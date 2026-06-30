import React from 'react';
import { useAppStore } from '../../stores/appStore';
import type { AppView } from '../../types';
import { SERVICE_META } from '../analysis/analysisServiceMeta';
import { useFlags } from '../../stores/featureFlagsStore';

const DB_TABS: { view: AppView; icon: string; label: string; matchViews?: AppView[] }[] = [
  { view: 'massModel',      icon: 'diagram-2',          label: '質量' },
  { view: 'parameters',     icon: 'sliders',             label: 'パラメータ' },
  { view: 'rocketShapeData',   icon: 'rulers-combined',  label: '空力形状' },
  { view: 'propulsionData',    icon: 'fire',             label: '推進系' },
  { view: 'debrisShapeData',   icon: 'hexagon',          label: '破片形状' },
  { view: 'errorSourceData',   icon: 'exclamation-diamond', label: '誤差源' },
];

const SIZING_TABS: { view: AppView; icon: string; label: string }[] = [
  { view: 'sizingCondition', icon: 'gear',  label: '解析条件' },
  { view: 'sizingResults',   icon: 'table', label: '解析結果' },
];

const ANALYSIS_TABS: { view: AppView; icon: string; label: string }[] = [
  { view: 'analysisCondition', icon: 'gear',  label: '解析条件' },
  { view: 'analysisResults',   icon: 'table', label: '解析結果' },
];

const DB_VIEWS: AppView[] = DB_TABS.map((t) => t.view);
const SIZING_VIEWS: AppView[] = SIZING_TABS.map((t) => t.view);
const ANALYSIS_VIEWS: AppView[] = ANALYSIS_TABS.map((t) => t.view);

// ─── メインコンポーネント ──────────────────────────────────────────────────────
export const ContentTabNav: React.FC = () => {
  const { view, projectId, massCaseId, sizingCaseId, analysisCaseId, analysisService, navigate } =
    useAppStore();
  const FEATURE_FLAGS = useFlags();
  const dbFlags = FEATURE_FLAGS.db as Record<string, boolean | undefined>;
  const VISIBLE_DB_TABS = DB_TABS.filter((tab) => dbFlags[tab.view] !== false);

  if (massCaseId && DB_VIEWS.includes(view)) {
    return (
      <div>
        <div className="content-tabnav">
          {VISIBLE_DB_TABS.map((tab) => {
            const isActive = tab.matchViews ? tab.matchViews.includes(view) : view === tab.view;
            return (
              <button
                key={tab.view}
                className={`content-tab ${isActive ? 'active' : ''}`}
                onClick={() => navigate(tab.view, { projectId, massCaseId })}
              >
                <i className={`bi bi-${tab.icon}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ケース②: DBコンテキスト内からサイジングに入ってきた（massCaseId + sizingCaseId 両方あり）
  if (massCaseId && sizingCaseId && SIZING_VIEWS.includes(view)) {
    return (
      <div>
        <div className="content-tabnav">
          <button
            className="content-tab"
            onClick={() => navigate('massModel', { projectId, massCaseId })}
            title="コンポーネント構成に戻る"
          >
            <i className="bi bi-arrow-left" />
            <span>構成</span>
          </button>
          <span style={{ borderLeft: '1px solid #dee2e6', margin: '6px 4px' }} />
          {SIZING_TABS.map((tab) => (
            <button
              key={tab.view}
              className={`content-tab ${view === tab.view ? 'active' : ''}`}
              onClick={() => navigate(tab.view, { projectId, massCaseId, sizingCaseId })}
            >
              <i className={`bi bi-${tab.icon}`} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ケース③: サイドバーから直接サイジングにアクセス（massCaseIdなし）
  if (!massCaseId && sizingCaseId && SIZING_VIEWS.includes(view)) {
    return (
      <div className="content-tabnav">
        {SIZING_TABS.map((tab) => (
          <button
            key={tab.view}
            className={`content-tab ${view === tab.view ? 'active' : ''}`}
            onClick={() => navigate(tab.view, { projectId, sizingCaseId })}
          >
            <i className={`bi bi-${tab.icon}`} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
    );
  }

  if (analysisCaseId && analysisService && ANALYSIS_VIEWS.includes(view)) {
    const meta = SERVICE_META[analysisService];
    return (
      <div className="content-tabnav">
        {ANALYSIS_TABS.map((tab) => (
          <button
            key={tab.view}
            className={`content-tab ${view === tab.view ? 'active' : ''}`}
            onClick={() => navigate(tab.view, { projectId, analysisCaseId, analysisService })}
          >
            <i className={`bi bi-${tab.icon}`} />
            <span>{tab.label}</span>
          </button>
        ))}
        <span className="ms-auto me-2 text-muted d-flex align-items-center" style={{ fontSize: '0.78rem' }}>
          <i className={`bi bi-${meta.icon} me-1`} />{meta.label}
        </span>
      </div>
    );
  }

  return null;
};
