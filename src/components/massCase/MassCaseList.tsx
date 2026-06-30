import React, { useState, useMemo, useEffect } from 'react';
import { DeleteConfirmModal } from '../common/DeleteConfirmModal';
import { useMassCaseStore } from '../../stores/massCaseStore';
import { useSizingStore } from '../../stores/sizingStore';
import { useAppStore } from '../../stores/appStore';
import { useProjectStore } from '../../stores/projectStore';
import type { MassCase } from '../../types';

interface FormState {
  name: string;
  memo: string;
  createdBy: string;
  projectId: string;
}

const emptyForm = (defaultProjectId = ''): FormState => ({
  name: '', memo: '', createdBy: '', projectId: defaultProjectId,
});

// ─── ツリーノード型 ──────────────────────────────────────────────────────────
interface DBTreeNode extends MassCase {
  children: DBTreeNode[];
}

function buildTree(cases: MassCase[], parentId: string | null = null): DBTreeNode[] {
  return cases
    .filter((c) => (c.parentMassCaseId ?? null) === parentId)
    .map((c) => ({ ...c, children: buildTree(cases, c.id) }));
}

// ─── ツリー行コンポーネント ──────────────────────────────────────────────────
interface DBTreeRowProps {
  node: DBTreeNode;
  depth: number;
  isLast: boolean;
  parentLines: boolean[];
  allSizingResults: { id: string; sizingCaseId: string; no: number }[];
  allSizingCases: { id: string; name: string }[];
  onOpen: (c: MassCase) => void;
  onEdit: (c: MassCase) => void;
  onCopy: (c: MassCase) => void;
  onFork: (c: MassCase) => void;
  onDelete: (c: MassCase) => void;
}

const DBTreeRow: React.FC<DBTreeRowProps> = ({
  node,
  depth,
  isLast,
  parentLines,
  allSizingResults,
  allSizingCases,
  onOpen,
  onEdit,
  onCopy,
  onFork,
  onDelete,
}) => {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

  const appliedResult = node.sizingResultApplied
    ? allSizingResults.find((r) => r.id === node.sizingResultApplied)
    : null;
  const appliedSizingCase = appliedResult
    ? allSizingCases.find((sc) => sc.id === appliedResult.sizingCaseId)
    : null;

  // ツリー罫線の描画
  const renderIndent = () => {
    const parts: React.ReactNode[] = [];
    // 祖先レベルの縦線
    for (let i = 0; i < depth - 1; i++) {
      const showLine = !parentLines[i];
      parts.push(
        <span
          key={`line-${i}`}
          style={{
            display: 'inline-block',
            width: 24,
            flexShrink: 0,
            borderLeft: showLine ? '1.5px solid #dee2e6' : 'none',
            alignSelf: 'stretch',
          }}
        />,
      );
    }
    // 直接の親との接続線
    if (depth > 0) {
      parts.push(
        <span
          key="connector"
          style={{
            display: 'inline-block',
            width: 24,
            flexShrink: 0,
            position: 'relative',
            alignSelf: 'stretch',
          }}
        >
          <span
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: isLast ? '50%' : 0,
              borderLeft: '1.5px solid #dee2e6',
            }}
          />
          <span
            style={{
              position: 'absolute',
              left: 0,
              top: '50%',
              width: 14,
              borderTop: '1.5px solid #dee2e6',
            }}
          />
        </span>,
      );
    }
    return parts;
  };

  return (
    <>
      <tr style={{ verticalAlign: 'middle' }}>
        {/* DB名（ツリー罫線 + アイコン + 名前） */}
        <td>
          <div className="d-flex align-items-center" style={{ gap: 0, minHeight: 36 }}>
            {renderIndent()}
            {/* 展開/折りたたみ */}
            <span style={{ width: 20, flexShrink: 0, textAlign: 'center' }}>
              {hasChildren ? (
                <button
                  className="btn btn-link btn-sm p-0 text-muted"
                  style={{ fontSize: '0.65rem', lineHeight: 1 }}
                  onClick={() => setExpanded(!expanded)}
                >
                  <i className={`bi bi-chevron-${expanded ? 'down' : 'right'}`} />
                </button>
              ) : null}
            </span>
            <button
              className="btn btn-link btn-sm p-0 fw-medium"
              style={{ textDecoration: 'none', color: '#1558c0' }}
              onClick={() => onOpen(node)}
            >
              <i className="bi bi-database me-1" style={{ color: '#1a73e8' }} />
              {node.name}
            </button>
            {appliedResult && (
              <span className="badge ms-1" style={{ background: '#34a853', fontSize: '0.62rem' }}>
                <i className="bi bi-check-lg me-1" />SC反映
              </span>
            )}
          </div>
        </td>

        {/* サイジング反映 */}
        <td>
          {appliedResult && appliedSizingCase ? (
            <span className="text-success" style={{ fontSize: '0.78rem' }}>
              <i className="bi bi-check-circle-fill me-1" />
              {appliedSizingCase.name} No.{appliedResult.no}
            </span>
          ) : (
            <span className="text-muted" style={{ fontSize: '0.78rem' }}>—</span>
          )}
        </td>

        {/* メモ */}
        <td className="text-muted">
          <span
            className="text-truncate d-inline-block"
            style={{ maxWidth: 200, fontSize: '0.82rem' }}
            title={node.memo}
          >
            {node.memo || '—'}
          </span>
        </td>

        {/* 作成者 */}
        <td style={{ fontSize: '0.82rem' }}>{node.createdBy || '—'}</td>

        {/* 更新日 */}
        <td className="text-muted" style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
          {new Date(node.updatedAt).toLocaleDateString('ja-JP')}
        </td>

        {/* 操作 */}
        <td className="col-actions">
          <button
            className="btn btn-sm btn-outline-secondary me-1"
            onClick={() => onEdit(node)}
            title="編集（名前・メモ）"
          >
            <i className="bi bi-pencil" />
          </button>
          <button
            className="btn btn-sm btn-outline-secondary me-1"
            onClick={() => onCopy(node)}
            title="独立コピー（親子関係なし）"
          >
            <i className="bi bi-copy" />
          </button>
          <button
            className="btn btn-sm btn-outline-primary me-1"
            onClick={() => onFork(node)}
            title="派生を作る（このDBを親として新バージョン作成）"
          >
            <i className="bi bi-git" />
          </button>
          <button
            className="btn btn-sm btn-outline-danger"
            onClick={() => onDelete(node)}
            title="削除"
          >
            <i className="bi bi-trash" />
          </button>
        </td>
      </tr>

      {/* 子ノードの再帰描画 */}
      {hasChildren &&
        expanded &&
        node.children.map((child, idx) => (
          <DBTreeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            isLast={idx === node.children.length - 1}
            parentLines={[...parentLines, isLast]}
            allSizingResults={allSizingResults}
            allSizingCases={allSizingCases}
            onOpen={onOpen}
            onEdit={onEdit}
            onCopy={onCopy}
            onFork={onFork}
            onDelete={onDelete}
          />
        ))}
    </>
  );
};

