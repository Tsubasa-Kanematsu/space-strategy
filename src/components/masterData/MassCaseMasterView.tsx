import React, { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useMassCaseStore } from '../../stores/massCaseStore';
import { MassModel } from '../massCase/MassModel';

/**
 * 質量諸元データ（マスタデータ）。他マスタと同じくプロジェクト非依存の「ケース一覧」。
 * 各ケースはコンポーネント構成・質量・重心・慣性テンソルを持つ。編集はフルスクリーンで開く。
 */
export const MassCaseMasterView: React.FC = () => {
  const navigate = useAppStore((s) => s.navigate);
  const cases = useMassCaseStore((s) => s.cases);
  const addCase = useMassCaseStore((s) => s.addCase);
  const updateCase = useMassCaseStore((s) => s.updateCase);
  const deleteCase = useMassCaseStore((s) => s.deleteCase);
  const getComponentsForCase = useMassCaseStore((s) => s.getComponentsForCase);

  const [meta, setMeta] = useState<{ mode: 'create' | 'edit'; id?: string; name: string; memo: string } | null>(null);
  const [editorId, setEditorId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const openEditor = (id: string) => {
    useAppStore.setState({ massCaseId: id });
    setEditorId(id);
  };

  const saveMeta = () => {
    if (!meta || !meta.name.trim()) return;
    if (meta.mode === 'create') {
      addCase({ projectId: '', name: meta.name.trim(), memo: meta.memo, createdBy: '' });
    } else if (meta.id) {
      updateCase(meta.id, { name: meta.name.trim(), memo: meta.memo });
    }
    setMeta(null);
  };

  const editingCase = editorId ? cases.find((c) => c.id === editorId) : null;

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <button className="btn btn-link btn-sm px-0 mb-2 text-decoration-none" onClick={() => navigate('masterDataHub')}>
        <i className="bi bi-arrow-left me-1" />マスタデータ
      </button>
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h1 className="page-title"><i className="bi bi-box-seam me-2 text-primary" />質量諸元データ</h1>
        <button className="btn btn-primary" onClick={() => setMeta({ mode: 'create', name: '', memo: '' })}>
          <i className="bi bi-plus-lg me-1" />新規登録
        </button>
      </div>
      <p className="text-muted small mb-3">
        コンポーネント構成・質量・重心・慣性テンソルのケースを管理します（プロジェクト横断で参照）。
      </p>

      {cases.length === 0 ? (
        <div className="card p-4 text-center text-muted">
          <i className="bi bi-box-seam fs-1 d-block mb-2 opacity-25" />
          <div>質量諸元ケースがありません。</div>
          <div className="mt-3">
            <button className="btn btn-outline-primary btn-sm" onClick={() => setMeta({ mode: 'create', name: '', memo: '' })}>
              最初のケースを登録
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <table className="table table-hover mb-0 align-middle">
            <thead>
              <tr>
                <th>ケース名</th>
                <th className="text-end" style={{ width: 90 }}>部品数</th>
                <th className="text-end" style={{ width: 100 }}>誤差源数</th>
                <th>メモ</th>
                <th style={{ width: 170 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => {
                const comps = getComponentsForCase(c.id);
                const errs = comps.reduce((n, x) => n + (x.errorSources?.length ?? 0), 0);
                return (
                  <tr key={c.id}>
                    <td>
                      <span className="fw-medium editable-cell" style={{ cursor: 'pointer' }} onClick={() => openEditor(c.id)}>
                        {c.name}
                      </span>
                    </td>
                    <td className="text-end font-monospace">{comps.length}</td>
                    <td className="text-end font-monospace">{errs}</td>
                    <td className="text-muted small text-truncate" style={{ maxWidth: 280 }}>{c.memo || '—'}</td>
                    <td>
                      <button className="btn btn-sm btn-outline-primary me-1 py-0" onClick={() => openEditor(c.id)}>
                        <i className="bi bi-pencil me-1" />諸元を編集
                      </button>
                      <button className="btn btn-sm btn-link text-secondary p-1" title="名称を編集" onClick={() => setMeta({ mode: 'edit', id: c.id, name: c.name, memo: c.memo })}>
                        <i className="bi bi-tag" />
                      </button>
                      <button className="btn btn-sm btn-link text-danger p-1" title="削除" onClick={() => setDeleteId(c.id)}>
                        <i className="bi bi-trash" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 名称・メモ 編集モーダル */}
      {meta && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setMeta(null)}>
          <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header py-2">
                <h6 className="modal-title">{meta.mode === 'create' ? '質量諸元ケースを追加' : 'ケース名を編集'}</h6>
                <button className="btn-close" onClick={() => setMeta(null)} />
              </div>
              <div className="modal-body">
                <label className="form-label small fw-medium mb-1">ケース名 <span className="text-danger">*</span></label>
                <input className="form-control form-control-sm mb-2" value={meta.name} autoFocus onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
                <label className="form-label small fw-medium mb-1">メモ</label>
                <textarea className="form-control form-control-sm" rows={2} value={meta.memo} onChange={(e) => setMeta({ ...meta, memo: e.target.value })} />
              </div>
              <div className="modal-footer py-2">
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setMeta(null)}>キャンセル</button>
                <button className="btn btn-sm btn-primary" disabled={!meta.name.trim()} onClick={saveMeta}>{meta.mode === 'create' ? '追加' : '更新'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 削除確認 */}
      {deleteId && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setDeleteId(null)}>
          <div className="modal-dialog modal-sm modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-body">
                <p className="mb-3 small">このケースを削除しますか？（コンポーネント構成も削除されます）</p>
                <div className="d-flex justify-content-end gap-2">
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => setDeleteId(null)}>キャンセル</button>
                  <button className="btn btn-sm btn-danger" onClick={() => { deleteCase(deleteId); setDeleteId(null); }}>削除</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* フルスクリーン諸元エディタ */}
      {editorId && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-fullscreen">
            <div className="modal-content">
              <div className="modal-header py-2">
                <h5 className="modal-title">
                  <i className="bi bi-box-seam me-2 text-primary" />質量諸元の編集
                  {editingCase && <small className="text-muted ms-2" style={{ fontSize: '0.8rem' }}>{editingCase.name}</small>}
                </h5>
                <button className="btn btn-primary btn-sm" onClick={() => setEditorId(null)}>
                  <i className="bi bi-check-lg me-1" />編集を終える
                </button>
              </div>
              <div className="modal-body" style={{ overflow: 'auto' }}>
                <MassModel />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
