import { evaluate } from 'mathjs';
import type { MassComponent, Parameter, DeltaVBudget } from '../types';

/**
 * Build a variable scope from parameters.
 */
export function buildScope(
  parameters: Parameter[]
): Record<string, number> {
  const scope: Record<string, number> = {};
  parameters.forEach((p) => {
    if (p.varName && (p.inputType === 'fixed' || p.inputType === 'variable')) {
      if (p.value !== null) scope[p.varName] = p.value;
    }
  });
  return scope;
}

/**
 * Evaluate a formula string with the given scope.
 * Returns null on error.
 */
export function evalFormula(formula: string, scope: Record<string, number>): number | null {
  if (!formula || formula.trim() === '') return null;
  try {
    const result = evaluate(formula, { ...scope });
    if (typeof result === 'number' && isFinite(result)) return result;
    return null;
  } catch {
    return null;
  }
}

/**
 * Evaluate component masses in dependency order.
 * Returns a map: componentId → computed mass value
 * extraScope: additional variables (e.g. from propulsion/shape stores) merged before parameters
 */
export function evaluateComponentMasses(
  components: MassComponent[],
  parameters: Parameter[],
  extraScope?: Record<string, number>
): Map<string, number> {
  const result = new Map<string, number>();
  // extraScope is merged first; parameter varNames take precedence if they overlap
  const scope = { ...(extraScope ?? {}), ...buildScope(parameters) };

  // Add parameter formula evaluations
  parameters.forEach((p) => {
    if (p.varName && p.inputType === 'formula' && p.formula) {
      const val = evalFormula(p.formula, scope);
      if (val !== null) scope[p.varName] = val;
    }
  });

  const childrenOf = new Map<string | null, MassComponent[]>();
  components.forEach((c) => {
    const parent = c.parentId;
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    childrenOf.get(parent)!.push(c);
  });

  function evalComp(comp: MassComponent): number | null {
    if (result.has(comp.id)) return result.get(comp.id)!;

    if (comp.inputType === 'aggregate') {
      const children = childrenOf.get(comp.logicalId || comp.id) ?? [];
      let total = 0;
      for (const child of children) {
        const v = evalComp(child);
        if (v === null) return null;
        total += v;
      }
      result.set(comp.id, total);
      if (comp.varName) scope[comp.varName] = total;
      return total;
    }

    if (comp.inputType === 'fixed' || comp.inputType === 'design_var') {
      const v = parseFloat(comp.valueOrFormula);
      if (isNaN(v)) return null;
      result.set(comp.id, v);
      if (comp.varName) scope[comp.varName] = v;
      return v;
    }

    if (comp.inputType === 'formula') {
      const v = evalFormula(comp.valueOrFormula, scope);
      if (v === null) return null;
      result.set(comp.id, v);
      if (comp.varName) scope[comp.varName] = v;
      return v;
    }

    return null;
  }

  components.forEach((c) => evalComp(c));
  return result;
}

// ── 重心・慣性テンソル積み上げ ────────────────────────────────────────────────

export type CG3D = { x: number; y: number; z: number };
export type Inertia6 = { ixx: number; iyy: number; izz: number; ixy: number; ixz: number; iyz: number };

/**
 * 各コンポーネントのCGを全機座標系に変換する。
 * 局所系の場合は localOriginX/Y/Z をオフセットとして加算する。
 * localOrigin が未設定（undefined/null）のときは mountPosX/Y/Z で代替する（lazy migration）。
 */
function toGlobalCG(comp: MassComponent): CG3D | null {
  const cx = comp.cgX ?? null;
  const cy = comp.cgY ?? null;
  const cz = comp.cgZ ?? null;
  if (cx === null && cy === null && cz === null) return null;
  if (comp.cgReference === 'global') {
    return { x: cx ?? 0, y: cy ?? 0, z: cz ?? 0 };
  }
  // local → localOrigin を優先し、未設定なら mountPos で代替
  const ox = comp.localOriginX ?? comp.mountPosX ?? 0;
  const oy = comp.localOriginY ?? comp.mountPosY ?? 0;
  const oz = comp.localOriginZ ?? comp.mountPosZ ?? 0;
  return {
    x: ox + (cx ?? 0),
    y: oy + (cy ?? 0),
    z: oz + (cz ?? 0),
  };
}

/**
 * 全コンポーネントの全機座標系CG を計算して返す。
 * 集計コンポーネント: 子コンポーネントの質量加重平均
 * 葉コンポーネント: cgReference に従い全機座標系に変換
 */
