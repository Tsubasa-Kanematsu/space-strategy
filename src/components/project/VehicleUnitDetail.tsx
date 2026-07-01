import React from 'react';
import { useAppStore } from '../../stores/appStore';
import { useProjectStore } from '../../stores/projectStore';
import { useVehicleUnitStore } from '../../stores/vehicleUnitStore';
import { useApplicationStore } from '../../stores/applicationStore';
import { useAnalysisFlowStore } from '../../stores/analysisFlowStore';
import { isPtComplete, PHASE_META } from '../../types/vehicleUnit';
import { buildApplicationData } from '../../utils/applicationGen';
import { BUILTIN_FLOW_TEMPLATES, PT_TEMPLATE_KEY, FT_TEMPLATE_KEY } from '../analysis/flow/flowTemplates';
import { openInNewWindow } from '../../lib/nav';
import type { AnalysisPhase, PhaseState, PhaseStatus } from '../../types';

const PHASE_ACCENT: Record<AnalysisPhase, string> = { PT: '#2563eb', FT: '#0d9488' };

const STATUS_BADGE: Record<PhaseStatus, string> = {
  未着手: 'bg-light text-muted',
  実施中: 'bg-info-subtle text-info',
  完了: 'bg-success',
};

export const VehicleUnitDetail: React.FC = () => {
  const projectId = useAppStore((s) => s.projectId);
  const vehicleUnitId = useAppStore((s) => s.vehicleUnitId);
  const navigate = useAppStore((s) => s.navigate);
  const getProject = useProjectStore((s) => s.getProject);
  const getUnit = useVehicleUnitStore((s) => s.getUnit);
  const updatePhase = useVehicleUnitStore((s) => s.updatePhase);
  const getByUnit = useApplicationStore((s) => s.getByUnit);
  const upsertForUnit = useApplicationStore((s) => s.upsertForUnit);
  const flows = useAnalysisFlowStore((s) => s.flows);
  const addFlow = useAnalysisFlowStore((s) => s.addFlow);

  const unit = vehicleUnitId ? getUnit(vehicleUnitId) : undefined;

  if (!unit || !projectId) {
    return (
      <div className="text-center text-muted py-5">
        <i className="bi bi-exclamation-circle fs-3 d-block mb-2" />
        号機が見つかりません
        <div className="mt-3">
          <button className="btn btn-outline-secondary btn-sm" onClick={() => navigate('projects')}>
            プロジェクト一覧へ
          </button>
        </div>
      </div>
    );
  }

  const project = getProject(projectId);
  const ptComplete = isPtComplete(unit);
  const app = getByUnit(unit.id);

  const phaseState = (phase: AnalysisPhase): PhaseState => (phase === 'PT' ? unit.pt : unit.ft);

  // フェーズページ（解析フロー）を開く。無ければテンプレートで作成。
  const openPhase = (phase: AnalysisPhase) => {
    const ps = phaseState(phase);
    let fid = ps.flowId;
    if (!fid) {
      const tpl = BUILTIN_FLOW_TEMPLATES.find((t) => t.key === (phase === 'PT' ? PT_TEMPLATE_KEY : FT_TEMPLATE_KEY));
      const f = addFlow({ projectId: unit.projectId, name: `${unit.unitNo}号機 ${PHASE_META[phase].label} 解析フロー`, steps: tpl ? tpl.build() : [] });
      fid = f.id;
      updatePhase(unit.id, phase, { flowId: fid });
    }
    navigate('analysisFlowDetail', { analysisFlowId: fid, projectId: unit.projectId });
  };

  const generateApplication = () => {
    const data = buildApplicationData({ unit, projectName: project?.name ?? '' });
    const created = upsertForUnit(data);
    // 申請書は別の括り（申請書）なので新規ウィンドウで開く
    openInNewWindow('applicationDetail', { applicationId: created.id });
  };

  const setBadge = (ok: boolean) =>
    ok
      ? <span className="badge bg-success">設定済み</span>
      : <span className="badge bg-light text-muted">未設定</span>;

  // フェーズのカード（クリックでフェーズページへ遷移）
  const renderPhase = (phase: AnalysisPhase) => {
    const ps = phaseState(phase);
    const meta = PHASE_META[phase];
    const accent = PHASE_ACCENT[phase];
    const flow = ps.flowId ? flows.find((f) => f.id === ps.flowId) : null;
    const totalSteps = flow ? flow.steps.length : 0;
    const doneSteps = flow ? flow.steps.filter((s) => s.status === 'done').length : 0;
    return (
      <button
        className="card h-100 w-100 text-start p-0"
        style={{ cursor: 'pointer', borderLeft: `4px solid ${accent}`, transition: 'box-shadow .15s, transform .1s', background: '#fff' }}
        onClick={() => openPhase(phase)}
        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = ''; }}
      >
        <div className="card-body p-3">
          <div className="d-flex align-items-center gap-2 mb-3">
            <span
              className="d-flex align-items-center justify-content-center rounded-2"
              style={{ width: 38, height: 38, background: `${accent}18`, color: accent, flexShrink: 0 }}
            >
              <i className={`bi bi-${meta.icon}`} style={{ fontSize: '1.1rem' }} />
            </span>
            <span className="fw-semibold" style={{ fontSize: '1rem' }}>{meta.label}</span>
            <span className={`badge ${STATUS_BADGE[ps.status]} ms-auto`}>{ps.status}</span>
          </div>
          <div className="d-flex flex-column gap-1 small">
            <div className="d-flex align-items-center">
              <span className="text-muted" style={{ width: 92 }}><i className="bi bi-sliders me-1" />条件設定</span>
              {setBadge(!!ps.massCaseId)}<span className="text-muted ms-2">機体諸元</span>
            </div>
            <div className="d-flex align-items-center">
              <span className="text-muted" style={{ width: 92 }}><i className="bi bi-diagram-3 me-1" />解析フロー</span>
              {ps.flowId
                ? <>{setBadge(true)}<span className="text-muted ms-2">{doneSteps}/{totalSteps} ステップ完了</span></>
                : setBadge(false)}
            </div>
          </div>
          <div className="mt-3 fw-semibold small" style={{ color: accent }}>
            {meta.label}を開く<i className="bi bi-arrow-right ms-1" />
          </div>
        </div>
      </button>
    );
  };

  return (
    <div>
      {/* 号機の同一性・セクションタブは上部の号機ワークバー(PhaseWorkBar)が提供する */}

      {/* 2フェーズのワークスペース */}
      <div className="row g-3 mb-3">
        <div className="col-md-6">{renderPhase('PT')}</div>
        <div className="col-md-6">{renderPhase('FT')}</div>
      </div>

      {/* 内閣府申請 */}
      <div className="card mb-3">
        <div className="card-header fw-semibold"><i className="bi bi-file-earmark-text me-1" />内閣府申請</div>
        <div className="card-body">
          {app ? (
            <div className="d-flex align-items-center gap-2">
              <span className={`badge bg-${app.status === '提出済み' || app.status === '受理' ? 'success' : 'primary'}`}>{app.status}</span>
              <span className="small text-muted">申請書を生成済みです。</span>
              <button className="btn btn-sm btn-outline-success" onClick={() => openInNewWindow('applicationDetail', { applicationId: app.id })}>
                <i className="bi bi-file-earmark-text me-1" />申請書を開く
              </button>
            </div>
          ) : ptComplete ? (
            <div className="d-flex align-items-center gap-3">
              <button className="btn btn-primary btn-sm" onClick={generateApplication}>
                <i className="bi bi-magic me-1" />申請書を自動生成
              </button>
              <span className="small text-muted">PT解析が完了しました。この結果で申請書を生成できます。</span>
            </div>
          ) : (
            <p className="text-muted small mb-0">PT解析を「完了」にすると、その結果で申請書を自動生成できます。</p>
          )}
        </div>
      </div>

      {unit.memo && (
        <div className="card">
          <div className="card-header fw-semibold"><i className="bi bi-journal-text me-1" />メモ</div>
          <div className="card-body">
            <p className="mb-0 small text-muted" style={{ whiteSpace: 'pre-wrap' }}>{unit.memo}</p>
          </div>
        </div>
      )}
    </div>
  );
};
