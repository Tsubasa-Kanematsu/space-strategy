import React from 'react';
import { useVehicleUnitStore } from '../../stores/vehicleUnitStore';
import { MASTER_CATEGORIES, useAllMasterOptions } from './masterCatalog';
import { openInNewWindow } from '../../lib/nav';
import type { AnalysisPhase, VehicleUnit } from '../../types';

/**
 * 共通パラメータ（マスタ）選択モーダル。
 * 各マスタから「具体的にどの項目を使うか」をフェーズ単位で選択する。
 */
export const MasterSelectModal: React.FC<{
  unit: VehicleUnit;
  phase: AnalysisPhase;
  onClose: () => void;
}> = ({ unit, phase, onClose }) => {
  const updatePhase = useVehicleUnitStore((s) => s.updatePhase);
  const optionsByKey = useAllMasterOptions();

  const ps = phase === 'PT' ? unit.pt : unit.ft;
  const selections = ps.masterSelections ?? {};

  const setSelection = (key: string, ids: string[]) => {
    updatePhase(unit.id, phase, { masterSelections: { ...selections, [key]: ids } });
  };

  const toggle = (key: string, id: string, multi: boolean) => {
    const cur = selections[key] ?? [];
    if (multi) {
      setSelection(key, cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
    } else {
      setSelection(key, cur.includes(id) ? [] : [id]);
    }
  };

  return (
    <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="modal-dialog modal-lg modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              <i className="bi bi-sliders me-2 text-primary" />共通パラメータ（マスタ）の選択
              <small className="text-muted ms-2" style={{ fontSize: '0.8rem' }}>{unit.unitNo}号機 ／ {phase}解析</small>
            </h5>
            <button className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body">
            <p className="text-muted small mb-3">
              各マスタから、この解析で使う項目を選びます（全解析で共通）。マスタ自体の編集は「開く」から。
            </p>
            {MASTER_CATEGORIES.map((cat) => {
              const opts = optionsByKey[cat.key] ?? [];
              const sel = selections[cat.key] ?? [];
              return (
                <div key={cat.key} className="card mb-2">
                  <div className="card-body py-2">
                    <div className="d-flex align-items-center mb-2">
                      <span className="fw-semibold">
                        <i className={`bi bi-${cat.icon} me-2 text-primary`} />{cat.label}
                        <small className="text-muted ms-2 fw-normal">{cat.multi ? '複数選択可' : '1つ選択'}</small>
                      </span>
                      {sel.length > 0 && <span className="badge bg-primary-subtle text-primary ms-2">{sel.length}件選択</span>}
                      <button
                        className="btn btn-sm btn-link ms-auto p-0"
                        onClick={() => openInNewWindow(cat.view)}
                        title={`${cat.label}（マスタ）を開く`}
                      >
                        <i className="bi bi-box-arrow-up-right me-1" />開く
                      </button>
                    </div>
                    {opts.length === 0 ? (
                      <div className="text-muted small">
                        項目がありません。
                        <button className="btn btn-sm btn-link p-0 ms-1 align-baseline" onClick={() => openInNewWindow(cat.view)}>マスタで登録</button>
                      </div>
                    ) : (
                      <div className="d-flex flex-wrap gap-2">
                        {opts.map((o) => {
                          const on = sel.includes(o.id);
                          return (
                            <button
                              key={o.id}
                              type="button"
                              className={`btn btn-sm ${on ? 'btn-primary' : 'btn-outline-secondary'}`}
                              onClick={() => toggle(cat.key, o.id, cat.multi)}
                            >
                              {on && <i className="bi bi-check-lg me-1" />}{o.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="modal-footer">
            <button className="btn btn-primary" onClick={onClose}>完了</button>
          </div>
        </div>
      </div>
    </div>
  );
};
