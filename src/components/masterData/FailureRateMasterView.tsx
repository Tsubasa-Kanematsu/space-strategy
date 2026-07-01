import React, { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useMasterDataStore } from '../../stores/masterDataStore';
import type { FailureRateMaster, FailureRow } from '../../types';

/**
 * 故障率マスタ。サブシステム別の故障率・代表故障モードを1セットとしてまとめ
 * （追加/編集/削除）、解析で参照する。1レコード＝1セット。
 */

interface DraftState {
  name: string;
  memo: string;
  subsystems: FailureRow[];
}

const emptyDraft = (): DraftState => ({ name: '', memo: '', subsystems: [] });

const toNum = (s: string): number | null => {
  if (s.trim() === '') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
};

export const FailureRateMasterView: React.FC = () => {
  const navigate = useAppStore((s) => s.navigate);
  const failureRates = useMasterDataStore((s) => s.failureRates);
  const addFailureRate = useMasterDataStore((s) => s.addFailureRate);
  const updateFailureRate = useMasterDataStore((s) => s.updateFailureRate);
  const deleteFailureRate = useMasterDataStore((s) => s.deleteFailureRate);

  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<FailureRateMaster | null>(null);
  const [draft, setDraft] = useState<DraftState>(emptyDraft());
  const [confirmDelete, setConfirmDelete] = useState<FailureRateMaster | null>(null);

  const openCreate = () => { setEditTarget(null); setDraft(emptyDraft()); setShowModal(true); };
  const openEdit = (x: FailureRateMaster) => {
    setEditTarget(x);
    setDraft({
      name: x.name,
      memo: x.memo,
      subsystems: x.subsystems.map((r) => ({ ...r })),
    });
    setShowModal(true);
  };

  const addRow = () =>
    setDraft((d) => ({ ...d, subsystems: [...d.subsystems, { name: '', failureRate: null, mode: '', phase: '' }] }));

  const removeRow = (idx: number) =>
    setDraft((d) => ({ ...d, subsystems: d.subsystems.filter((_, i) => i !== idx) }));

  const updateRow = (idx: number, patch: Partial<FailureRow>) =>
    setDraft((d) => ({ ...d, subsystems: d.subsystems.map((r, i) => i === idx ? { ...r, ...patch } : r) }));

  const handleSave = () => {
    if (!draft.name.trim()) return;
    const data = {
      name: draft.name.trim(),
      memo: draft.memo,
      subsystems: draft.subsystems,
    };
    if (editTarget) updateFailureRate(editTarget.id, data);
    else addFailureRate(data);
    setShowModal(false);
  };

  const handleDelete = () => {
    if (!confirmDelete) return;
    deleteFailureRate(confirmDelete.id);
    setConfirmDelete(null);
  };

  return (
    <div>
      <button className="btn btn-link btn-sm px-0 mb-2 text-decoration-none" onClick={() => navigate('masterDataHub')}>
        <i className="bi bi-arrow-left me-1" />マスタデータ
      </button>

      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="page-title mb-0">
          <i className="bi bi-exclamation-triangle me-2 text-primary" />故障率データ
        </h1>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>
          <i className="bi bi-plus-lg me-1" />新規登録
        </button>
      </div>
      <p className="text-muted small mb-3">
        サブシステム別の故障率（/flight）・代表故障モード・発生フェーズを1セットとして設定します。飛行安全解析・信頼性解析の入力として参照します。
      </p>

      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover mb-0 align-middle">
            <thead>
              <tr>
                <th>セット名</th>
                <th className="text-end">サブシステム数</th>
                <th className="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {failureRates.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-center text-muted py-5">
                    <i className="bi bi-exclamation-triangle fs-3 d-block mb-2 opacity-25" />
                    <div>故障率データがありません</div>
                    <button className="btn btn-primary btn-sm mt-2" onClick={openCreate}>
                      <i className="bi bi-plus-lg me-1" />最初のセットを登録
                    </button>
                  </td>
                </tr>
              ) : (
                failureRates.map((x) => (
                  <tr key={x.id}>
                    <td className="fw-medium">{x.name}</td>
                    <td className="text-end font-monospace">{x.subsystems.length}</td>
                    <td className="col-actions">
                      <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => openEdit(x)} title="編集">
                        <i className="bi bi-pencil" />
                      </button>
                      <button className="btn btn-sm btn-outline-danger" onClick={() => setConfirmDelete(x)} title="削除">
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
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title"><i className="bi bi-exclamation-triangle me-2" />{editTarget ? '故障率セット編集' : '新規故障率セット登録'}</h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body">
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label fw-medium">セット名 <span className="text-danger">*</span></label>
                    <input className="form-control" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="例: ZERO 標準故障率セット" autoFocus />
                  </div>
                  <div className="col-12">
                    <label className="form-label fw-medium">メモ</label>
                    <textarea className="form-control" rows={2} value={draft.memo} onChange={(e) => setDraft({ ...draft, memo: e.target.value })} />
                  </div>

                  <div className="col-12">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <label className="form-label fw-medium mb-0">サブシステム</label>
                      <button className="btn btn-sm btn-outline-primary" onClick={addRow}>
                        <i className="bi bi-plus-lg me-1" />サブシステムを追加
                      </button>
                    </div>
                    <div className="table-responsive">
                      <table className="table table-sm align-middle mb-0">
                        <thead>
                          <tr>
                            <th>サブシステム</th>
                            <th className="text-end">故障率 (/flight)</th>
                            <th>代表故障モード</th>
                            <th>発生フェーズ</th>
                            <th className="col-actions" />
                          </tr>
                        </thead>
                        <tbody>
                          {draft.subsystems.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="text-center text-muted small py-3">
                                サブシステムがありません。「サブシステムを追加」で行を登録します。
                              </td>
                            </tr>
                          ) : (
                            draft.subsystems.map((r, idx) => (
                              <tr key={idx}>
                                <td>
                                  <input className="form-control form-control-sm"
                                    value={r.name} onChange={(e) => updateRow(idx, { name: e.target.value })} placeholder="例: 1段推進系" />
                                </td>
                                <td>
                                  <input type="number" step="any" className="form-control form-control-sm text-end font-monospace"
                                    value={r.failureRate ?? ''} onChange={(e) => updateRow(idx, { failureRate: toNum(e.target.value) })} placeholder="例: 1e-3" />
                                </td>
                                <td>
                                  <input className="form-control form-control-sm"
                                    value={r.mode} onChange={(e) => updateRow(idx, { mode: e.target.value })} placeholder="例: 燃焼室破損" />
                                </td>
                                <td>
                                  <input className="form-control form-control-sm"
                                    value={r.phase} onChange={(e) => updateRow(idx, { phase: e.target.value })} placeholder="例: 1段燃焼中" />
                                </td>
                                <td className="col-actions">
                                  <button className="btn btn-sm btn-outline-danger" onClick={() => removeRow(idx)} title="行を削除">
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
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>キャンセル</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={!draft.name.trim()}>{editTarget ? '保存' : '登録'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="modal-dialog modal-sm">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title text-danger">削除確認</h5>
                <button className="btn-close" onClick={() => setConfirmDelete(null)} />
              </div>
              <div className="modal-body"><p><strong>{confirmDelete.name}</strong> を削除しますか？</p></div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>キャンセル</button>
                <button className="btn btn-danger" onClick={handleDelete}>削除</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