// ─── メインコンポーネント ────────────────────────────────────────────────────
export const MassCaseList: React.FC = () => {
  const { projectId: currentProjectId, navigate } = useAppStore();
  const projects = useProjectStore((s) => s.projects);
  const allCases = useMassCaseStore((s) => s.cases);
  const addCase = useMassCaseStore((s) => s.addCase);
  const copyCase = useMassCaseStore((s) => s.copyCase);
  const forkCase = useMassCaseStore((s) => s.forkCase);
  const updateCase = useMassCaseStore((s) => s.updateCase);
  const deleteCase = useMassCaseStore((s) => s.deleteCase);

  const allSizingCases = useSizingStore((s) => s.cases);
  const allSizingResults = useSizingStore((s) => s.results);

  const [projectFilter, setProjectFilter] = useState(currentProjectId ?? 'all');

  // プロジェクトナビゲーション時はフィルタを同期
  useEffect(() => {
    setProjectFilter(currentProjectId ?? 'all');
  }, [currentProjectId]);

  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<MassCase | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm(currentProjectId ?? ''));
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<MassCase | null>(null);

  const [forkTarget, setForkTarget] = useState<MassCase | null>(null);
  const [forkName, setForkName] = useState('');

  // プロジェクトフィルタのみ適用（ツリー構造の基礎）
  const projectFiltered = useMemo(
    () => allCases.filter((c) => projectFilter === 'all' || c.projectId === projectFilter),
    [allCases, projectFilter],
  );

  // 検索フィルタ（件数表示用）
  const filtered = useMemo(
    () =>
      !search
        ? projectFiltered
        : projectFiltered.filter(
            (c) =>
              c.name.toLowerCase().includes(search.toLowerCase()) ||
              c.createdBy.toLowerCase().includes(search.toLowerCase()),
          ),
    [projectFiltered, search],
  );

  // ツリーはプロジェクトフィルタのみで構築（検索で親が消えても構造を維持）
  const treeRoots = useMemo(() => buildTree(projectFiltered), [projectFiltered]);

  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm(projectFilter !== 'all' ? projectFilter : (currentProjectId ?? '')));
    setShowModal(true);
  };

  const openEdit = (c: MassCase) => {
    setEditTarget(c);
    setForm({ name: c.name, memo: c.memo, createdBy: c.createdBy, projectId: c.projectId });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.projectId) return;
    if (editTarget) {
      updateCase(editTarget.id, { name: form.name, memo: form.memo, createdBy: form.createdBy });
    } else {
      addCase({
        name: form.name,
        memo: form.memo,
        createdBy: form.createdBy,
        projectId: form.projectId,
      });
    }
    setShowModal(false);
  };

  const handleCopy = (c: MassCase) => {
    copyCase(c.id);
  };

  const openForkModal = (c: MassCase) => {
    setForkTarget(c);
    setForkName(`${c.name} 派生`);
  };

  const handleFork = () => {
    if (!forkTarget || !forkName.trim()) return;
    forkCase(forkTarget.id, forkName.trim());
    setForkTarget(null);
    setForkName('');
  };

  const handleDelete = () => {
    if (!confirmDelete) return;
    deleteCase(confirmDelete.id);
    setConfirmDelete(null);
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="page-title">
          <i className="bi bi-database me-2 text-primary" />
          ロケットデータベース
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

      {/* 操作説明 */}
      <div
        className="d-flex align-items-center gap-3 mb-3"
        style={{ fontSize: '0.78rem', color: '#6c757d' }}
      >
        <span>
          <i className="bi bi-copy me-1" />コピー: 独立した複製（派生関係なし）
        </span>
        <span>
          <i className="bi bi-git me-1" style={{ color: '#0d6efd' }} />
          派生: このDBを親として新バージョンを作成
        </span>
      </div>

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
            placeholder="DB名・作成者で検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <small className="text-muted ms-auto">{filtered.length} 件</small>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover mb-0" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '34%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '12%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>DB名</th>
                <th>サイジング反映</th>
                <th>メモ</th>
                <th>作成者</th>
                <th>更新日</th>
                <th className="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {treeRoots.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-5">
                    <i className="bi bi-database fs-3 d-block mb-2 opacity-25" />
                    <div>ロケットデータベースがありません</div>
                    {projects.length > 0 && (
                      <button className="btn btn-primary btn-sm mt-2" onClick={openCreate}>
                        <i className="bi bi-plus-lg me-1" />最初のDBを作成
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                treeRoots.map((root, idx) => (
                  <DBTreeRow
                    key={root.id}
                    node={root}
                    depth={0}
                    isLast={idx === treeRoots.length - 1}
                    parentLines={[]}
                    allSizingResults={allSizingResults}
                    allSizingCases={allSizingCases}
                    onOpen={(c) =>
                      navigate('massModel', { projectId: c.projectId, massCaseId: c.id })
                    }
                    onEdit={openEdit}
                    onCopy={handleCopy}
                    onFork={openForkModal}
                    onDelete={setConfirmDelete}
                  />
                ))
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
                  <i className="bi bi-database me-2" />
                  {editTarget ? 'ロケットDB編集' : '新規ロケットデータベース'}
                </h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body">
                {!editTarget && (
                  <div className="mb-3">
                    <label className="form-label fw-medium">
                      プロジェクト <span className="text-danger">*</span>
                    </label>
                    <select
                      className="form-select"
                      value={form.projectId}
                      onChange={(e) => setForm({ ...form, projectId: e.target.value })}
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
                <div className="mb-3">
                  <label className="form-label fw-medium">
                    DB名 <span className="text-danger">*</span>
                  </label>
                  <input
                    className="form-control"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="例: LV-Alpha Rev.A"
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
                    placeholder="設計方針・特記事項など"
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
                  disabled={!form.name.trim() || !form.projectId}
                >
                  {editTarget ? '保存' : '作成'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 派生モーダル */}
      {forkTarget && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="modal-dialog modal-sm">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="bi bi-git me-2 text-primary" />派生DBを作成
                </h5>
                <button className="btn-close" onClick={() => setForkTarget(null)} />
              </div>
              <div className="modal-body">
                <p className="text-muted mb-3" style={{ fontSize: '0.85rem' }}>
                  <strong>{forkTarget.name}</strong> を派生元として新しいDBを作成します。
                  <br />
                  コンポーネント構成・パラメータがすべてコピーされます。
                </p>
                <label className="form-label fw-medium">
                  新DBの名前 <span className="text-danger">*</span>
                </label>
                <input
                  className="form-control"
                  value={forkName}
                  onChange={(e) => setForkName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleFork()}
                  autoFocus
                  placeholder="例: LV-Alpha 再使用案"
                />
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setForkTarget(null)}>
                  キャンセル
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleFork}
                  disabled={!forkName.trim()}
                >
                  作成して開く
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <DeleteConfirmModal
          itemName={confirmDelete.name}
          description="関連するすべてのコンポーネントデータ・パラメータが削除されます。"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
};
