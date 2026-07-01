import React, { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useMasterDataStore } from '../../stores/masterDataStore';
import type { AeroCoeffMaster } from '../../types';

/**
 * 空力係数マスタ。抗力係数・揚力傾斜などの代表値を設定（追加/編集/削除）し、解析で参照する。
 */

interface FormState {
  name: string;
  cdSubsonic: string;
  cdTransonicPeak: string;
  cdSupersonic: string;
  clAlpha: string;
  memo: string;
}

const emptyForm = (): FormState => ({
  name: '', cdSubsonic: '', cdTransonicPeak: '', cdSupersonic: '', clAlpha: '', memo: '',
});

const toNum = (s: string): number | null => {
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
};

const numCell = (v: number | null) => (v !== null ? v : <span className="text-muted">—</span>);

export const AeroCoeffView: React.FC = () => {
  const navigate = useAppStore((s) => s.navigate);
  const aeroCoeffs = useMasterDataStore((s) => s.aeroCoeffs);
  const addAeroCoeff = useMasterDataStore((s) => s.addAeroCoeff);
  const updateAeroCoeff = useMasterDataStore((s) => s.updateAeroCoeff);
  const deleteAeroCoeff = useMasterDataStore((s) => s.deleteAeroCoeff);

  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<AeroCoeffMaster | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [confirmDelete, setConfirmDelete] = useState<AeroCoeffMaster | null>(null);

  const openCreate = () => { setEditTarget(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (x: AeroCoeffMaster) => {
    setEditTarget(x);
    setForm({
      name: x.name,
      cdSubsonic: x.cdSubsonic?.toString() ?? '',
      cdTransonicPeak: x.cdTransonicPeak?.toString() ?? '',
      cdSupersonic: x.cdSupersonic?.toString() ?? '',
      clAlpha: x.clAlpha?.toString() ?? '',
      memo: x.memo,
    });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    const data = {
      name: form.name.trim(),
      cdSubsonic: toNum(form.cdSubsonic),
      cdTransonicPeak: toNum(form.cdTransonicPeak),
      cdSupersonic: toNum(form.cdSupersonic),
      clAlpha: toNum(form.clAlpha),
      memo: form.memo,
    };
    if (editTarget) updateAeroCoeff(editTarget.id, data);
    else addAeroCoeff(data);
    setShowModal(false);
  };

  const handleDelete = () => {
    if (!confirmDelete) return;
    deleteAeroCoeff(confirmDelete.id);
    setConfirmDelete(null);
  };

  return (
    <div>
      <button className="btn btn-link btn-sm px-0 mb-2 text-decoration-none" onClick={() => navigate('masterDataHub')}>
        <i className="bi bi-arrow-left me-1" />マスタデータ
      </button>

      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="page-title mb-0">
          <i className="bi bi-wind me-2 text-primary" />空力係数データ
        </h1>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>
          <i className="bi bi-plus-lg me-1" />新規登録
        </button>
      </div>
      <p className="text-muted small mb-3">
        機体の抗力係数（マッハ域別）・揚力傾斜などの代表空力係数を設定します。飛行解析・空力解析の入力として参照します。
      </p>

      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover mb-0 align-middle">
            <thead>
              <tr>
                <th>名称</th>
                <th className="text-end">亜音速 Cd</th>
                <th className="text-end">遷音速ピーク Cd</th>
                <th className="text-end">超音速 Cd</th>
                <th className="text-end">揚力傾斜 CLα (/rad)</th>
                <th className="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {aeroCoeffs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-5">
                    <i className="bi bi-wind fs-3 d-block mb-2 opacity-25" />
                    <div>空力係数データがありません</div>
                    <button className="btn btn-primary btn-sm mt-2" onClick={openCreate}>
                      <i className="bi bi-plus-lg me-1" />最初の空力係数を登録
                    </button>
                  </td>
                </tr>
              ) : (
                aeroCoeffs.map((x) => (
                  <tr key={x.id}>
                    <td className="fw-medium">{x.name}</td>
                    <td className="text-end font-monospace">{numCell(x.cdSubsonic)}</td>
                    <td className="text-end font-monospace">{numCell(x.cdTransonicPeak)}</td>
                    <td className="text-end font-monospace">{numCell(x.cdSupersonic)}</td>
                    <td className="text-end font-monospace">{numCell(x.clAlpha)}</td>
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
                <h5 className="modal-title"><i className="bi bi-wind me-2" />{editTarget ? '空力係数編集' : '新規空力係数登録'}</h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body">
                <div className="row g-3">
                  <div className="col-md-12">
                    <label className="form-label fw-medium">名称 <span className="text-danger">*</span></label>
                    <input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例: LV-Alpha 標準空力" autoFocus />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-medium">亜音速 Cd</label>
                    <input type="number" step="0.01" className="form-control" value={form.cdSubsonic} onChange={(e) => setForm({ ...form, cdSubsonic: e.target.value })} placeholder="例: 0.30" />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-medium">遷音速ピーク Cd</label>
                    <input type="number" step="0.01" className="form-control" value={form.cdTransonicPeak} onChange={(e) => setForm({ ...form, cdTransonicPeak: e.target.value })} placeholder="例: 0.55" />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-medium">超音速 Cd</label>
                    <input type="number" step="0.01" className="form-control" value={form.cdSupersonic} onChange={(e) => setForm({ ...form, cdSupersonic: e.target.value })} placeholder="例: 0.28" />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-medium">揚力傾斜 CLα (/rad)</label>
                    <input type="number" step="0.1" className="form-control" value={form.clAlpha} onChange={(e) => setForm({ ...form, clAlpha: e.target.value })} placeholder="例: 2.0" />
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
