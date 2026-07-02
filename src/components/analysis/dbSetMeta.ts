import type { AnalysisServiceType, AppView } from '../../types';

/** 上流解析サービスの依存関係マップ（依存がないサービスはエントリなし） */
// 上流解析（このサービスの入力となる上位解析）。運用版の飛行安全解析フローに準拠。
//  飛行解析 → 飛行経路分散解析 → {軌道上寿命→溶融, 海上船舶危険, 地上Ec(Pi/Ec),
//                                 投棄物落下域, GNSS可視, 射場内建屋危険, RFリンク}
//  飛行解析 → 経路回転率解析 → 破片抗力落下予測域解析 → ゲート侵犯可否
export const SERVICE_UPSTREAM: Partial<Record<AnalysisServiceType, AnalysisServiceType>> = {
  dispersedFlight:    'flightAnalysis',
  orbitLifetime:      'dispersedFlight',
  ablation:           'orbitLifetime',
  shipHazard:         'dispersedFlight',
  piEc:               'dispersedFlight',
  debrisImpact:       'dispersedFlight',
  gnssSatellite:      'dispersedFlight',
  launchSiteBuilding: 'dispersedFlight',
  rfLink:             'dispersedFlight',
  pathRotationRate:   'flightAnalysis',
  debrisDragFall:     'pathRotationRate',
  gateIncursion:      'debrisDragFall',
};

export type DbSet = 'mass' | 'cg' | 'inertia' | 'material' | 'debris' | 'errorSource' | 'shape' | 'propulsion';

/**
 * MassModel に統合済みのデータビュー (mass/cginertia/material/mounting) は massModel 経由で開く。
 * 統合済みでない (debris/errorSource/shape) は従来通り専用ビューへ。
 * massModelTab を指定すると MassModel 起動時にそのタブを選択する (sessionStorage 経由)。
 */
export interface DbSetMeta {
  label: string;
  icon: string;
  view: AppView;
  badgeClass: string;
  /** view='massModel' のときに開くデータビュー (内部タブ) */
  massModelTab?: 'mass' | 'cginertia' | 'material' | 'mounting';
}

export const DB_SET_META: Record<DbSet, DbSetMeta> = {
  mass:        { label: '質量',       icon: 'boxes',               view: 'massModel',         massModelTab: 'mass',      badgeClass: 'bg-primary-subtle text-primary' },
  cg:          { label: '重心',       icon: 'crosshair',           view: 'massModel',         massModelTab: 'cginertia', badgeClass: 'bg-success-subtle text-success' },
  inertia:     { label: '慣性テンソル', icon: 'arrow-clockwise',   view: 'massModel',         massModelTab: 'cginertia', badgeClass: 'bg-info-subtle text-info' },
  material:    { label: '材質',       icon: 'layers',              view: 'massModel',         massModelTab: 'material',  badgeClass: 'bg-warning-subtle text-warning' },
  debris:      { label: '形状',       icon: 'hexagon',             view: 'debrisShapeData',                              badgeClass: 'bg-danger-subtle text-danger' },
  errorSource: { label: '誤差源',     icon: 'exclamation-diamond', view: 'errorSourceData',                              badgeClass: 'bg-secondary-subtle text-secondary' },
  shape:       { label: 'ロケット形状', icon: 'rulers-combined',   view: 'rocketShapeData',                              badgeClass: 'bg-primary-subtle text-primary' },
  propulsion:  { label: '推進系',     icon: 'fire',                view: 'propulsionData',                               badgeClass: 'bg-danger-subtle text-danger' },
};

/** クリックで navigate する際、massModelTab を sessionStorage に積んでおき、
 *  MassModel 側で起動時に拾って初期 dataView に反映する。
 *  ・URL に乗せると routing 拡張が広範になるので軽量に runtime hint で代替
 *  ・1 回読んだら自動削除 */
