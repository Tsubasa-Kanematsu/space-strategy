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
