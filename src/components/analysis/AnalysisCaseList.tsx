import React, { useState, useMemo } from 'react';
import { DeleteConfirmModal } from '../common/DeleteConfirmModal';
import { useAnalysisStore } from '../../stores/analysisStore';
import { useMassCaseStore } from '../../stores/massCaseStore';
import { useAppStore } from '../../stores/appStore';
import { useProjectStore } from '../../stores/projectStore';
import type { AnalysisCase, AnalysisServiceType } from '../../types';
import { SERVICE_META } from './analysisServiceMeta';
import { DB_SET_META, SERVICE_DB_SETS, SERVICE_UPSTREAM } from './dbSetMeta';

interface FormState {
  name: string;
  memo: string;
  createdBy: string;
  projectId: string;
  massCaseId: string;
  upstreamCaseId: string;
}

const emptyForm = (defaultProjectId = ''): FormState => ({
  name: '', memo: '', createdBy: '', projectId: defaultProjectId, massCaseId: '', upstreamCaseId: '',
});

export const AnalysisCaseList: React.FC = () => {
  // 解析タブのリストは「全プロジェクト横断」が原則。
  // 以前選んでいた projectId で勝手に絞り込まない (ユーザーは projectFilter で明示選択)。
  const { analysisService, navigate } = useAppStore();
  const serviceType = analysisService as AnalysisServiceType;
  const meta = SERVICE_META[serviceType];

  const projects = useProjectStore((s) => s.projects);
  const allCases = useAnalysisStore((s) => s.cases);
  const allMassCases = useMassCaseStore((s) => s.cases);
  const addCase = useAnalysisStore((s) => s.addCase);
  const updateCase = useAnalysisStore((s) => s.updateCase);
  const deleteCase = useAnalysisStore((s) => s.deleteCase);
  const getResultsForCase = useAnalysisStore((s) => s.getResultsForCase);

  const [projectFilter, setProjectFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<AnalysisCase | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<AnalysisCase | null>(null);

  // 上流サービス種別
  const upstreamServiceType = SERVICE_UPSTREAM[serviceType];

  const serviceCases = useMemo(
    () => allCases.filter((c) => c.serviceType === serviceType),
    [allCases, serviceType]
  );

  // 上流解析ケース一覧（プロジェクトフィルタ適用）
  const upstreamCases = useMemo(() => {
    if (!upstreamServiceType) return [];
    return allCases.filter((c) => c.serviceType === upstreamServiceType && c.projectId === form.projectId);
  }, [allCases, upstreamServiceType, form.projectId]);

  const filtered = useMemo(() => serviceCases.filter((c) => {
    const matchProject = projectFilter === 'all' || c.projectId === projectFilter;
    const matchSearch = !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.createdBy.toLowerCase().includes(search.toLowerCase());
    return matchProject && matchSearch;
  }), [serviceCases, projectFilter, search]);

  const formMassCases = useMemo(
    () => form.projectId ? allMassCases.filter((m) => m.projectId === form.projectId) : [],
    [allMassCases, form.projectId]
  );

  const getProjectName = (pid: string) => projects.find((p) => p.id === pid)?.name ?? '—';
  const getMassCaseName = (mid: string) => allMassCases.find((m) => m.id === mid)?.name ?? '—';
  const getAnalysisCaseName = (cid: string) => allCases.find((c) => c.id === cid)?.name ?? '—';

  const openCreate = () => {
    setEditTarget(null);
    // 一覧側のフィルタが特定プロジェクトに絞られていればそれを初期値に使う (ユーザー手動選択)
    const defaultProjectId = projectFilter !== 'all' ? projectFilter : '';
    setForm(emptyForm(defaultProjectId));
    setShowModal(true);
  };

  const openEdit = (c: AnalysisCase) => {
    setEditTarget(c);
    setForm({
      name: c.name,
      memo: c.memo,
      createdBy: c.createdBy,
      projectId: c.projectId,
      massCaseId: c.massCaseId,
      upstreamCaseId: c.upstreamCaseId ?? '',
    });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.projectId || !form.massCaseId) return;
    if (upstreamServiceType && !form.upstreamCaseId) return;
    if (editTarget) {
      updateCase(editTarget.id, {
        name: form.name,
        memo: form.memo,
        createdBy: form.createdBy,
        massCaseId: form.massCaseId,
        upstreamCaseId: form.upstreamCaseId,
      });
    } else {
      const created = addCase({
        serviceType,
        name: form.name,
        memo: form.memo,
        createdBy: form.createdBy,
        projectId: form.projectId,
        massCaseId: form.massCaseId,
        upstreamCaseId: form.upstreamCaseId,
        condition: {},
      });
      navigate('analysisCondition', { projectId: created.projectId, analysisCaseId: created.id, analysisService: serviceType });
    }
    setShowModal(false);
  };

  const handleDelete = () => {
    if (!confirmDelete) return;
    deleteCase(confirmDelete.id);
    setConfirmDelete(null);
  };

  const isSaveDisabled = !form.name.trim() || !form.projectId || !form.massCaseId
    || (!!upstreamServiceType && !form.upstreamCaseId);

  const upstreamMeta = upstreamServiceType ? SERVICE_META[upstreamServiceType] : null;

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="page-title">
          <i className={`bi bi-${meta.icon} me-2 text-primary`} />
          {meta.label}
        </h1>
        <button
          className="btn btn-primary btn-sm"
          onClick={openCreate}
          disabled={projects.length === 0}
          title={projects.length === 0 ? '先にプロジェクトを作成してください' : undefined}
        >
          <i className="bi bi-plus-lg me-1" />
          新規作成
        </button>
      </div>

      <div className="filter-bar mb-3 rounded">
        <select
          className="form-select form-select-sm"
          style={{ maxWidth: 200 }}
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
        >
          <option value="all">すべてのプロジェクト</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="input-group input-group-sm" style={{ maxWidth: 280 }}>
          <span className="input-group-text bg-white"><i className="bi bi-search" /></span>
          <input
            className="form-control"
            placeholder="ケース名・作成者で検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <small className="text-muted ms-auto">{filtered.length} 件</small>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th>ケース名</th>
                <th>プロジェクト</th>
                <th>参照ロケットDB</th>
                {upstreamMeta && <th>上流解析ケース</th>}
                <th>参照データセット</th>
                <th>メモ</th>
                <th>作成者</th>
                <th className="text-center">結果件数</th>
                <th>作成日時</th>
                <th className="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={upstreamMeta ? 10 : 9} className="text-center text-muted py-5">
                    <i className={`bi bi-${meta.icon} fs-3 d-block mb-2 opacity-25`} />
                    <div>解析ケースがありません</div>
                    {projects.length > 0 && (
                      <button className="btn btn-primary btn-sm mt-2" onClick={openCreate}>
                        <i className="bi bi-plus-lg me-1" />最初のケースを作成
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map((c) => {
                  const resultCount = getResultsForCase(c.id).length;
                  return (
                    <tr key={c.id}>
                      <td>
                        <button
                          className="btn btn-link btn-sm p-0 text-primary fw-medium"
                          style={{ textDecoration: 'none' }}
                          onClick={() => navigate('analysisCondition', { projectId: c.projectId, analysisCaseId: c.id, analysisService: serviceType })}
                        >
                          <i className={`bi bi-${meta.icon} me-1`} />{c.name}
                        </button>
                      </td>
                      <td>
                        <span className="badge bg-primary-subtle text-primary" style={{ fontSize: '0.75rem' }}>
                          {getProjectName(c.projectId)}
                        </span>
                      </td>
                      <td>
                        <span className="badge bg-secondary-subtle text-secondary" style={{ fontSize: '0.75rem' }}>
                          {getMassCaseName(c.massCaseId)}
                        </span>
                      </td>
                      {upstreamMeta && (
                        <td>
                          {c.upstreamCaseId ? (
                            <span className="badge bg-warning-subtle text-warning" style={{ fontSize: '0.75rem' }}>
                              <i className={`bi bi-${upstreamMeta.icon} me-1`} />
                              {getAnalysisCaseName(c.upstreamCaseId)}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      )}
                      <td>
                        <div className="d-flex flex-wrap gap-1">
                          {SERVICE_DB_SETS[serviceType].map((set) => {
                            const sm = DB_SET_META[set];
                            return (
                              <span key={set} className={`badge ${sm.badgeClass}`} style={{ fontSize: '0.68rem' }} title={sm.label}>
                                <i className={`bi bi-${sm.icon}`} />
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="text-muted">
                        <span className="text-truncate d-inline-block" style={{ maxWidth: 160 }}>
                          {c.memo || '—'}
                        </span>
                      </td>
                      <td>{c.createdBy || '—'}</td>
                      <td className="text-center">
                        <span className={`badge ${resultCount > 0 ? 'bg-success' : 'bg-secondary'}`}>
                          {resultCount}
                        </span>
                      </td>
                      <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>
                        {new Date(c.createdAt).toLocaleDateString('ja-JP')}
                      </td>
                      <td className="col-actions">
                        <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => openEdit(c)} title="編集">
                          <i className="bi bi-pencil" />
                        </button>
                        <button
                          className="btn btn-sm btn-outline-primary me-1"
                          onClick={() => navigate('analysisResults', { projectId: c.projectId, analysisCaseId: c.id, analysisService: serviceType })}
                          title="結果"
                        >
                          <i className="bi bi-table" />
                        </button>
                        <button className="btn btn-sm btn-outline-danger" onClick={() => setConfirmDelete(c)} title="削除">
                          <i className="bi bi-trash" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className={`bi bi-${meta.icon} me-2`} />
                  {editTarget ? `${meta.label} 編集` : `新規 ${meta.label}`}
                </h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body">
                {!editTarget && (
                  <div className="mb-3">
                    <label className="form-label fw-medium">プロジェクト <span className="text-danger">*</span></label>
                    <select
                      className="form-select"
                      value={form.projectId}
                      onChange={(e) => setForm({ ...form, projectId: e.target.value, massCaseId: '', upstreamCaseId: '' })}
                    >
                      <option value="">— 選択してください —</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                )}
                <div className="mb-3">
                  <label className="form-label fw-medium">参照ロケットDB <span className="text-danger">*</span></label>
                  <select
                    className="form-select"
                    value={form.massCaseId}
                    onChange={(e) => setForm({ ...form, massCaseId: e.target.value })}
                    disabled={!editTarget && !form.projectId}
                  >
                    <option value="">— 選択してください —</option>
                    {(editTarget
                      ? allMassCases.filter((m) => m.projectId === form.projectId)
                      : formMassCases
                    ).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  {!editTarget && form.projectId && formMassCases.length === 0 && (
                    <div className="form-text text-warning">
                      <i className="bi bi-exclamation-triangle me-1" />このプロジェクトにはロケットDBがありません
                    </div>
                  )}
                </div>
                {upstreamServiceType && upstreamMeta && (
                  <div className="mb-3">
                    <label className="form-label fw-medium">
                      上流解析ケース
                      <span className="ms-2 badge bg-warning-subtle text-warning" style={{ fontSize: '0.72rem' }}>
                        <i className={`bi bi-${upstreamMeta.icon} me-1`} />{upstreamMeta.label}
                      </span>
                      <span className="text-danger ms-1">*</span>
                    </label>
                    <select
                      className="form-select"
                      value={form.upstreamCaseId}
                      onChange={(e) => setForm({ ...form, upstreamCaseId: e.target.value })}
                      disabled={!form.projectId}
                    >
                      <option value="">— 選択してください —</option>
                      {upstreamCases.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {form.projectId && upstreamCases.length === 0 && (
                      <div className="form-text text-warning">
                        <i className="bi bi-exclamation-triangle me-1" />このプロジェクトに{upstreamMeta.label}ケースがありません
                      </div>
                    )}
                  </div>
                )}
                <div className="mb-3">
                  <label className="form-label fw-medium">ケース名 <span className="text-danger">*</span></label>
                  <input
                    className="form-control"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder={`例: ${meta.shortLabel}-001`}
                    autoFocus
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-medium">作成者</label>
                  <input
                    className="form-control"
                    value={form.createdBy}
                    onChange={(e) => setForm({ ...form, createdBy: e.target.value })}
                    placeholder="例: 山田 太郎"
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-medium">メモ</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={form.memo}
                    onChange={(e) => setForm({ ...form, memo: e.target.value })}
                    placeholder="任意のメモ"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>キャンセル</button>
                <button
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={isSaveDisabled}
                >
                  {editTarget ? '保存' : '作成'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <DeleteConfirmModal
          itemName={confirmDelete.name}
          description="すべての解析結果も削除されます。"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
};
