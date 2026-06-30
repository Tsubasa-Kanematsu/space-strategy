import React, { useState, useEffect, useMemo } from 'react';
import { ConditionJsonIO } from '../common/ConditionJsonIO';
import { useSizingStore } from '../../stores/sizingStore';
import { useMassCaseStore } from '../../stores/massCaseStore';
import { useAppStore } from '../../stores/appStore';
import type { SizingCondition, ParaStaConfig } from '../../types';
import { runParametricStudy } from '../../utils/sizingCalc';
import { DeltaVBudgetPanel } from '../massCase/DeltaVBudgetPanel';
import { STAGE_LABELS } from '../../utils/constants';

const defaultParaSta = (): ParaStaConfig => ({ enabled: false, min: 0, max: 0, step: 1 });

const defaultCondition = (): SizingCondition => ({
  numStages: 2,
  payloadMass: 1000,
  deltaV: 9500,
  deltaVParaSta: defaultParaSta(),
  ispPerStage: [280, 320],
  ispParaSta: [defaultParaSta(), defaultParaSta()],
  variableParams: [],
});

const ParaStaRow: React.FC<{
  label: string;
  baseValue: number;
  psta: ParaStaConfig;
  onBaseChange: (v: number) => void;
  onPstaChange: (p: ParaStaConfig) => void;
}> = ({ label, baseValue, psta, onBaseChange, onPstaChange }) => (
  <tr>
    <td className="fw-medium">{label}</td>
    <td>
      <input
        className="form-control form-control-sm font-monospace"
        type="number"
        value={baseValue}
        onChange={(e) => onBaseChange(parseFloat(e.target.value) || 0)}
        style={{ width: 100 }}
      />
    </td>
    <td className="text-center">
      <input
        type="checkbox"
        className="form-check-input"
        checked={psta.enabled}
        onChange={(e) => onPstaChange({ ...psta, enabled: e.target.checked })}
      />
    </td>
    <td>
      <input
        className="form-control form-control-sm font-monospace"
        type="number"
        value={psta.min}
        disabled={!psta.enabled}
        onChange={(e) => onPstaChange({ ...psta, min: parseFloat(e.target.value) || 0 })}
        style={{ width: 90 }}
      />
    </td>
    <td>
      <input
        className="form-control form-control-sm font-monospace"
        type="number"
        value={psta.max}
        disabled={!psta.enabled}
        onChange={(e) => onPstaChange({ ...psta, max: parseFloat(e.target.value) || 0 })}
        style={{ width: 90 }}
      />
    </td>
    <td>
      <input
        className="form-control form-control-sm font-monospace"
        type="number"
        value={psta.step}
        disabled={!psta.enabled}
        onChange={(e) => onPstaChange({ ...psta, step: parseFloat(e.target.value) || 1 })}
        style={{ width: 90 }}
      />
    </td>
    <td className="text-muted" style={{ fontSize: '0.8rem' }}>
      {psta.enabled && psta.step > 0
        ? `${Math.floor((psta.max - psta.min) / psta.step) + 1} 点`
        : '—'}
    </td>
  </tr>
);

interface SizingConditionViewProps {
  /** モーダルから直接渡す場合に使う。省略時は appStore の値を参照。 */
  caseId?: string;
  /** モーダル内で使う際に標準ページ用 h1 を抑制する */
  hideTitle?: boolean;
}

