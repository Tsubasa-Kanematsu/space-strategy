import React, { useState, useMemo } from 'react';
import { DeleteConfirmModal } from '../common/DeleteConfirmModal';
import { useMassCaseStore } from '../../stores/massCaseStore';
import { usePropulsionStore } from '../../stores/propulsionStore';
import { useAppStore } from '../../stores/appStore';
import type { PropulsionStage } from '../../types';

const PROPELLANT_OPTIONS = [
  'LOX/LH2', 'LOX/RP-1', 'LOX/Methane',
  'UDMH/N2O4', 'MMH/N2O4',
  'Solid', 'Hybrid', 'Monopropellant', 'Cold Gas', 'Custom',
];

// ---- インライン数値入力 ----
const NumCell: React.FC<{
  value: number | null;
  onChange: (v: number | null) => void;
  step?: string;
  width?: number;
  placeholder?: string;
}> = ({ value, onChange, step = '0.01', width = 100, placeholder = '—' }) => (
  <input
    type="number"
    className="form-control form-control-sm text-end font-monospace"
    style={{ width }}
    step={step}
    value={value ?? ''}
    placeholder={placeholder}
    onChange={(e) => {
      const v = parseFloat(e.target.value);
      onChange(isNaN(v) ? null : v);
    }}
  />
);

