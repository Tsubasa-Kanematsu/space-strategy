import React, { useState } from 'react';
import { useVehicleUnitStore } from '../../stores/vehicleUnitStore';
import { useMasterDataStore } from '../../stores/masterDataStore';
import { MASTER_CATEGORIES, useAllMasterOptions } from './masterCatalog';
import { MASTER_FIELDS, MASTER_BLANK, summarizeRecord } from './masterFields';
import type { AnalysisPhase, VehicleUnit } from '../../types';

interface Crud {
  list: Array<Record<string, unknown> & { id: string; name: string }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  add: (d: any) => { id: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update: (id: string, d: any) => void;
  remove: (id: string) => void;
}

/**
 * 共通パラメータ（マスタ）選択モーダル。
 * 各マスタから「どの項目を使うか」をフェーズ単位で選択でき、さらに
 * 画面遷移せずにレコードの追加・編集・削除（複数ケース作成）もこの場で行える。
 */
export const MasterSelectModal: React.FC<{
  unit: VehicleUnit;
  phase: AnalysisPhase;
  onClose: () => void;
}> = ({ unit, phase, onClose }) => {
  const updatePhase = useVehicleUnitStore((s) => s.updatePhase);
  const optionsByKey = useAllMasterOptions();
  const ms = useMasterDataStore();

  // カテゴリ key → ストアCRUD 束
  const CRUD: Record<string, Crud> = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    shape: { list: ms.shapes as any, add: ms.addShape, update: ms.updateShape, remove: ms.deleteShape },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    aero: { list: ms.aeroCoeffs as any, add: ms.addAeroCoeff, update: ms.updateAeroCoeff, remove: ms.deleteAeroCoeff },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    propulsion: { list: ms.propulsions as any, add: ms.addPropulsion, update: ms.updatePropulsion, remove: ms.deletePropulsion },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wind: { list: ms.winds as any, add: ms.addWind, update: ms.updateWind, remove: ms.deleteWind },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    debris: { list: ms.debris as any, add: ms.addDebris, update: ms.updateDebris, remove: ms.deleteDebris },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    failure: { list: ms.failureRates as any, add: ms.addFailureRate, update: ms.updateFailureRate, remove: ms.deleteFailureRate },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vAntenna: { list: ms.antennas.filter((a) => a.type === 'rocket') as any, add: ms.addAntenna, update: ms.updateAntenna, remove: ms.deleteAntenna },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gAntenna: { list: ms.antennas.filter((a) => a.type === 'ground') as any, add: ms.addAntenna, update: ms.updateAntenna, remove: ms.deleteAntenna },
  };

  const ps = phase === 'PT' ? unit.pt : unit.ft;
  const selections = ps.masterSelections ?? {};

