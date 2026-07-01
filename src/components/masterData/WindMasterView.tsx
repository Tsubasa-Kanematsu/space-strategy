import React, { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useMasterDataStore } from '../../stores/masterDataStore';
import type { WindMaster, WindLayer } from '../../types';

/**
 * 風データマスタ。射場ごとの代表風プロファイル（高度ごとの風向・風速のリスト）を
 * 設定（追加/編集/削除）し、解析で参照する。1レコード＝1プロファイル。
 */

interface DraftState {
  name: string;
  site: string;
  memo: string;
  layers: WindLayer[];
}

const emptyDraft = (): DraftState => ({ name: '', site: '', memo: '', layers: [] });

const toNum = (s: string): number | null => {
  if (s.trim() === '') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
};

const numCell = (v: number | null) => (v !== null ? v : <span className="text-muted">—</span>);

const maxSpeed = (layers: WindLayer[]): number | null => {
  const speeds = layers.map((l) => l.speedMs).filter((v): v is number => v !== null);
  return speeds.length > 0 ? Math.max(...speeds) : null;
};

const sortLayers = (layers: WindLayer[]): WindLayer[] =>
  [...layers].sort((a, b) => {
    if (a.altitudeKm === null && b.altitudeKm === null) return 0;
    if (a.altitudeKm === null) return 1;
    if (b.altitudeKm === null) return -1;
    return a.altitudeKm - b.altitudeKm;
  });

export const WindMasterView: React.FC = () => {
  const navigate = useAppStore((s) => s.navigate);
  const winds = useMasterDataStore((s) => s.winds);
  const addWind = useMasterDataStore((s) => s.addWind);
  const updateWind = useMasterDataStore((s) => s.updateWind);
  const deleteWind = useMasterDataStore((s) => s.deleteWind);

  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<WindMaster | null>(null);
  const [draft, setDraft] = useState<DraftState>(emptyDraft());
  const [confirmDelete, setConfirmDelete] = useState<WindMaster | null>(null);

  const openCreate = () => { setEditTarget(null); setDraft(emptyDraft()); setShowModal(true); };
  const openEdit = (x: WindMaster) => {
    setEditTarget(x);
    setDraft({
      name: x.name,
      site: x.site,
      memo: x.memo,
      layers: x.layers.map((l) => ({ ...l })),
    });
    setShowModal(true);
  };

  const addLayer = () =>
    setDraft((d) => ({ ...d, layers: [...d.layers, { altitudeKm: null, dirDeg: null, speedMs: null }] }));

  const removeLayer = (idx: number) =>
    setDraft((d) => ({ ...d, layers: d.layers.filter((_, i) => i !== idx) }));

  const updateLayer = (idx: number, patch: Partial<WindLayer>) =>
    setDraft((d) => ({ ...d, layers: d.layers.map((l, i) => i === idx ? { ...l, ...patch } : l) }));

  const handleSave = () => {
    if (!draft.name.trim()) return;
    const data = {
      name: draft.name.trim(),
      site: draft.site,
      memo: draft.memo,
      layers: sortLayers(draft.layers),
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
        射場ごとの代表風プロファイル（高度ごとの風向・風速）を設定します。飛行解析・荷重解析の入力として参照します。
      </p>

      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover mb-0 align-middle">
            <thead>
              <tr>
                <th>プロファイル名</th>
                <th>射場</th>
                <th className="text-end">層数</th>
                <th className="text-end">最大風速 (m/s)</th>
                <th className="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {winds.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-muted py-5">
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
                    <td className="text-end font-monospace">{x.layers.length}</td>
                    <td className="text-end font-monospace">{numCell(maxSpeed(x.layers))}</td>
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
                    <input className="form-control" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="例: 大樹町 夏季代表風" autoFocus />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-medium">射場</label>
                    <input className="form-control" value={draft.site} onChange={(e) => setDraft({ ...draft, site: e.target.value })} placeholder="例: 大樹町" />
                  </div>
                  <div className="col-12">
                    <label className="form-label fw-medium">メモ</label>
                    <textarea className="form-control" rows={2} value={draft.memo} onChange={(e) => setDraft({ ...draft, memo: e.target.value })} />
                  </div>

                  <div className="col-12">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <label className="form-label fw-medium mb-0">高度プロファイル</label>
                      <button className="btn btn-sm btn-outline-primary" onClick={addLayer}>
                        <i className="bi bi-plus-lg me-1" />層を追加
                      </button>
                    </div>
                    <div className="table-responsive">
                      <table className="table table-sm align-middle mb-0">
                        <thead>
                          <tr>
                            <th className="text-end">高度 (km)</th>
                            <th className="text-end">風向 (deg)</th>
                            <th className="text-end">風速 (m/s)</th>
                            <th className="col-actions" />
                          </tr>
                        </thead>
                        <tbody>
                          {draft.layers.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="text-center text-muted small py-3">
                                層がありません。「層を追加」で高度ごとの風を登録します。
                              </td>
                            </tr>
                          ) : (
                            draft.layers.map((l, idx) => (
                              <tr key={idx}>
                                <td>
                                  <input type="number" step="any" className="form-control form-control-sm text-end font-monospace"
                                    value={l.altitudeKm ?? ''} onChange={(e) => updateLayer(idx, { altitudeKm: toNum(e.target.value) })} />
                                </td>
                                <td>
                                  <input type="number" step="any" className="form-control form-control-sm text-end font-monospace"
                                    value={l.dirDeg ?? ''} onChange={(e) => updateLayer(idx, { dirDeg: toNum(e.target.value) })} />
                                </td>
                                <td>
                                  <input type="number" step="any" className="form-control form-control-sm text-end font-monospace"
                                    value={l.speedMs ?? ''} onChange={(e) => updateLayer(idx, { speedMs: toNum(e.target.value) })} />
                                </td>
                                <td className="col-actions">
                                  <button className="btn btn-sm btn-outline-danger" onClick={() => removeLayer(idx)} title="行を削除">
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
