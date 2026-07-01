import React, { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useMasterDataStore } from '../../stores/masterDataStore';
import type { FailureRateMaster } from '../../types';

/**
 * 故障率マスタ。サブシステム別の故障率・代表故障モードを設定（追加/編集/削除）し、解析で参照する。
 */

interface FormState {
  name: string;
  failureRate: string;
  mode: string;
  phase: string;
  memo: string;
}

const emptyForm = (): FormState => ({
  name: '', failureRate: '', mode: '', phase: '', memo: '',
});

const toNum = (s: string): number | null => {
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
};

const rateCell = (v: number | null) => (v !== null ? v.toExponential(1) : <span className="text-muted">—</span>);

export const FailureRateMasterView: React.FC = () => {
  const navigate = useAppStore((s) => s.navigate);
  const failureRates = useMasterDataStore((s) => s.failureRates);
  const addFailureRate = useMasterDataStore((s) => s.addFailureRate);
  const updateFailureRate = useMasterDataStore((s) => s.updateFailureRate);
  const deleteFailureRate = useMasterDataStore((s) => s.deleteFailureRate);

  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<FailureRateMaster | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [confirmDelete, setConfirmDelete] = useState<FailureRateMaster | null>(null);

  const openCreate = () => { setEditTarget(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (x: FailureRateMaster) => {
    setEditTarget(x);
    setForm({
      name: x.name,
      failureRate: x.failureRate?.toString() ?? '',
      mode: x.mode,
      phase: x.phase,
      memo: x.memo,
    });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    const data = {
      name: form.name.trim(),
      failureRate: toNum(form.failureRate),
      mode: form.mode,
      phase: form.phase,
      memo: form.memo,
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
        サブシステム別の故障率（/flight）・代表故障モード・発生フェーズを設定します。飛行安全解析・信頼性解析の入力として参照します。
      </p>

      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover mb-0 align-middle">
            <thead>
              <tr>
                <th>サブシステム</th>
                <th className="text-end">故障率 (/flight)</th>
                <th>代表故障モード</th>
                <th>発生フェーズ</th>
                <th className="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {failureRates.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-muted py-5">
                    <i className="bi bi-exclamation-triangle fs-3 d-block mb-2 opacity-25" />
                    <div>故障率データがありません</div>
                    <button className="btn btn-primary btn-sm mt-2" onClick={openCreate}>
                      <i className="bi bi-plus-lg me-1" />最初のサブシステムを登録
                    </button>
                  </td>
                </tr>
              ) : (
                failureRates.map((x) => (
                  <tr key={x.id}>
                    <td className="fw-medium">{x.name}</td>
                    <td className="text-end font-monospace">{rateCell(x.failureRate)}</td>
                    <td>{x.mode || '—'}</td>
                    <td>{x.phase || '—'}</td>
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
                <h5 className="modal-title"><i className="bi bi-exclamation-triangle me-2" />{editTarget ? '故障率編集' : '新規故障率登録'}</h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body">
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label fw-medium">サブシステム <span className="text-danger">*</span></label>
                    <input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例: 1段推進系" autoFocus />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-medium">故障率 (/flight)</label>
                    <input type="number" step="any" className="form-control" value={form.failureRate} onChange={(e) => setForm({ ...form, failureRate: e.target.value })} placeholder="例: 1e-3" />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-medium">代表故障モード</label>
                    <input className="form-control" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} placeholder="例: 燃焼室破損" />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-medium">発生フェーズ</label>
                    <input className="form-control" value={form.phase} onChange={(e) => setForm({ ...form, phase: e.target.value })} placeholder="例: 1段燃焼中" />
                  </div>
                  <div className="col-12">
                    <label className="form-label fw-medium">メモ</label>
                    <textarea className="form-control" rows={2} value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>キャンセル</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={!form.name.trim()}>{editTarget ? '保存' : '登録'}</button>
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