// ---- 段別詳細パネル ----
const StageDetail: React.FC<{
  stage: PropulsionStage;
  onUpdate: (patch: Partial<PropulsionStage>) => void;
}> = ({ stage, onUpdate }) => {
  // 総推力（真空）と総インパルスを自動計算
  const totalThrustVacKN = stage.thrustVacKN !== null ? stage.thrustVacKN * stage.engineCount : null;
  const totalImpulseKNs = stage.thrustVacKN !== null && stage.burnTimeSec !== null
    ? stage.thrustVacKN * stage.engineCount * stage.burnTimeSec
    : null;

  return (
    <div className="border rounded p-3 mb-3 bg-white">
      <div className="row g-3">
        {/* 左カラム：基本情報 */}
        <div className="col-lg-6">
          <h6 className="fw-semibold mb-3" style={{ fontSize: '0.85rem', color: '#555' }}>
            <i className="bi bi-info-circle me-2" />基本情報
          </h6>
          <div className="row g-2 mb-2">
            <div className="col-4">
              <label className="form-label mb-1" style={{ fontSize: '0.8rem' }}>段番号</label>
              <input
                type="number"
                className="form-control form-control-sm"
                min="1"
                step="1"
                value={stage.stageNo}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v >= 1) onUpdate({ stageNo: v });
                }}
              />
            </div>
            <div className="col-8">
              <label className="form-label mb-1" style={{ fontSize: '0.8rem' }}>エンジン名 / 型式</label>
              <input
                className="form-control form-control-sm"
                value={stage.engineName}
                placeholder="例: LE-9, Merlin 1D, SRB-A"
                onChange={(e) => onUpdate({ engineName: e.target.value })}
              />
            </div>
          </div>
          <div className="row g-2 mb-2">
            <div className="col-4">
              <label className="form-label mb-1" style={{ fontSize: '0.8rem' }}>エンジン数</label>
              <input
                type="number"
                className="form-control form-control-sm"
                min="1"
                step="1"
                value={stage.engineCount}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v >= 1) onUpdate({ engineCount: v });
                }}
              />
            </div>
            <div className="col-8">
              <label className="form-label mb-1" style={{ fontSize: '0.8rem' }}>推進剤種類</label>
              <select
                className="form-select form-select-sm"
                value={stage.propellantType}
                onChange={(e) => onUpdate({ propellantType: e.target.value })}
              >
                {PROPELLANT_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mb-2">
            <label className="form-label mb-1" style={{ fontSize: '0.8rem' }}>備考</label>
            <textarea
              className="form-control form-control-sm"
              rows={2}
              value={stage.note}
              placeholder="自由記述"
              onChange={(e) => onUpdate({ note: e.target.value })}
            />
          </div>
        </div>

        {/* 右カラム：性能データ */}
        <div className="col-lg-6">
          <h6 className="fw-semibold mb-3" style={{ fontSize: '0.85rem', color: '#555' }}>
            <i className="bi bi-speedometer2 me-2" />性能データ（1エンジンあたり）
          </h6>
          <div className="row g-2 mb-2">
            <div className="col-6">
              <label className="form-label mb-1" style={{ fontSize: '0.8rem' }}>真空推力 (kN)</label>
              <NumCell value={stage.thrustVacKN} onChange={(v) => onUpdate({ thrustVacKN: v })} step="0.1" width={120} placeholder="例: 137" />
            </div>
            <div className="col-6">
              <label className="form-label mb-1" style={{ fontSize: '0.8rem' }}>海面推力 (kN)</label>
              <NumCell value={stage.thrustSLKN} onChange={(v) => onUpdate({ thrustSLKN: v })} step="0.1" width={120} placeholder="例: 120" />
            </div>
          </div>
          <div className="row g-2 mb-2">
            <div className="col-6">
              <label className="form-label mb-1" style={{ fontSize: '0.8rem' }}>真空 Isp (s)</label>
              <NumCell value={stage.ispVacS} onChange={(v) => onUpdate({ ispVacS: v })} step="0.1" width={120} placeholder="例: 450" />
            </div>
            <div className="col-6">
              <label className="form-label mb-1" style={{ fontSize: '0.8rem' }}>海面 Isp (s)</label>
              <NumCell value={stage.ispSLS} onChange={(v) => onUpdate({ ispSLS: v })} step="0.1" width={120} placeholder="例: 380" />
            </div>
          </div>
          <div className="row g-2 mb-2">
            <div className="col-4">
              <label className="form-label mb-1" style={{ fontSize: '0.8rem' }}>燃焼室圧 (mpa)</label>
              <NumCell value={stage.chamberPressureMPa} onChange={(v) => onUpdate({ chamberPressureMPa: v })} step="0.1" width={110} placeholder="例: 12.0" />
            </div>
            <div className="col-4">
              <label className="form-label mb-1" style={{ fontSize: '0.8rem' }}>膨張比 ε</label>
              <NumCell value={stage.expansionRatio} onChange={(v) => onUpdate({ expansionRatio: v })} step="0.1" width={100} placeholder="例: 45" />
            </div>
            <div className="col-4">
              <label className="form-label mb-1" style={{ fontSize: '0.8rem' }}>O/F比</label>
              <NumCell value={stage.ofRatio} onChange={(v) => onUpdate({ ofRatio: v })} step="0.01" width={100} placeholder="例: 6.0" />
            </div>
          </div>
          <div className="row g-2 mb-2">
            <div className="col-6">
              <label className="form-label mb-1" style={{ fontSize: '0.8rem' }}>燃焼時間 (s)</label>
              <NumCell value={stage.burnTimeSec} onChange={(v) => onUpdate({ burnTimeSec: v })} step="1" width={120} placeholder="例: 200" />
            </div>
            <div className="col-6">
              <label className="form-label mb-1" style={{ fontSize: '0.8rem' }}>推進剤質量 (kg)</label>
              <NumCell value={stage.propellantMassKg} onChange={(v) => onUpdate({ propellantMassKg: v })} step="1" width={120} placeholder="例: 50000" />
            </div>
          </div>
        </div>
      </div>

      {/* 自動計算値 */}
      {(totalThrustVacKN !== null || totalImpulseKNs !== null) && (
        <div
          className="d-flex gap-4 p-2 rounded mt-2"
          style={{ background: '#f8f9fa', fontSize: '0.8rem', borderTop: '1px solid #dee2e6' }}
        >
          <span className="text-muted fw-semibold">自動計算</span>
          {totalThrustVacKN !== null && (
            <span>
              総真空推力:{' '}
              <strong className="font-monospace">{totalThrustVacKN.toFixed(1)} kN</strong>
              <span className="text-muted ms-1">
                ({stage.thrustVacKN?.toFixed(1)} × {stage.engineCount})
              </span>
            </span>
          )}
          {totalImpulseKNs !== null && (
            <span>
              総インパルス:{' '}
              <strong className="font-monospace">{(totalImpulseKNs / 1000).toFixed(1)} MN·s</strong>
            </span>
          )}
        </div>
      )}
    </div>
  );
};

