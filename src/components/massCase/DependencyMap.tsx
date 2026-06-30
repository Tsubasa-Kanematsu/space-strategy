import React, { useState } from 'react';
import type { MassComponent, Parameter } from '../../types';
import type { CrossRefVarDoc } from '../../utils/crossRefScope';

interface Props {
  components: MassComponent[];
  parameters: Parameter[];
  propVars: CrossRefVarDoc[];
  shapeVars: CrossRefVarDoc[];
}

type SourceType = 'param' | 'crossref' | 'compvar';

interface SourceInfo {
  varName: string;
  type: SourceType;
  value?: number | null;
  compName?: string; // compvar の場合の component.paramName
}

const SOURCE_STYLE: Record<SourceType, React.CSSProperties> = {
  param:    { background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd' },
  crossref: { background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' },
  compvar:  { background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' },
};

const SOURCE_LABEL: Record<SourceType, string> = {
  param:    'パラメータ',
  crossref: '外部参照',
  compvar:  'コンポーネント変数',
};

function findRefs(formula: string, varNames: string[]): string[] {
  return varNames.filter((v) => v && new RegExp(`\\b${v}\\b`).test(formula));
}

function fmtVal(v: number | null | undefined): string {
  if (v == null) return '';
  return v.toLocaleString('ja-JP', { maximumFractionDigits: 4 });
}

export const DependencyMap: React.FC<Props> = ({ components, parameters, propVars, shapeVars }) => {
  const [filterVarName, setFilterVarName] = useState<string | null>(null);

  // ── ソース変数マップを構築 ──
  const sourceMap = new Map<string, SourceInfo>();
  parameters.forEach((p) => {
    if (p.varName) sourceMap.set(p.varName, { varName: p.varName, type: 'param', value: p.value });
  });
  [...propVars, ...shapeVars].forEach((v) => {
    if (v.varName)
      sourceMap.set(v.varName, { varName: v.varName, type: 'crossref', value: v.value as number });
  });
  components
    .filter((c) => c.varName && c.inputType !== 'formula')
    .forEach((c) => {
      if (c.varName)
        sourceMap.set(c.varName, { varName: c.varName, type: 'compvar', compName: c.paramName });
    });

  const allVarNames = [...sourceMap.keys()];

  // ── 計算対象コンポーネント ──
  const formulaComps = components.filter((c) => c.inputType === 'formula');

  if (formulaComps.length === 0) {
    return (
      <div className="card-body text-center text-muted py-5">
        <i className="bi bi-diagram-3 fs-3 d-block mb-2 opacity-25" />
        <div style={{ fontSize: '0.88rem' }}>
          計算式（formula）を持つコンポーネントがありません。
        </div>
      </div>
    );
  }

  // ── 各 formulaComp の依存変数を算出 ──
  const compDeps = formulaComps.map((comp) => {
    const depVarNames = findRefs(comp.valueOrFormula, allVarNames);
    return { comp, depVarNames };
  });

  // ── フィルタリング（変数クリック時） ──
  const visibleComps =
    filterVarName == null
      ? compDeps
      : compDeps.filter((cd) => cd.depVarNames.includes(filterVarName));

  // ── 使われている変数の使用回数集計（サイドバー用） ──
  const usedVarCounts = new Map<string, number>();
  compDeps.forEach(({ depVarNames }) => {
    depVarNames.forEach((v) => usedVarCounts.set(v, (usedVarCounts.get(v) ?? 0) + 1));
  });
  const usedSources = [...sourceMap.entries()]
    .filter(([v]) => usedVarCounts.has(v))
    .sort((a, b) => (usedVarCounts.get(b[0]) ?? 0) - (usedVarCounts.get(a[0]) ?? 0));

  return (
    <div className="card-body p-0">
      <div className="d-flex" style={{ minHeight: 0 }}>
        {/* ── 左サイドバー: 変数一覧 ── */}
        <div
          className="border-end flex-shrink-0"
          style={{ width: 220, padding: '12px 10px', overflowY: 'auto', maxHeight: 520, fontSize: '0.76rem' }}
        >
          <div className="fw-semibold text-muted mb-2" style={{ fontSize: '0.70rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            参照されている変数
          </div>

          {/* 凡例 */}
          <div className="d-flex flex-column gap-1 mb-3">
            {(['param', 'crossref', 'compvar'] as SourceType[]).map((t) => (
              <span key={t} className="d-inline-flex align-items-center gap-1" style={{ fontSize: '0.68rem' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, display: 'inline-block', ...SOURCE_STYLE[t], border: 'none' }} />
                {SOURCE_LABEL[t]}
              </span>
            ))}
          </div>

          {/* フィルタ解除 */}
          {filterVarName != null && (
            <button
              className="btn btn-sm btn-outline-secondary w-100 mb-2"
              style={{ fontSize: '0.70rem', padding: '2px 6px' }}
              onClick={() => setFilterVarName(null)}
            >
              <i className="bi bi-x-circle me-1" />フィルタ解除
            </button>
          )}

          {/* 変数リスト */}
          {usedSources.length === 0 ? (
            <span className="text-muted" style={{ fontSize: '0.72rem' }}>（なし）</span>
          ) : (
            usedSources.map(([varName, info]) => {
              const count = usedVarCounts.get(varName) ?? 0;
              const active = filterVarName === varName;
              return (
                <div
                  key={varName}
                  className="d-flex align-items-center gap-1 rounded px-1 mb-1"
                  style={{
                    cursor: 'pointer',
                    background: active ? '#e0f2fe' : 'transparent',
                    border: active ? '1px solid #38bdf8' : '1px solid transparent',
                    padding: '3px 4px',
                    transition: 'background 0.1s',
                  }}
                  onClick={() => setFilterVarName(active ? null : varName)}
                  title={`${SOURCE_LABEL[info.type]}${info.value != null ? `  ${fmtVal(info.value)}` : info.compName ? `  ← ${info.compName}` : ''}`}
                >
                  <span
                    style={{ width: 6, height: 6, borderRadius: 1, display: 'inline-block', flexShrink: 0, ...SOURCE_STYLE[info.type], border: 'none' }}
                  />
                  <code style={{ fontSize: '0.72rem', flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {varName}
                  </code>
                  {count > 1 && (
                    <span className="badge bg-secondary" style={{ fontSize: '0.58rem', padding: '1px 4px' }}>{count}</span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* ── 右メイン: コンポーネントカード ── */}
        <div className="flex-grow-1 p-3 overflow-auto" style={{ maxHeight: 520 }}>
          {filterVarName && (
            <div className="alert alert-info py-1 px-2 mb-2" style={{ fontSize: '0.76rem' }}>
              <i className="bi bi-funnel me-1" />
              <code>{filterVarName}</code> を参照しているコンポーネントのみ表示中
            </div>
          )}

          {visibleComps.length === 0 ? (
            <div className="text-muted text-center py-4" style={{ fontSize: '0.84rem' }}>
              <i className="bi bi-search d-block fs-3 mb-2 opacity-25" />
              該当するコンポーネントがありません
            </div>
          ) : (
            <div className="d-flex flex-column gap-2">
              {visibleComps.map(({ comp, depVarNames }) => (
                <div
                  key={comp.id}
                  className="card"
                  style={{ borderColor: comp.inputType === 'formula' ? '#86efac' : '#c4b5fd', borderWidth: 1.5 }}
                >
                  <div className="card-body py-2 px-3">
                    {/* ヘッダー */}
                    <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                      <span className="fw-semibold" style={{ fontSize: '0.88rem' }}>{comp.paramName}</span>
                      {comp.varName && (
                        <code className="text-secondary" style={{ fontSize: '0.76rem' }}>({comp.varName})</code>
                      )}
                      <span
                        className="badge ms-auto"
                        style={
                          comp.inputType === 'formula'
                            ? { background: '#dcfce7', color: '#166534', border: '1px solid #86efac', fontSize: '0.62rem' }
                            : { background: '#ede9fe', color: '#5b21b6', border: '1px solid #c4b5fd', fontSize: '0.62rem' }
                        }
                      >
                        {comp.inputType === 'formula' ? '計算式' : '質量比'}
                      </span>
                    </div>

                    {/* 式 */}
                    <div
                      className="rounded px-2 py-1 mb-2"
                      style={{ background: '#f8fafc', border: '1px solid #e2e8f0', fontFamily: 'monospace', fontSize: '0.80rem', wordBreak: 'break-all', color: '#0f172a' }}
                    >
                      {comp.inputType === 'formula'
                        ? comp.valueOrFormula || <span className="text-muted fst-italic">（式なし）</span>
                        : <>親コンポーネントの <strong>{comp.valueOrFormula}%</strong></>}
                    </div>

                    {/* 依存変数チップ */}
                    {depVarNames.length > 0 ? (
                      <div className="d-flex gap-1 flex-wrap align-items-center">
                        <span className="text-muted me-1" style={{ fontSize: '0.70rem' }}>依存:</span>
                        {depVarNames.map((varName) => {
                          const info = sourceMap.get(varName);
                          if (!info) return null;
                          const st = SOURCE_STYLE[info.type];
                          const subtitle =
                            info.value != null
                              ? fmtVal(info.value)
                              : info.compName
                                ? `← ${info.compName}`
                                : '';
                          return (
                            <button
                              key={varName}
                              className="badge d-inline-flex align-items-center gap-1"
                              style={{
                                ...st,
                                border: filterVarName === varName ? '1.5px solid #0ea5e9' : st.border,
                                cursor: 'pointer',
                                fontFamily: 'monospace',
                                fontSize: '0.72rem',
                                padding: '2px 6px',
                                fontWeight: 400,
                              }}
                              title={`${SOURCE_LABEL[info.type]}`}
                              onClick={() => setFilterVarName(filterVarName === varName ? null : varName)}
                            >
                              {varName}
                              {subtitle && (
                                <span style={{ opacity: 0.65, fontSize: '0.65rem', marginLeft: 2 }}>
                                  {subtitle}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                        <i className="bi bi-exclamation-triangle me-1 text-warning" />
                        参照変数なし
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
