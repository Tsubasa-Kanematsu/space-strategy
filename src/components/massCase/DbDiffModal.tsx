import React, { useMemo, useState } from 'react';
import { useMassCaseStore } from '../../stores/massCaseStore';
import type { MassCase, MassComponent, Parameter } from '../../types';

interface Props {
  caseA: MassCase;
  caseB: MassCase;
  onClose: () => void;
}

type DiffStatus = 'added' | 'removed' | 'changed' | 'same';

interface CompDiffRow {
  varName: string;
  paramName: string;
  status: DiffStatus;
  changes: { field: string; oldVal: string; newVal: string }[];
}

interface ParamDiffRow {
  varName: string;
  name: string;
  status: DiffStatus;
  changes: { field: string; oldVal: string; newVal: string }[];
}

function tagIdsToNames(ids: string[], tagDefs: { id: string; name: string }[]): string {
  return ids.map((id) => tagDefs.find((d) => d.id === id)?.name ?? id).join(';');
}

function diffComponents(
  compsA: MassComponent[],
  compsB: MassComponent[],
  tagDefsA: { id: string; name: string }[],
  tagDefsB: { id: string; name: string }[],
): CompDiffRow[] {
  const mapA = new Map(compsA.map((c) => [c.varName, c]));
  const mapB = new Map(compsB.map((c) => [c.varName, c]));
  const allVars = Array.from(new Set([...mapA.keys(), ...mapB.keys()]));

  return allVars.map((varName) => {
    const a = mapA.get(varName);
    const b = mapB.get(varName);

    if (!a) return { varName, paramName: b!.paramName, status: 'added', changes: [] };
    if (!b) return { varName, paramName: a.paramName, status: 'removed', changes: [] };

    const changes: { field: string; oldVal: string; newVal: string }[] = [];
    const check = (field: string, va: unknown, vb: unknown) => {
      const sa = String(va ?? '');
      const sb = String(vb ?? '');
      if (sa !== sb) changes.push({ field, oldVal: sa, newVal: sb });
    };

    check('inputType', a.inputType, b.inputType);
    check('数式/値', a.valueOrFormula, b.valueOrFormula);
    check('ステージ', a.stage, b.stage);
    check('タグ', tagIdsToNames(a.tags ?? [], tagDefsA), tagIdsToNames(b.tags ?? [], tagDefsB));
    check('実質量', a.actualMass, b.actualMass);

    return {
      varName,
      paramName: b.paramName,
      status: changes.length > 0 ? 'changed' : 'same',
      changes,
    };
  });
}

function diffParams(
  paramsA: Parameter[],
  paramsB: Parameter[],
): ParamDiffRow[] {
  const mapA = new Map(paramsA.map((p) => [p.varName, p]));
  const mapB = new Map(paramsB.map((p) => [p.varName, p]));
  const allVars = Array.from(new Set([...mapA.keys(), ...mapB.keys()]));

  return allVars.map((varName) => {
    const a = mapA.get(varName);
    const b = mapB.get(varName);

    if (!a) return { varName, name: b!.name, status: 'added', changes: [] };
    if (!b) return { varName, name: a.name, status: 'removed', changes: [] };

    const changes: { field: string; oldVal: string; newVal: string }[] = [];
    const check = (field: string, va: unknown, vb: unknown) => {
      const sa = String(va ?? '');
      const sb = String(vb ?? '');
      if (sa !== sb) changes.push({ field, oldVal: sa, newVal: sb });
    };

    check('inputType', a.inputType, b.inputType);
    check('値', a.value, b.value);
    check('数式', a.formula, b.formula);

    return {
      varName,
      name: b.name,
      status: changes.length > 0 ? 'changed' : 'same',
      changes,
    };
  });
}

const STATUS_STYLE: Record<DiffStatus, { bg: string; label: string; color: string }> = {
  added:   { bg: '#e6f4ea', label: '追加',   color: '#1b5e20' },
  removed: { bg: '#fce8e6', label: '削除',   color: '#b71c1c' },
  changed: { bg: '#fff8e1', label: '変更',   color: '#e65100' },
  same:    { bg: 'transparent', label: '同一', color: '#6c757d' },
};