// ---- メインビュー ----
export const PropulsionDataView: React.FC = () => {
  const { massCaseId } = useAppStore();
  const cases = useMassCaseStore((s) => s.cases);
  const allStages = usePropulsionStore((s) => s.stages);
  const addStage = usePropulsionStore((s) => s.addStage);
  const updateStage = usePropulsionStore((s) => s.updateStage);
  const deleteStage = usePropulsionStore((s) => s.deleteStage);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PropulsionStage | null>(null);

  const massCase = cases.find((c) => c.id === massCaseId) ?? null;
  const stages = useMemo(
    () => allStages.filter((s) => s.massCaseId === massCaseId).sort((a, b) => a.stageNo - b.stageNo),
    [allStages, massCaseId],
  );

  if (!massCaseId || !massCase) {
    return <div className="text-muted p-4">ロケットデータベースが選択されていません。</div>;
  }

  const handleAdd = () => {
    if (!massCaseId) return;
    const stage = addStage(massCaseId);
    setExpandedId(stage.id);
  };

  const handleDelete = () => {
    if (!confirmDelete) return;
    deleteStage(confirmDelete.id);
    if (expandedId === confirmDelete.id) setExpandedId(null);
    setConfirmDelete(null);
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="page-title">
          <i className="bi bi-fire me-2 text-primary" />
          推進系 — {massCase.name}
        </h1>
        <button className="btn btn-primary btn-sm" onClick={handleAdd}>
          <i className="bi bi-plus-lg me-1" />段を追加
        </button>
      </div>

      <div className="alert alert-info d-flex align-items-start gap-2 py-2 mb-3">
        <i className="bi bi-info-circle mt-1 flex-shrink-0" />
        <small>
          各段のエンジン仕様・推進剤データを入力してください。
          推力・Isp・燃焼時間などを記録でき、総推力・総インパルスが自動計算されます。
        </small>
      </div>

      {stages.length === 0 ? (
        <div className="text-center text-muted py-5">
          <i className="bi bi-fire fs-2 d-block mb-2 opacity-25" />
          <div>推進系データがありません</div>
          <button className="btn btn-primary btn-sm mt-2" onClick={handleAdd}>
            <i className="bi bi-plus-lg me-1" />最初の段を追加
          </button>
        </div>
      ) : (
        <div>
          {/* サマリーテーブル */}
          <div className="card mb-3">
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: '0.83rem' }}>
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>段</th>
                    <th>エンジン</th>
                    <th style={{ width: 70 }}>数</th>
                    <th style={{ width: 120 }}>推進剤</th>
                    <th className="text-end" style={{ width: 120 }}>真空推力 (kN)</th>
                    <th className="text-end" style={{ width: 110 }}>真空 Isp (s)</th>
                    <th className="text-end" style={{ width: 100 }}>燃焼時間 (s)</th>
                    <th style={{ width: 90 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {stages.map((st) => (
                    <tr
                      key={st.id}
                      className={expandedId === st.id ? 'table-primary' : ''}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setExpandedId(expandedId === st.id ? null : st.id)}
                    >
                      <td className="fw-semibold text-center">{st.stageNo}</td>
                      <td>
                        {st.engineName || (
                          <span className="text-muted fst-italic">未入力</span>
                        )}
                      </td>
                      <td className="text-center">{st.engineCount}</td>
                      <td>
                        <span className="badge bg-light text-dark border" style={{ fontSize: '0.72rem' }}>
                          {st.propellantType}
                        </span>
                      </td>
                      <td className="text-end font-monospace">
                        {st.thrustVacKN !== null
                          ? `${(st.thrustVacKN * st.engineCount).toFixed(1)}`
                          : <span className="text-muted">—</span>}
                      </td>
                      <td className="text-end font-monospace">
                        {st.ispVacS !== null ? st.ispVacS.toFixed(0) : <span className="text-muted">—</span>}
                      </td>
                      <td className="text-end font-monospace">
                        {st.burnTimeSec !== null ? st.burnTimeSec.toFixed(0) : <span className="text-muted">—</span>}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button
                          className="btn btn-sm btn-outline-danger"
                          style={{ padding: '2px 8px' }}
                          onClick={() => setConfirmDelete(st)}
                          title="削除"
                        >
                          <i className="bi bi-trash" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 展開詳細パネル */}
          {expandedId && (() => {
            const st = stages.find((s) => s.id === expandedId);
            if (!st) return null;
            return (
              <div>
                <div className="d-flex align-items-center gap-2 mb-2">
                  <h6 className="fw-semibold mb-0" style={{ fontSize: '0.9rem' }}>
                    <i className="bi bi-pencil me-2 text-primary" />
                    {st.stageNo}段 詳細編集
                  </h6>
                  <button
                    className="btn btn-sm btn-outline-secondary ms-auto"
                    onClick={() => setExpandedId(null)}
                  >
                    <i className="bi bi-x-lg" />
                  </button>
                </div>
                <StageDetail
                  stage={st}
                  onUpdate={(patch) => updateStage(st.id, patch)}
                />
              </div>
            );
          })()}
        </div>
      )}

      {confirmDelete && (
        <DeleteConfirmModal
          itemName={`${confirmDelete.stageNo}段${confirmDelete.engineName ? ` (${confirmDelete.engineName})` : ''}`}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
};
