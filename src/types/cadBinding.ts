// ================================
// CAD Binding
// ================================

export type CadType = 'step' | 'json' | 'csv';

export const CAD_TYPE_LABELS: Record<CadType, string> = {
  step:     'STEP (ISO 10303)',
  json:     'JSON',
  csv:      'CSV',
};

/** Detect CAD type from file extension. Returns null if unknown. */
export function detectCadType(fileName: string): CadType | null {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'stp':
    case 'step':       return 'step';
    case 'json':       return 'json';
    case 'csv':        return 'csv';
    default:           return null;
  }
}

/** Which rocketDB data this CAD alias maps to */
export type ParamSourceType =
  | 'noseCone'       // geometry.noseCone.*
  | 'bodySection'    // geometry.bodySections[stageNo=N].*
  | 'propulsion'     // propulsionStages[stageNo=N].*
  | 'parameter'      // Parameter.value (by varName)
  | 'massComponent'  // MassComponent fields (allocatedMass / actualMass / cg*)
  | 'constant';      // fixed numeric value

export interface ParamBinding {
  id: string;
  cadAlias: string;          // CAD parameter alias (e.g. "D_body" — STEP/JSON/CSV のパラメータ名)
  sourceType: ParamSourceType;
  sourceField?: string;      // e.g. "baseDiameterM", "lengthM", "expansionRatio"
  stageNo?: number;            // for bodySection / propulsion
  componentVarName?: string;   // for massComponent: which component (by varName)
  multiplier: number;          // unit conversion, e.g. 1000 for m→mm
  addend?: number;             // optional offset after multiplication
  constantValue?: number;      // used when sourceType = 'constant'
  note?: string;
}

/** Maps a CAD object/body to a rocketDB MassComponent for mass writeback */
export interface ComponentBinding {
  id: string;
  cadObjectName: string;       // CAD object name (STEP の PRODUCT 名 / json/csv のアイテム名)
  componentId: string | null;  // rocketDB MassComponent.id to write back to (null = compute only)
  densityOverride?: number | null; // kg/m³; if null, use component's materialDensity
  materialName?: string | null;    // 材質プリセット名 (STEP モードA用); null = 未設定
}

/** Full CAD setup for one massCaseId */
export interface CadSetup {
  id: string;
  massCaseId: string;
  label: string;              // user-facing name e.g. "2段式ロケット メインCAD"
  cadType: CadType;           // CAD software type (auto-detected from file extension on upload)
  s3Key: string;              // S3 key of CAD file (empty string for json/csv types)
  paramBindings: ParamBinding[];
  componentBindings: ComponentBinding[];
  detectedObjectNames?: string[];  // STEP の PRODUCT 名一覧 / json/csv のアイテム名一覧
  fileContent?: string;            // JSON string of CadAssemblyItem[] for json/csv types
  lastGeneratedAt?: string;        // ISO timestamp of last successful generation
  updatedAt: string;
}

/** Result from cad_server POST /generate */
export interface CadComponentResult {
  cadObjectName: string;
  volumeM3: number;
  massKg: number;
  cgX: number;
  cgY: number;
  cgZ: number;
  ixx: number | null;
  iyy: number | null;
  izz: number | null;
  ixy: number | null;
  ixz: number | null;
  iyz: number | null;
}

export interface CadGenerateResult {
  success: boolean;
  error?: string;
  components?: CadComponentResult[];
  assembly?: {
    totalMassKg: number;
    assemblyCgX: number;
    assemblyCgY: number;
    assemblyCgZ: number;
  };
}