export const DbDiffModal: React.FC<Props> = ({ caseA, caseB, onClose }) => {
  const getComponentsForCase = useMassCaseStore((s) => s.getComponentsForCase);
  const getParametersForCase = useMassCaseStore((s) => s.getParametersForCase);

  const [showSame, setShowSame] = useState(false);
  const [activeSection, setActiveSection] = useState<'components' | 'params'>('components');

  const compDiff = useMemo(
    () => diffComponents(
      getComponentsForCase(caseA.id),
      getComponentsForCase(caseB.id),
      caseA.tagDefinitions ?? [],
      caseB.tagDefinitions ?? [],
    ),
    [caseA, caseB, getComponentsForCase],
  );
  const paramDiff = useMemo(
    () => diffParams(getParametersForCase(caseA.id), getParametersForCase(caseB.id)),
    [caseA.id, caseB.id, getParametersForCase],
  );

  const compCounts = {
    added:   compDiff.filter((r) => r.status === 'added').length,
    removed: compDiff.filter((r) => r.status === 'removed').length,
    changed: compDiff.filter((r) => r.status === 'changed').length,
  };
  const paramCounts = {
    added:   paramDiff.filter((r) => r.status === 'added').length,
    removed: paramDiff.filter((r) => r.status === 'removed').length,
    changed: paramDiff.filter((r) => r.status === 'changed').length,
  };

  const visibleComp  = showSame ? compDiff  : compDiff.filter((r)  => r.status !== 'same');
  const visibleParam = showSame ? paramDiff : paramDiff.filter((r) => r.status !== 'same');

  const renderBadge = (status: DiffStatus) => {
    const s = STATUS_STYLE[status];
    if (status === 'same') return null;
    return (
      <span style={{
        background: s.bg, color: s.color,
        fontSize: '0.68rem', fontWeight: 600,
        padding: '1px 6px', borderRadius: 100,
      }}>
        {s.label}
      </span>
    );
  };

  return (
    <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="modal-dialog modal-xl">
        <div className="modal-content">
          <div className="modal-header py-2">
            <h6 className="modal-title d-flex align-items-center gap-2">
              <i className="bi bi-subtract text-primary" />
              DB比較
            </h6>
            <button className="btn-close btn-sm" onClick={onClose} />
          </div>

          {/* 比較対象ヘッダー */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', background: '#f8f9fa', borderBottom: '1px solid #e9ecef', padding: '8px 20px', gap: 8, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: '#6c757d', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>比較元 A</div>
              <div className="fw-semibold" style={{ color: '#1558c0', fontSize: '0.9rem' }}>
                <i className="bi bi-database me-1" />{caseA.name}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#6c757d' }}>{caseA.createdAt.slice(0, 10)}</div>
            </div>
            <div className="text-center text-muted" style={{ fontSize: '1.2rem' }}>→</div>
            <div>
              <div style={{ fontSize: '0.7rem', color: '#6c757d', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>比較先 B</div>
              <div className="fw-semibold" style={{ color: '#1558c0', fontSize: '0.9rem' }}>
                <i className="bi bi-database me-1" />{caseB.name}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#6c757d' }}>{caseB.createdAt.slice(0, 10)}</div>
            </div>
          </div>

          {/* サマリーバッジ */}
          <div className="d-flex align-items-center gap-2 px-3 py-2 border-bottom flex-wrap">
            {(['added', 'removed', 'changed'] as DiffStatus[]).map((s) => {
              const cnt = activeSection === 'components' ? compCounts[s as keyof typeof compCounts] : paramCounts[s as keyof typeof paramCounts];
              if (cnt === 0) return null;
              const style = STATUS_STYLE[s];
              return (
                <span key={s} style={{ background: style.bg, color: style.color, fontSize: '0.75rem', fontWeight: 600, padding: '2px 10px', borderRadius: 100 }}>
                  {style.label} {cnt}
                </span>
              );
            })}
            <label className="ms-auto d-flex align-items-center gap-1" style={{ fontSize: '0.78rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                className="form-check-input"
                style={{ marginTop: 0 }}
                checked={showSame}
                onChange={(e) => setShowSame(e.target.checked)}
              />
              差分なしも表示
            </label>
          </div>

          {/* タブ */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e9ecef', padding: '0 16px', gap: 0 }}>
            {([['components', 'コンポーネント', compCounts], ['params', 'パラメータ', paramCounts]] as const).map(([key, label, counts]) => {
              const total = counts.added + counts.removed + counts.changed;
              return (
                <button
                  key={key}
                  className={`content-tab ${activeSection === key ? 'active' : ''}`}
                  onClick={() => setActiveSection(key)}
                >
                  {label}
                  {total > 0 && (
                    <span style={{ background: '#1a73e8', color: '#fff', fontSize: '0.65rem', fontWeight: 700, padding: '0 5px', borderRadius: 100, marginLeft: 4 }}>
                      {total}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="modal-body p-0" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
            {activeSection === 'components' && (
              <table className="table table-hover mb-0" style={{ fontSize: '0.82rem' }}>
                <thead className="table-light sticky-top">
                  <tr>
                    <th style={{ width: 80 }}>状態</th>
                    <th>表示名</th>
                    <th style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>varName</th>
                    <th>変更内容</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleComp.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center text-muted py-4" style={{ fontSize: '0.85rem' }}>
                        差分はありません
                      </td>
                    </tr>
                  )}
                  {visibleComp.map((row) => (
                    <tr key={row.varName} style={{ background: row.status !== 'same' ? STATUS_STYLE[row.status].bg : undefined }}>
                      <td>{renderBadge(row.status)}</td>
                      <td>{row.paramName}</td>
                      <td style={{ fontFamily: 'monospace', color: '#495057' }}>{row.varName}</td>
                      <td>
                        {row.status === 'added' && <span className="text-muted" style={{ fontSize: '0.78rem' }}>新規追加</span>}
                        {row.status === 'removed' && <span className="text-muted" style={{ fontSize: '0.78rem' }}>削除済み</span>}
                        {row.status === 'changed' && (
                          <div className="d-flex flex-wrap gap-2">
                            {row.changes.map((ch) => (
                              <span key={ch.field} style={{ fontSize: '0.75rem' }}>
                                <span className="text-muted">{ch.field}:</span>{' '}
                                <span style={{ color: '#b71c1c', textDecoration: 'line-through' }}>{ch.oldVal || '—'}</span>
                                {' → '}
                                <span style={{ color: '#1b5e20', fontWeight: 600 }}>{ch.newVal || '—'}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {activeSection === 'params' && (
              <table className="table table-hover mb-0" style={{ fontSize: '0.82rem' }}>
                <thead className="table-light sticky-top">
                  <tr>
                    <th style={{ width: 80 }}>状態</th>
                    <th>パラメータ名</th>
                    <th style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>varName</th>
                    <th>変更内容</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleParam.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center text-muted py-4" style={{ fontSize: '0.85rem' }}>
                        差分はありません
                      </td>
                    </tr>
                  )}
                  {visibleParam.map((row) => (
                    <tr key={row.varName} style={{ background: row.status !== 'same' ? STATUS_STYLE[row.status].bg : undefined }}>
                      <td>{renderBadge(row.status)}</td>
                      <td>{row.name}</td>
                      <td style={{ fontFamily: 'monospace', color: '#495057' }}>{row.varName}</td>
                      <td>
                        {row.status === 'added' && <span className="text-muted" style={{ fontSize: '0.78rem' }}>新規追加</span>}
                        {row.status === 'removed' && <span className="text-muted" style={{ fontSize: '0.78rem' }}>削除済み</span>}
                        {row.status === 'changed' && (
                          <div className="d-flex flex-wrap gap-2">
                            {row.changes.map((ch) => (
                              <span key={ch.field} style={{ fontSize: '0.75rem' }}>
                                <span className="text-muted">{ch.field}:</span>{' '}
                                <span style={{ color: '#b71c1c', textDecoration: 'line-through' }}>{ch.oldVal || '—'}</span>
                                {' → '}
                                <span style={{ color: '#1b5e20', fontWeight: 600 }}>{ch.newVal || '—'}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="modal-footer py-2">
            <button className="btn btn-secondary btn-sm" onClick={onClose}>閉じる</button>
          </div>
        </div>
      </div>
    </div>
  );
};
