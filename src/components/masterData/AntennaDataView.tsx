import React, { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useMasterDataStore } from '../../stores/masterDataStore';
import type { AntennaData } from '../../types';

type AntennaType = 'ground' | 'rocket';

interface Props {
  /** 指定すると、その種別だけの専用マスター画面になる（地上局/機体で分割） */
  lockType?: AntennaType;
}

interface FormState {
  name: string;
  type: AntennaType;
  frequencyBand: string;
  frequencyMHz: string;
  gainDbi: string;
  eirpDbw: string;
  gtDbK: string;
  polarization: string;
  memo: string;
}

const emptyForm = (type: AntennaType = 'ground'): FormState => ({
  name: '', type, frequencyBand: '', frequencyMHz: '',
  gainDbi: '', eirpDbw: '', gtDbK: '', polarization: '', memo: '',
});

const toNum = (s: string): number | null => {
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
};

const TYPE_LABELS: Record<'ground' | 'rocket', string> = {
  ground: '地上局',
  rocket: 'ロケット',
};

const TYPE_BADGE_CLASS: Record<'ground' | 'rocket', string> = {
  ground: 'bg-info-subtle text-info',
  rocket: 'bg-warning-subtle text-warning',
};

const FREQ_BANDS = ['', 'VHF', 'UHF', 'L-band', 'S-band', 'C-band', 'X-band', 'Ku-band', 'Ka-band', 'その他'];
const POLARIZATIONS = ['', 'RHCP', 'LHCP', 'Linear (H)', 'Linear (V)', 'Dual'];

