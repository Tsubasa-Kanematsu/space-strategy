import type { SizingCondition, SizingResult } from '../types';

const G0 = 9.80665; // m/s^2

/**
 * Tsiolkovsky equation: ΔV = Isp * g0 * ln(m_initial / m_final)
 * Rearranged: m_propellant = m_final * (exp(ΔV / (Isp * g0)) - 1)
 *
 * For a multi-stage rocket, we optimize from the last stage backwards.
 * Assumption: Each stage contributes equally to the total ΔV (can be refined).
 * The optimizer finds the minimum total initial mass given:
 *   - Total ΔV constraint
 *   - Isp per stage
 *   - Structural efficiency (fixed at ~0.1 per stage as default)
 *
 * Returns null if calculation is not feasible.
 */

interface StageResult {
  initialMass: number;
  finalMass: number;
  propellantMass: number;
  structuralMass: number;
  propellantRatio: number;
  structuralEfficiency: number;
}

interface SizingCalcResult {
  totalMass: number;
  grossPayloadRatio: number;
  stages: StageResult[];
}

/**
 * Simple multi-stage sizing calculation.
 * Assumes structural efficiency (epsilon) per stage = structMass / (structMass + propMass).
 * Default epsilon = 0.08 (8%).
 * Splits ΔV equally among stages unless overridden.
 */
export function calcSizing(
  condition: SizingCondition,
  structuralEfficiencyPerStage?: number[]
): SizingCalcResult | null {
  const { numStages, payloadMass, deltaV, ispPerStage } = condition;

  if (numStages < 1 || numStages > 4) return null;
  if (payloadMass <= 0 || deltaV <= 0) return null;

  const epsilons = structuralEfficiencyPerStage ?? Array(numStages).fill(0.08);
  const deltaVPerStage = deltaV / numStages;

  const stages: StageResult[] = [];
  let currentPayload = payloadMass;

  // Calculate from last stage to first
  for (let i = numStages - 1; i >= 0; i--) {
    const isp = ispPerStage[i] ?? 300;
    const epsilon = epsilons[i] ?? 0.08;
    const dv = deltaVPerStage;

    // Mass ratio from Tsiolkovsky: m_initial / m_final = exp(dv / (Isp * g0))
    const massRatio = Math.exp(dv / (isp * G0));

    // Let m_final_i = currentPayload + structMass_i
    // propMass_i = (m_final_i + structMass_i) * (massRatio - 1) ...
    // Solve: epsilon = structMass / (structMass + propMass)
    //        m_initial = m_final * massRatio
    //        m_final = currentPayload + structMass
    //        m_initial = currentPayload + structMass + propMass
    //        propMass = m_initial - m_final = m_final * (massRatio - 1)
    //        structMass = epsilon * (structMass + propMass) = epsilon * (m_initial - m_final + structMass)
    //        structMass * (1 - epsilon) = epsilon * propMass
    //        structMass = epsilon * propMass / (1 - epsilon)
    //
    // Also: m_final = currentPayload + structMass
    //       propMass = m_final * (massRatio - 1) = (currentPayload + structMass) * (massRatio - 1)
    //
    // Substituting:
    //   structMass = epsilon * (currentPayload + structMass) * (massRatio - 1) / (1 - epsilon)
    //   structMass * (1 - epsilon) = epsilon * (currentPayload + structMass) * (massRatio - 1)
    //   structMass * (1 - epsilon) = epsilon * currentPayload * (massRatio - 1) + epsilon * structMass * (massRatio - 1)
    //   structMass * ((1 - epsilon) - epsilon * (massRatio - 1)) = epsilon * currentPayload * (massRatio - 1)
    //   structMass = epsilon * currentPayload * (massRatio - 1) / ((1 - epsilon) - epsilon * (massRatio - 1))

    const denom = (1 - epsilon) - epsilon * (massRatio - 1);
    if (denom <= 0) return null; // infeasible (structural efficiency too high for this ΔV)

    const structMass = (epsilon * currentPayload * (massRatio - 1)) / denom;
    const mFinal = currentPayload + structMass;
    const propMass = mFinal * (massRatio - 1);
    const mInitial = mFinal + propMass;

    stages.unshift({
      initialMass: mInitial,
      finalMass: mFinal,
      propellantMass: propMass,
      structuralMass: structMass,
      propellantRatio: propMass / (propMass + structMass),
      structuralEfficiency: epsilon,
    });

    currentPayload = mInitial; // next (outer) stage payload = this stage initial mass
  }

  const totalMass = stages[0]?.initialMass ?? 0;
  return {
    totalMass,
    grossPayloadRatio: payloadMass / totalMass,
    stages,
  };
}

/**
 * Run sizing with parametric study and return all results.
 */
export function runParametricStudy(
  condition: SizingCondition,
  structuralEfficiency?: number[]
): Array<{ condition: SizingCondition; calc: SizingCalcResult }> {
  const results: Array<{ condition: SizingCondition; calc: SizingCalcResult }> = [];

  // Collect ΔV values to iterate
  const deltaVValues: number[] = [];
  if (condition.deltaVParaSta.enabled) {
    const { min, max, step } = condition.deltaVParaSta;
    for (let v = min; v <= max + 1e-9; v += step) {
      deltaVValues.push(Math.round(v * 1000) / 1000);
    }
  } else {
    deltaVValues.push(condition.deltaV);
  }

  // Collect Isp arrays to iterate (one combination per stage set)
  // For simplicity: iterate each stage Isp independently
  const ispArrays: number[][] = [condition.ispPerStage.slice()];
  condition.ispParaSta.forEach((psta, stageIdx) => {
    if (!psta.enabled) return;
    const newArrays: number[][] = [];
    for (let isp = psta.min; isp <= psta.max + 1e-9; isp += psta.step) {
      ispArrays.forEach((arr) => {
        const newArr = arr.slice();
        newArr[stageIdx] = Math.round(isp * 100) / 100;
        newArrays.push(newArr);
      });
    }
    ispArrays.splice(0, ispArrays.length, ...newArrays);
  });

  for (const dv of deltaVValues) {
    for (const ispArr of ispArrays) {
      const cond: SizingCondition = {
        ...condition,
        deltaV: dv,
        ispPerStage: ispArr,
      };
      const calc = calcSizing(cond, structuralEfficiency);
      if (calc) {
        results.push({ condition: cond, calc });
      }
    }
  }

  return results;
}

/**
 * Convert a SizingCalcResult to SizingResult fields.
 */
export function calcResultToResultFields(
  _sizingCaseId: string,
  _condition: SizingCondition,
  calc: SizingCalcResult,
  _no: number
): Omit<SizingResult, 'id' | 'sizingCaseId' | 'no' | 'condition' | 'createdAt'> {
  return {
    totalMass: calc.totalMass,
    grossPayloadRatio: calc.grossPayloadRatio,
    propellantMassPerStage: calc.stages.map((s) => s.propellantMass),
    propellantRatioPerStage: calc.stages.map((s) => s.propellantRatio),
    structuralEfficiencyPerStage: calc.stages.map((s) => s.structuralEfficiency),
    componentMasses: [],
  };
}
