import React, { useMemo, useState } from 'react';
import { useAnalysisFlowStore } from '../../stores/analysisFlowStore';
import { useAppStore } from '../../stores/appStore';
import { useProjectStore } from '../../stores/projectStore';
import type { AnalysisFlow } from '../../types';

/**
 * 解析フロー: 全プロジェクト横断の一覧画面。
 * 他解析タブと統一の「一覧 → クリックで個別フロー編集 (analysisFlowDetail)」 UX。
 * 解析タブから入った時点ではプロジェクト指定は不要 (新規作成モーダルでプロジェクトを選ぶ)。
 */
export const AnalysisFlowList: React.FC = () => {
  const navigate = useAppStore((s) => s.navigate);
  const projects = useProjectStore((s) => s.projects);
  const flows = useAnalysisFlowStore((s) => s.flows);
  const addFlow = useAnalysisFlowStore((s) => s.addFlow);
  const deleteFlow = useAnalysisFlowStore((s) => s.deleteFlow);

  const [filterProjectId, setFilterProjectId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);

  const filteredFlows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return flows.filter((f) => {
      if (filterProjectId && f.projectId !== filterProjectId) return false;
      if (q && !f.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [flows, filterProjectId, search]);

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? '—';

  const flowStatus = (f: AnalysisFlow): 'pending' | 'in_progress' | 'done' => {
    const total = f.steps.length;
    if (total === 0) return 'pending';
    const done = f.steps.filter((s) => s.status === 'done').length;
    const ip = f.steps.filter((s) => s.status === 'in_progress').length;
    if (done === total) return 'done';
    if (ip > 0 || done > 0) return 'in_progress';
    return 'pending';
  };

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="page-title">
          <i className="bi bi-diagram-3 me-2 text-primary" />解析フロー
        </h1>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setShowModal(true)}
          disabled={projects.length === 0}
          title={projects.length === 0 ? '先にプロジェクトを作成してください' : undefined}
        >
          <i className="bi bi-plus-lg me-1" />新規作成
        </button>
      </div>

      <div className="card p-3 mb-3">
        <div className="row g-2 align-items-center">
          <div className="col-auto">
            <select
              className="form-select form-select-sm"
              value={filterProjectId}
              onChange={(e) => setFilterProjectId(e.target.value)}
            >
              <option value="">すべてのプロジェクト</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="col">
            <div className="input-group input-group-sm">
              <span className="input-group-text"><i className="bi bi-search" /></span>
              <input
                className="form-control"
                placeholder="フロー名で検索"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="col-auto">
            <span className="text-muted" style={{ fontSize: '0.85rem' }}>{filteredFlows.length} 件</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th>フロー名</th>
                <th>プロジェクト</th>
                <th className="text-center">ステップ数</th>
                <th className="text-center">進捗</th>
                <th>ステータス</th>
                <th>更新日</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredFlows.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-muted py-4">
                  <i className="bi bi-diagram-3 fs-3 d-block mb-2 opacity-25" />
                  <div>解析フローがありません。「新規作成」 から追加してください</div>
                </td></tr>
              ) : (
                filteredFlows.map((f) => {
                  const total = f.steps.length;
                  const done = f.steps.filter((s) => s.status === 'done').length;
                  const status = flowStatus(f);
                  return (
                    <tr
                      key={f.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate('analysisFlowDetail', { analysisFlowId: f.id, projectId: f.projectId })}
                    >
                      <td>
                        <i className="bi bi-diagram-3 text-primary me-1" />
                        <a href="#" className="text-decoration-none" onClick={(e) => e.preventDefault()}>{f.name}</a>
                      </td>
                      <td><span className="badge bg-primary-subtle text-primary">{projectName(f.projectId)}</span></td>
                      <td className="text-center">{total}</td>
                      <td className="text-center" style={{ minWidth: 120 }}>
                        {total > 0 ? (
                          <div className="d-flex align-items-center gap-2">
                            <div className="progress flex-grow-1" style={{ height: 4 }}>
                              <div className="progress-bar bg-success" style={{ width: `${(done / total) * 100}%` }} />
                            </div>
                            <small className="text-muted" style={{ fontSize: '0.72rem' }}>{done}/{total}</small>
                          </div>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            status === 'done'        ? 'bg-success' :
                            status === 'in_progress' ? 'bg-warning text-dark' :
                            'bg-secondary'
                          }`}
                          style={{ fontSize: '0.7rem' }}
                        >
                          {status === 'done' ? '完了' : status === 'in_progress' ? '実施中' : '未実施'}
                        </span>
                      </td>
                      <td className="text-muted" style={{ whiteSpace: 'nowrap', fontSize: '0.83rem' }}>
                        {new Date(f.updatedAt).toLocaleDateString('ja-JP')}
                      </td>
                      <td className="text-end">
                        <button
                          className="btn btn-sm btn-outline-danger p-0 px-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`「${f.name}」を削除しますか？`)) deleteFlow(f.id);
                          }}
                          title="削除"
                        ><i className="bi bi-trash" /></button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <NewFlowModal
          onClose={() => setShowModal(false)}
          onCreated={(flow) => {
            setShowModal(false);
            navigate('analysisFlowDetail', { analysisFlowId: flow.id, projectId: flow.projectId });
          }}
          projects={projects}
          onAddFlow={addFlow}
        />
      )}
    </div>
  );
};

// ─── 新規作成モーダル ─────────────────────────────────────

const NewFlowModal: React.FC<{
  onClose: () => void;
  onCreated: (flow: AnalysisFlow) => void;
  projects: { id: string; name: string }[];
  onAddFlow: ReturnType<typeof useAnalysisFlowStore.getState>['addFlow'];
}> = ({ onClose, onCreated, projects, onAddFlow }) => {
  const [name, setName] = useState('');
  const [projectId, setProjectId] = useState('');

  const canSubmit = !!(name.trim() && projectId);

  const handleSubmit = () => {
    if (!canSubmit) return;
    const flow = onAddFlow({ projectId, name: name.trim(), steps: [] });
    onCreated(flow);
  };

  return (
    <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)', zIndex: 1060 }} onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              <i className="bi bi-diagram-3 me-2" />新規 解析フロー
            </h5>
            <button className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body">
            <div className="mb-3">
              <label className="form-label fw-medium">プロジェクト <span className="text-danger">*</span></label>
              <select
                className="form-select"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">— 選択してください —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="mb-0">
              <label className="form-label fw-medium">フロー名 <span className="text-danger">*</span></label>
              <input
                className="form-control"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例: ロケット全体設計フロー"
                autoFocus
              />
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>キャンセル</button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={!canSubmit}>
              <i className="bi bi-plus-lg me-1" />作成して編集画面へ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