export const AntennaDataView: React.FC<Props> = ({ lockType }) => {
  const navigate = useAppStore((s) => s.navigate);
  const antennas = useMasterDataStore((s) => s.antennas);
  const addAntenna = useMasterDataStore((s) => s.addAntenna);
  const updateAntenna = useMasterDataStore((s) => s.updateAntenna);
  const deleteAntenna = useMasterDataStore((s) => s.deleteAntenna);

  const [typeFilter, setTypeFilter] = useState<'all' | 'ground' | 'rocket'>('all');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<AntennaData | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm(lockType));
  const [confirmDelete, setConfirmDelete] = useState<AntennaData | null>(null);

  // lockType 指定時はその種別だけを扱う専用マスター（タイトル・絞り込み・新規既定値を固定）
  const title = lockType === 'ground' ? '地上局アンテナデータ'
    : lockType === 'rocket' ? '機体アンテナデータ'
    : 'アンテナデータ';

  const filtered = antennas.filter((a) => {
    const matchType = lockType ? a.type === lockType : (typeFilter === 'all' || a.type === typeFilter);
    const matchSearch = !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.frequencyBand.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm(lockType));
    setShowModal(true);
  };

  const openEdit = (a: AntennaData) => {
    setEditTarget(a);
    setForm({
      name: a.name, type: a.type, frequencyBand: a.frequencyBand,
      frequencyMHz: a.frequencyMHz?.toString() ?? '',
      gainDbi: a.gainDbi?.toString() ?? '',
      eirpDbw: a.eirpDbw?.toString() ?? '',
      gtDbK: a.gtDbK?.toString() ?? '',
      polarization: a.polarization, memo: a.memo,
    });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    const data = {
      name: form.name, type: form.type, frequencyBand: form.frequencyBand,
      frequencyMHz: toNum(form.frequencyMHz), gainDbi: toNum(form.gainDbi),
      eirpDbw: toNum(form.eirpDbw), gtDbK: toNum(form.gtDbK),
      polarization: form.polarization, memo: form.memo,
    };
    if (editTarget) {
      updateAntenna(editTarget.id, data);
    } else {
      addAntenna(data);
    }
    setShowModal(false);
  };

  const handleDelete = () => {
    if (!confirmDelete) return;
    deleteAntenna(confirmDelete.id);
    setConfirmDelete(null);
  };

  const numCell = (v: number | null, unit = '') =>
    v !== null ? `${v}${unit ? ' ' + unit : ''}` : <span className="text-muted">—</span>;

  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-1">
        <button
          className="btn btn-link btn-sm p-0 text-muted"
          style={{ textDecoration: 'none' }}
          onClick={() => navigate('masterDataHub')}
        >
          <i className="bi bi-arrow-left me-1" />マスタデータ
        </button>
      </div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="page-title">
          <i className="bi bi-broadcast me-2 text-primary" />
          {title}
        </h1>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>
          <i className="bi bi-plus-lg me-1" />
          新規登録
        </button>
      </div>

      <div className="filter-bar mb-3 rounded">
        {!lockType && (
          <div className="btn-group btn-group-sm">
            {(['all', 'ground', 'rocket'] as const).map((t) => (
              <button
                key={t}
                className={`btn ${typeFilter === t ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setTypeFilter(t)}
              >
                {t === 'all' ? 'すべて' : TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        )}
        <div className="input-group input-group-sm" style={{ maxWidth: 280 }}>
          <span className="input-group-text bg-white"><i className="bi bi-search" /></span>
          <input
            className="form-control"
            placeholder="名称・周波数帯で検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <small className="text-muted ms-auto">{filtered.length} 件</small>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th>名称</th>
                <th>タイプ</th>
                <th>周波数帯</th>
                <th className="text-end">周波数 (MHz)</th>
                <th className="text-end">ゲイン (dBi)</th>
                <th className="text-end">EIRP (dBW)</th>
                <th className="text-end">G/T (dB/K)</th>
                <th>偏波</th>
                <th>メモ</th>
                <th className="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center text-muted py-5">
                    <i className="bi bi-broadcast fs-3 d-block mb-2 opacity-25" />
                    <div>アンテナデータがありません</div>
                    <button className="btn btn-primary btn-sm mt-2" onClick={openCreate}>
                      <i className="bi bi-plus-lg me-1" />最初のアンテナを登録
                    </button>
                  </td>
                </tr>
              ) : (
                filtered.map((a) => (
                  <tr key={a.id}>
                    <td className="fw-medium">{a.name}</td>
                    <td>
                      <span className={`badge ${TYPE_BADGE_CLASS[a.type]}`}>{TYPE_LABELS[a.type]}</span>
                    </td>
                    <td>{a.frequencyBand || '—'}</td>
                    <td className="text-end font-monospace">{numCell(a.frequencyMHz)}</td>
                    <td className="text-end font-monospace">{numCell(a.gainDbi)}</td>
                    <td className="text-end font-monospace">{numCell(a.eirpDbw)}</td>
                    <td className="text-end font-monospace">{numCell(a.gtDbK)}</td>
                    <td>{a.polarization || '—'}</td>
                    <td className="text-muted">
                      <span className="text-truncate d-inline-block" style={{ maxWidth: 120 }}>{a.memo || '—'}</span>
                    </td>
                    <td className="col-actions">
                      <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => openEdit(a)} title="編集">
                        <i className="bi bi-pencil" />
                      </button>
                      <button className="btn btn-sm btn-outline-danger" onClick={() => setConfirmDelete(a)} title="削除">
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
                <h5 className="modal-title">
                  <i className="bi bi-broadcast me-2" />
                  {editTarget ? 'アンテナ編集' : '新規アンテナ登録'}
                </h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body">
                <div className="row g-3">
                  <div className={lockType ? 'col-12' : 'col-md-8'}>
                    <label className="form-label fw-medium">アンテナ名 <span className="text-danger">*</span></label>
                    <input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例: 種子島管制局 S帯パラボラ" autoFocus />
                  </div>
                  {!lockType && (
                    <div className="col-md-4">
                      <label className="form-label fw-medium">タイプ</label>
                      <select className="form-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AntennaType })}>
                        <option value="ground">地上局</option>
                        <option value="rocket">ロケット</option>
                      </select>
                    </div>
                  )}
                  <div className="col-md-4">
                    <label className="form-label fw-medium">周波数帯</label>
                    <select className="form-select" value={form.frequencyBand} onChange={(e) => setForm({ ...form, frequencyBand: e.target.value })}>
                      {FREQ_BANDS.map((b) => <option key={b} value={b}>{b || '— 選択 —'}</option>)}
                    </select>
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-medium">周波数 (MHz)</label>
                    <input type="number" className="form-control" value={form.frequencyMHz} onChange={(e) => setForm({ ...form, frequencyMHz: e.target.value })} placeholder="例: 2200" />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-medium">偏波</label>
                    <select className="form-select" value={form.polarization} onChange={(e) => setForm({ ...form, polarization: e.target.value })}>
                      {POLARIZATIONS.map((p) => <option key={p} value={p}>{p || '— 選択 —'}</option>)}
                    </select>
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-medium">ゲイン (dBi)</label>
                    <input type="number" step="0.1" className="form-control" value={form.gainDbi} onChange={(e) => setForm({ ...form, gainDbi: e.target.value })} placeholder="例: 45.0" />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-medium">EIRP (dBW)</label>
                    <input type="number" step="0.1" className="form-control" value={form.eirpDbw} onChange={(e) => setForm({ ...form, eirpDbw: e.target.value })} placeholder="例: 55.0" />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-medium">G/T (dB/K)</label>
                    <input type="number" step="0.1" className="form-control" value={form.gtDbK} onChange={(e) => setForm({ ...form, gtDbK: e.target.value })} placeholder="例: 20.0" />
                  </div>
                  <div className="col-12">
                    <label className="form-label fw-medium">メモ</label>
                    <textarea className="form-control" rows={2} value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} placeholder="設置場所、運用条件など" />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>キャンセル</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={!form.name.trim()}>
                  {editTarget ? '保存' : '登録'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {confirmDelete && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="modal-dialog modal-sm">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title text-danger">削除確認</h5>
                <button className="btn-close" onClick={() => setConfirmDelete(null)} />
              </div>
              <div className="modal-body">
                <p><strong>{confirmDelete.name}</strong> を削除しますか？</p>
              </div>
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
