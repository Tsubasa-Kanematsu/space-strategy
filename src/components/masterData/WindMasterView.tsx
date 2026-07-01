import React, { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useMasterDataStore } from '../../stores/masterDataStore';
import type { WindMaster } from '../../types';

/**
 * 風データマスタ。射場ごとの代表風プロファイルを設定（追加/編集/削除）し、解析で参照する。
 */

interface FormState {
  name: string;
  site: string;
  maxSpeedMs: string;
  maxSpeedAltKm: string;
  dirDeg: string;
  memo: string;
}

const emptyForm = (): FormState => ({
  name: '', site: '', maxSpeedMs: '', maxSpeedAltKm: '', dirDeg: '', memo: '',
});

const toNum = (s: string): number | null => {
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
};

const numCell = (v: number | null) => (v !== null ? v : <span className="text-muted">—</span>);

export const WindMasterView: React.FC = () => {
  const navigate = useAppStore((s) => s.navigate);
  const winds = useMasterDataStore((s) => s.winds);
  const addWind = useMasterDataStore((s) => s.addWind);
  const updateWind = useMasterDataStore((s) => s.updateWind);
  const deleteWind = useMasterDataStore((s) => s.deleteWind);

  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<WindMaster | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [confirmDelete, setConfirmDelete] = useState<WindMaster | null>(null);

  const openCreate = () => { setEditTarget(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (x: WindMaster) => {
    setEditTarget(x);
    setForm({
      name: x.name,
      site: x.site,
      maxSpeedMs: x.maxSpeedMs?.toString() ?? '',
      maxSpeedAltKm: x.maxSpeedAltKm?.toString() ?? '',
      dirDeg: x.dirDeg?.toString() ?? '',
      memo: x.memo,
    });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    const data = {
      name: form.name.trim(),
      site: form.site,
      maxSpeedMs: toNum(form.maxSpeedMs),
      maxSpeedAltKm: toNum(form.maxSpeedAltKm),
      dirDeg: toNum(form.dirDeg),
      memo: form.memo,
    };
    if (editTarget) updateWind(editTarget.id, data);
    else addWind(data);
    setShowModal(false);
  };

  const handleDelete = () => {
    if (!confirmDelete) return;
    deleteWind(confirmDelete.id);
    setConfirmDelete(null);
  };

  return (
    <div>
      <button className="btn btn-link btn-sm px-0 mb-2 text-decoration-none" onClick={() => navigate('masterDataHub')}>
        <i className="bi bi-arrow-left me-1" />マスタデータ
      </button>

      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="page-title mb-0">
          <i className="bi bi-tornado me-2 text-primary" />風データ
        </h1>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>
          <i className="bi bi-plus-lg me-1" />新規登録
        </button>
      </div>
      <p className="text-muted small mb-3">
        射場ごとの代表風プロファイル（最大風速・その高度・代表風向）を設定します。飛行解析・荷重解析の入力として参照します。
      </p>

      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover mb-0 align-middle">
            <thead>
              <tr>
                <th>プロファイル名</th>
                <th>射場</th>
                <th className="text-end">最大風速 (m/s)</th>
                <th className="text-end">最大風速高度 (km)</th>
                <th className="text-end">代表風向 (deg)</th>
                <th className="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {winds.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-5">
                    <i className="bi bi-tornado fs-3 d-block mb-2 opacity-25" />
                    <div>風データがありません</div>
                    <button className="btn btn-primary btn-sm mt-2" onClick={openCreate}>
                      <i className="bi bi-plus-lg me-1" />最初の風プロファイルを登録
                    </button>
                  </td>
                </tr>
              ) : (
                winds.map((x) => (
                  <tr key={x.id}>
                    <td className="fw-medium">{x.name}</td>
                    <td>{x.site || '—'}</td>
                    <td className="text-end font-monospace">{numCell(x.maxSpeedMs)}</td>
                    <td className="text-end font-monospace">{numCell(x.maxSpeedAltKm)}</td>
                    <td className="text-end font-monospace">{numCell(x.dirDeg)}</td>
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
                <h5 className="modal-title"><i className="bi bi-tornado me-2" />{editTarget ? '風プロファイル編集' : '新規風プロファイル登録'}</h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body">
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label fw-medium">プロファイル名 <span className="text-danger">*</span></label>
                    <input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例: 大樹町 夏季代表風" autoFocus />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-medium">射場</label>
                    <input className="form-control" value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} placeholder="例: 大樹町" />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-medium">最大風速 (m/s)</label>
                    <input type="number" step="0.1" className="form-control" value={form.maxSpeedMs} onChange={(e) => setForm({ ...form, maxSpeedMs: e.target.value })} placeholder="例: 45" />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-medium">最大風速高度 (km)</label>
                    <input type="number" step="0.1" className="form-control" value={form.maxSpeedAltKm} onChange={(e) => setForm({ ...form, maxSpeedAltKm: e.target.value })} placeholder="例: 12" />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-medium">代表風向 (deg)</label>
                    <input type="number" step="1" className="form-control" value={form.dirDeg} onChange={(e) => setForm({ ...form, dirDeg: e.target.value })} placeholder="例: 270" />
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
