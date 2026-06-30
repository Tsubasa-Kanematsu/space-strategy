import type { AnalysisServiceType } from './analysis';

export type AppView =
  | 'projects'
  | 'traceability'
  | 'massCases'
  | 'massModel'
  | 'parameters'
  | 'rocketShapeData'
  | 'propulsionData'
  | 'debrisShapeData'
  | 'errorSourceData'
  | 'sizingCases'
  | 'sizingCondition'
  | 'sizingResults'
  | 'analysisCases'
  | 'analysisCondition'
  | 'analysisResults'
  /** 解析フロー: 全プロジェクト横断の一覧画面 */
  | 'analysisFlow'
  /** 解析フロー: 個別フロー編集画面 */
  | 'analysisFlowDetail'
  | 'antennaData'
  /** マスタデータ: 地上局アンテナ */
  | 'groundAntennaData'
  /** マスタデータ: 機体アンテナ */
  | 'vehicleAntennaData'
  /** マスタデータ: 推進系データ */
  | 'propulsionMaster'
  /** マスタデータ: 風データ */
  | 'windMaster'
  /** マスタデータ: 故障率データ */
  | 'failureRateMaster'
  /** カスタム解析: ケース一覧 */
  | 'pluginCases'
  /** カスタム解析: 個別ケース条件・実行 */
  | 'pluginCondition'
  /** 解析ハブ: 各解析サービス + サイジング + カスタム解析 + 解析フロー をカード並びで表示 */
  | 'analysisHub'
  /** マスタデータハブ: アンテナデータ等のマスタデータ画面をカード並びで表示 */
  | 'masterDataHub'
  /** マスタデータ: 機体形状データ */
  | 'shapeMaster'
  /** マスタデータ: 空力係数データ */
  | 'aeroCoeffMaster'
  /** マスタデータ: 代表破片データ */
  | 'debrisMaster'
  /** プロジェクト詳細: 号機一覧テーブル */
  | 'vehicleUnits'
  /** 号機詳細: 紐づくデータ・解析結果 */
  | 'vehicleUnitDetail'
  /** 申請書: 解析済み/申請済みミッション一覧 */
  | 'applications'
  /** 申請書: 個別申請書の閲覧 */
  | 'applicationDetail';

export interface AppNavState {
  view: AppView;
  projectId: string | null;
  massCaseId: string | null;
  sizingCaseId: string | null;
  analysisCaseId: string | null;
  analysisService: AnalysisServiceType | null;
  /** カスタム解析ケース ID (pluginCondition で使用) */
  pluginCaseId: string | null;
  /** 解析フロー ID (analysisFlowDetail で使用) */
  analysisFlowId: string | null;
  /** 号機 ID (vehicleUnitDetail で使用) */
  vehicleUnitId: string | null;
  /** 申請書 ID (applicationDetail で使用) */
  applicationId: string | null;
}
