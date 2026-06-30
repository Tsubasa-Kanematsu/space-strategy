import React, { useState, useRef } from 'react';
import { DeleteConfirmModal } from '../common/DeleteConfirmModal';
import { useProjectStore } from '../../stores/projectStore';
import { useMassCaseStore } from '../../stores/massCaseStore';
import { useSizingStore } from '../../stores/sizingStore';
import { useAppStore } from '../../stores/appStore';
import type { Project } from '../../types';
import { exportToJSON, importFromJSON, downloadFile } from '../../utils/importExport';

interface FormState {
  name: string;
  memo: string;
  createdBy: string;
}

const emptyForm = (): FormState => ({ name: '', memo: '', createdBy: '' });

export const ProjectList: React.FC = () => {
  const projects = useProjectStore((s) => s.projects);
  const addProject = useProjectStore((s) => s.addProject);
  const updateProject = useProjectStore((s) => s.updateProject);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const navigate = useAppStore((s) => s.navigate);

  // For JSON export/import
  const allCases = useMassCaseStore((s) => s.cases);
  const allComponents = useMassCaseStore((s) => s.components);
  const allParameters = useMassCaseStore((s) => s.parameters);
  const deleteCase = useMassCaseStore((s) => s.deleteCase);
  const allSizingCases = useSizingStore((s) => s.cases);
  const allSizingResults = useSizingStore((s) => s.results);

  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Project | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportJSON = () => {
    const json = exportToJSON({
      projects,
      massCases: allCases,
      components: allComponents,
      parameters: allParameters,
      sizingCases: allSizingCases,
      sizingResults: allSizingResults,
    });
    downloadFile(json, `rocketDB-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
  };

  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm());
    setShowModal(true);
  };

  const openEdit = (p: Project) => {
    setEditTarget(p);
    setForm({ name: p.name, memo: p.memo, createdBy: p.createdBy });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    if (editTarget) {
      updateProject(editTarget.id, form);
    } else {
      const newProject = addProject(form);
      setShowModal(false);
      navigate('vehicleUnits', { projectId: newProject.id });
      return;
    }
    setShowModal(false);
  };

  const handleDelete = () => {
    if (!confirmDelete) return;
    // Cascade: delete all mass cases (and their components/parameters) for this project
    allCases
      .filter((c) => c.projectId === confirmDelete.id)
      .forEach((c) => deleteCase(c.id));
    deleteProject(confirmDelete.id);
    setConfirmDelete(null);
  };

  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.createdBy.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="page-title">プロジェクト一覧</h1>
        <div className="action-toolbar">
<button className="btn btn-outline-secondary btn-sm" onClick={handleExportJSON} title="全データをJSONでエクスポート">
            <i className="bi bi-download me-1" />
            JSON出力
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="d-none"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const text = await file.text();
                const data = importFromJSON(text);
                alert(`インポート: プロジェクト ${data.projects.length} 件、質量ケース ${data.massCases.length} 件\n\n※インポート機能は現在準備中です。手動で localStorage を上書きする形で実装予定です。`);
                setImportError(null);
              } catch (err) {
                setImportError(String(err));
              }
              e.target.value = '';
            }}
          />
          <button className="btn btn-outline-secondary btn-sm" onClick={() => fileInputRef.current?.click()} title="JSONからインポート">
            <i className="bi bi-upload me-1" />
            JSON読込
          </button>
          <button className="btn btn-primary btn-sm" onClick={openCreate}>
            <i className="bi bi-plus-lg me-1" />
            新規作成
          </button>
        </div>
      </div>
      {importError && (
        <div className="alert alert-danger py-2 d-flex align-items-center gap-2">
          <i className="bi bi-exclamation-circle" />
          <span>{importError}</span>
          <button className="btn-close ms-auto btn-sm" onClick={() => setImportError(null)} />
        </div>
      )}

      {/* Search */}
      <div className="filter-bar mb-3 rounded" style={{ borderRadius: '0.625rem' }}>
        <div className="input-group input-group-sm" style={{ maxWidth: 300 }}>
          <span className="input-group-text bg-white">
            <i className="bi bi-search" />
          </span>
          <input
            className="form-control"
            placeholder="プロジェクト名・作成者で検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <small className="text-muted ms-auto">{filtered.length} 件</small>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th>プロジェクト名</th>
                <th>メモ</th>
                <th>作成者</th>
                <th>作成日時</th>
                <th>更新日時</th>
                <th className="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-4">
                    <i className="bi bi-inbox fs-4 d-block mb-2" />
                    プロジェクトがありません
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <button
                        className="btn btn-link btn-sm p-0 text-primary fw-medium"
                        style={{ textDecoration: 'none' }}
                        onClick={() => navigate('vehicleUnits', { projectId: p.id })}
                      >
                        {p.name}
                      </button>
                    </td>
                    <td className="text-muted" style={{ maxWidth: 200 }}>
                      <span className="text-truncate d-inline-block" style={{ maxWidth: 200 }}>
                        {p.memo || '—'}
                      </span>
                    </td>
                    <td>{p.createdBy || '—'}</td>
                    <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>
                      {new Date(p.createdAt).toLocaleDateString('ja-JP')}
                    </td>
                    <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>
                      {new Date(p.updatedAt).toLocaleDateString('ja-JP')}
                    </td>
                    <td className="col-actions">
                      <button
                        className="btn btn-sm btn-outline-primary me-1"
                        onClick={() => navigate('vehicleUnits', { projectId: p.id })}
                        title="トレーサビリティ"
                      >
                        <i className="bi bi-diagram-3" />
                      </button>
                      <button
                        className="btn btn-sm btn-outline-secondary me-1"
                        onClick={() => openEdit(p)}
                        title="編集"
                      >
                        <i className="bi bi-pencil" />
                      </button>
                      <button
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => setConfirmDelete(p)}
                        title="削除"
                      >
                        <i className="bi bi-trash" />
                      </button>
                    </td>
                  </tr>
                ))
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
                  {editTarget ? 'プロジェクト編集' : '新規プロジェクト'}
                </h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label fw-medium">プロジェクト名 <span className="text-danger">*</span></label>
                  <input
                    className="form-control"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="例: LV-Alpha 基本設計"
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
                  disabled={!form.name.trim()}
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
          description="関連するすべての質量ケースとサイジングデータが削除されます。"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
};
