export interface SizingCase {
  id: string;
  projectId: string;
  massCaseId: string;
  name: string;
  memo: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ParaStaConfig {
  enabled: boolean;
  min: number;
  max: number;
  step: number;
}

export interface VariableParamCondition {
  paramId: string;
  value: number;
  paraSta: ParaStaConfig;
}

export interface SizingCondition {
  numStages: number;
  payloadMass: number;        // kg
  deltaV: number;             // m/s
  deltaVParaSta: ParaStaConfig;
  ispPerStage: number[];      // s (one per stage)
  ispParaSta: ParaStaConfig[];
  variableParams: VariableParamCondition[];
}

export interface ComponentMassResult {
  componentId: string;
  mass: number;
}

export interface SizingResult {
  id: string;
  sizingCaseId: string;
  no: number;
  condition: SizingCondition;
  totalMass: number;
  grossPayloadRatio: number;               // payload / totalMass
  propellantMassPerStage: number[];
  propellantRatioPerStage: number[];       // propellant / (propellant + structure)
  structuralEfficiencyPerStage: number[];  // structure / total
  componentMasses: ComponentMassResult[];
  createdAt: string;
}
