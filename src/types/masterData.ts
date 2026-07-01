export interface ComponentCategoryPreset {
  id: string;
  name: string;
  color: string;       // bootstrap badge クラス e.g. 'bg-secondary-subtle text-secondary'
  builtin?: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

/** タグプリセット（ComponentCategoryPreset の別名。新コードはこちらを使う） */
export type ComponentTagPreset = ComponentCategoryPreset;

export interface AntennaData {
  id: string;
  name: string;
  type: 'ground' | 'rocket';
  frequencyBand: string;
  frequencyMHz: number | null;
  gainDbi: number | null;
  eirpDbw: number | null;
  gtDbK: number | null;
  polarization: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
}

/** 推進系マスタ（エンジン諸元）。マスタデータで設定し、解析で参照する。 */
export interface PropulsionMaster {
  id: string;
  name: string;
  stage: string;            // 段（1段/2段/ブースター/姿勢制御 等）
  propellant: string;       // 推進剤
  cycle: string;            // サイクル
  thrustVacKN: number | null;  // 真空推力 (kN)
  thrustSlKN: number | null;   // 海面推力 (kN)
  ispVacS: number | null;      // 真空比推力 (s)
  burnTimeS: number | null;    // 燃焼時間 (s)
  throttle: string;         // スロットル
  memo: string;
  createdAt: string;
  updatedAt: string;
}

/** 機体形状マスタ。 */
export interface ShapeMaster {
  id: string;
  name: string;
  lengthM: number | null;      // 全長 (m)
  maxDiameterM: number | null; // 最大直径 (m)
  stages: number | null;       // 段数
  noseCone: string;            // ノーズコーン形式
  refAreaM2: number | null;    // 基準面積 (m²)
  memo: string;
  createdAt: string;
  updatedAt: string;
}

/** 空力係数マスタ（代表値）。 */
export interface AeroCoeffMaster {
  id: string;
  name: string;
  cdSubsonic: number | null;      // 亜音速 Cd
  cdTransonicPeak: number | null; // 遷音速ピーク Cd
  cdSupersonic: number | null;    // 超音速 Cd
  clAlpha: number | null;         // 揚力傾斜 CLα (/rad)
  memo: string;
  createdAt: string;
  updatedAt: string;
}

/** 風プロファイルの1層（高度ごとの風向・風速）。 */
export interface WindLayer {
  altitudeKm: number | null;  // 高度 (km)
  dirDeg: number | null;      // 風向 (deg)
  speedMs: number | null;     // 風速 (m/s)
}

/** 風データマスタ（1レコード＝1プロファイル。高度ごとの風向・風速のリスト）。 */
export interface WindMaster {
  id: string;
  name: string;
  site: string;               // 射場
  memo: string;
  layers: WindLayer[];        // 高度ごとの風向・風速
  createdAt: string;
  updatedAt: string;
}

/** 故障率セットの1行（サブシステム別）。 */
export interface FailureRow {
  name: string;                // サブシステム
  failureRate: number | null;  // 故障率 (/flight)
  mode: string;                // 代表故障モード
  phase: string;               // 発生フェーズ
}

/** 故障率マスタ（1レコード＝1セット。サブシステム行のリストでワンセット）。 */
export interface FailureRateMaster {
  id: string;
  name: string;                // セット名
  memo: string;
  subsystems: FailureRow[];    // サブシステム別 故障率（このセットで1組）
  createdAt: string;
  updatedAt: string;
}

/** 代表破片マスタ。 */
export interface DebrisMaster {
  id: string;
  name: string;
  massKg: number | null;   // 質量 (kg)
  areaM2: number | null;   // 代表断面積 (m²)
  cd: number | null;       // 抗力係数
  material: string;        // 材質
  memo: string;
  createdAt: string;
  updatedAt: string;
}