export function computeGlobalCGMap(
  components: MassComponent[],
  massMap: Map<string, number>
): Map<string, CG3D> {
  const result = new Map<string, CG3D>();
  const childrenOf = new Map<string | null, MassComponent[]>();
  components.forEach((c) => {
    const pid = c.parentId;
    if (!childrenOf.has(pid)) childrenOf.set(pid, []);
    childrenOf.get(pid)!.push(c);
  });

  function compute(comp: MassComponent): CG3D | null {
    if (result.has(comp.id)) return result.get(comp.id)!;
    // 明示的に集計モードならば手動値が残っていても無視して子から集計する
    const isExplicitAggregate = comp.cgInertiaMode === 'aggregate';
    // cgX/Y/Z 全部に数値があれば手動値を優先（集計をスキップ）。
    // ただし cgInertiaMode==='aggregate' のときは明示的に手動値を無視する
    if (!isExplicitAggregate &&
        comp.cgX !== null && comp.cgX !== undefined &&
        comp.cgY !== null && comp.cgY !== undefined &&
        comp.cgZ !== null && comp.cgZ !== undefined) {
      const cg = toGlobalCG(comp);
      if (cg) result.set(comp.id, cg);
      return cg;
    }
    const children = childrenOf.get(comp.logicalId || comp.id) ?? [];
    if (children.length === 0) {
      const cg = toGlobalCG(comp);
      if (cg) result.set(comp.id, cg);
      return cg;
    }
    let totalMass = 0;
    let sx = 0, sy = 0, sz = 0;
    let hasAny = false;
    for (const child of children) {
      const childCG = compute(child);
      const childMass = massMap.get(child.id) ?? null;
      if (!childCG || childMass === null || childMass === 0) continue;
      totalMass += childMass; sx += childMass * childCG.x;
      sy += childMass * childCG.y; sz += childMass * childCG.z;
      hasAny = true;
    }
    if (!hasAny || totalMass === 0) return null;
    const cg: CG3D = { x: sx / totalMass, y: sy / totalMass, z: sz / totalMass };
    result.set(comp.id, cg);
    return cg;
  }

  components.forEach((c) => compute(c));
  return result;
}

/**
 * 集計コンポーネントの慣性テンソルを平行軸の定理で積み上げ計算する。
 * 葉コンポーネントは comp.ixx 等の実測値をそのまま使用。
 * 注意: 全コンポーネントのCGが全機座標系で存在する場合のみ正確に計算される。
 */
export function computeAggregateInertiaMap(
  components: MassComponent[],
  massMap: Map<string, number>,
  cgMap: Map<string, CG3D>
): Map<string, Inertia6> {
  const result = new Map<string, Inertia6>();
  const childrenOf = new Map<string | null, MassComponent[]>();
  components.forEach((c) => {
    const pid = c.parentId;
    if (!childrenOf.has(pid)) childrenOf.set(pid, []);
    childrenOf.get(pid)!.push(c);
  });

  function getLeafInertia(comp: MassComponent): Inertia6 {
    return {
      ixx: comp.ixx ?? 0, iyy: comp.iyy ?? 0, izz: comp.izz ?? 0,
      ixy: comp.ixy ?? 0, ixz: comp.ixz ?? 0, iyz: comp.iyz ?? 0,
    };
  }

  function compute(comp: MassComponent): Inertia6 | null {
    if (result.has(comp.id)) return result.get(comp.id)!;
    // 明示的に集計モードならば手動値が残っていても無視して子から集計する
    const isExplicitAggregate = comp.cgInertiaMode === 'aggregate';
    // 6成分全部に数値があれば手動値を優先（集計をスキップ）。
    // ただし cgInertiaMode==='aggregate' のときは明示的に手動値を無視する
    if (!isExplicitAggregate &&
        comp.ixx !== null && comp.ixx !== undefined &&
        comp.iyy !== null && comp.iyy !== undefined &&
        comp.izz !== null && comp.izz !== undefined &&
        comp.ixy !== null && comp.ixy !== undefined &&
        comp.ixz !== null && comp.ixz !== undefined &&
        comp.iyz !== null && comp.iyz !== undefined) {
      const inertia: Inertia6 = {
        ixx: comp.ixx, iyy: comp.iyy, izz: comp.izz,
        ixy: comp.ixy, ixz: comp.ixz, iyz: comp.iyz,
      };
      result.set(comp.id, inertia);
      return inertia;
    }
    const children = childrenOf.get(comp.logicalId || comp.id) ?? [];
    if (children.length === 0) return null;

    const parentCG = cgMap.get(comp.id);
    if (!parentCG) return null;

    const total: Inertia6 = { ixx: 0, iyy: 0, izz: 0, ixy: 0, ixz: 0, iyz: 0 };
    let hasAny = false;
    for (const child of children) {
      compute(child); // 先に子を計算
      const childI = result.get(child.id) ?? getLeafInertia(child);
      const childCG = cgMap.get(child.id);
      const childMass = massMap.get(child.id) ?? null;
      if (!childCG || childMass === null) continue;
      const dx = childCG.x - parentCG.x;
      const dy = childCG.y - parentCG.y;
      const dz = childCG.z - parentCG.z;
      // 平行軸の定理
      total.ixx += childI.ixx + childMass * (dy * dy + dz * dz);
      total.iyy += childI.iyy + childMass * (dx * dx + dz * dz);
      total.izz += childI.izz + childMass * (dx * dx + dy * dy);
      total.ixy += childI.ixy - childMass * dx * dy;
      total.ixz += childI.ixz - childMass * dx * dz;
      total.iyz += childI.iyz - childMass * dy * dz;
      hasAny = true;
    }
    if (!hasAny) return null;
    result.set(comp.id, total);
    return total;
  }

  components.forEach((c) => compute(c));
  return result;
}

