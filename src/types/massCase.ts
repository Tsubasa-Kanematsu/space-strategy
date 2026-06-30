// ================================
// ΔV Budget
// ================================

export interface DeltaVEntry {
  key: string;           // 'required' | 'gravity_loss' | 'aero_loss' | 'control_loss' | 'pressure_loss' | custom
  label: string;
  varName: string;       // formula スコープ変数名 e.g. 'dv_required'
  value: number;         // m/s
  source: 'manual' | 'analysis_bind';
  analysisBind?: {
    analysisCaseId: string;
    resultLabel: string; // AnalysisResult.label でマッチ
  };
}

export interface DeltaVBudget {
  entries: DeltaVEntry[];
  totalVarName: string;  // デフォルト 'dv_total'
}

// ================================
// Change Log
// ================================

export interface ChangeRecord {
  id: string;
  changedAt: string;      // ISO timestamp
  changedBy: string;
  summary: string;        // 変更概要（短い説明）
  rationale: string;      // 変更理由（詳細）
  documentUrls: string[]; // 参照ドキュメントURL
}

// ================================
// Component Field History（全フィールド共通の変更記録）
// ================================

export interface ComponentFieldEntry {
  id: string;
  changedAt: string;      // ISO timestamp
  changedBy: string;      // 記入者
  field: string;          // フィールドキー e.g. 'actualMass', 'cgX', 'materialName'
  fieldLabel: string;     // 表示名 e.g. '実質量', '重心X', '材質名'
  value: string | null;   // 新しい値（文字列化）
  evidence: string;       // エビデンス・備考
  status: 'input' | 'confirmed';
  confirmedBy?: string;
  confirmedAt?: string;
  documentId?: string;    // 同時に添付されたドキュメント (DocumentRef.id)
  source?: 'manual' | 'cad'; // 入力ソース (未指定は manual 相当)
}

// ================================
// Actual Mass History
// ================================

export interface ActualMassEntry {
  id: string;
  recordedAt: string;   // ISO timestamp
  recordedBy: string;   // 記入者
  value: number | null; // 実質量 (kg)
  evidence: string;     // エビデンス・備考
  status: 'input' | 'confirmed';
  confirmedBy?: string; // 確認者
  confirmedAt?: string; // 確認日時
  source?: 'manual' | 'cad'; // 入力ソース
  documentId?: string;  // 同時に添付されたドキュメント (DocumentRef.id)
}

// ================================
// Error Sources
// ================================

export interface ErrorSourceEntry {
  id: string;
  errorType: string;        // 例: '加速度計バイアス', 'ジャイロドリフト'
  axis: string;             // 'X' | 'Y' | 'Z' | '全軸'
  value3sigma: number | null;
  unit: string;             // 例: 'm/s²', 'deg/s', 'deg', 'mm'
  note: string;
}

// ================================
// Document Reference
// ================================

export type DocumentType = 'drawing' | 'spec' | 'report' | 'other';

export interface DocumentRef {
  id: string;
  docNumber: string;   // 図番 e.g. "STR-001"
  title: string;       // タイトル
  revision: string;    // リビジョン e.g. "Rev.C"
  docType: DocumentType;
  url: string;         // 参照URL or PDMパス
  note: string;
  addedAt: string;     // 登録日時 ISO timestamp
  addedBy: string;     // 登録者
  updatedAt?: string;  // 最終更新日時 ISO timestamp
  updatedBy?: string;  // 最終更新者
}

// ================================
// MassCase (ロケットデータベース)
// ================================

/** タグ定義（MassCase単位で共有）*/
export interface TagDefinition {
  id: string;
  name: string;
  color: string; // hex e.g. '#0d6efd' or Bootstrap token e.g. 'primary'
}

/** ロケットデータベース (旧: MassCase) */
export interface MassCase {
  id: string;
  projectId: string;
  name: string;
  memo: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  sizingResultApplied?: string;   // SizingResult.id applied to this case
  parentMassCaseId?: string;      // 派生元DBのID（バージョン管理用）
  deltaVBudget?: DeltaVBudget;
  changeLog?: ChangeRecord[];     // 変更ログ
  tagDefinitions?: TagDefinition[]; // Notion風タグ定義（MassCase単位）
}
export type RocketDatabase = MassCase;

// ================================
// Component
// ================================

export type ComponentStage = 'all' | 'payload' | 'pbs' | 'stage1' | 'stage2' | 'stage3' | 'stage4';
export type ComponentInputType = 'fixed' | 'formula' | 'design_var' | 'aggregate';
/**
 * @deprecated MassCase.tagDefinitions + MassComponent.tags (string[]) に移行。
 * 旧データの後方互換のためのみ残留。
 */
export type ComponentCategory =
  | 'structure'
  | 'propulsion'
  | 'avionics'
  | 'payload'
  | 'power'
  | 'thermal'
  | 'other';

export interface MassComponent {
  id: string;                 // レコード固有のUUID
  massCaseId: string;         // レコードが属するバージョン
  logicalId?: string;         // 部品の不変識別子（差分管理の主キー）。古いデータは id を代用。
  isDeleted?: boolean;        // 削除されたバージョンを示すフラグ（Tombstone）
  parentId: string | null;    // 親部品の logicalId を指す
  paramName: string;          // display name e.g. "1段エンジン"
  varName: string;            // variable name e.g. "m_eng1"
  level: number;
  stage: ComponentStage;
  inputType: ComponentInputType;
  valueOrFormula: string;     // number string for fixed/design_var, formula for formula, ignored for aggregate
  /** @deprecated componentCategory は tags[0] に移行済み。読み込み時に自動マイグレーション。 */
  componentCategory?: ComponentCategory;
  /** タグID配列（MassCase.tagDefinitions の id を参照）。複数付与可。 */
  tags?: string[];
  isPropellant?: boolean;       // 推進剤フラグ（サイジング・質量計算用。タグとは独立）
  order: number;

