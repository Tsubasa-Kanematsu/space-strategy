import React, { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useMasterDataStore } from '../../stores/masterDataStore';
import type { DebrisMaster } from '../../types';

/**
 * 代表破片マスタ。機体分解時の代表破片諸元を設定（追加/編集/削除）し、解析で参照する。
 */

interface FormState {
  name: string;
  massKg: string;
  areaM2: string;
  cd: string;
  material: string;
  memo: string;
}

const emptyForm = (): FormState => ({
  name: '', massKg: '', areaM2: '', cd: '', material: '', memo: '',
});

const toNum = (s: string): number | null => {
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
};

const numCell = (v: number | null) => (v !== null ? v : <span className="text-muted">—</span>);

export const DebrisMasterView: React.FC = () => {
  const navigate = useAppStore((s) => s.navigate);
  const debris = useMasterDataStore((s) => s.debris);
  const addDebris = useMasterDataStore((s) => s.addDebris);
  const updateDebris = useMasterDataStore((s) => s.updateDebris);
  const deleteDebris = useMasterDataStore((s) => s.deleteDebris);

  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<DebrisMaster | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [confirmDelete, setConfirmDelete] = useState<DebrisMaster | null>(null);

  const openCreate = () => { setEditTarget(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (x: DebrisMaster) => {
    setEditTarget(x);
    setForm({
      name: x.name,
      massKg: x.massKg?.toString() ?? '',
      areaM2: x.areaM2?.toString() ?? '',
      cd: x.cd?.toString() ?? '',
      material: x.material,
      memo: x.memo,
    });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    const data = {
      name: form.name.trim(),
      massKg: toNum(form.massKg),
      areaM2: toNum(form.areaM2),
      cd: toNum(form.cd),
      material: form.material,
      memo: form.memo,
    };
    if (editTarget) updateDebris(editTarget.id, data);
    else addDebris(data);
    setShowModal(false);
  };

  const handleDelete = () => {
    if (!confirmDelete) return;
    deleteDebris(confirmDelete.id);
    setConfirmDelete(null);
  };

  return (
    <div>
      <button className="btn btn-link btn-sm px-0 mb-2 text-decoration-none" onClick={() => navigate('masterDataHub')}>
        <i className="bi bi-arrow-left me-1" />マスタデータ
      </button>

      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="page-title mb-0">
          <i className="bi bi-hexagon me-2 text-primary" />代表破片データ
        </h1>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>
          <i className="bi bi-plus-lg me-1" />新規登録
        </button>
      </div>
      <p className="text-muted small mb-3">
        機体分解時の代表破片の諸元（質量・断面積・抗力係数・材質）を設定します。飛行安全解析・落下分散解析の入力として参照します。
      </p>

      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover mb-0 align-middle">
            <thead>
              <tr>
                <th>破片名</th>
                <th className="text-end">質量 (kg)</th>
                <th className="text-end">代表断面積 (m²)</th>
                <th className="text-end">抗力係数 Cd</th>
                <th>材質</th>
                <th className="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {debris.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-5">
                    <i className="bi bi-hexagon fs-3 d-block mb-2 opacity-25" />
                    <div>代表破片データがありません</div>
                    <button className="btn btn-primary btn-sm mt-2" onClick={openCreate}>
                      <i className="bi bi-plus-lg me-1" />最初の破片を登録
                    </button>
                  </td>
                </tr>
              ) : (
                debris.map((x) => (
                  <tr key={x.id}>
                    <td className="fw-medium">{x.name}</td>
                    <td className="text-end font-monospace">{numCell(x.massKg)}</td>
                    <td className="text-end font-monospace">{numCell(x.areaM2)}</td>
                    <td className="text-end font-monospace">{numCell(x.cd)}</td>
                    <td>{x.material || '—'}</td>
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
                <h5 className="modal-title"><i className="bi bi-hexagon me-2" />{editTarget ? '代表破片編集' : '新規代表破片登録'}</h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body">
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label fw-medium">破片名 <span className="text-danger">*</span></label>
                    <input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例: エンジンブロック" autoFocus />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-medium">材質</label>
                    <input className="form-control" value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })} placeholder="例: チタン合金" />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-medium">質量 (kg)</label>
                    <input type="number" step="0.1" className="form-control" value={form.massKg} onChange={(e) => setForm({ ...form, massKg: e.target.value })} placeholder="例: 120" />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-medium">代表断面積 (m²)</label>
                    <input type="number" step="0.001" className="form-control" value={form.areaM2} onChange={(e) => setForm({ ...form, areaM2: e.target.value })} placeholder="例: 0.35" />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-medium">抗力係数 Cd</label>
                    <input type="number" step="0.01" className="form-control" value={form.cd} onChange={(e) => setForm({ ...form, cd: e.target.value })} placeholder="例: 0.8" />
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
