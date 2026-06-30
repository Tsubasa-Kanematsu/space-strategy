/** ロケット・宇宙機で使用される主要材質のプリセット */
export interface MaterialPreset {
  name: string;
  density: number;        // kg/m³（内部値）
  youngModulus: number;   // GPa
  category: string;       // グループ表示用
}

export const MATERIAL_PRESETS: MaterialPreset[] = [
  // アルミニウム合金
  { name: 'Al2024-T4',    density: 2780, youngModulus: 73.1, category: 'アルミ合金' },
  { name: 'Al2024-T3',    density: 2780, youngModulus: 73.1, category: 'アルミ合金' },
  { name: 'Al6061-T6',    density: 2700, youngModulus: 69.0, category: 'アルミ合金' },
  { name: 'Al7075-T6',    density: 2810, youngModulus: 72.0, category: 'アルミ合金' },
  { name: 'Al7050-T7451', density: 2830, youngModulus: 71.7, category: 'アルミ合金' },

  // チタン合金
  { name: 'Ti-6Al-4V',    density: 4430, youngModulus: 114,  category: 'チタン合金' },
  { name: 'Ti-3Al-2.5V',  density: 4480, youngModulus: 105,  category: 'チタン合金' },

  // ステンレス・鉄鋼
  { name: 'SUS304',        density: 7900, youngModulus: 193,  category: 'ステンレス鋼' },
  { name: 'SUS316L',       density: 7980, youngModulus: 193,  category: 'ステンレス鋼' },
  { name: 'SUS321',        density: 7900, youngModulus: 200,  category: 'ステンレス鋼' },
  { name: 'マルエージング鋼 (M300)',  density: 8000, youngModulus: 190, category: 'ステンレス鋼' },

  // 超合金
  { name: 'Inconel 718',   density: 8190, youngModulus: 200,  category: '超合金' },
  { name: 'Inconel 625',   density: 8440, youngModulus: 207,  category: '超合金' },
  { name: 'Waspaloy',      density: 8200, youngModulus: 211,  category: '超合金' },

  // 炭素繊維複合材
  { name: 'CFRP (積層準等方)',  density: 1550, youngModulus:  70, category: 'CFRP' },
  { name: 'CFRP (一方向)',      density: 1600, youngModulus: 145, category: 'CFRP' },
  { name: 'C/C複合材',          density: 1900, youngModulus:  60, category: 'CFRP' },

  // その他複合材・樹脂
  { name: 'アラミド繊維 (Kevlar)', density: 1380, youngModulus: 70, category: '複合材・樹脂' },
  { name: 'ガラス繊維強化プラスチック (GFRP)', density: 1900, youngModulus: 20, category: '複合材・樹脂' },
  { name: 'ポリイミド',         density: 1420, youngModulus:   2.5, category: '複合材・樹脂' },

  // 断熱・アブレータ
  { name: 'アブレータ (ノボラック系)', density: 1250, youngModulus: 0.5, category: '断熱材' },
  { name: 'コルク',              density:  240, youngModulus: 0.03, category: '断熱材' },

  // 構造要素
  { name: 'アルミハニカムパネル (等価)', density: 130, youngModulus: 1.0, category: 'サンドイッチ構造' },
];

/** 材質名からプリセットを検索 */
export function findMaterialPreset(name: string): MaterialPreset | undefined {
  return MATERIAL_PRESETS.find((m) => m.name === name);
}

/** カテゴリごとにグループ化 */
export function getMaterialsByCategory(): Record<string, MaterialPreset[]> {
  const groups: Record<string, MaterialPreset[]> = {};
  for (const m of MATERIAL_PRESETS) {
    if (!groups[m.category]) groups[m.category] = [];
    groups[m.category].push(m);
  }
  return groups;
}

// ──────────────────────────────
// 形状タイプ (ロケットDB 形状データ / CADインポート共通)
// ──────────────────────────────
export interface ShapeType {
  value: string;
  label: string;
  /** 標準的に使用する寸法フィールド */
  fields: Array<'charLength' | 'diameter' | 'area'>;
}

export const SHAPE_TYPES: ShapeType[] = [
  { value: '',           label: '— 未設定 —',      fields: [] },
  { value: 'sphere',     label: '球体',             fields: ['diameter', 'area'] },
  { value: 'cylinder',   label: '円柱',             fields: ['charLength', 'diameter', 'area'] },
  { value: 'cone',       label: '円錐',             fields: ['charLength', 'diameter', 'area'] },
  { value: 'flat_plate', label: '平板',             fields: ['charLength', 'area'] },
  { value: 'cuboid',     label: '直方体',           fields: ['charLength', 'area'] },
  { value: 'irregular',  label: '不定形',           fields: ['charLength', 'area'] },
];
