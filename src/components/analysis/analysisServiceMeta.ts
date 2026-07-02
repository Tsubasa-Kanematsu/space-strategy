import type { AnalysisServiceType } from '../../types';

export interface ServiceMeta {
  label: string;
  icon: string;
  shortLabel: string;
}

export const SERVICE_META: Record<AnalysisServiceType, ServiceMeta> = {
  aeroAnalysis:      { label: '空力解析',             icon: 'wind',              shortLabel: '空力' },
  flightAnalysis:    { label: '飛行解析',            icon: 'rocket-takeoff',    shortLabel: '飛行' },
  dispersedFlight:   { label: '分散飛行経路解析',     icon: 'diagram-3',         shortLabel: '分散飛行' },
  loadAnalysis:      { label: '荷重解析',             icon: 'speedometer2',      shortLabel: '荷重' },
  shipHazard:        { label: '海上船舶危険解析',     icon: 'tsunami',           shortLabel: '船舶危険' },
  piEc:              { label: '地上落下傷害予測数解析', icon: 'percent',         shortLabel: '地上Ec' },
  debrisImpact:      { label: '投棄物落下域解析',     icon: 'geo-alt',           shortLabel: '落下域' },
  rfLink:            { label: 'RFリンク解析',         icon: 'broadcast',         shortLabel: 'RFリンク' },
  ablation:          { label: '溶融解析',             icon: 'thermometer-high',  shortLabel: '溶融' },
  orbitLifetime:     { label: '軌道上寿命解析',       icon: 'globe',             shortLabel: '軌道寿命' },
  pathRotationRate:  { label: '経路回転率解析',       icon: 'arrow-repeat',      shortLabel: '経路回転率' },
  gnssSatellite:     { label: 'GNSS可視解析/COLA',    icon: 'reception-4',       shortLabel: 'GNSS可視' },
  launchSiteBuilding:{ label: '射場内建屋危険解析',   icon: 'building',          shortLabel: '射場建屋' },
  debrisDragFall:    { label: '破片抗力落下予測域解析', icon: 'geo',             shortLabel: '破片落下' },
  gateIncursion:     { label: 'ゲート侵犯可否',       icon: 'sign-stop',         shortLabel: 'ゲート' },
};

export const ALL_SERVICES: AnalysisServiceType[] = [
  'aeroAnalysis', 'flightAnalysis', 'dispersedFlight', 'loadAnalysis', 'shipHazard',
  'piEc', 'debrisImpact', 'rfLink', 'ablation', 'orbitLifetime',
  'pathRotationRate', 'gnssSatellite',
  'launchSiteBuilding', 'debrisDragFall', 'gateIncursion',
];
