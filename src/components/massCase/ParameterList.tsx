import React, { useState, useMemo, useRef } from 'react';
import { useMassCaseStore } from '../../stores/massCaseStore';
import { useAppStore } from '../../stores/appStore';
import { useRocketShapeStore } from '../../stores/rocketShapeStore';
import { usePropulsionStore } from '../../stores/propulsionStore';
import { listPropulsionVars, listShapeVars } from '../../utils/crossRefScope';
import { evalFormula, buildScope, evaluateComponentMasses } from '../../utils/formulaEngine';
import { DeleteConfirmModal } from '../common/DeleteConfirmModal';
import type { MassComponent, Parameter, ParameterInputType } from '../../types';

const INPUT_TYPE_LABELS: Record<ParameterInputType, string> = {
  fixed: '固定',
  variable: '変数',
  formula: '計算式',
};

const INPUT_TYPE_BADGE: Record<ParameterInputType, string> = {
  fixed: 'secondary',
  variable: 'warning',
  formula: 'info',
};

const MATH_FUNCTIONS = [
  'log()', 'log10()', 'log2()', 'sqrt()', 'abs()',
  'exp()', 'sin()', 'cos()', 'tan()',
  'ceil()', 'floor()', 'round()', 'max()', 'min()', 'pi',
];

interface FormState {
  name: string;
  varName: string;
  inputType: ParameterInputType;
  value: string;
  formula: string;
}

const emptyForm = (): FormState => ({
  name: '',
  varName: '',
  inputType: 'fixed',
  value: '0',
  formula: '',
});

