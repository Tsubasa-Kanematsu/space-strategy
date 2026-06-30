import React from 'react';
import { useAppStore } from '../../stores/appStore';
import { useProjectStore } from '../../stores/projectStore';
import { useVehicleUnitStore } from '../../stores/vehicleUnitStore';
import { useApplicationStore } from '../../stores/applicationStore';
import { useAnalysisFlowStore } from '../../stores/analysisFlowStore';
import { isPtComplete, PHASE_META, PHASE_STATUSES } from '../../types/vehicleUnit';
import { buildApplicationData } from '../../utils/applicationGen';
import { BUILTIN_FLOW_TEMPLATES, PT_TEMPLATE_KEY, FT_TEMPLATE_KEY } from '../analysis/flow/flowTemplates';
import type { AnalysisPhase, PhaseState, PhaseStatus } from '../../types';

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

  // このフェーズの解析設定（パイプライン）を開く（無ければ作成し、対応テンプレートを初期適用）。
  // 機体諸元を含む解析の設定はパイプライン内で行う。
  const openFlow = (phase: AnalysisPhase) => {
    const ps = phaseState(phase);
    let fId = ps.flowId;
    if (!fId) {
      const tplKey = phase === 'PT' ? PT_TEMPLATE_KEY : FT_TEMPLATE_KEY;
      const tpl = BUILTIN_FLOW_TEMPLATES.find((t) => t.key === tplKey);
      const created = addFlow({
        projectId,
        name: `${unit.unitNo}号機 ${PHASE_META[phase].label} パイプライン`,
        steps: tpl ? tpl.build() : [],
      });
      fId = created.id;
      updatePhase(unit.id, phase, { flowId: fId });
    }
    navigate('analysisFlowDetail', { analysisFlowId: fId, projectId });
  };

  const generateApplication = () => {
    const data = buildApplicationData({ unit, projectName: project?.name ?? '' });
    const created = upsertForUnit(data);
    navigate('applicationDetail', { applicationId: created.id });
  };

  // フェーズパネル（コンポーネント化せず関数で返す。再マウント回避）
  const renderPhase = (phase: AnalysisPhase) => {
    const ps = phaseState(phase);
    const meta = PHASE_META[phase];
    return (
      <div className="card h-100">
        <div className="card-header d-flex justify-content-between align-items-center">
          <span className="fw-semibold"><i className={`bi bi-${meta.icon} me-1`} />{meta.label}</span>
          <span className={`badge ${STATUS_BADGE[ps.status]}`}>{ps.status}</span>
        </div>
        <div className="card-body d-flex flex-column">
          <button
            className="btn btn-outline-primary btn-sm w-100 text-start d-flex justify-content-between align-items-center mb-3"
            onClick={() => openFlow(phase)}
          >
            <span><i className="bi bi-diagram-3 me-1" />解析設定</span>
            <i className="bi bi-arrow-right" />
          </button>

          <div className="mt-auto">
            <label className="form-label small fw-medium mb-1">ステータス</label>
            <select
              className="form-select form-select-sm"
              value={ps.status}
              onChange={(e) => updatePhase(unit.id, phase, { status: e.target.value as PhaseStatus })}
            >
              {PHASE_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
            </select>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-1">
        <button
          className="btn btn-link btn-sm p-0 text-muted"
          style={{ textDecoration: 'none' }}
          onClick={() => navigate('vehicleUnits', { projectId })}
        >
          <i className="bi bi-arrow-left me-1" />{project?.name ?? 'プロジェクト'} / 号機一覧
        </button>
      </div>
      <div className="mb-3">
        <h1 className="page-title mb-0">{unit.unitNo}号機 — {unit.missionName}</h1>
        <small className="text-muted">
          打上予定日: {unit.launchDate || '未定'} ・ ステータス: <span className="fw-semibold">{unit.status}</span>
        </small>
      </div>

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
              <button className="btn btn-sm btn-outline-success" onClick={() => navigate('applicationDetail', { applicationId: app.id })}>
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
