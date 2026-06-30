import React from 'react';
import { useAppStore } from '../../stores/appStore';
import { useMassCaseStore } from '../../stores/massCaseStore';
import { useVehicleUnitStore } from '../../stores/vehicleUnitStore';
import type { AppView } from '../../types';
import { PHASE_META } from '../../types/vehicleUnit';
import { SERVICE_META } from '../analysis/analysisServiceMeta';
import { useFlags } from '../../stores/featureFlagsStore';

const DB_TABS: { view: AppView; icon: string; label: string; matchViews?: AppView[] }[] = [
  { view: 'massModel',      icon: 'diagram-2',          label: 'コンポーネント構成' },
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

// ─── DBコンテキストバー ───────────────────────────────────────────────────────
const DBContextBar: React.FC<{ massCaseId: string; projectId: string | null }> = ({
  massCaseId,
}) => {
  const { navigate } = useAppStore();
  const allCases = useMassCaseStore((s) => s.cases);
  const units = useVehicleUnitStore((s) => s.units);

  const massCase = allCases.find((c) => c.id === massCaseId);
  // この機体諸元DBを所有する号機フェーズ（PT/FT）。フェーズと1:1対応。
  const owner = units.find((u) => u.pt.massCaseId === massCaseId || u.ft.massCaseId === massCaseId) ?? null;
  const phase = owner ? (owner.pt.massCaseId === massCaseId ? 'PT' : 'FT') : null;

  if (!massCase) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 16px',
        background: '#f0f4ff',
        borderBottom: '1px solid #d0ddf7',
        flexWrap: 'wrap',
        minHeight: 38,
      }}
    >
      <i className="bi bi-database" style={{ color: '#1a73e8', flexShrink: 0 }} />
      <span className="fw-semibold" style={{ color: '#1558c0', fontSize: '0.9rem' }}>機体諸元</span>
      {owner && phase ? (
        <span className="d-flex align-items-center gap-2 flex-wrap" style={{ fontSize: '0.8rem' }}>
          <span className="badge bg-primary-subtle text-primary">
            {owner.unitNo}号機 ／ {PHASE_META[phase].label}
          </span>
          <button
            className="btn btn-link btn-sm p-0"
            style={{ fontSize: '0.8rem', textDecoration: 'none' }}
            onClick={() => navigate('vehicleUnitDetail', { projectId: owner.projectId, vehicleUnitId: owner.id })}
            title="号機詳細へ戻る"
          >
            <i className="bi bi-arrow-left me-1" />{owner.unitNo}号機へ
          </button>
        </span>
      ) : (
        <span className="text-muted" style={{ fontSize: '0.8rem' }}>{massCase.name}</span>
      )}
    </div>
  );
};

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
        <DBContextBar massCaseId={massCaseId} projectId={projectId} />
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
        <DBContextBar massCaseId={massCaseId} projectId={projectId} />
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
