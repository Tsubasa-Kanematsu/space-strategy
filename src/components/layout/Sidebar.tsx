import React from 'react';
import { useAppStore } from '../../stores/appStore';
import type { AppView } from '../../types';
import { useFlags } from '../../stores/featureFlagsStore';

// 「解析」 1 アイテムから analysisHub に入り、ハブ内のカードで各サービスを開く形に統一。
// なので解析関連の全 view はサイドバーの 「解析」 ハイライト対象として扱う。
const ANALYSIS_LIKE_VIEWS: AppView[] = [
  'analysisHub',
  'analysisCases', 'analysisCondition', 'analysisResults',
  'sizingCases', 'sizingCondition', 'sizingResults',
  'analysisFlow', 'analysisFlowDetail',
  'pluginCases', 'pluginCondition',
];

// プロジェクト（号機一覧・号機詳細・トレーサビリティ等）配下の view
const PROJECT_LIKE_VIEWS: AppView[] = [
  'projects', 'vehicleUnits', 'vehicleUnitDetail', 'traceability',
  'massCases', 'massModel', 'parameters',
  'rocketShapeData', 'propulsionData', 'debrisShapeData', 'errorSourceData',
];

// マスタデータ配下の view
const MASTER_LIKE_VIEWS: AppView[] = [
  'masterDataHub', 'antennaData', 'shapeMaster', 'aeroCoeffMaster', 'debrisMaster',
];

// 申請書配下の view
const APPLICATION_LIKE_VIEWS: AppView[] = ['applications', 'applicationDetail'];

export const Sidebar: React.FC = () => {
  const { view, navigate, sidebarCollapsed } = useAppStore();
  const FEATURE_FLAGS = useFlags();

  const isProjectActive = PROJECT_LIKE_VIEWS.includes(view);
  const isAnalysisActive = ANALYSIS_LIKE_VIEWS.includes(view);
  const isMasterActive = MASTER_LIKE_VIEWS.includes(view);
  const isApplicationActive = APPLICATION_LIKE_VIEWS.includes(view);

  return (
    <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <i className="bi bi-rocket-takeoff-fill text-primary" />
        <span>space-strategy</span>
      </div>

      <div className="sidebar-nav">
        {FEATURE_FLAGS.project && (
          <button
            className={`sidebar-item ${isProjectActive ? 'active' : ''}`}
            onClick={() => navigate('projects')}
          >
            <i className="bi bi-grid-3x3-gap" />
            <span>プロジェクト</span>
          </button>
        )}

        {/* 解析 (ハブ 1 アイテムに統合。中で各解析サービス + カスタム解析 +
            解析フロー + 外部ツール連携 をカードで開ける) */}
        <button
          className={`sidebar-item ${isAnalysisActive ? 'active' : ''}`}
          onClick={() => navigate('analysisHub')}
        >
          <i className="bi bi-cpu" />
          <span>解析</span>
        </button>

        {/* マスタデータ (ハブ統合: アンテナ・代表破片・機体形状・空力係数) */}
        <button
          className={`sidebar-item ${isMasterActive ? 'active' : ''}`}
          onClick={() => navigate('masterDataHub')}
        >
          <i className="bi bi-archive" />
          <span>マスタデータ</span>
        </button>

        {/* 申請書 (打ち上げ許可申請: 解析済み/申請済みミッション) */}
        {FEATURE_FLAGS.applications && (
          <button
            className={`sidebar-item ${isApplicationActive ? 'active' : ''}`}
            onClick={() => navigate('applications')}
          >
            <i className="bi bi-file-earmark-text" />
            <span>申請書</span>
          </button>
        )}
      </div>
    </div>
  );
};
