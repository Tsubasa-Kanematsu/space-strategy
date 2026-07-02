export type AnalysisServiceType =
  | 'aeroAnalysis'
  | 'flightAnalysis'
  | 'dispersedFlight'
  | 'loadAnalysis'
  | 'shipHazard'
  | 'piEc'
  | 'debrisImpact'
  | 'rfLink'
  | 'ablation'
  | 'orbitLifetime'
  | 'pathRotationRate'
  | 'gnssSatellite'
  | 'launchSiteBuilding'
  | 'debrisDragFall'
  | 'gateIncursion';

export interface DataBinding {
  id: string;
  fromAnalysisCaseId: string;
  fromResultLabel: string;
  toType: 'deltaV';
  toDeltaVEntryKey: string;
  massCaseId: string;
}

export interface AnalysisFlowStep {
  id: string;
  order: number;
  label: string;
  /**
   * ステップの種類。
   *  - 'normal' (既定): 解析/サイジング/カスタム/DBなどに紐付く実行ステップ
   *  - 'decision'    : 判定ステップ。複数前駆からの結果を判定し、条件を満たさなければ
   *                    loopBackToStepId に戻る。満たせば後続 nextStepIds へ進む
   * 旧データは kind 未定義 = 'normal' として扱う。
   */
  kind?: 'normal' | 'decision';
  analysisCaseId?: string;    // 解析ケース (normal)
  isCustom?: boolean;         // カスタム解析ステップ（サービス種別なし。名前・メモで管理）
  sizingCaseId?: string;      // サイジングケース (normal)
  linkedMassCaseId?: string;  // DB（MassCase）更新ステップ用 (normal)
  pluginCaseId?: string;      // カスタム解析(プラグイン)ケース (normal)
  status: 'pending' | 'in_progress' | 'done';
  notes: string;
  dataBindings: DataBinding[];
  // ---- グラフ構造 ----
  // 後続ステップID一覧。複数指定で並列分岐、別ステップから複数指定で合流。
  // 未定義 (=旧データ) は order ベースの線形フローとして扱う。
  nextStepIds?: string[];
  // ---- ループ設定 (判定ステップのみ使用) ----
  loopBackToStepId?: string;  // ループ先ステップID
  loopCondition?: string;     // ループ条件メモ（自由記述）
  // ---- ReactFlow キャンバス座標 ----
  position?: { x: number; y: number };
}

export interface AnalysisFlow {
  id: string;
  projectId: string;
  name: string;
  steps: AnalysisFlowStep[];
  createdAt: string;
  updatedAt: string;
}

/** パラメータ別のメモ・エビデンス注記。 */
export interface ParamAnnotation {
  id: string;
  param: string;      // 対象パラメータ名（自由記述可）
  memo: string;       // 設定根拠・補足
  evidence: string;   // エビデンス（図番・報告書・URL 等）
}

export interface AnalysisCase {
  id: string;
  projectId: string;
  massCaseId: string;
  serviceType: AnalysisServiceType;
  name: string;
  memo: string;
  createdBy: string;
  condition: Record<string, unknown>;
  annotations?: ParamAnnotation[];  // パラメータ別のメモ・エビデンス
  upstreamCaseId: string;  // 上流解析ケースID（依存関係がない場合は空文字）
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisResult {
  id: string;
  analysisCaseId: string;
  no: number;
  label: string;
  value: string;
  unit: string;
  notes: string;
  createdAt: string;
}