export const MASSMODEL_INITIAL_TAB_KEY = 'rocketdb.massModel.initialTab';
export function setMassModelInitialTab(tab: 'mass' | 'cginertia' | 'material' | 'mounting'): void {
  try { sessionStorage.setItem(MASSMODEL_INITIAL_TAB_KEY, tab); } catch { /* noop */ }
}
export function consumeMassModelInitialTab(): 'mass' | 'cginertia' | 'material' | 'mounting' | null {
  try {
    const v = sessionStorage.getItem(MASSMODEL_INITIAL_TAB_KEY);
    if (!v) return null;
    sessionStorage.removeItem(MASSMODEL_INITIAL_TAB_KEY);
    if (v === 'mass' || v === 'cginertia' || v === 'material' || v === 'mounting') return v;
    return null;
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────
// 解析インプットの3分類（運用版の再設計）
//   ① マスタデータ（号機によらず共通）          → ANALYSIS_MASTER_REFS（マスタ画面へ）
//   ② 条件設定（解析の種類によらず共通＝機体諸元）→ ANALYSIS_CONDITION_SETS（このフェーズの条件設定へ）
//   ③ 解析固有（解析によって変わる）             → 各 *Form（解析条件画面の左側）
// ─────────────────────────────────────────────────────────────────

export interface MasterRef {
  key: string;
  label: string;
  icon: string;
  view: AppView;
}

const MASTER: Record<string, MasterRef> = {
  shape:      { key: 'shape',      label: '機体形状データ',     icon: 'rulers',               view: 'shapeMaster' },
  aero:       { key: 'aero',       label: '空力係数データ',     icon: 'wind',                 view: 'aeroCoeffMaster' },
  propulsion: { key: 'propulsion', label: '推進系データ',       icon: 'fire',                 view: 'propulsionMaster' },
  wind:       { key: 'wind',       label: '風データ',           icon: 'tornado',              view: 'windMaster' },
  debris:     { key: 'debris',     label: '代表破片データ',     icon: 'hexagon',              view: 'debrisMaster' },
  failure:    { key: 'failure',    label: '故障率データ',       icon: 'exclamation-triangle', view: 'failureRateMaster' },
  vAntenna:   { key: 'vAntenna',   label: '機体アンテナデータ', icon: 'broadcast',            view: 'vehicleAntennaData' },
  gAntenna:   { key: 'gAntenna',   label: '地上局アンテナデータ', icon: 'broadcast-pin',      view: 'groundAntennaData' },
};

/** ① マスタデータ（号機共通）: 各解析が参照するマスタ */
export const ANALYSIS_MASTER_REFS: Record<AnalysisServiceType, MasterRef[]> = {
  aeroAnalysis:     [MASTER.shape, MASTER.aero],
  flightAnalysis:   [MASTER.shape, MASTER.aero, MASTER.propulsion, MASTER.wind],
  dispersedFlight:  [MASTER.wind],
  loadAnalysis:     [MASTER.aero, MASTER.wind],
  shipHazard:       [MASTER.debris],
  piEc:             [MASTER.debris, MASTER.failure],
  debrisImpact:     [MASTER.debris],
  rfLink:           [MASTER.vAntenna, MASTER.gAntenna],
  ablation:         [MASTER.debris],
  orbitLifetime:    [],
  pathRotationRate: [],
  gnssSatellite:    [MASTER.vAntenna],
  launchSiteBuilding: [MASTER.debris, MASTER.failure],
  debrisDragFall:   [MASTER.debris],
  gateIncursion:    [MASTER.debris],
};

/** ② 条件設定（機体諸元・解析共通）: 各解析が参照する機体諸元データ（mass/cg/inertia/material/errorSource のみ） */
export const ANALYSIS_CONDITION_SETS: Record<AnalysisServiceType, DbSet[]> = {
  aeroAnalysis:     [],
  flightAnalysis:   ['mass', 'cg', 'inertia'],
  dispersedFlight:  ['errorSource'],
  loadAnalysis:     ['mass', 'cg', 'inertia', 'material'],
  shipHazard:       ['mass', 'errorSource'],
  piEc:             ['mass', 'cg', 'inertia', 'errorSource'],
  debrisImpact:     ['mass', 'errorSource'],
  rfLink:           ['mass', 'cg', 'inertia', 'errorSource'],
  ablation:         ['mass', 'material'],
  orbitLifetime:    ['mass'],
  pathRotationRate: ['mass', 'cg', 'inertia'],
  gnssSatellite:    ['mass', 'cg', 'inertia', 'errorSource'],
  launchSiteBuilding: ['mass', 'errorSource'],
  debrisDragFall:   ['mass', 'errorSource'],
  gateIncursion:    ['errorSource'],
};

/** （旧）DBセット参照。後方互換のため残置。新UIは上の3分類を使う。 */
export const SERVICE_DB_SETS: Record<AnalysisServiceType, DbSet[]> = {
  aeroAnalysis:     ['shape'],
  flightAnalysis:   ['mass', 'cg', 'inertia', 'shape', 'propulsion'],
  dispersedFlight:  ['errorSource'],
  loadAnalysis:     ['mass', 'cg', 'inertia', 'material'],
  shipHazard:       ['mass', 'debris', 'errorSource'],
  piEc:             ['mass', 'cg', 'inertia', 'debris', 'errorSource'],
  debrisImpact:     ['mass', 'debris', 'errorSource'],
  rfLink:           ['mass', 'cg', 'inertia', 'errorSource'],
  ablation:         ['mass', 'material', 'debris'],
  orbitLifetime:    ['mass', 'debris'],
  pathRotationRate: ['mass', 'cg', 'inertia'],
  gnssSatellite:    ['mass', 'cg', 'inertia', 'errorSource'],
  launchSiteBuilding: ['mass', 'errorSource'],
  debrisDragFall:   ['mass', 'errorSource'],
  gateIncursion:    ['errorSource'],
};
