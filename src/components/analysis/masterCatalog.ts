import { useMasterDataStore } from '../../stores/masterDataStore';
import type { AppView } from '../../types';

/**
 * 共通パラメータ（マスタデータ）の選択肢カタログ。
 *
 * 各マスタから「具体的にどの項目を使うか」をフェーズ単位で選択できるようにする。
 * 推進系・アンテナは実レコード（masterDataStore）から、その他（機体形状/空力係数/
 * 風/代表破片/故障率）は代表データを選択肢として提供する（プロトタイプ）。
 */

export interface MasterOption {
  id: string;
  label: string;
}

export interface MasterCategory {
  key: string;
  label: string;
  icon: string;
  view: AppView;
  multi: boolean;   // 複数選択可か（推進系・アンテナ・代表破片は複数）
}

export const MASTER_CATEGORIES: MasterCategory[] = [
  { key: 'shape',      label: '機体形状',     icon: 'rulers',               view: 'shapeMaster',        multi: false },
  { key: 'aero',       label: '空力係数',     icon: 'wind',                 view: 'aeroCoeffMaster',    multi: false },
  { key: 'propulsion', label: '推進系',       icon: 'fire',                 view: 'propulsionMaster',   multi: true },
  { key: 'wind',       label: '風',           icon: 'tornado',              view: 'windMaster',         multi: false },
  { key: 'debris',     label: '代表破片',     icon: 'hexagon',              view: 'debrisMaster',       multi: true },
  { key: 'failure',    label: '故障率',       icon: 'exclamation-triangle', view: 'failureRateMaster',  multi: false },
  { key: 'vAntenna',   label: '機体アンテナ', icon: 'broadcast',            view: 'vehicleAntennaData', multi: true },
  { key: 'gAntenna',   label: '地上局アンテナ', icon: 'broadcast-pin',      view: 'groundAntennaData',  multi: true },
];

// 静的マスタ（ストア未管理）の代表選択肢。ビューの表示内容に対応。
const STATIC_OPTIONS: Record<string, MasterOption[]> = {
  shape: [
    { id: 'LV-Alpha', label: 'LV-Alpha' },
    { id: 'LV-Beta-3', label: 'LV-Beta (3段型)' },
    { id: 'EpsilonS', label: 'イプシロンS相当' },
  ],
  aero: [
    { id: 'LV-Alpha', label: 'LV-Alpha 空力係数' },
    { id: 'LV-Beta-3', label: 'LV-Beta (3段型) 空力係数' },
  ],
  wind: [
    { id: 'taiki-annual', label: '大樹町射場・年間代表' },
  ],
  debris: [
    { id: 'engine', label: 'エンジン' },
    { id: 'tank-dome', label: 'タンクドーム' },
    { id: 'avionics', label: 'アビオ筐体' },
    { id: 'fairing', label: 'フェアリング片' },
    { id: 'interstage', label: '段間フレーム' },
    { id: 'small-struct', label: '小型構造片' },
  ],
  failure: [
    { id: 'standard', label: '標準故障率セット' },
  ],
};

/** 全マスタ種別の選択肢を返す（推進系・アンテナはストアから、他は静的）。 */
export function useAllMasterOptions(): Record<string, MasterOption[]> {
  const propulsions = useMasterDataStore((s) => s.propulsions);
  const antennas = useMasterDataStore((s) => s.antennas);
  return {
    ...STATIC_OPTIONS,
    propulsion: propulsions.map((p) => ({ id: p.id, label: p.name })),
    vAntenna: antennas.filter((a) => a.type === 'rocket').map((a) => ({ id: a.id, label: a.name })),
    gAntenna: antennas.filter((a) => a.type === 'ground').map((a) => ({ id: a.id, label: a.name })),
  };
}