  // インライン編集: どのカテゴリの、どのレコード（null=新規）を編集中か
  const [editCat, setEditCat] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});

  const setSelection = (key: string, ids: string[]) => {
    updatePhase(unit.id, phase, { masterSelections: { ...selections, [key]: ids } });
  };

  const toggle = (key: string, id: string, multi: boolean) => {
    const cur = selections[key] ?? [];
    if (multi) setSelection(key, cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
    else setSelection(key, cur.includes(id) ? [] : [id]);
  };

  const startAdd = (catKey: string) => {
    setEditCat(catKey);
    setEditId(null);
    setDraft(MASTER_BLANK[catKey]());
  };

  const startEdit = (catKey: string, rec: Record<string, unknown>) => {
    setEditCat(catKey);
    setEditId(rec.id as string);
    setDraft({ ...rec });
  };

  const cancelEdit = () => {
    setEditCat(null);
    setEditId(null);
    setDraft({});
  };

  const saveEdit = (catKey: string) => {
    const crud = CRUD[catKey];
    const name = String(draft.name ?? '').trim();
    if (!name) return;
    if (editId) {
      crud.update(editId, draft);
    } else {
      const created = crud.add(draft);
      // 新規作成したものは自動で選択に加える
      const cat = MASTER_CATEGORIES.find((c) => c.key === catKey)!;
      const cur = selections[catKey] ?? [];
      setSelection(catKey, cat.multi ? [...cur, created.id] : [created.id]);
    }
    cancelEdit();
  };

  const removeRec = (catKey: string, id: string) => {
    CRUD[catKey].remove(id);
    const cur = selections[catKey] ?? [];
    if (cur.includes(id)) setSelection(catKey, cur.filter((x) => x !== id));
  };

  const setField = (key: string, value: unknown) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="modal-dialog modal-lg modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              <i className="bi bi-sliders me-2 text-primary" />共通パラメータ（マスタ）
              <small className="text-muted ms-2" style={{ fontSize: '0.8rem' }}>{unit.unitNo}号機 ／ {phase}解析</small>
            </h5>
            <button className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body">
            <p className="text-muted small mb-3">
              各マスタから、この解析で使う項目を選びます（全解析で共通）。この場でレコードの追加・編集・削除もできます（画面遷移不要）。
            </p>
            {MASTER_CATEGORIES.map((cat) => {
              const opts = optionsByKey[cat.key] ?? [];
              const sel = selections[cat.key] ?? [];
              const crud = CRUD[cat.key];
              const isEditingHere = editCat === cat.key;
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
                        className="btn btn-sm btn-outline-primary ms-auto py-0"
                        onClick={() => (isEditingHere && editId === null ? cancelEdit() : startAdd(cat.key))}
                        title={`${cat.label}を追加`}
                      >
                        <i className="bi bi-plus-lg me-1" />追加
                      </button>
                    </div>

                    {opts.length === 0 && !isEditingHere ? (
                      <div className="text-muted small">
                        項目がありません。「追加」で最初のレコードを作成してください。
                      </div>
                    ) : (
                      <div className="d-flex flex-column gap-1">
                        {crud.list.map((rec) => {
                          const on = sel.includes(rec.id);
                          const summary = summarizeRecord(cat.key, rec);
                          return (
                            <div key={rec.id} className="d-flex align-items-center gap-1">
                              <button
                                type="button"
                                className={`btn btn-sm text-start flex-grow-1 ${on ? 'btn-primary' : 'btn-outline-secondary'}`}
                                onClick={() => toggle(cat.key, rec.id, cat.multi)}
                              >
                                {on && <i className="bi bi-check-lg me-1" />}
                                <span className="fw-medium">{rec.name}</span>
                                {summary && <small className={`ms-2 ${on ? 'text-white-50' : 'text-muted'}`}>{summary}</small>}
                              </button>
                              <button className="btn btn-sm btn-link text-secondary p-1" title="編集" onClick={() => startEdit(cat.key, rec)}>
                                <i className="bi bi-pencil" />
                              </button>
                              <button className="btn btn-sm btn-link text-danger p-1" title="削除" onClick={() => removeRec(cat.key, rec.id)}>
                                <i className="bi bi-trash" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* インライン追加/編集フォーム */}
                    {isEditingHere && (
                      <div className="border rounded p-2 mt-2 bg-light">
                        <div className="row g-2">
                          <div className="col-12">
                            <label className="form-label small mb-1 fw-medium">名称 <span className="text-danger">*</span></label>
                            <input
                              className="form-control form-control-sm"
                              value={String(draft.name ?? '')}
                              autoFocus
                              onChange={(e) => setField('name', e.target.value)}
                            />
                          </div>
                          {(MASTER_FIELDS[cat.key] ?? []).map((f) => (
                            <div key={f.key} className="col-6 col-md-4">
                              <label className="form-label small mb-1">{f.label}</label>
                              {f.type === 'select' ? (
                                <select
                                  className="form-select form-select-sm"
                                  value={String(draft[f.key] ?? '')}
                                  onChange={(e) => setField(f.key, e.target.value)}
                                >
                                  {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                                </select>
                              ) : f.type === 'number' ? (
                                <input
                                  type="number"
                                  step={f.step ?? 'any'}
                                  className="form-control form-control-sm"
                                  value={draft[f.key] === null || draft[f.key] === undefined ? '' : String(draft[f.key])}
                                  onChange={(e) => setField(f.key, e.target.value === '' ? null : Number(e.target.value))}
                                />
                              ) : (
                                <input
                                  className="form-control form-control-sm"
                                  value={String(draft[f.key] ?? '')}
                                  onChange={(e) => setField(f.key, e.target.value)}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="d-flex gap-2 mt-2">
                          <button className="btn btn-sm btn-primary" disabled={!String(draft.name ?? '').trim()} onClick={() => saveEdit(cat.key)}>
                            <i className="bi bi-check-lg me-1" />{editId ? '更新' : '追加'}
                          </button>
                          <button className="btn btn-sm btn-outline-secondary" onClick={cancelEdit}>キャンセル</button>
                        </div>
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
