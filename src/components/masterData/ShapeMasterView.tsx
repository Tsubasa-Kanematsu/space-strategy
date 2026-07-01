import React, { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useMasterDataStore } from '../../stores/masterDataStore';
import type { ShapeMaster } from '../../types';

/**
 * 機体形状マスタ。機体形状諸元（全長・直径・段数等）を設定（追加/編集/削除）し、解析で参照する。
 */

interface FormState {
  name: string;
  lengthM: string;
  maxDiameterM: string;
  stages: string;
  noseCone: string;
  refAreaM2: string;
  memo: string;
}

const emptyForm = (): FormState => ({
  name: '', lengthM: '', maxDiameterM: '', stages: '', noseCone: 'フォン・カルマン', refAreaM2: '', memo: '',
});

const toNum = (s: string): number | null => {
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
};

const NOSE_CONES = ['フォン・カルマン', 'タンジェントオージャイブ', 'コニカル', 'その他'];
const numCell = (v: number | null) => (v !== null ? v : <span className="text-muted">—</span>);

export const ShapeMasterView: React.FC = () => {
  const navigate = useAppStore((s) => s.navigate);
  const shapes = useMasterDataStore((s) => s.shapes);
  const addShape = useMasterDataStore((s) => s.addShape);
  const updateShape = useMasterDataStore((s) => s.updateShape);
  const deleteShape = useMasterDataStore((s) => s.deleteShape);

  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<ShapeMaster | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [confirmDelete, setConfirmDelete] = useState<ShapeMaster | null>(null);

  const openCreate = () => { setEditTarget(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (x: ShapeMaster) => {
    setEditTarget(x);
    setForm({
      name: x.name,
      lengthM: x.lengthM?.toString() ?? '',
      maxDiameterM: x.maxDiameterM?.toString() ?? '',
      stages: x.stages?.toString() ?? '',
      noseCone: x.noseCone,
      refAreaM2: x.refAreaM2?.toString() ?? '',
      memo: x.memo,
    });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    const data = {
      name: form.name.trim(),
      lengthM: toNum(form.lengthM),
      maxDiameterM: toNum(form.maxDiameterM),
      stages: toNum(form.stages),
      noseCone: form.noseCone,
      refAreaM2: toNum(form.refAreaM2),
      memo: form.memo,
    };
    if (editTarget) updateShape(editTarget.id, data);
    else addShape(data);
    setShowModal(false);
  };

  const handleDelete = () => {
    if (!confirmDelete) return;
    deleteShape(confirmDelete.id);
    setConfirmDelete(null);
  };

  return (
    <div>
      <button className="btn btn-link btn-sm px-0 mb-2 text-decoration-none" onClick={() => navigate('masterDataHub')}>
        <i className="bi bi-arrow-left me-1" />マスタデータ
      </button>

      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="page-title mb-0">
          <i className="bi bi-rocket-takeoff me-2 text-primary" />機体形状データ
        </h1>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>
          <i className="bi bi-plus-lg me-1" />新規登録
        </button>
      </div>
      <p className="text-muted small mb-3">
        機体形状の諸元（全長・最大直径・段数・基準面積など）を設定します。飛行解析・空力解析の入力として参照します。
      </p>

      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover mb-0 align-middle">
            <thead>
              <tr>
                <th>機体名</th>
                <th className="text-end">全長 (m)</th>
                <th className="text-end">最大直径 (m)</th>
                <th className="text-end">段数</th>
                <th>ノーズコーン形式</th>
                <th className="text-end">基準面積 (m²)</th>
                <th className="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {shapes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-muted py-5">
                    <i className="bi bi-rocket-takeoff fs-3 d-block mb-2 opacity-25" />
                    <div>機体形状データがありません</div>
                    <button className="btn btn-primary btn-sm mt-2" onClick={openCreate}>
                      <i className="bi bi-plus-lg me-1" />最初の機体を登録
                    </button>
                  </td>
                </tr>
              ) : (
                shapes.map((x) => (
                  <tr key={x.id}>
                    <td className="fw-medium">{x.name}</td>
                    <td className="text-end font-monospace">{numCell(x.lengthM)}</td>
                    <td className="text-end font-monospace">{numCell(x.maxDiameterM)}</td>
                    <td className="text-end font-monospace">{numCell(x.stages)}</td>
                    <td>{x.noseCone || '—'}</td>
                    <td className="text-end font-monospace">{numCell(x.refAreaM2)}</td>
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
                <h5 className="modal-title"><i className="bi bi-rocket-takeoff me-2" />{editTarget ? '機体形状編集' : '新規機体形状登録'}</h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body">
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label fw-medium">機体名 <span className="text-danger">*</span></label>
                    <input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例: LV-Alpha" autoFocus />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-medium">ノーズコーン形式</label>
                    <select className="form-select" value={form.noseCone} onChange={(e) => setForm({ ...form, noseCone: e.target.value })}>
                      {NOSE_CONES.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-medium">全長 (m)</label>
                    <input type="number" step="0.1" className="form-control" value={form.lengthM} onChange={(e) => setForm({ ...form, lengthM: e.target.value })} placeholder="例: 24.5" />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-medium">最大直径 (m)</label>
                    <input type="number" step="0.01" className="form-control" value={form.maxDiameterM} onChange={(e) => setForm({ ...form, maxDiameterM: e.target.value })} placeholder="例: 1.8" />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-medium">段数</label>
                    <input type="number" step="1" className="form-control" value={form.stages} onChange={(e) => setForm({ ...form, stages: e.target.value })} placeholder="例: 2" />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-medium">基準面積 (m²)</label>
                    <input type="number" step="0.001" className="form-control" value={form.refAreaM2} onChange={(e) => setForm({ ...form, refAreaM2: e.target.value })} placeholder="例: 2.545" />
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
