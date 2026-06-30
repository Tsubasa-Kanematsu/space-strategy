import type { AnalysisServiceType } from './analysis';

/** 号機のステータス（運用フェーズの進行段階） */
export type VehicleUnitStatus =
  | '計画'
  | 'PT実施中'
  | '申請済み'
  | 'FT確認中'
  | '打上可'
  | '打上完了';

export const VEHICLE_UNIT_STATUSES: VehicleUnitStatus[] = [
  '計画', 'PT実施中', '申請済み', 'FT確認中', '打上可', '打上完了',
];

/**
 * 解析フェーズ。1号機あたり PT・FT の2回実施する。
 * 各フェーズはそれぞれ独立した「機体諸元（DB）」と「解析パイプライン（解析フロー）」を持つ。
 */
export type AnalysisPhase = 'PT' | 'FT';

export const ANALYSIS_PHASES: AnalysisPhase[] = ['PT', 'FT'];

export const PHASE_META: Record<AnalysisPhase, { label: string; icon: string }> = {
  PT: { label: 'PT解析', icon: 'clipboard-data' },
  FT: { label: 'FT解析', icon: 'shield-check' },
};

/** フェーズの進行状況 */
export type PhaseStatus = '未着手' | '実施中' | '完了';
export const PHASE_STATUSES: PhaseStatus[] = ['未着手', '実施中', '完了'];

/** フェーズ1つ分の状態。機体諸元（DB）と解析パイプライン（フロー）を1つずつ持つ。 */
export interface PhaseState {
  /** このフェーズの機体諸元（massCase = DB）の ID */
  massCaseId?: string;
  /** このフェーズの解析パイプライン（解析フロー）の ID */
  flowId?: string;
  status: PhaseStatus;
}

/**
 * 号機（フライト1機分）。PT・FT の2フェーズで解析を実施する。
 * 各フェーズが独立した機体諸元・解析パイプラインを持つ。
 */
export interface VehicleUnit {
  id: string;
  projectId: string;
  /** 号機番号（例: "1", "2", "S1"） */
  unitNo: string;
  /** ミッション名 */
  missionName: string;
  /** 打ち上げ予定日（ISO date。未定は空文字） */
  launchDate: string;
  status: VehicleUnitStatus;
  /** このミッションで実施する解析項目（申請書に記載する解析の宣言） */
  requiredAnalyses: AnalysisServiceType[];
  /** PT解析フェーズ */
  pt: PhaseState;
  /** FT解析フェーズ */
  ft: PhaseState;
  memo?: string;
  createdAt: string;
  updatedAt: string;
}

/** PT解析が完了したか（＝申請書を自動生成できる） */
export function isPtComplete(u: Pick<VehicleUnit, 'pt'>): boolean {
  return u.pt.status === '完了';
}

/** FT解析が完了したか */
export function isFtComplete(u: Pick<VehicleUnit, 'ft'>): boolean {
  return u.ft.status === '完了';
}
