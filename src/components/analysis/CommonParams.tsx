import React, { useState, useMemo } from 'react';
import { useMassCaseStore } from '../../stores/massCaseStore';
import { useVehicleUnitStore } from '../../stores/vehicleUnitStore';
import { useAppStore } from '../../stores/appStore';
import { MASTER_CATEGORIES, useAllMasterOptions } from './masterCatalog';
import { MassModel } from '../massCase/MassModel';
import { ErrorSourceView } from '../rocketDb/ErrorSourceView';
import type { AnalysisEntry, VehicleUnit } from '../../types';

/** 共通パラメータ行の定義。massCase 系（質量諸元・誤差源）とマスタ系を統一的に扱う。 */
interface ParamRow {
  key: string;
  kind: 'massCase' | 'master';
  icon: string;
  color: string;
  label: string;
  value: string;       // 選択中の表示文字列
  isSet: boolean;
}

/**
 * 共通パラメータ（フロー画面上）。
 * 各パラメータは「選択中のケース/項目名」を表示するだけ。右端の「変更」で
 * モーダルの一覧が開き、選択を変更する。質量諸元・誤差源もマスタデータ扱い。
 */
export const CommonParams: React.FC<{ unit: VehicleUnit; entry: AnalysisEntry }> = ({ unit, entry }) => {
  const cases = useMassCaseStore((s) => s.cases);
  const addCase = useMassCaseStore((s) => s.addCase);
  const allComponents = useMassCaseStore((s) => s.components);
  const getComponentsForCase = useMassCaseStore((s) => s.getComponentsForCase);
  const updateAnalysis = useVehicleUnitStore((s) => s.updateAnalysis);
  const optionsByKey = useAllMasterOptions();

  const ps = entry;
  const selections = ps.masterSelections ?? {};
  const massCaseId = ps.massCaseId ?? null;

  // 質量諸元はマスタデータ扱い（プロジェクト非依存）。全ケースから選択する。
  const allCases = cases;
  const selectedCase = allCases.find((c) => c.id === massCaseId) ?? null;
  const caseComponents = useMemo(
    () => (massCaseId ? getComponentsForCase(massCaseId) : []),
    [allComponents, massCaseId, getComponentsForCase],
  );
  const partCount = caseComponents.length;
  const errorCount = caseComponents.reduce((n, c) => n + (c.errorSources?.length ?? 0), 0);

  const [picker, setPicker] = useState<string | null>(null);      // 選択変更モーダル対象
  const [editor, setEditor] = useState<'mass' | 'error' | null>(null); // フル編集モーダル

  // マスタ選択の表示名
  const masterValue = (key: string): string => {
    const ids = selections[key] ?? [];
    if (ids.length === 0) return '未選択';
    const opts = optionsByKey[key] ?? [];
    return ids.map((id) => opts.find((o) => o.id === id)?.label ?? id).join('、');
  };

  const rows: ParamRow[] = [
    {
      key: 'mass', kind: 'massCase', icon: 'box-seam', color: '#2563eb', label: '質量諸元',
      value: selectedCase ? `${selectedCase.name}（${partCount}部品）` : '未選択', isSet: !!selectedCase,
    },
    {
      key: 'error', kind: 'massCase', icon: 'exclamation-diamond', color: '#d97706', label: '誤差源',
      value: selectedCase ? `${selectedCase.name}（${errorCount}件）` : '未選択', isSet: !!selectedCase,
    },
    ...MASTER_CATEGORIES.map((cat) => ({
      key: cat.key, kind: 'master' as const, icon: cat.icon, color: '#059669',
      label: cat.label, value: masterValue(cat.key), isSet: (selections[cat.key]?.length ?? 0) > 0,
    })),
  ];

  // massCase を用意（無ければ作成）し、appStore にセット（エディタ用）
  const ensureMassCase = (): string => {
    let mc = ps.massCaseId;
    if (!mc) {
      const c = addCase({ projectId: unit.projectId, name: `${unit.unitNo}号機 ${entry.name} 機体諸元`, memo: '', createdBy: '' });
      mc = c.id;
      updateAnalysis(unit.id, entry.id, { massCaseId: mc });
    }
    return mc;
  };
  const openEditor = (which: 'mass' | 'error') => {
    const mc = ensureMassCase();
    useAppStore.setState({ projectId: unit.projectId, massCaseId: mc });
    setPicker(null);
    setEditor(which);
  };
  const selectCase = (id: string) => updateAnalysis(unit.id, entry.id, { massCaseId: id });
  const createCase = () => {
    const c = addCase({ projectId: "", name: `機体諸元 ${allCases.length + 1}`, memo: '', createdBy: '' });
    selectCase(c.id);
  };

  const toggleMaster = (key: string, id: string, multi: boolean) => {
    const cur = selections[key] ?? [];
    const next = multi
      ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])
      : (cur.includes(id) ? [] : [id]);
    updateAnalysis(unit.id, entry.id, { masterSelections: { ...selections, [key]: next } });
  };

  const pickerRow = rows.find((r) => r.key === picker) ?? null;
  const pickerCat = MASTER_CATEGORIES.find((c) => c.key === picker) ?? null;

  return (
    <div className="mb-3">
      <div className="d-flex align-items-center mb-2">
        <span className="fw-semibold small"><i className="bi bi-sliders me-1 text-primary" />共通パラメータ</span>
        <span className="text-muted ms-2" style={{ fontSize: '0.75rem' }}>この解析フローで使う条件（全解析で共通）。右の「変更」で選択</span>
      </div>

      {/* 選択サマリのリスト */}
      <div className="border rounded-3" style={{ borderColor: '#e5e7eb' }}>
        {rows.map((r, i) => (
          <div
            key={r.key}
            className={`d-flex align-items-center px-3 py-2 ${i < rows.length - 1 ? 'border-bottom' : ''}`}
          >
            <span className="d-inline-flex align-items-center gap-2" style={{ width: 150, flexShrink: 0 }}>
              <span
                className="d-inline-flex align-items-center justify-content-center rounded-2"
                style={{ width: 26, height: 26, background: `${r.color}1a`, color: r.color, flexShrink: 0 }}
              >
                <i className={`bi bi-${r.icon}`} style={{ fontSize: '0.85rem' }} />
              </span>
              <span className="fw-medium small">{r.label}</span>
            </span>
            <span
              className={`flex-grow-1 text-truncate small ${r.isSet ? '' : 'text-muted fst-italic'}`}
              style={{ minWidth: 0 }}
              title={r.value}
            >
              {r.value}
            </span>
            <button className="btn btn-sm btn-outline-primary ms-2 py-0" onClick={() => setPicker(r.key)}>
              <i className="bi bi-pencil-square me-1" />変更
            </button>
          </div>
        ))}
      </div>

      {/* 選択変更モーダル */}
      {pickerRow && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setPicker(null)}>
          <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header py-2">
                <h6 className="modal-title">
                  <i className={`bi bi-${pickerRow.icon} me-2`} style={{ color: pickerRow.color }} />
                  {pickerRow.label} を選択
                </h6>
                <button className="btn-close" onClick={() => setPicker(null)} />
              </div>
              <div className="modal-body">
                {pickerRow.kind === 'massCase' ? (
                  <>
                    <p className="text-muted small mb-2">使用する{pickerRow.label}のケースを選びます。内容の編集は「編集」から。</p>
                    <div className="list-group mb-2">
                      {allCases.length === 0 && (
                        <div className="text-muted small py-2">ケースがありません。「新規作成」してください。</div>
                      )}
                      {allCases.map((c) => {
                        const on = c.id === massCaseId;
                        const comps = getComponentsForCase(c.id);
                        const errs = comps.reduce((n, x) => n + (x.errorSources?.length ?? 0), 0);
                        return (
                          <button
                            key={c.id}
                            className={`list-group-item list-group-item-action d-flex align-items-center ${on ? 'active' : ''}`}
                            onClick={() => selectCase(c.id)}
                          >
                            <i className={`bi ${on ? 'bi-check-circle-fill' : 'bi-circle'} me-2`} />
                            <span className="flex-grow-1 text-start">
                              <span className="fw-medium">{c.name}</span>
                              <small className={on ? 'ms-2' : 'ms-2 text-muted'}>{comps.length}部品 / 誤差源{errs}件</small>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="d-flex gap-2">
                      <button className="btn btn-sm btn-outline-secondary" onClick={createCase}>
                        <i className="bi bi-plus-lg me-1" />新規作成
                      </button>
                      <button
                        className="btn btn-sm btn-primary ms-auto"
                        onClick={() => openEditor(pickerRow.key === 'error' ? 'error' : 'mass')}
                      >
                        <i className="bi bi-pencil me-1" />{pickerRow.label}を編集
                      </button>
                    </div>
                  </>
                ) : pickerCat ? (
                  <>
                    <p className="text-muted small mb-2">
                      {pickerCat.multi ? '使う項目を選びます（複数選択可）。' : '使う項目を1つ選びます。'}
                      項目の追加・編集は「マスタデータ」画面で。
                    </p>
                    <div className="list-group">
                      {(optionsByKey[pickerCat.key] ?? []).length === 0 && (
                        <div className="text-muted small py-2">項目がありません（マスタデータで登録）。</div>
                      )}
                      {(optionsByKey[pickerCat.key] ?? []).map((o) => {
                        const on = (selections[pickerCat.key] ?? []).includes(o.id);
                        return (
                          <button
                            key={o.id}
                            className={`list-group-item list-group-item-action d-flex align-items-center ${on ? 'active' : ''}`}
                            onClick={() => toggleMaster(pickerCat.key, o.id, pickerCat.multi)}
                          >
                            <i className={`bi ${on ? (pickerCat.multi ? 'bi-check-square-fill' : 'bi-check-circle-fill') : (pickerCat.multi ? 'bi-square' : 'bi-circle')} me-2`} />
                            <span className="flex-grow-1 text-start fw-medium">{o.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : null}
              </div>
              <div className="modal-footer py-2">
                <button className="btn btn-sm btn-primary" onClick={() => setPicker(null)}>完了</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* フル編集モーダル（質量諸元 / 誤差源） */}
      {editor && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-fullscreen">
            <div className="modal-content">
              <div className="modal-header py-2">
                <h5 className="modal-title">
                  <i className={`bi bi-${editor === 'mass' ? 'box-seam' : 'exclamation-diamond'} me-2 text-primary`} />
                  {editor === 'mass' ? '質量諸元' : '誤差源'} の編集
                  {selectedCase && <small className="text-muted ms-2" style={{ fontSize: '0.8rem' }}>{selectedCase.name}</small>}
                </h5>
                <button className="btn btn-primary btn-sm" onClick={() => setEditor(null)}>
                  <i className="bi bi-check-lg me-1" />編集を終える
                </button>
              </div>
              <div className="modal-body" style={{ overflow: 'auto' }}>
                {editor === 'mass' ? <MassModel /> : <ErrorSourceView embedded />}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
