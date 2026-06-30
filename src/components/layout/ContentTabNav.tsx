import React, { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useMassCaseStore } from '../../stores/massCaseStore';
import { useRocketShapeStore } from '../../stores/rocketShapeStore';
import { usePropulsionStore } from '../../stores/propulsionStore';
import type { AppView } from '../../types';
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
  projectId,
}) => {
  const { navigate } = useAppStore();
  const allCases = useMassCaseStore((s) => s.cases);
  const forkCase = useMassCaseStore((s) => s.forkCase);
  const copyGeometry = useRocketShapeStore((s) => s.copyGeometry);
  const copyStages = usePropulsionStore((s) => s.copyStages);

  const [showForkModal, setShowForkModal] = useState(false);
  const [forkName, setForkName] = useState('');

  const massCase = allCases.find((c) => c.id === massCaseId);
  const parentCase = massCase?.parentMassCaseId
    ? allCases.find((c) => c.id === massCase.parentMassCaseId)
    : null;

  // 同じプロジェクト内の他DB（切り替え用）
  const projectCases = allCases.filter(
    (c) => c.projectId === (projectId ?? '') && c.id !== massCaseId,
  );

  const handleFork = () => {
    if (!forkName.trim()) return;
    const forked = forkCase(massCaseId, forkName.trim());
    if (forked) {
      copyGeometry(massCaseId, forked.id);
      copyStages(massCaseId, forked.id);
      navigate('traceability', { projectId: forked.projectId });
    }
    setShowForkModal(false);
    setForkName('');
  };

  const openForkModal = () => {
    setForkName(massCase ? `${massCase.name} 派生` : '');
    setShowForkModal(true);
  };

  if (!massCase) return null;

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 16px',
          background: '#f0f4ff',
          borderBottom: '1px solid #d0ddf7',
          flexWrap: 'wrap',
          minHeight: 38,
        }}
      >
        {/* 現在のDB名 */}
        <div className="d-flex align-items-center gap-2 flex-grow-1" style={{ minWidth: 0 }}>
          <i className="bi bi-database" style={{ color: '#1a73e8', flexShrink: 0 }} />
          <span
            className="fw-semibold text-truncate"
            style={{ color: '#1558c0', fontSize: '0.9rem', maxWidth: 240 }}
            title={massCase.name}
          >
            {massCase.name}
          </span>


          {/* 派生元 */}
          {parentCase && (
            <span
              className="text-muted d-flex align-items-center gap-1"
              style={{ fontSize: '0.75rem', flexShrink: 0 }}
            >
              <i className="bi bi-arrow-return-right" />
              <button
                className="btn btn-link btn-sm p-0 text-muted"
                style={{ fontSize: '0.75rem', textDecoration: 'none' }}
                onClick={() =>
                  navigate('massModel', { projectId, massCaseId: parentCase.id })
                }
                title={`派生元: ${parentCase.name}`}
              >
                {parentCase.name}
              </button>
            </span>
          )}
        </div>

        {/* DB切り替えドロップダウン */}
        {projectCases.length > 0 && (
          <select
            className="form-select form-select-sm"
            style={{ maxWidth: 180, fontSize: '0.78rem' }}
            value=""
            onChange={(e) => {
              if (e.target.value) {
                navigate('massModel', { projectId, massCaseId: e.target.value });
              }
            }}
            title="他のDBに切り替え"
          >
            <option value="">DB切り替え...</option>
            {projectCases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}

        {/* 派生ボタン */}
        <button
          className="btn btn-sm btn-outline-primary"
          style={{ fontSize: '0.78rem', whiteSpace: 'nowrap', flexShrink: 0 }}
          onClick={openForkModal}
          title="このDBを元に新しい派生バージョンを作成"
        >
          <i className="bi bi-git me-1" />派生を作る
        </button>
      </div>

      {/* 派生モーダル */}
      {showForkModal && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.35)' }}>
          <div className="modal-dialog modal-sm">
            <div className="modal-content">
              <div className="modal-header py-2">
                <h6 className="modal-title">
                  <i className="bi bi-git me-2 text-primary" />派生DBを作成
                </h6>
                <button
                  className="btn-close btn-sm"
                  onClick={() => setShowForkModal(false)}
                />
              </div>
              <div className="modal-body py-3">
                <p className="text-muted mb-2" style={{ fontSize: '0.82rem' }}>
                  <strong>{massCase.name}</strong> を派生元として新しいDBを作成します。
                </p>
                <label className="form-label fw-medium" style={{ fontSize: '0.85rem' }}>
                  新DBの名前 <span className="text-danger">*</span>
                </label>
                <input
                  className="form-control form-control-sm"
                  value={forkName}
                  onChange={(e) => setForkName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleFork()}
                  autoFocus
                  placeholder="例: LV-Alpha 再使用案"
                />
              </div>
              <div className="modal-footer py-2">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowForkModal(false)}
                >
                  キャンセル
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleFork}
                  disabled={!forkName.trim()}
                >
                  作成
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
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
