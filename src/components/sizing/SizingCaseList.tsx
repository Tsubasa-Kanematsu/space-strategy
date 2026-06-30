import React, { useState, useMemo } from 'react';
import { DeleteConfirmModal } from '../common/DeleteConfirmModal';
import { useSizingStore } from '../../stores/sizingStore';
import { useMassCaseStore } from '../../stores/massCaseStore';
import { useAppStore } from '../../stores/appStore';
import { useProjectStore } from '../../stores/projectStore';
import type { SizingCase } from '../../types';

interface FormState {
  name: string;
  memo: string;
  createdBy: string;
  projectId: string;
  massCaseId: string;
}

const emptyForm = (defaultProjectId = '', defaultMassCaseId = ''): FormState => ({
  name: '',
  memo: '',
  createdBy: '',
  projectId: defaultProjectId,
  massCaseId: defaultMassCaseId,
});

export const SizingCaseList: React.FC = () => {
  // 解析タブのリストは「全プロジェクト横断」が原則。
  // 以前選んでいた projectId で勝手に絞り込まない。
  // ただし massCaseId がコンテキストに残っていれば DB ピン留めモードを維持する
  // (ロケットDB画面から直接サイジング一覧に来たケース)。
  const { massCaseId: contextMassCaseId, navigate } = useAppStore();
  const projects = useProjectStore((s) => s.projects);
  const allCases = useSizingStore((s) => s.cases);
  const allMassCases = useMassCaseStore((s) => s.cases);
  const addCase = useSizingStore((s) => s.addCase);
  const updateCase = useSizingStore((s) => s.updateCase);
  const deleteCase = useSizingStore((s) => s.deleteCase);
  const getResultsForCase = useSizingStore((s) => s.getResultsForCase);

  // DBコンテキストがある場合はそのDBで固定
  const isDbContext = !!contextMassCaseId;
  const contextMassCase = isDbContext
    ? allMassCases.find((m) => m.id === contextMassCaseId)
    : null;

  const [projectFilter, setProjectFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<SizingCase | null>(null);
  const [form, setForm] = useState<FormState>(
    emptyForm('', contextMassCaseId ?? ''),
  );
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<SizingCase | null>(null);

  const filtered = useMemo(() => {
    return allCases.filter((c) => {
      // DBコンテキストがある場合はそのDBのSCのみ表示
      if (isDbContext) return c.massCaseId === contextMassCaseId;
      const matchProject = projectFilter === 'all' || c.projectId === projectFilter;
      const matchSearch =
        !search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.createdBy.toLowerCase().includes(search.toLowerCase());
      return matchProject && matchSearch;
    });
  }, [allCases, projectFilter, search, isDbContext, contextMassCaseId]);

  const formMassCases = useMemo(
    () => (form.projectId ? allMassCases.filter((m) => m.projectId === form.projectId) : []),
    [allMassCases, form.projectId],
  );

  const getProjectName = (pid: string) => projects.find((p) => p.id === pid)?.name ?? '—';
  const getMassCaseName = (mid: string) => allMassCases.find((m) => m.id === mid)?.name ?? '—';

  const openCreate = () => {
    setEditTarget(null);
    const defaultProjectId = isDbContext
      ? (contextMassCase?.projectId ?? '')
      : (projectFilter !== 'all' ? projectFilter : '');
    setForm(emptyForm(defaultProjectId, contextMassCaseId ?? ''));
    setShowModal(true);
  };

  const openEdit = (c: SizingCase) => {
    setEditTarget(c);
    setForm({
      name: c.name,
      memo: c.memo,
      createdBy: c.createdBy,
      projectId: c.projectId,
      massCaseId: c.massCaseId,
    });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.projectId || !form.massCaseId) return;
    if (editTarget) {
      updateCase(editTarget.id, {
        name: form.name,
        memo: form.memo,
        createdBy: form.createdBy,
        massCaseId: form.massCaseId,
      });
    } else {
      const created = addCase({
        name: form.name,
        memo: form.memo,
        createdBy: form.createdBy,
        projectId: form.projectId,
        massCaseId: form.massCaseId,
      });
      // DBコンテキストがある場合は massCaseId を保持したまま遷移
      navigate('sizingCondition', {
        projectId: created.projectId,
        sizingCaseId: created.id,
        ...(isDbContext ? { massCaseId: contextMassCaseId } : {}),
      });
    }
    setShowModal(false);
  };

  const handleDelete = () => {
    if (!confirmDelete) return;
    deleteCase(confirmDelete.id);
    setConfirmDelete(null);
  };

  const handleCaseClick = (c: SizingCase) => {
    navigate('sizingCondition', {
      projectId: c.projectId,
      sizingCaseId: c.id,
      ...(isDbContext ? { massCaseId: contextMassCaseId } : {}),
    });
  };

  const handleResultsClick = (c: SizingCase) => {
    navigate('sizingResults', {
      projectId: c.projectId,
      sizingCaseId: c.id,
      ...(isDbContext ? { massCaseId: contextMassCaseId } : {}),
    });
  };

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="page-title">
          <i className="bi bi-calculator me-2 text-primary" />
          {isDbContext && contextMassCase ? (
            <>サイジング — <span style={{ color: '#1a73e8' }}>{contextMassCase.name}</span></>
          ) : 'サイジング'}
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

      {/* DBコンテキストなし: プロジェクトフィルタ表示 */}
      {!isDbContext && (
        <div className="filter-bar mb-3 rounded">
          <select
            className="form-select form-select-sm"
            style={{ maxWidth: 200 }}
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="all">すべてのプロジェクト</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="input-group input-group-sm" style={{ maxWidth: 280 }}>
            <span className="input-group-text bg-white">
              <i className="bi bi-search" />
            </span>
            <input
              className="form-control"
              placeholder="ケース名・作成者で検索"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <small className="text-muted ms-auto">{filtered.length} 件</small>
        </div>
      )}

      {/* DBコンテキストあり: 件数表示のみ */}
      {isDbContext && (
        <div className="d-flex align-items-center mb-3">
          <small className="text-muted">{filtered.length} 件</small>
        </div>
      )}

      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th>ケース名</th>
                {!isDbContext && <th>プロジェクト</th>}
                {!isDbContext && <th>参照ロケットDB</th>}
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
                  <td colSpan={isDbContext ? 6 : 8} className="text-center text-muted py-5">
                    <i className="bi bi-calculator fs-3 d-block mb-2 opacity-25" />
                    <div>サイジングケースがありません</div>
                    <button className="btn btn-primary btn-sm mt-2" onClick={openCreate}>
                      <i className="bi bi-plus-lg me-1" />最初のケースを作成
                    </button>
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
                          onClick={() => handleCaseClick(c)}
                        >
                          <i className="bi bi-calculator me-1" />
                          {c.name}
                        </button>
                      </td>
                      {!isDbContext && (
                        <td>
                          <span
                            className="badge bg-primary-subtle text-primary"
                            style={{ fontSize: '0.75rem' }}
                          >
                            {getProjectName(c.projectId)}
                          </span>
                        </td>
                      )}
                      {!isDbContext && (
                        <td>
                          <span
                            className="badge bg-secondary-subtle text-secondary"
                            style={{ fontSize: '0.75rem' }}
                          >
                            {getMassCaseName(c.massCaseId)}
                          </span>
                        </td>
                      )}
                      <td className="text-muted">
                        <span
                          className="text-truncate d-inline-block"
                          style={{ maxWidth: 180 }}
                        >
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
                        <button
                          className="btn btn-sm btn-outline-secondary me-1"
                          onClick={() => openEdit(c)}
                          title="編集"
                        >
                          <i className="bi bi-pencil" />
                        </button>
                        <button
                          className="btn btn-sm btn-outline-primary me-1"
                          onClick={() => handleResultsClick(c)}
                          title="結果"
                        >
                          <i className="bi bi-table" />
                        </button>
                        <button
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => setConfirmDelete(c)}
                          title="削除"
                        >
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

      {/* 作成/編集モーダル */}
      {showModal && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="bi bi-calculator me-2" />
                  {editTarget ? 'サイジングケース編集' : '新規サイジングケース'}
                </h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body">
                {/* DBコンテキストなし: プロジェクト選択 */}
                {!editTarget && !isDbContext && (
                  <div className="mb-3">
                    <label className="form-label fw-medium">
                      プロジェクト <span className="text-danger">*</span>
                    </label>
                    <select
                      className="form-select"
                      value={form.projectId}
                      onChange={(e) => setForm({ ...form, projectId: e.target.value, massCaseId: '' })}
                    >
                      <option value="">— 選択してください —</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 参照ロケットDB: DBコンテキストあり=固定表示、なし=選択 */}
                <div className="mb-3">
                  <label className="form-label fw-medium">
                    参照ロケットDB <span className="text-danger">*</span>
                  </label>
                  {isDbContext && !editTarget ? (
                    <div className="form-control-plaintext d-flex align-items-center gap-2">
                      <i className="bi bi-database text-primary" />
                      <strong>{contextMassCase?.name ?? '—'}</strong>
                      <span className="badge bg-primary-subtle text-primary" style={{ fontSize: '0.72rem' }}>
                        固定
                      </span>
                    </div>
                  ) : (
                    <>
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
                        ).map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                      {!editTarget && form.projectId && formMassCases.length === 0 && (
                        <div className="form-text text-warning">
                          <i className="bi bi-exclamation-triangle me-1" />
                          このプロジェクトにはロケットDBがありません
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="mb-3">
                  <label className="form-label fw-medium">
                    ケース名 <span className="text-danger">*</span>
                  </label>
                  <input
                    className="form-control"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="例: SC-001 標準条件"
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
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  キャンセル
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={!form.name.trim() || !form.projectId || !form.massCaseId}
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
