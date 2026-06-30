/**
 * 申請書の自動生成ロジック（プロトタイプ）。
 *
 * 号機の完了済み解析から、内閣府提出向けの「標準化された解析結果」を合成する。
 * 実運用では各解析結果（解析ストア）+ 標準化API(/api/standardize) の戻りを使うが、
 * プロトタイプでは決定論的なモック値で本文を組み立てる。
 */
import type { AnalysisServiceType, Application, StandardizedAnalysisResult, VehicleUnit } from '../types';
import { SERVICE_META } from '../components/analysis/analysisServiceMeta';

// 入力文字列から決定論的な擬似乱数（再現性のため）
function pseudo(seed: string, i: number): number {
  let h = 2166136261;
  const s = `${seed}:${i}`;
  for (let k = 0; k < s.length; k++) {
    h ^= s.charCodeAt(k);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/** 解析種別ごとの代表的な主要指標（モック） */
function metricsFor(type: AnalysisServiceType, seed: string): StandardizedAnalysisResult['metrics'] {
  const r = (i: number) => pseudo(seed + type, i);
  switch (type) {
    case 'flightAnalysis':
      return [
        { key: '最大高度', value: String(Math.round(100 + r(1) * 60)), unit: 'km' },
        { key: '最大ダウンレンジ', value: String(Math.round(700 + r(2) * 500)), unit: 'km' },
      ];
    case 'dispersedFlight':
      return [
        { key: '3σ落下楕円長径', value: (5 + r(1) * 20).toFixed(1), unit: 'km' },
        { key: '想定落下点数', value: String(1000 + Math.round(r(2) * 4000)) },
      ];
    case 'loadAnalysis':
      return [
        { key: '最大動圧', value: (30 + r(1) * 30).toFixed(1), unit: 'kPa' },
        { key: '最大軸加速度', value: (4 + r(2) * 4).toFixed(1), unit: 'G' },
      ];
    case 'shipHazard':
      return [
        { key: '船舶被害確率', value: (r(1) * 1e-5).toExponential(2) },
        { key: '危険区域面積', value: String(Math.round(200 + r(2) * 800)), unit: 'km²' },
      ];
    case 'piEc':
      return [
        { key: 'Expected Casualty (Ec)', value: (r(1) * 1e-4).toExponential(2) },
        { key: 'Pi (個別確率)', value: (r(2) * 1e-6).toExponential(2) },
      ];
    case 'debrisImpact':
      return [
        { key: '投棄物落下域(個数)', value: String(2 + Math.round(r(1) * 4)) },
        { key: '最大破片運動エネルギー', value: String(Math.round(50 + r(2) * 400)), unit: 'J' },
      ];
    case 'rfLink':
      return [
        { key: '最小リンクマージン', value: (3 + r(1) * 6).toFixed(1), unit: 'dB' },
      ];
    case 'ablation':
      return [
        { key: '最大表面温度', value: String(Math.round(1200 + r(1) * 1500)), unit: 'K' },
        { key: '残存質量割合', value: (r(2) * 100).toFixed(1), unit: '%' },
      ];
    case 'orbitLifetime':
      return [
        { key: '軌道寿命', value: (r(1) * 25).toFixed(1), unit: '年' },
      ];
    case 'pathRotationRate':
      return [
        { key: '最大経路回転率', value: (1 + r(1) * 5).toFixed(2), unit: 'deg/s' },
      ];
    case 'gnssSatellite':
      return [
        { key: '可視衛星数(最小)', value: String(5 + Math.round(r(1) * 6)) },
        { key: '測位精度(水平)', value: (2 + r(2) * 8).toFixed(1), unit: 'm' },
      ];
    default:
      return [{ key: '判定', value: 'OK' }];
  }
}

export interface BuildAppInput {
  unit: VehicleUnit;
  projectName: string;
}

/** 号機から申請書本文データ（results + Ec判定）を合成する */
export function buildApplicationData(input: BuildAppInput): Pick<
  Application,
  'projectId' | 'vehicleUnitId' | 'projectName' | 'unitNo' | 'missionName' | 'launchDate'
  | 'status' | 'submittedTo' | 'generatedAt' | 'results' | 'ecValue' | 'ecPass'
> {
  const { unit, projectName } = input;
  // 内閣府申請は PT解析（計画時）の結果を用いる。申請書にはミッションの宣言解析項目を載せる。
  const seed = `${unit.id}:${unit.missionName}`;
  const results: StandardizedAnalysisResult[] = unit.requiredAnalyses.map((type) => ({
    type,
    label: SERVICE_META[type]?.label ?? type,
    metrics: metricsFor(type, seed),
    status: '完了',
  }));

  // Ec は Pi/Ec解析の値を採用（無ければ全体から推定）
  const ec = pseudo(seed, 99) * 1e-4;
  const ecPass = ec < 1e-4;

  return {
    projectId: unit.projectId,
    vehicleUnitId: unit.id,
    projectName,
    unitNo: unit.unitNo,
    missionName: unit.missionName,
    launchDate: unit.launchDate,
    status: '作成済み',
    submittedTo: '内閣府',
    generatedAt: new Date().toISOString(),
    results,
    ecValue: ec,
    ecPass,
  };
}
