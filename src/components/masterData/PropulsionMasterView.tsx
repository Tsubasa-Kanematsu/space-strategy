import React, { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useMasterDataStore } from '../../stores/masterDataStore';
import type { PropulsionMaster } from '../../types';

/**
 * 推進系マスタ。エンジン諸元を設定（追加/編集/削除）し、解析で参照する。
 * 旧・機体諸元DBの「推進系」タブの設定機能をマスタデータ側へ移したもの。
 */

interface FormState {
  name: string;
  stage: string;
  propellant: string;
  cycle: string;
  thrustVacKN: string;
  thrustSlKN: string;
  ispVacS: string;
  burnTimeS: string;
  throttle: string;
  memo: string;
}

const emptyForm = (): FormState => ({
  name: '', stage: '1段', propellant: 'LOX/RP-1', cycle: 'ガス発生器',
  thrustVacKN: '', thrustSlKN: '', ispVacS: '', burnTimeS: '', throttle: '固定', memo: '',
});

const toNum = (s: string): number | null => {
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
};

const STAGES = ['ブースター', '1段', '2段', '3段', '上段', '姿勢制御', 'その他'];
const CYCLES = ['ガス発生器', '段階燃焼', 'エキスパンダー', '電動ポンプ', '固体', '触媒分解', 'その他'];
const numCell = (v: number | null) => (v !== null ? v : <span className="text-muted">—</span>);

export const PropulsionMasterView: React.FC = () => {
  const navigate = useAppStore((s) => s.navigate);
  const propulsions = useMasterDataStore((s) => s.propulsions);
  const addPropulsion = useMasterDataStore((s) => s.addPropulsion);
  const updatePropulsion = useMasterDataStore((s) => s.updatePropulsion);
  const deletePropulsion = useMasterDataStore((s) => s.deletePropulsion);

  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<PropulsionMaster | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [confirmDelete, setConfirmDelete] = useState<PropulsionMaster | null>(null);

  const openCreate = () => { setEditTarget(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (p: PropulsionMaster) => {
    setEditTarget(p);
    setForm({
      name: p.name, stage: p.stage, propellant: p.propellant, cycle: p.cycle,
      thrustVacKN: p.thrustVacKN?.toString() ?? '',
      thrustSlKN: p.thrustSlKN?.toString() ?? '',
      ispVacS: p.ispVacS?.toString() ?? '',
      burnTimeS: p.burnTimeS?.toString() ?? '',
      throttle: p.throttle, memo: p.memo,
    });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    const data = {
      name: form.name.trim(), stage: form.stage, propellant: form.propellant, cycle: form.cycle,
      thrustVacKN: toNum(form.thrustVacKN), thrustSlKN: toNum(form.thrustSlKN),
      ispVacS: toNum(form.ispVacS), burnTimeS: toNum(form.burnTimeS),
      throttle: form.throttle, memo: form.memo,
    };
    if (editTarget) updatePropulsion(editTarget.id, data);
    else addPropulsion(data);
    setShowModal(false);
  };

  const handleDelete = () => {
    if (!confirmDelete) return;
    deletePropulsion(confirmDelete.id);
    setConfirmDelete(null);
  };

  return (
    <div>
      <button className="btn btn-link btn-sm px-0 mb-2 text-decoration-none" onClick={() => navigate('masterDataHub')}>
        <i className="bi bi-arrow-left me-1" />マスタデータ
      </button>

      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="page-title mb-0">
          <i className="bi bi-fire me-2 text-primary" />推進系データ
        </h1>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>
          <i className="bi bi-plus-lg me-1" />新規登録
        </button>
      </div>
      <p className="text-muted small mb-3">
        各段エンジン・推進系の諸元を設定します。飛行解析・荷重解析・溶融解析の入力として参照します。
      </p>

      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover mb-0 align-middle">
            <thead>
              <tr>
                <th>エンジン名</th>
                <th>段</th>
                <th>推進剤</th>
                <th>サイクル</th>
                <th className="text-end">真空推力 (kN)</th>
                <th className="text-end">海面推力 (kN)</th>
                <th className="text-end">Isp真空 (s)</th>
                <th className="text-end">燃焼時間 (s)</th>
                <th>スロットル</th>
                <th className="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {propulsions.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center text-muted py-5">
                    <i className="bi bi-fire fs-3 d-block mb-2 opacity-25" />
                    <div>推進系データがありません</div>
                    <button className="btn btn-primary btn-sm mt-2" onClick={openCreate}>
                      <i className="bi bi-plus-lg me-1" />最初のエンジンを登録
                    </button>
                  </td>
                </tr>
              ) : (
                propulsions.map((p) => (
                  <tr key={p.id}>
                    <td className="fw-medium">{p.name}</td>
                    <td>{p.stage}</td>
                    <td>{p.propellant}</td>
                    <td>{p.cycle}</td>
                    <td className="text-end font-monospace">{numCell(p.thrustVacKN)}</td>
                    <td className="text-end font-monospace">{numCell(p.thrustSlKN)}</td>
                    <td className="text-end font-monospace">{numCell(p.ispVacS)}</td>
                    <td className="text-end font-monospace">{numCell(p.burnTimeS)}</td>
                    <td>{p.throttle || '—'}</td>
                    <td className="col-actions">
                      <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => openEdit(p)} title="編集">
                        <i className="bi bi-pencil" />
                      </button>
                      <button className="btn btn-sm btn-outline-danger" onClick={() => setConfirmDelete(p)} title="削除">
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
                <h5 className="modal-title"><i className="bi bi-fire me-2" />{editTarget ? 'エンジン編集' : '新規エンジン登録'}</h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body">
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label fw-medium">エンジン名 <span className="text-danger">*</span></label>
                    <input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例: RP-9 (1段メイン)" autoFocus />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label fw-medium">段</label>
                    <select className="form-select" value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
                      {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="col-md-3">
                    <label className="form-label fw-medium">サイクル</label>
                    <select className="form-select" value={form.cycle} onChange={(e) => setForm({ ...form, cycle: e.target.value })}>
                      {CYCLES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-medium">推進剤</label>
                    <input className="form-control" value={form.propellant} onChange={(e) => setForm({ ...form, propellant: e.target.value })} placeholder="例: LOX/RP-1" />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-medium">スロットル</label>
                    <input className="form-control" value={form.throttle} onChange={(e) => setForm({ ...form, throttle: e.target.value })} placeholder="例: 60–100%" />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-medium">真空比推力 Isp (s)</label>
                    <input type="number" step="0.1" className="form-control" value={form.ispVacS} onChange={(e) => setForm({ ...form, ispVacS: e.target.value })} placeholder="例: 311" />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-medium">真空推力 (kN)</label>
                    <input type="number" step="0.1" className="form-control" value={form.thrustVacKN} onChange={(e) => setForm({ ...form, thrustVacKN: e.target.value })} placeholder="例: 1120" />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-medium">海面推力 (kN)</label>
                    <input type="number" step="0.1" className="form-control" value={form.thrustSlKN} onChange={(e) => setForm({ ...form, thrustSlKN: e.target.value })} placeholder="例: 980（無ければ空欄）" />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-medium">燃焼時間 (s)</label>
                    <input type="number" step="0.1" className="form-control" value={form.burnTimeS} onChange={(e) => setForm({ ...form, burnTimeS: e.target.value })} placeholder="例: 155" />
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