export const SizingConditionView: React.FC<SizingConditionViewProps> = ({ caseId: propCaseId, hideTitle = false }) => {
  const { sizingCaseId: storeSizingCaseId, projectId, navigate } = useAppStore();
  const sizingCaseId = propCaseId ?? storeSizingCaseId;
  const getCase = useSizingStore((s) => s.getCase);
  const addResult = useSizingStore((s) => s.addResult);

  const sizingCase = sizingCaseId ? getCase(sizingCaseId) : null;
  const getParametersForCase = useMassCaseStore((s) => s.getParametersForCase);
  const getMassCase = useMassCaseStore((s) => s.getCase);
  const getComponentsForCase = useMassCaseStore((s) => s.getComponentsForCase);
  const updateComponent = useMassCaseStore((s) => s.updateComponent);
  const allComponents = useMassCaseStore((s) => s.components);
  const variableParams = sizingCase ? getParametersForCase(sizingCase.massCaseId).filter((p) => p.inputType === 'variable') : [];

  const components = useMemo(
    () => sizingCase ? getComponentsForCase(sizingCase.massCaseId) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allComponents, sizingCase?.massCaseId],
  );

  // ΔVバジェット合計
  const mc = sizingCase ? getMassCase(sizingCase.massCaseId) : null;
  const dvTotal = mc?.deltaVBudget
    ? mc.deltaVBudget.entries.reduce((s, e) => s + (e.value || 0), 0)
    : null;

  const [condition, setCondition] = useState<SizingCondition>(() => {
    const base = defaultCondition();
    return {
      ...base,
      variableParams: variableParams.map((p) => ({
        paramId: p.id,
        value: p.value ?? 0,
        paraSta: defaultParaSta(),
      })),
    };
  });

  const [isCalculating, setIsCalculating] = useState(false);
  const [lastRunCount, setLastRunCount] = useState<number | null>(null);

  // Update variableParams when numStages changes
  useEffect(() => {
    setCondition((prev) => {
      const newIsp = Array.from({ length: prev.numStages }, (_, i) => prev.ispPerStage[i] ?? 300);
      const newIspParaSta = Array.from({ length: prev.numStages }, (_, i) => prev.ispParaSta[i] ?? defaultParaSta());
      return { ...prev, ispPerStage: newIsp, ispParaSta: newIspParaSta };
    });
  }, [condition.numStages]);

  const estimateRunCount = (): number => {
    let dvCount = condition.deltaVParaSta.enabled
      ? Math.floor((condition.deltaVParaSta.max - condition.deltaVParaSta.min) / condition.deltaVParaSta.step) + 1
      : 1;
    let ispCount = 1;
    condition.ispParaSta.slice(0, condition.numStages).forEach((psta) => {
      if (psta.enabled && psta.step > 0) {
        ispCount *= Math.floor((psta.max - psta.min) / psta.step) + 1;
      }
    });
    return dvCount * ispCount;
  };

  const handleRun = async () => {
    if (!sizingCaseId || !sizingCase) return;
    setIsCalculating(true);
    try {
      const results = runParametricStudy(condition);
      for (const { condition: cond, calc } of results) {
        addResult(sizingCaseId, cond, {
          totalMass: calc.totalMass,
          grossPayloadRatio: calc.grossPayloadRatio,
          propellantMassPerStage: calc.stages.map((s) => s.propellantMass),
          propellantRatioPerStage: calc.stages.map((s) => s.propellantRatio),
          structuralEfficiencyPerStage: calc.stages.map((s) => s.structuralEfficiency),
          componentMasses: [],
        });
      }
      setLastRunCount(results.length);
      navigate('sizingResults', { projectId, sizingCaseId });
    } finally {
      setIsCalculating(false);
    }
  };

  if (!sizingCaseId || !sizingCase) {
    return <div className="text-muted p-4">サイジングケースが選択されていません。</div>;
  }

  const runCount = estimateRunCount();

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        {!hideTitle && <h1 className="page-title">解析条件 — {sizingCase.name}</h1>}
        <div className="action-toolbar d-flex align-items-center gap-2 flex-wrap">
          <ConditionJsonIO
            caseName={sizingCase.name}
            condition={condition as unknown as Record<string, unknown>}
            onImport={(c) => setCondition(c as unknown as typeof condition)}
            labelPrefix="サイジング条件"
          />
          <span className="text-muted small">推定実行数: <strong>{runCount}</strong> ケース</span>
          <button
            className="btn btn-success btn-sm"
            onClick={handleRun}
            disabled={isCalculating}
          >
            {isCalculating ? (
              <>
                <span className="spinner-border spinner-border-sm me-1" />
                計算中...
              </>
            ) : (
              <>
                <i className="bi bi-play-fill me-1" />
                計算実行
              </>
            )}
          </button>
        </div>
      </div>

      {lastRunCount !== null && (
        <div className="alert alert-success d-flex align-items-center gap-2 py-2">
          <i className="bi bi-check-circle" />
          <span>{lastRunCount} ケースの計算が完了しました。</span>
          <button
            className="btn btn-sm btn-success ms-auto"
            onClick={() => navigate('sizingResults', { projectId, sizingCaseId })}
          >
            結果を見る
          </button>
        </div>
      )}

      {/* Basic Conditions */}
      <div className="card mb-3">
        <div className="card-header">基本設定</div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-sm-3">
              <label className="form-label fw-medium">段数</label>
              <select
                className="form-select"
                value={condition.numStages}
                onChange={(e) => setCondition({ ...condition, numStages: parseInt(e.target.value) })}
              >
                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}段</option>)}
              </select>
            </div>
            <div className="col-sm-3">
              <label className="form-label fw-medium">ペイロード質量 (kg)</label>
              <input
                className="form-control font-monospace"
                type="number"
                value={condition.payloadMass}
                onChange={(e) => setCondition({ ...condition, payloadMass: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 推進剤コンポーネント設定 */}
      <div className="card mb-3">
        <div className="card-header d-flex align-items-center gap-2">
          <i className="bi bi-fire text-danger me-1" />
          推進剤コンポーネント設定
          <small className="text-muted">（質量バジェットから推進剤として扱うコンポーネントを選択）</small>
        </div>
        <div className="card-body p-0">
          {components.filter((c) => c.inputType !== 'aggregate').length === 0 ? (
            <div className="text-muted p-3" style={{ fontSize: '0.85rem' }}>
              コンポーネントがありません。先にデータベースでコンポーネントを追加してください。
            </div>
          ) : (
            <table className="table table-sm mb-0">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>推進剤</th>
                  <th>コンポーネント名</th>
                  <th style={{ width: 80 }}>段</th>
                  <th style={{ width: 100 }}>変数名</th>
                </tr>
              </thead>
              <tbody>
                {components
                  .filter((c) => c.inputType !== 'aggregate')
                  .map((c) => (
                    <tr key={c.id} className={c.isPropellant ? 'table-danger' : ''}>
                      <td className="text-center">
                        <input
                          type="checkbox"
                          className="form-check-input"
                          checked={!!c.isPropellant}
                          onChange={(e) => updateComponent(c.id, { isPropellant: e.target.checked })}
                        />
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>{c.paramName}</td>
                      <td style={{ fontSize: '0.82rem' }}>
                        <span className="badge bg-light text-dark border">{STAGE_LABELS[c.stage]}</span>
                      </td>
                      <td>
                        <code style={{ fontSize: '0.78rem', color: '#0891b2' }}>{c.varName || '—'}</code>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ΔVバジェット */}
      <DeltaVBudgetPanel massCaseId={sizingCase.massCaseId} />

      {/* Parametric Study Table */}
      <div className="card mb-3">
        <div className="card-header d-flex align-items-center gap-2">
          パラメトリックスタディ設定
          <small className="text-muted">(パラスタ有効時: min〜max を step 刻みで計算)</small>
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-sm mb-0">
              <thead>
                <tr>
                  <th>パラメータ</th>
                  <th>基準値</th>
                  <th className="text-center">パラスタ</th>
                  <th>Min</th>
                  <th>Max</th>
                  <th>Step</th>
                  <th>点数</th>
                </tr>
              </thead>
              <tbody>
                {/* ΔV row */}
                <ParaStaRow
                  label="ΔV (m/s)"
                  baseValue={condition.deltaV}
                  psta={condition.deltaVParaSta}
                  onBaseChange={(v) => setCondition({ ...condition, deltaV: v })}
                  onPstaChange={(p) => setCondition({ ...condition, deltaVParaSta: p })}
                />
                {/* バジェット合計を反映するボタン */}
                {dvTotal !== null && (
                  <tr>
                    <td colSpan={7} className="py-1 px-2 border-0">
                      <button
                        className="btn btn-outline-info"
                        style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                        onClick={() => setCondition({ ...condition, deltaV: dvTotal })}
                        title={`ΔVバジェット合計 (${dvTotal} m/s) を基準値に反映`}
                      >
                        <i className="bi bi-arrow-down-circle me-1" />
                        バジェット合計 ({dvTotal.toLocaleString('ja-JP')} m/s) を使用
                      </button>
                    </td>
                  </tr>
                )}
                {/* Isp rows per stage */}
                {Array.from({ length: condition.numStages }, (_, i) => (
                  <ParaStaRow
                    key={i}
                    label={`Isp Stage${i + 1} (s)`}
                    baseValue={condition.ispPerStage[i] ?? 300}
                    psta={condition.ispParaSta[i] ?? defaultParaSta()}
                    onBaseChange={(v) => {
                      const newIsp = [...condition.ispPerStage];
                      newIsp[i] = v;
                      setCondition({ ...condition, ispPerStage: newIsp });
                    }}
                    onPstaChange={(p) => {
                      const newPsta = [...condition.ispParaSta];
                      newPsta[i] = p;
                      setCondition({ ...condition, ispParaSta: newPsta });
                    }}
                  />
                ))}
                {/* Variable params */}
                {variableParams.map((vp) => {
                  const vpCond = condition.variableParams.find((v) => v.paramId === vp.id) ?? {
                    paramId: vp.id, value: vp.value ?? 0, paraSta: defaultParaSta(),
                  };
                  return (
                    <ParaStaRow
                      key={vp.id}
                      label={`${vp.name} (${vp.varName})`}
                      baseValue={vpCond.value}
                      psta={vpCond.paraSta}
                      onBaseChange={(v) => {
                        const newVp = condition.variableParams.map((x) =>
                          x.paramId === vp.id ? { ...x, value: v } : x
                        );
                        if (!newVp.find((x) => x.paramId === vp.id)) {
                          newVp.push({ paramId: vp.id, value: v, paraSta: defaultParaSta() });
                        }
                        setCondition({ ...condition, variableParams: newVp });
                      }}
                      onPstaChange={(p) => {
                        const newVp = condition.variableParams.map((x) =>
                          x.paramId === vp.id ? { ...x, paraSta: p } : x
                        );
                        if (!newVp.find((x) => x.paramId === vp.id)) {
                          newVp.push({ paramId: vp.id, value: vp.value ?? 0, paraSta: p });
                        }
                        setCondition({ ...condition, variableParams: newVp });
                      }}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
