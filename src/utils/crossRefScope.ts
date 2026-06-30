import type { PropulsionStage, RocketGeometry } from '../types';

/**
 * 推進系データから数式スコープ変数を構築する。
 *
 * 変数命名規則（N = stageNo）:
 *   p{N}_thrust_vac  : 総真空推力 (kN)  = thrustVacKN × engineCount
 *   p{N}_thrust_sl   : 総海面推力 (kN)  = thrustSLKN × engineCount
 *   p{N}_isp_vac     : 真空 Isp (s)
 *   p{N}_isp_sl      : 海面 Isp (s)
 *   p{N}_burn        : 燃焼時間 (s)
 *   p{N}_prop_mass   : 推進剤質量 (kg)
 *   p{N}_pc          : 燃焼室圧 (MPa)
 *   p{N}_eps         : 膨張比
 *   p{N}_of          : O/F 比
 *   p{N}_n_eng       : エンジン数
 */
export function buildPropulsionScope(
  stages: PropulsionStage[],
): Record<string, number> {
  const scope: Record<string, number> = {};
  for (const st of stages) {
    const N = st.stageNo;
    const set = (suffix: string, v: number | null) => {
      if (v !== null) scope[`p${N}_${suffix}`] = v;
    };
    set('n_eng',      st.engineCount);
    set('thrust_vac', st.thrustVacKN !== null ? st.thrustVacKN * st.engineCount : null);
    set('thrust_sl',  st.thrustSLKN  !== null ? st.thrustSLKN  * st.engineCount : null);
    set('isp_vac',    st.ispVacS);
    set('isp_sl',     st.ispSLS);
    set('burn',       st.burnTimeSec);
    set('prop_mass',  st.propellantMassKg);
    set('pc',         st.chamberPressureMPa);
    set('eps',        st.expansionRatio);
    set('of',         st.ofRatio);
  }
  return scope;
}

/**
 * ロケット形状データから数式スコープ変数を構築する。
 *
 * 変数:
 *   geom_nose_len   : ノーズコーン長さ (m)
 *   geom_nose_dia   : ノーズコーン基部直径 (m)
 *   geom_ref_area   : 基準断面積 (m²)  = π × (D/2)²
 *   geom_total_len  : 全長 (m)  = ノーズ + 胴体セクション合計
 */
export function buildShapeScope(
  geometry: RocketGeometry | undefined,
): Record<string, number> {
  if (!geometry) return {};
  const { noseCone, bodySections } = geometry;
  const scope: Record<string, number> = {};
  scope['geom_nose_len']  = noseCone.lengthM;
  scope['geom_nose_dia']  = noseCone.baseDiameterM;
  scope['geom_ref_area']  = Math.PI * (noseCone.baseDiameterM / 2) ** 2;
  scope['geom_total_len'] = noseCone.lengthM + bodySections.reduce((acc, bs) => acc + bs.lengthM, 0);
  return scope;
}

/** 全クロスリファレンス変数を統合したスコープを返す */
export function buildCrossRefScope(
  stages: PropulsionStage[],
  geometry: RocketGeometry | undefined,
): Record<string, number> {
  return {
    ...buildShapeScope(geometry),
    ...buildPropulsionScope(stages),
  };
}

// ---- ドキュメント生成（UI参照パネル用）----

export interface CrossRefVarDoc {
  varName: string;
  description: string;
  unit: string;
  value: number | null;
}

/** 推進系変数の一覧（UI表示用） */
export function listPropulsionVars(stages: PropulsionStage[]): CrossRefVarDoc[] {
  const scope = buildPropulsionScope(stages);
  const docs: CrossRefVarDoc[] = [];
  for (const st of stages) {
    const N = st.stageNo;
    const engineLabel = st.engineName ? ` (${st.engineName})` : '';
    const label = `${N}段${engineLabel}`;
    const row = (suffix: string, desc: string, unit: string): CrossRefVarDoc => ({
      varName: `p${N}_${suffix}`,
      description: `${label} ${desc}`,
      unit,
      value: scope[`p${N}_${suffix}`] ?? null,
    });
    docs.push(
      row('n_eng',      'エンジン数',          '台'),
      row('thrust_vac', '総真空推力',           'kN'),
      row('thrust_sl',  '総海面推力',           'kN'),
      row('isp_vac',    '真空 Isp',             's'),
      row('isp_sl',     '海面 Isp',             's'),
      row('burn',       '燃焼時間',             's'),
      row('prop_mass',  '推進剤質量',           'kg'),
      row('pc',         '燃焼室圧',             'MPa'),
      row('eps',        '膨張比',               '—'),
      row('of',         'O/F 比',               '—'),
    );
  }
  return docs;
}

/** 形状変数の一覧（UI表示用） */
export function listShapeVars(geometry: RocketGeometry | undefined): CrossRefVarDoc[] {
  if (!geometry) return [];
  const scope = buildShapeScope(geometry);
  const row = (varName: string, desc: string, unit: string): CrossRefVarDoc => ({
    varName,
    description: desc,
    unit,
    value: scope[varName] ?? null,
  });
  return [
    row('geom_nose_len',  'ノーズコーン長さ',  'm'),
    row('geom_nose_dia',  'ノーズコーン直径',  'm'),
    row('geom_ref_area',  '基準断面積',         'm²'),
    row('geom_total_len', '全長',               'm'),
  ];
}