export const ParameterList: React.FC = () => {
  const { massCaseId } = useAppStore();
  const cases = useMassCaseStore((s) => s.cases);
  const allParameters = useMassCaseStore((s) => s.parameters);
  const allComponents = useMassCaseStore((s) => s.components);
  const getParametersForCase = useMassCaseStore((s) => s.getParametersForCase);
  const getComponentsForCase = useMassCaseStore((s) => s.getComponentsForCase);
  const addParameter = useMassCaseStore((s) => s.addParameter);
  const updateParameter = useMassCaseStore((s) => s.updateParameter);
  const deleteParameter = useMassCaseStore((s) => s.deleteParameter);

  const geometries = useRocketShapeStore((s) => s.geometries);
  const allStages = usePropulsionStore((s) => s.stages);

  const massCase = cases.find((c) => c.id === massCaseId) ?? null;
  const parameters = useMemo(
    () => massCaseId ? getParametersForCase(massCaseId) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allParameters, massCaseId],
  );
  const components = useMemo(
    () => massCaseId ? getComponentsForCase(massCaseId) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allComponents, massCaseId],
  );
  const geom = geometries.find((g) => g.massCaseId === massCaseId);
  const stages = useMemo(
    () => allStages.filter((s) => s.massCaseId === massCaseId).sort((a, b) => a.stageNo - b.stageNo),
    [allStages, massCaseId],
  );

  const propVars = useMemo(() => listPropulsionVars(stages), [stages]);
  const shapeVars = useMemo(() => listShapeVars(geom), [geom]);

  // 外部参照変数のスコープ（推進系・形状）
  const crossRefScope = useMemo(() => {
    const scope: Record<string, number> = {};
    [...propVars, ...shapeVars].forEach((v) => {
      if (v.varName && v.value !== null) scope[v.varName] = v.value;
    });
    return scope;
  }, [propVars, shapeVars]);

  // formula engine による質量計算（パラメータ変数参照可能）
  const massComputedMap = useMemo(
    () => evaluateComponentMasses(components, parameters, crossRefScope),
    [components, parameters, crossRefScope],
  );

  // childrenOf マップ（集計用）
  const childrenOf = useMemo(() => {
    const map = new Map<string, typeof components>();
    components.forEach((c) => {
      const key = c.parentId ?? '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    });
    return map;
  }, [components]);

  // MassModel と同じロジックで質量スコープを構築
  // 配分値: fixed→parseFloat(valueOrFormula), formula/design_var→computedMass, fallback→allocatedMass
  // 集計: 子の合計（nullはスキップ、MassModelと同じ）
  const buildUnifiedMassScope = useMemo(() => {
    return (mode: 'allocated' | 'actual'): Record<string, number> => {
      const cache = new Map<string, number | null>();

      const resolve = (comp: MassComponent): number | null => {
        if (cache.has(comp.id)) return cache.get(comp.id)!;

        const children = childrenOf.get(comp.logicalId || comp.id) ?? [];
        if (comp.inputType === 'aggregate' && children.length > 0) {
          // 集計: nullスキップ（MassModel の actualMassAggregated と同じ方式）
          let total = 0;
          let hasAny = false;
          for (const child of children) {
            const v = resolve(child);
            if (v != null) { total += v; hasAny = true; }
          }
          const val = hasAny ? total : null;
          cache.set(comp.id, val);
          return val;
        }

        if (mode === 'actual') {
          // 実質量: actualMass 優先 → computedMass → allocatedMass
          const actual = comp.actualMass ?? null;
          if (actual != null) { cache.set(comp.id, actual); return actual; }
          const computed = massComputedMap.get(comp.id) ?? null;
          if (computed != null) { cache.set(comp.id, computed); return computed; }
          cache.set(comp.id, comp.allocatedMass);
          return comp.allocatedMass;
        }

        // 配分値: MassModel の resolveAllocatedMass と同じ
        if (comp.inputType === 'fixed') {
          const v = parseFloat(comp.valueOrFormula);
          if (!Number.isNaN(v)) { cache.set(comp.id, v); return v; }
        }
        const computed = massComputedMap.get(comp.id) ?? null;
        if (computed != null) { cache.set(comp.id, computed); return computed; }
        cache.set(comp.id, comp.allocatedMass);
        return comp.allocatedMass;
      };

      components.forEach((c) => resolve(c));

      const scope: Record<string, number> = {};
      components.forEach((c) => {
        if (c.varName) {
          const v = cache.get(c.id);
          if (v != null) scope[c.varName] = v;
        }
      });
      return scope;
    };
  }, [components, childrenOf, massComputedMap]);

  const massScope_allocated = useMemo(
    () => buildUnifiedMassScope('allocated'),
    [buildUnifiedMassScope],
  );

  const massScope_actual = useMemo(
    () => buildUnifiedMassScope('actual'),
    [buildUnifiedMassScope],
  );

  // 質量変数リスト（UI表示用 — 配分値ベース）
  const massVars = useMemo(
    () =>
      components
        .filter((c) => c.varName)
        .map((c) => ({
          varName: c.varName,
          label: c.paramName,
          value: massScope_allocated[c.varName] ?? null,
        })),
    [components, massScope_allocated],
  );

  const hasCrossRefVars = propVars.length > 0 || shapeVars.length > 0 || massVars.length > 0;

  // 各パラメータの計算値（配分値ベース）
  const computedValues_allocated = useMemo(() => {
    const result = new Map<string, number | null>();
    const scope: Record<string, number> = { ...crossRefScope, ...massScope_allocated, ...buildScope(parameters) };
    parameters.forEach((p) => {
      if (p.inputType === 'formula') {
        const val = evalFormula(p.formula, scope);
        if (val !== null && p.varName) scope[p.varName] = val;
        result.set(p.id, val);
      } else {
        result.set(p.id, p.value);
      }
    });
    return result;
  }, [parameters, crossRefScope, massScope_allocated]);

  // 各パラメータの計算値（実質量ベース）
  const computedValues_actual = useMemo(() => {
    const result = new Map<string, number | null>();
    const scope: Record<string, number> = { ...crossRefScope, ...massScope_actual, ...buildScope(parameters) };
    parameters.forEach((p) => {
      if (p.inputType === 'formula') {
        const val = evalFormula(p.formula, scope);
        if (val !== null && p.varName) scope[p.varName] = val;
        result.set(p.id, val);
      } else {
        result.set(p.id, p.value);
      }
    });
    return result;
  }, [parameters, crossRefScope, massScope_actual]);

  const [showVarsPanel, setShowVarsPanel] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Parameter | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [confirmDelete, setConfirmDelete] = useState<Parameter | null>(null);

  const formulaInputRef = useRef<HTMLInputElement>(null);

  // カーソル位置に変数・関数を挿入
  const insertAtCursor = (text: string) => {
    const el = formulaInputRef.current;
    if (!el) return;
    const start = el.selectionStart ?? form.formula.length;
    const end = el.selectionEnd ?? form.formula.length;
    const newFormula = form.formula.slice(0, start) + text + form.formula.slice(end);
    setForm({ ...form, formula: newFormula });
    setTimeout(() => {
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    }, 0);
  };

  // 利用可能な変数リスト（モーダル内）
  const availableVars = useMemo(() => {
    return parameters
      .filter((p) => p.varName && p.id !== editTarget?.id)
      .map((p) => ({ varName: p.varName, label: p.name }));
  }, [parameters, editTarget]);

  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm());
    setShowModal(true);
  };

  const openEdit = (p: Parameter) => {
    setEditTarget(p);
    setForm({
      name: p.name,
      varName: p.varName,
      inputType: p.inputType,
      value: p.value !== null ? String(p.value) : '0',
      formula: p.formula,
    });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.name.trim() || !massCaseId) return;
    const data = {
      massCaseId,
      name: form.name,
      varName: form.varName,
      inputType: form.inputType,
      value: form.inputType === 'fixed' || form.inputType === 'variable' ? parseFloat(form.value) || 0 : null,
      formula: form.inputType === 'formula' ? form.formula : '',
      usageLocations: [],
    };
    if (editTarget) {
      updateParameter(editTarget.id, data);
    } else {
      addParameter(data);
    }
    setShowModal(false);
  };

  if (!massCaseId || !massCase) {
    return <div className="text-muted p-4">ロケットデータベースが選択されていません。</div>;
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="page-title">
          <i className="bi bi-sliders me-2 text-primary" />
          パラメータ — {massCase.name}
        </h1>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>
          <i className="bi bi-plus-lg me-1" />
          追加
        </button>
      </div>

      <div className="alert alert-info d-flex align-items-start gap-2 py-2">
        <i className="bi bi-info-circle mt-1" />
        <small>
          <strong>固定</strong>: 常に固定値。
          <strong> 変数</strong>: サイジングサービスが値を設定。
          <strong> 計算式</strong>: 他パラメータ・コンポーネントを参照した式で計算。
        </small>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th>パラメータ名</th>
                <th>変数名</th>
                <th>タイプ</th>
                <th>値/計算式</th>
                <th className="text-center" style={{ whiteSpace: 'nowrap', fontSize: '0.78rem' }}>計算値<br /><span className="text-muted fw-normal">（配分値）</span></th>
                <th className="text-center" style={{ whiteSpace: 'nowrap', fontSize: '0.78rem' }}>計算値<br /><span className="text-muted fw-normal">（実質量）</span></th>
                <th className="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {parameters.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-muted py-4">
                    <i className="bi bi-sliders fs-4 d-block mb-2" />
                    パラメータがありません
                  </td>
                </tr>
              ) : (
                parameters.map((p) => {
                  const alloc = computedValues_allocated.get(p.id);
                  const actual = computedValues_actual.get(p.id);
                  const fmtVal = (v: number | null | undefined) =>
                    v !== null && v !== undefined
                      ? v.toLocaleString('ja-JP', { maximumFractionDigits: 6 })
                      : null;
                  return (
                    <tr key={p.id}>
                      <td className="fw-medium">{p.name}</td>
                      <td>
                        <code className="bg-light px-1 rounded" style={{ fontSize: '0.8rem' }}>
                          {p.varName || '—'}
                        </code>
                      </td>
                      <td>
                        <span className={`badge bg-${INPUT_TYPE_BADGE[p.inputType]}-subtle text-${INPUT_TYPE_BADGE[p.inputType]}`}>
                          {INPUT_TYPE_LABELS[p.inputType]}
                        </span>
                      </td>
                      <td className="font-monospace">
                        {p.inputType === 'formula' ? (
                          <code style={{ fontSize: '0.8rem' }}>{p.formula || '—'}</code>
                        ) : (
                          p.value !== null ? p.value.toLocaleString('ja-JP') : '—'
                        )}
                      </td>
                      <td className="font-monospace text-end" style={{ fontSize: '0.85rem' }}>
                        {fmtVal(alloc) !== null ? (
                          <span className="text-success fw-medium">{fmtVal(alloc)}</span>
                        ) : <span className="text-muted">—</span>}
                      </td>
                      <td className="font-monospace text-end" style={{ fontSize: '0.85rem' }}>
                        {fmtVal(actual) !== null ? (
                          <span className="text-primary fw-medium">{fmtVal(actual)}</span>
                        ) : <span className="text-muted">—</span>}
                      </td>
                      <td className="col-actions">
                        <button
                          className="btn btn-sm btn-outline-secondary me-1"
                          onClick={() => openEdit(p)}
                          title="編集"
                        >
                          <i className="bi bi-pencil" />
                        </button>
                        <button
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => setConfirmDelete(p)}
                          title="削除"
                        >
                          <i className="bi bi-trash" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 利用可能な外部参照変数パネル */}
      <div className="card mt-3">
        <div
          className="card-header d-flex align-items-center justify-content-between"
          style={{ cursor: 'pointer', userSelect: 'none' }}
          onClick={() => setShowVarsPanel((v) => !v)}
        >
          <span className="fw-medium" style={{ fontSize: '0.88rem' }}>
            <i className="bi bi-link-45deg me-1 text-primary" />
            利用可能な外部参照変数
            {hasCrossRefVars && (
              <span className="badge bg-primary-subtle text-primary ms-2" style={{ fontSize: '0.7rem' }}>
                {propVars.length + shapeVars.length}
              </span>
            )}
          </span>
          <i className={`bi bi-chevron-${showVarsPanel ? 'up' : 'down'} text-muted`} style={{ fontSize: '0.8rem' }} />
        </div>
        {showVarsPanel && (
          <div className="card-body p-0">
            {!hasCrossRefVars ? (
              <p className="text-muted text-center py-3 mb-0" style={{ fontSize: '0.85rem' }}>
                推進系データまたは空力形状データが登録されると、計算式で使える変数がここに表示されます。
              </p>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm mb-0" style={{ fontSize: '0.82rem' }}>
                  <thead className="table-light">
                    <tr>
                      <th style={{ width: 170 }}>変数名</th>
                      <th>説明</th>
                      <th style={{ width: 60 }}>単位</th>
                      <th className="text-end" style={{ width: 110 }}>現在値</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shapeVars.length > 0 && (
                      <>
                        <tr className="table-secondary">
                          <td colSpan={4} className="fw-semibold py-1">
                            <i className="bi bi-rulers-combined me-1" />空力形状
                          </td>
                        </tr>
                        {shapeVars.map((v) => (
                          <tr key={v.varName}>
                            <td>
                              <code
                                className="bg-light px-1 rounded"
                                style={{ fontSize: '0.8rem', cursor: 'pointer' }}
                                title="クリックでコピー"
                                onClick={() => navigator.clipboard?.writeText(v.varName)}
                              >
                                {v.varName}
                              </code>
                            </td>
                            <td className="text-muted">{v.description}</td>
                            <td className="text-muted">{v.unit}</td>
                            <td className="text-end font-monospace">
                              {v.value !== null
                                ? v.value.toLocaleString('ja-JP', { maximumFractionDigits: 4 })
                                : <span className="text-muted">—</span>}
                            </td>
                          </tr>
                        ))}
                      </>
                    )}
                    {propVars.length > 0 && (
                      <>
                        <tr className="table-secondary">
                          <td colSpan={4} className="fw-semibold py-1">
                            <i className="bi bi-fire me-1" />推進系
                          </td>
                        </tr>
                        {propVars.map((v) => (
                          <tr key={v.varName}>
                            <td>
                              <code
                                className="bg-light px-1 rounded"
                                style={{ fontSize: '0.8rem', cursor: 'pointer' }}
                                title="クリックでコピー"
                                onClick={() => navigator.clipboard?.writeText(v.varName)}
                              >
                                {v.varName}
                              </code>
                            </td>
                            <td className="text-muted">{v.description}</td>
                            <td className="text-muted">{v.unit}</td>
                            <td className="text-end font-monospace">
                              {v.value !== null
                                ? v.value.toLocaleString('ja-JP', { maximumFractionDigits: 4 })
                                : <span className="text-muted">—</span>}
                            </td>
                          </tr>
                        ))}
                      </>
                    )}
                    {massVars.length > 0 && (
                      <>
                        <tr className="table-secondary">
                          <td colSpan={4} className="fw-semibold py-1">
                            <i className="bi bi-layers me-1" />質量コンポーネント
                          </td>
                        </tr>
                        {massVars.map((v) => (
                          <tr key={v.varName}>
                            <td>
                              <code
                                className="bg-light px-1 rounded"
                                style={{ fontSize: '0.8rem', cursor: 'pointer' }}
                                title="クリックでコピー"
                                onClick={() => navigator.clipboard?.writeText(v.varName)}
                              >
                                {v.varName}
                              </code>
                            </td>
                            <td className="text-muted">{v.label}</td>
                            <td className="text-muted">kg</td>
                            <td className="text-end font-monospace">
                              {v.value !== null
                                ? v.value.toLocaleString('ja-JP', { maximumFractionDigits: 4 })
                                : <span className="text-muted">—</span>}
                            </td>
                          </tr>
                        ))}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  {editTarget ? 'パラメータ編集' : 'パラメータ追加'}
                </h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label fw-medium">パラメータ名 <span className="text-danger">*</span></label>
                  <input
                    className="form-control"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="例: 比推力 Stage1"
                    autoFocus
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-medium">変数名</label>
                  <input
                    className="form-control font-monospace"
                    value={form.varName}
                    onChange={(e) => setForm({ ...form, varName: e.target.value })}
                    placeholder="例: isp1"
                  />
                  <div className="form-text">計算式内で参照する名前 (英数字・アンダースコア)</div>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-medium">入力タイプ</label>
                  <select
                    className="form-select"
                    value={form.inputType}
                    onChange={(e) => setForm({ ...form, inputType: e.target.value as ParameterInputType })}
                  >
                    <option value="fixed">固定</option>
                    <option value="variable">変数 (サイジングサービスが設定)</option>
                    <option value="formula">計算式</option>
                  </select>
                </div>
                {form.inputType !== 'formula' ? (
                  <div className="mb-3">
                    <label className="form-label fw-medium">値</label>
                    <input
                      className="form-control font-monospace"
                      type="number"
                      value={form.value}
                      onChange={(e) => setForm({ ...form, value: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                ) : (
                  <div className="mb-3">
                    <label className="form-label fw-medium">計算式</label>
                    <input
                      ref={formulaInputRef}
                      className="form-control font-monospace"
                      value={form.formula}
                      onChange={(e) => setForm({ ...form, formula: e.target.value })}
                      placeholder="例: isp1 * 2 + log(offset)"
                    />
                    {/* プレビュー */}
                    {form.formula && (() => {
                      const allocScope = { ...crossRefScope, ...massScope_allocated, ...buildScope(parameters) };
                      const actualScope = { ...crossRefScope, ...massScope_actual, ...buildScope(parameters) };
                      const valAlloc = evalFormula(form.formula, allocScope);
                      const valActual = evalFormula(form.formula, actualScope);
                      const fmt = (v: number | null) =>
                        v !== null ? v.toLocaleString('ja-JP', { maximumFractionDigits: 6 }) : null;
                      return (
                        <div className="form-text">
                          {valAlloc !== null || valActual !== null ? (
                            <span className="text-success">
                              {fmt(valAlloc) !== null && <>配分値: {fmt(valAlloc)}</>}
                              {fmt(valAlloc) !== null && fmt(valActual) !== null && <span className="mx-2 text-muted">|</span>}
                              {fmt(valActual) !== null && <>実質量: {fmt(valActual)}</>}
                            </span>
                          ) : (
                            <span className="text-danger">計算エラー（変数名・式を確認してください）</span>
                          )}
                        </div>
                      );
                    })()}

                    {/* 変数・関数候補 */}
                    <div className="mt-2 p-2 bg-light rounded" style={{ fontSize: '0.78rem' }}>
                      {availableVars.length > 0 && (
                        <div className="mb-2">
                          <span className="text-muted fw-semibold me-1">パラメータ変数:</span>
                          <div className="d-flex flex-wrap gap-1 mt-1">
                            {availableVars.map((v) => (
                              <button
                                key={v.varName}
                                type="button"
                                className="btn btn-outline-secondary btn-sm py-0 font-monospace"
                                style={{ fontSize: '0.75rem' }}
                                title={v.label}
                                onClick={() => insertAtCursor(v.varName)}
                              >
                                {v.varName}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {(propVars.length > 0 || shapeVars.length > 0) && (
                        <div className="mb-2">
                          <span className="text-muted fw-semibold me-1">外部参照変数:</span>
                          <div className="d-flex flex-wrap gap-1 mt-1">
                            {[...shapeVars, ...propVars].map((v) => (
                              <button
                                key={v.varName}
                                type="button"
                                className="btn btn-outline-primary btn-sm py-0 font-monospace"
                                style={{ fontSize: '0.75rem' }}
                                title={v.description}
                                onClick={() => insertAtCursor(v.varName)}
                              >
                                {v.varName}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {massVars.length > 0 && (
                        <div className="mb-2">
                          <span className="text-muted fw-semibold me-1">質量変数:</span>
                          <div className="d-flex flex-wrap gap-1 mt-1">
                            {massVars.map((v) => (
                              <button
                                key={v.varName}
                                type="button"
                                className="btn btn-outline-success btn-sm py-0 font-monospace"
                                style={{ fontSize: '0.75rem' }}
                                title={`${v.label}${v.value !== null ? ` = ${v.value}` : ''}`}
                                onClick={() => insertAtCursor(v.varName)}
                              >
                                {v.varName}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div>
                        <span className="text-muted fw-semibold me-1">数学関数:</span>
                        <div className="d-flex flex-wrap gap-1 mt-1">
                          {MATH_FUNCTIONS.map((fn) => (
                            <button
                              key={fn}
                              type="button"
                              className="btn btn-outline-info btn-sm py-0 font-monospace"
                              style={{ fontSize: '0.75rem' }}
                              onClick={() => insertAtCursor(fn)}
                            >
                              {fn}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  キャンセル
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={!form.name.trim()}
                >
                  {editTarget ? '保存' : '追加'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <DeleteConfirmModal
          itemName={confirmDelete.name}
          onConfirm={() => { deleteParameter(confirmDelete.id); setConfirmDelete(null); }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
};
