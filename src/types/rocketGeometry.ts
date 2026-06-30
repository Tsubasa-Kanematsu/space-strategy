export type NoseConeType = 'ogive' | 'conical' | 'haack' | 'elliptical' | 'parabolic';

export interface RocketNoseCone {
  type: NoseConeType;
  lengthM: number;
  baseDiameterM: number;
}

export interface RocketBodySection {
  id: string;
  stageNo: number;
  outerDiameterM: number;
  lengthM: number;
}

export interface RocketFinSet {
  id: string;
  stageNo: number;
  count: number;
  rootChordM: number;
  tipChordM: number;
  spanM: number;
  sweepAngleDeg: number;
  thicknessM: number;
}

export interface RocketGeometry {
  massCaseId: string;
  noseCone: RocketNoseCone;
  bodySections: RocketBodySection[];
  finSets: RocketFinSet[];
  updatedAt: string;
}

// ================================
// Aero Data
// ================================

export interface AeroDataEntry {
  mach: number;
  aoaDeg: number;
  ca: number;
  cn: number;
  xcpM?: number;
}

export interface AeroDataSet {
  referenceAreaM2: number;
  referenceLengthM: number;
  entries: AeroDataEntry[];
}
