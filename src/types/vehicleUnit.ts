import type { AnalysisServiceType } from './analysis';

/** 号機のステータス（運用フェーズの進行段階） */
export type VehicleUnitStatus =
  | '計画'
  | '解析中'
  | '解析完了'
  | '申請準備'
  | '申請済み'
  | '打上完了';

export const VEHICLE_UNIT_STATUSES: VehicleUnitStatus[] = [
  '計画', '解析中', '解析完了', '申請準備', '申請済み', '打上完了',
];

/**
 * 号機（フライト1機分）。
 * プロジェクト（例: イプシロン）の配下に 1..N 並ぶ。
 * 機体諸元（質量・形状）データや解析ケースが紐づく。
 */
export interface VehicleUnit {
  id: string;
  projectId: string;
  /** 号機番号（例: "1", "2", "S1"） */
  unitNo: string;
  /** ミッション名 */
  missionName: string;
  /** 打ち上げ予定日（ISO date, 例 "2026-09-01"。未定は空文字） */
  launchDate: string;
  status: VehicleUnitStatus;
  /** 紐づく機体諸元（既存の massCase = DB）の ID（任意） */
  massCaseId?: string;
  /** 申請に必要な解析項目 */
  requiredAnalyses: AnalysisServiceType[];
  /** 完了済みの解析項目 */
  completedAnalyses: AnalysisServiceType[];
  memo?: string;
  createdAt: string;
  updatedAt: string;
}

/** 解析進捗（0–1）。必要解析が空なら 0。 */
export function analysisProgress(u: Pick<VehicleUnit, 'requiredAnalyses' | 'completedAnalyses'>): number {
  if (u.requiredAnalyses.length === 0) return 0;
  const done = u.requiredAnalyses.filter((a) => u.completedAnalyses.includes(a)).length;
  return done / u.requiredAnalyses.length;
}

/** 申請書を自動生成できる状態か（必要解析がすべて完了） */
export function isAnalysisComplete(u: Pick<VehicleUnit, 'requiredAnalyses' | 'completedAnalyses'>): boolean {
  return u.requiredAnalyses.length > 0 && analysisProgress(u) >= 1;
}
