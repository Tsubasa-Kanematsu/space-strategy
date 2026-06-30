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
