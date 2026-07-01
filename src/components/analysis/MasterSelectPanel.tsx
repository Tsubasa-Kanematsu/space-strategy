import React from 'react';
import { useVehicleUnitStore } from '../../stores/vehicleUnitStore';
import { MASTER_CATEGORIES, useAllMasterOptions } from './masterCatalog';
import type { AnalysisPhase, VehicleUnit } from '../../types';

/**
 * 共通パラメータ（マスタ）選択パネル。フロー画面にインライン展開される。
 * 各マスタから「どの項目を使うか」をフェーズ単位で選ぶだけ（レコード編集はマスタデータ画面で）。
 */
export const MasterSelectPanel: React.FC<{
  unit: VehicleUnit;
  phase: AnalysisPhase;
}> = ({ unit, phase }) => {
  const updatePhase = useVehicleUnitStore((s) => s.updatePhase);
  const optionsByKey = useAllMasterOptions();

  const ps = phase === 'PT' ? unit.pt : unit.ft;
  const selections = ps.masterSelections ?? {};

  const setSelection = (key: string, ids: string[]) => {
    updatePhase(unit.id, phase, { masterSelections: { ...selections, [key]: ids } });
  };

  const toggle = (key: string, id: string, multi: boolean) => {
    const cur = selections[key] ?? [];
    if (multi) setSelection(key, cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
    else setSelection(key, cur.includes(id) ? [] : [id]);
  };

  return (
    <div>
      <p className="text-muted small mb-2">
        各マスタから、この解析で使う項目を選びます（全解析で共通）。項目の追加・編集は「マスタデータ」画面で行います。
      </p>
      <div className="row g-2">
        {MASTER_CATEGORIES.map((cat) => {
          const opts = optionsByKey[cat.key] ?? [];
          const sel = selections[cat.key] ?? [];
          return (
            <div key={cat.key} className="col-md-6">
              <div className="border rounded p-2 h-100 bg-white">
                <div className="d-flex align-items-center mb-1">
                  <span className="fw-semibold small">
                    <i className={`bi bi-${cat.icon} me-2 text-primary`} />{cat.label}
                    <small className="text-muted ms-2 fw-normal">{cat.multi ? '複数選択可' : '1つ選択'}</small>
                  </span>
                  {sel.length > 0 && <span className="badge bg-primary-subtle text-primary ms-auto">{sel.length}件</span>}
                </div>
                {opts.length === 0 ? (
                  <div className="text-muted small">項目がありません（マスタデータで登録）</div>
                ) : (
                  <div className="d-flex flex-wrap gap-1">
                    {opts.map((o) => {
                      const on = sel.includes(o.id);
                      return (
                        <button
                          key={o.id}
                          type="button"
                          className={`btn btn-sm py-0 ${on ? 'btn-primary' : 'btn-outline-secondary'}`}
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
    </div>
  );
};
