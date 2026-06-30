import type { AnalysisServiceType } from './analysis';

/** 申請書のステータス */
export type ApplicationStatus =
  | '作成済み'   // 解析完了で自動生成された
  | '提出済み'   // 内閣府に提出
  | '受理'       // 受理された
  | '差戻し';    // 修正依頼

/** 申請書本文に載る、標準化された解析結果1件 */
export interface StandardizedAnalysisResult {
  type: AnalysisServiceType;
  label: string;
  /** 主要指標（例: Ec, 最大ダウンレンジ等） */
  metrics: { key: string; value: string; unit?: string }[];
  status: string;
}

/**
 * 打ち上げ許可申請書。
 * 号機の必要解析がすべて完了した時点で自動生成される（status='作成済み'）。
 */
export interface Application {
  id: string;
  projectId: string;
  vehicleUnitId: string;
  /** 表示用に号機側からコピーした値（一覧で join しなくても表示できるように） */
  projectName: string;
  unitNo: string;
  missionName: string;
  launchDate: string;

  status: ApplicationStatus;
  /** 提出先（既定: 内閣府） */
  submittedTo: string;

  /** 自動生成日時 */
  generatedAt: string;
  /** 提出日時（提出済み以降） */
  submittedAt?: string;

  /** 標準化API を通した解析結果サマリ（申請書本文） */
  results: StandardizedAnalysisResult[];
  /** Expected Casualty（Ec）と判定 */
  ecValue?: number;
  ecPass?: boolean;

  createdAt: string;
  updatedAt: string;
}
