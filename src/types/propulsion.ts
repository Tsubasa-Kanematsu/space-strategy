export type PropellantType =
  | 'LOX/LH2'
  | 'LOX/RP-1'
  | 'LOX/Methane'
  | 'UDMH/N2O4'
  | 'MMH/N2O4'
  | 'Solid'
  | 'Hybrid'
  | 'Monopropellant'
  | 'Cold Gas'
  | 'Custom';

export interface PropulsionStage {
  id: string;
  massCaseId: string;
  stageNo: number;
  engineName: string;
  engineCount: number;
  propellantType: PropellantType | string;
  thrustVacKN: number | null;      // 真空中推力 (kN)
  thrustSLKN: number | null;       // 海面推力 (kN)
  ispVacS: number | null;          // 真空比推力 (s)
  ispSLS: number | null;           // 海面比推力 (s)
  chamberPressureMPa: number | null;
  expansionRatio: number | null;
  burnTimeSec: number | null;
  propellantMassKg: number | null;
  ofRatio: number | null;          // 酸化剤/燃料比
  note: string;
}