/** 搭載位置のバウンディングボックス */
export type MountBounds = {
  posX: number; endX: number;
  posY: number; endY: number;
  posZ: number; endZ: number;
};

/**
 * 子コンポーネントの搭載位置から親のバウンディングボックスを集計する。
 * 葉はそのままの値、親は子の min(始点)〜max(終点)。
 */
export function computeAggregateMountMap(
  components: MassComponent[],
): Map<string, MountBounds> {
  const result = new Map<string, MountBounds>();
  const childrenOf = new Map<string | null, MassComponent[]>();
  components.forEach((c) => {
    const pid = c.parentId;
    if (!childrenOf.has(pid)) childrenOf.set(pid, []);
    childrenOf.get(pid)!.push(c);
  });

  function compute(comp: MassComponent): MountBounds | null {
    if (result.has(comp.id)) return result.get(comp.id)!;
    const children = childrenOf.get(comp.logicalId || comp.id) ?? [];
    if (children.length === 0) {
      // 葉: 全6値が揃っていなくても部分的に使う
      const hasMounting = comp.mountPosX != null || comp.mountEndX != null ||
        comp.mountPosY != null || comp.mountEndY != null ||
        comp.mountPosZ != null || comp.mountEndZ != null;
      if (!hasMounting) return null;
      const bounds: MountBounds = {
        posX: comp.mountPosX ?? 0, endX: comp.mountEndX ?? comp.mountPosX ?? 0,
        posY: comp.mountPosY ?? 0, endY: comp.mountEndY ?? comp.mountPosY ?? 0,
        posZ: comp.mountPosZ ?? 0, endZ: comp.mountEndZ ?? comp.mountPosZ ?? 0,
      };
      result.set(comp.id, bounds);
      return bounds;
    }
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    let hasAny = false;
    for (const child of children) {
      const cb = compute(child);
      if (!cb) continue;
      minX = Math.min(minX, cb.posX); maxX = Math.max(maxX, cb.endX);
      minY = Math.min(minY, cb.posY); maxY = Math.max(maxY, cb.endY);
      minZ = Math.min(minZ, cb.posZ); maxZ = Math.max(maxZ, cb.endZ);
      hasAny = true;
    }
    if (!hasAny) return null;
    const bounds: MountBounds = { posX: minX, endX: maxX, posY: minY, endY: maxY, posZ: minZ, endZ: maxZ };
    result.set(comp.id, bounds);
    return bounds;
  }

  components.forEach((c) => compute(c));
  return result;
}

/**
 * Build a variable scope from a ΔV budget.
 * Injects each entry's varName and the total into the formula scope.
 */
export function buildDeltaVScope(budget: DeltaVBudget | undefined): Record<string, number> {
  if (!budget) return {};
  const scope: Record<string, number> = {};
  let total = 0;
  for (const entry of budget.entries) {
    if (entry.varName) {
      scope[entry.varName] = entry.value;
      total += entry.value;
    }
  }
  scope[budget.totalVarName ?? 'dv_total'] = total;
  return scope;
}

/**
 * Check if a mass case has design_var or variable parameters
 */
export function hasDesignVariables(
  components: MassComponent[],
  parameters: Parameter[]
): boolean {
  return (
    components.some((c) => c.inputType === 'design_var') ||
    parameters.some((p) => p.inputType === 'variable')
  );
}