  // ---- 質量 (Mass) データ ----
  allocatedMass: number | null;   // 質量配分値 (from sizing result or manual)
  actualMass: number | null;      // 実質量 (leaf node: manual input; non-leaf: auto-aggregated)
  actualMassEvidence: string;     // エビデンスメモ
  diff: number | null;            // 差分 = allocatedMass - actualMass (auto-calculated)
  actualMassHistory?: ActualMassEntry[]; // 実質量の更新履歴
  /**
   * 実質量の集計モード。
   * - 'aggregate' = 子要素から自動集計 (actualMass フィールドの値は無視)
   * - 'fixed'     = 手入力値を使う
   * undefined のときは hasChildren && actualMass == null で aggregate、それ以外 fixed のフォールバック。
   */
  actualMassMode?: 'aggregate' | 'fixed';

  // ---- 重心 (CG) データ ----
  cgX?: number | null;   // m
  cgY?: number | null;
  cgZ?: number | null;
  cgEvidence?: string;
  /** 重心座標の基準座標系: 'local' = コンポーネント局所系, 'global' = 全機ロケット系（デフォルト: local） */
  cgReference?: 'local' | 'global';
  /** 重心・慣性テンソルの原点（局所系の場合のみ使用）。undefined のとき mountPosX/Y/Z で代替 */
  localOriginX?: number | null;  // m
  localOriginY?: number | null;
  localOriginZ?: number | null;

  // ---- 慣性テンソル (Inertia Tensor) データ ----
  ixx?: number | null;  // kg·m²
  iyy?: number | null;
  izz?: number | null;
  ixy?: number | null;  // products of inertia
  ixz?: number | null;
  iyz?: number | null;
  inertiaEvidence?: string;

  /**
   * 重心・慣性テンソルの集計モード。
   * - 'aggregate' = 子要素から自動集計（hasChildren のときデフォルト）
   * - 'manual'    = 手入力値を使う（leaf は常に manual 扱い）
   * undefined のときは hasChildren で 'aggregate'、leaf で 'manual' にフォールバック。
   */
  cgInertiaMode?: 'aggregate' | 'manual';

  // ---- 材質 (Material) データ ----
  materialName?: string;
  materialDensity?: number | null;       // kg/m³（内部値。表示時は materialDensityUnit で換算）
  materialDensityUnit?: 'kg/m³' | 'g/cm³' | 'kg/L' | 'ton/m³'; // 表示用単位（未設定時は kg/m³ 扱い）
  materialYoungModulus?: number | null;  // GPa
  materialNote?: string;

  // ---- 破片形状 (Debris Shape) データ ----
  debrisShapeType?: string; // 'sphere' | 'cylinder' | 'flat_plate' | 'irregular' | ''
  debrisCharLength?: number | null; // m, characteristic length
  debrisDiameter?: number | null;   // m
  debrisArea?: number | null;       // m², cross-sectional area
  debrisNote?: string;

  // ---- 機体系誤差源 (Error Sources) データ ----
  errorSources?: ErrorSourceEntry[];

  // ---- CAD参照 ----
  cadFile?: string;
  cadLastImported?: string;  // ISO timestamp
  cadSoftware?: string;      // 'manual' | 'step' | 'json' | 'csv'
  cadRevision?: string;
  cadFilePath?: string;

  // ---- 搭載位置・搭載範囲 (Mounting) データ ----
  mountPosX?: number | null;  // m, X軸始点（搭載範囲の前端）
  mountEndX?: number | null;  // m, X軸終点（搭載範囲の後端）
  mountPosY?: number | null;  // m, Y軸始点
  mountEndY?: number | null;  // m, Y軸終点
  mountPosZ?: number | null;  // m, Z軸始点
  mountEndZ?: number | null;  // m, Z軸終点
  /** @deprecated lengthM は mountEndX - mountPosX で代替 */
  lengthM?: number | null;
  mountNote?: string;         // 備考

  // ---- フィールド変更履歴（全データビュー共通） ----
  fieldHistory?: ComponentFieldEntry[];

  // ---- 図面・ドキュメント参照 ----
  documents?: DocumentRef[];

  // ---- コンポーネントリンク（マスター-クローン方式） ----
  /** 同じリンクグループのメンバー識別 UUID。未設定 = 独立部品 */
  linkGroupId?: string;
  /** true = マスター、false/undefined = クローン（linkGroupId が設定されている場合のみ有効） */
  isLinkMaster?: boolean;
}
export type RocketComponent = MassComponent;

// ================================
// Parameter
// ================================

export type ParameterInputType = 'fixed' | 'variable' | 'formula';

export interface Parameter {
  id: string;                 // レコード固有のUUID
  massCaseId: string;         // レコードが属するバージョン
  logicalId?: string;         // 変数の不変識別子（差分管理の主キー）
  isDeleted?: boolean;        // オーバーライドにおける削除フラグ
  name: string;
  varName: string;            // variable name used in formulas e.g. "isp1"
  inputType: ParameterInputType;
  value: number | null;       // for fixed
  formula: string;            // for formula
  usageLocations: string[];
}
