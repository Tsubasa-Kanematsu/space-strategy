/**
 * 共通パラメータ（マスタ）をフロー画面上でインライン編集するためのフィールド定義。
 * MasterSelectModal が使用。各マスタの「名称以外」の編集フィールドと、
 * 新規レコードの完全な初期値（ストアの型を満たす）を提供する。
 */

export type FieldType = 'text' | 'number' | 'select';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  step?: string;
}

/** 名称(name)以外の編集フィールド。 */
export const MASTER_FIELDS: Record<string, FieldDef[]> = {
  shape: [
    { key: 'lengthM', label: '全長(m)', type: 'number' },
    { key: 'maxDiameterM', label: '最大直径(m)', type: 'number' },
    { key: 'stages', label: '段数', type: 'number' },
    { key: 'noseCone', label: 'ノーズコーン形式', type: 'select', options: ['フォン・カルマン', 'タンジェントオージャイブ', 'コニカル', 'その他'] },
    { key: 'refAreaM2', label: '基準面積(m²)', type: 'number' },
  ],
  aero: [
    { key: 'cdSubsonic', label: '亜音速Cd', type: 'number' },
    { key: 'cdTransonicPeak', label: '遷音速ピークCd', type: 'number' },
    { key: 'cdSupersonic', label: '超音速Cd', type: 'number' },
    { key: 'clAlpha', label: '揚力傾斜CLα(/rad)', type: 'number' },
  ],
  propulsion: [
    { key: 'stage', label: '段', type: 'text' },
    { key: 'propellant', label: '推進剤', type: 'text' },
    { key: 'cycle', label: 'サイクル', type: 'text' },
    { key: 'thrustVacKN', label: '真空推力(kN)', type: 'number' },
    { key: 'thrustSlKN', label: '海面推力(kN)', type: 'number' },
    { key: 'ispVacS', label: '真空Isp(s)', type: 'number' },
    { key: 'burnTimeS', label: '燃焼時間(s)', type: 'number' },
    { key: 'throttle', label: 'スロットル', type: 'text' },
  ],
  wind: [
    { key: 'site', label: '射場', type: 'text' },
    { key: 'maxSpeedMs', label: '最大風速(m/s)', type: 'number' },
    { key: 'maxSpeedAltKm', label: '最大風速高度(km)', type: 'number' },
    { key: 'dirDeg', label: '代表風向(deg)', type: 'number' },
  ],
  debris: [
    { key: 'massKg', label: '質量(kg)', type: 'number' },
    { key: 'areaM2', label: '代表断面積(m²)', type: 'number' },
    { key: 'cd', label: '抗力係数Cd', type: 'number' },
    { key: 'material', label: '材質', type: 'text' },
  ],
  failure: [
    { key: 'failureRate', label: '故障率(/flight)', type: 'number', step: 'any' },
    { key: 'mode', label: '代表故障モード', type: 'text' },
    { key: 'phase', label: '発生フェーズ', type: 'text' },
  ],
  vAntenna: [
    { key: 'frequencyBand', label: '周波数帯', type: 'text' },
    { key: 'frequencyMHz', label: '周波数(MHz)', type: 'number' },
    { key: 'gainDbi', label: '利得(dBi)', type: 'number' },
    { key: 'eirpDbw', label: 'EIRP(dBW)', type: 'number' },
    { key: 'polarization', label: '偏波', type: 'text' },
  ],
  gAntenna: [
    { key: 'frequencyBand', label: '周波数帯', type: 'text' },
    { key: 'frequencyMHz', label: '周波数(MHz)', type: 'number' },
    { key: 'gainDbi', label: '利得(dBi)', type: 'number' },
    { key: 'gtDbK', label: 'G/T(dB/K)', type: 'number' },
    { key: 'polarization', label: '偏波', type: 'text' },
  ],
};

/** 新規レコードの完全な初期値（ストアの型を満たす全フィールド）。 */
export const MASTER_BLANK: Record<string, () => Record<string, unknown>> = {
  shape: () => ({ name: '', lengthM: null, maxDiameterM: null, stages: null, noseCone: 'フォン・カルマン', refAreaM2: null, memo: '' }),
  aero: () => ({ name: '', cdSubsonic: null, cdTransonicPeak: null, cdSupersonic: null, clAlpha: null, memo: '' }),
  propulsion: () => ({ name: '', stage: '', propellant: '', cycle: '', thrustVacKN: null, thrustSlKN: null, ispVacS: null, burnTimeS: null, throttle: '', memo: '' }),
  wind: () => ({ name: '', site: '', maxSpeedMs: null, maxSpeedAltKm: null, dirDeg: null, memo: '' }),
  debris: () => ({ name: '', massKg: null, areaM2: null, cd: null, material: '', memo: '' }),
  failure: () => ({ name: '', failureRate: null, mode: '', phase: '', memo: '' }),
  vAntenna: () => ({ name: '', type: 'rocket', frequencyBand: '', frequencyMHz: null, gainDbi: null, eirpDbw: null, gtDbK: null, polarization: '', memo: '' }),
  gAntenna: () => ({ name: '', type: 'ground', frequencyBand: '', frequencyMHz: null, gainDbi: null, eirpDbw: null, gtDbK: null, polarization: '', memo: '' }),
};

/** レコード1件の要約文字列（先頭2フィールドを "ラベル 値" で連結）。 */
export function summarizeRecord(catKey: string, rec: Record<string, unknown>): string {
  const fields = MASTER_FIELDS[catKey] ?? [];
  return fields
    .slice(0, 2)
    .map((f) => {
      const v = rec[f.key];
      if (v === null || v === undefined || v === '') return null;
      return `${f.label} ${v}`;
    })
    .filter(Boolean)
    .join(' / ');
}
