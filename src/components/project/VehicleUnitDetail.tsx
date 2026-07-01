import React from 'react';
import { useAppStore } from '../../stores/appStore';
import { useProjectStore } from '../../stores/projectStore';
import { useVehicleUnitStore } from '../../stores/vehicleUnitStore';
import { useApplicationStore } from '../../stores/applicationStore';
import { useAnalysisFlowStore } from '../../stores/analysisFlowStore';
import { isPtComplete } from '../../types/vehicleUnit';
import { buildApplicationData } from '../../utils/applicationGen';
import { BUILTIN_FLOW_TEMPLATES, PT_TEMPLATE_KEY, FT_TEMPLATE_KEY } from '../analysis/flow/flowTemplates';
import { openInNewWindow } from '../../lib/nav';
import type { AnalysisEntry, PhaseStatus } from '../../types';

const KIND_ACCENT: Record<AnalysisEntry['kind'], string> = { PT: '#2563eb', FT: '#0d9488', custom: '#7c3aed' };

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
  const updateAnalysis = useVehicleUnitStore((s) => s.updateAnalysis);
  const addAnalysis = useVehicleUnitStore((s) => s.addAnalysis);
  const deleteAnalysis = useVehicleUnitStore((s) => s.deleteAnalysis);
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

  const generateApplication = () => {
    const data = buildApplicationData({ unit, projectName: project?.name ?? '' });
    const created = upsertForUnit(data);
    openInNewWindow('applicationDetail', { applicationId: created.id });
  };

  const setBadge = (ok: boolean) =>
    ok
      ? <span className="badge bg-success">設定済み</span>
      : <span className="badge bg-light text-muted">未設定</span>;

  // 解析ページ（解析フロー）を開く。無ければテンプレートで作成。
  const openAnalysis = (entry: AnalysisEntry) => {
    let fid = entry.flowId;
    if (!fid) {
      const tplKey = entry.kind === 'PT' ? PT_TEMPLATE_KEY : entry.kind === 'FT' ? FT_TEMPLATE_KEY : null;
      const tpl = tplKey ? BUILTIN_FLOW_TEMPLATES.find((t) => t.key === tplKey) : null;
      const f = addFlow({ projectId: unit.projectId, name: `${unit.unitNo}号機 ${entry.name} 解析フロー`, steps: tpl ? tpl.build() : [] });
      fid = f.id;
      updateAnalysis(unit.id, entry.id, { flowId: fid });
    }
    navigate('analysisFlowDetail', { analysisFlowId: fid, projectId: unit.projectId });
  };

  const addCustomAnalysis = () => {
    const name = window.prompt('追加する解析の名称を入力してください', '追加解析');
    if (!name || !name.trim()) return;
    addAnalysis(unit.id, { name: name.trim(), icon: 'graph-up', kind: 'custom', status: '未着手' });
  };

  const removeAnalysis = (entry: AnalysisEntry) => {
    if (window.confirm(`「${entry.name}」を削除しますか？`)) deleteAnalysis(unit.id, entry.id);
  };

  const renderAnalysis = (entry: AnalysisEntry, i: number, arr: AnalysisEntry[]) => {
    const accent = KIND_ACCENT[entry.kind];
    const flow = entry.flowId ? flows.find((f) => f.id === entry.flowId) : null;
    const totalSteps = flow ? flow.steps.length : 0;
    const doneSteps = flow ? flow.steps.filter((s) => s.status === 'done').length : 0;
    return (
      <div
        key={entry.id}
        className={`d-flex align-items-center px-3 py-2 ${i < arr.length - 1 ? 'border-bottom' : ''}`}
        style={{ cursor: 'pointer' }}
        onClick={() => openAnalysis(entry)}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#f6f9ff'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
      >
        <span className="d-flex align-items-center justify-content-center rounded-2" style={{ width: 30, height: 30, background: `${accent}18`, color: accent, flexShrink: 0 }}>
          <i className={`bi bi-${entry.icon}`} style={{ fontSize: '0.95rem' }} />
        </span>
        <span className="fw-semibold ms-2" style={{ minWidth: 120 }}>{entry.name}</span>
        <span className={`badge ${STATUS_BADGE[entry.status]} ms-2`}>{entry.status}</span>

        <span className="ms-4 small text-muted d-none d-lg-flex align-items-center gap-3">
          <span><i className="bi bi-sliders me-1" />条件設定 {setBadge(!!entry.massCaseId)}</span>
          <span>
            <i className="bi bi-diagram-3 me-1" />解析フロー{' '}
            {entry.flowId ? <span className="text-body">{doneSteps}/{totalSteps} 完了</span> : setBadge(false)}
          </span>
        </span>

        <span className="ms-auto d-flex align-items-center gap-2">
          {entry.kind === 'custom' && (
            <button className="btn btn-sm btn-link text-danger p-1" title="この解析を削除" onClick={(e) => { e.stopPropagation(); removeAnalysis(entry); }}>
              <i className="bi bi-trash" />
            </button>
          )}
          <span className="fw-semibold small" style={{ color: accent }}>開く<i className="bi bi-arrow-right ms-1" /></span>
        </span>
      </div>
    );
  };

  return (
    <div>
      {/* 解析一覧（PT/FT はサンプル。任意の解析を追加できる） */}
      <div className="d-flex align-items-center mb-2">
        <span className="fw-semibold small"><i className="bi bi-clipboard-data me-1 text-primary" />この号機の解析</span>
        <button className="btn btn-sm btn-outline-primary ms-auto py-0" onClick={addCustomAnalysis}>
          <i className="bi bi-plus-lg me-1" />解析を追加
        </button>
      </div>
      <div className="border rounded-3 mb-3">
        {unit.analyses.map(renderAnalysis)}
        {unit.analyses.length === 0 && (
          <div className="p-4 text-center text-muted">
            <i className="bi bi-clipboard-plus fs-1 d-block mb-2 opacity-25" />
            解析がありません。「解析を追加」で追加してください。
          </div>
        )}
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
