import type { AnalysisServiceType, AppView } from '../../types';

/** 上流解析サービスの依存関係マップ（依存がないサービスはエントリなし） */
export const SERVICE_UPSTREAM: Partial<Record<AnalysisServiceType, AnalysisServiceType>> = {
  dispersedFlight:  'flightAnalysis',
  shipHazard:       'dispersedFlight',
  piEc:             'dispersedFlight',
  debrisImpact:     'dispersedFlight',
  rfLink:           'dispersedFlight',
  orbitLifetime:    'flightAnalysis',
  ablation:         'orbitLifetime',
  pathRotationRate: 'flightAnalysis',
  gnssSatellite:    'flightAnalysis',
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
};
