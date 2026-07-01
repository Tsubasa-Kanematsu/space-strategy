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

/** 解析の進行状況 */
export type PhaseStatus = '未着手' | '実施中' | '完了';
export const PHASE_STATUSES: PhaseStatus[] = ['未着手', '実施中', '完了'];

/**
 * 号機で実施する解析1件分。機体諸元（DB）と解析パイプライン（解析フロー）を1つずつ持つ。
 * 従来は PT/FT の2フェーズ固定だったが、号機ごとに任意の解析を並べられるリストにした。
 * PT解析・FT解析はサンプルとして既定で追加される。
 */
export interface AnalysisEntry {
  id: string;
  name: string;              // 例: 'PT解析', 'FT解析', '追加解析'
  icon: string;              // bootstrap-icons 名
  kind: 'PT' | 'FT' | 'custom';
  massCaseId?: string;       // 機体諸元（massCase = DB）の ID
  flowId?: string;           // 解析パイプライン（解析フロー）の ID
  masterSelections?: Record<string, string[]>; // 共通パラメータ: マスタ選択
  status: PhaseStatus;
}

/** 号機に既定で追加される解析（サンプル）。 */
export const DEFAULT_ANALYSES: Array<Pick<AnalysisEntry, 'name' | 'icon' | 'kind'>> = [
  { name: 'PT解析', icon: 'clipboard-data', kind: 'PT' },
  { name: 'FT解析', icon: 'shield-check', kind: 'FT' },
];

/**
 * 号機（フライト1機分）。任意の数の解析を並べて実施する。
 * 各解析が独立した機体諸元・解析パイプラインを持つ。
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
  /** この号機で実施する解析の一覧（PT/FT はサンプル） */
  analyses: AnalysisEntry[];
  memo?: string;
  createdAt: string;
  updatedAt: string;
}

/** 申請書の元になる解析（PT種別、無ければ先頭）を返す。 */
export function primaryAnalysis(u: Pick<VehicleUnit, 'analyses'>): AnalysisEntry | undefined {
  return u.analyses.find((a) => a.kind === 'PT') ?? u.analyses[0];
}

/** 申請書を自動生成できるか（PT解析＝主解析が完了）。 */
export function isPtComplete(u: Pick<VehicleUnit, 'analyses'>): boolean {
  return primaryAnalysis(u)?.status === '完了';
}
