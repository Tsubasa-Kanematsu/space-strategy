import React, { useMemo } from 'react';
import { useMassCaseStore } from '../../stores/massCaseStore';
import { useAppStore } from '../../stores/appStore';
import type { MassComponent } from '../../types';
import { SHAPE_TYPES } from '../../utils/materialPresets';
import { STAGE_LABELS } from '../../utils/constants';

export const DebrisShapeView: React.FC = () => {
  const { massCaseId } = useAppStore();
  const cases = useMassCaseStore((s) => s.cases);
  const allComponents = useMassCaseStore((s) => s.components);
  const getComponentsForCase = useMassCaseStore((s) => s.getComponentsForCase);
  const updateComponent = useMassCaseStore((s) => s.updateComponent);

  const massCase = cases.find((c) => c.id === massCaseId) ?? null;
  const components = useMemo(
    () => massCaseId ? getComponentsForCase(massCaseId) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allComponents, massCaseId],
  );

  const childrenOf = useMemo(() => {
    const map = new Map<string | null, MassComponent[]>();
    components.forEach((c) => {
      if (!map.has(c.parentId)) map.set(c.parentId, []);
      map.get(c.parentId)!.push(c);
    });
    map.forEach((arr) => arr.sort((a, b) => a.order - b.order));
    return map;
  }, [components]);

  const flattenTree = (parentId: string | null, depth: number): { comp: MassComponent; depth: number }[] => {
    const children = childrenOf.get(parentId) ?? [];
    return children.flatMap((c) => [{ comp: c, depth }, ...flattenTree(c.logicalId || c.id, depth + 1)]);
  };

  const rows = flattenTree(null, 0);

  const numInput = (
    id: string,
    field: 'debrisCharLength' | 'debrisDiameter' | 'debrisArea',
    value: number | null | undefined,
    step = '0.001'
  ) => (
    <input
      className="form-control form-control-sm text-end font-monospace"
      style={{ width: 90 }}
      type="number"
      step={step}
      value={value ?? ''}
      placeholder="—"
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        updateComponent(id, { [field]: isNaN(v) ? null : v });
      }}
    />
  );

  if (!massCaseId || !massCase) {
    return <div className="text-muted p-4">ロケットデータベースが選択されていません。</div>;
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="page-title">
          <i className="bi bi-hexagon me-2 text-primary" />
          破片形状 — {massCase.name}
        </h1>
      </div>

      <div className="alert alert-info d-flex align-items-start gap-2 py-2 mb-3">
        <i className="bi bi-info-circle mt-1 flex-shrink-0" />
        <small>
          各コンポーネントの破片形状情報を入力してください。
          形状タイプ・代表長さ (m)・直径 (m)・断面積 (m²) を記録できます。
          落下速度推定・安全解析などに利用します。
        </small>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>コンポーネント名</th>
                <th>段</th>
                <th style={{ minWidth: 120 }}>形状タイプ</th>
                <th className="text-end" style={{ minWidth: 100 }}>代表長さ (m)</th>
                <th className="text-end" style={{ minWidth: 100 }}>直径 (m)</th>
                <th className="text-end" style={{ minWidth: 100 }}>断面積 (m²)</th>
                <th style={{ minWidth: 160 }}>備考</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-muted py-4">
                    コンポーネントがありません
                  </td>
                </tr>
              ) : (
                rows.map(({ comp, depth }) => {
                  return (
                    <tr key={comp.id} className={depth === 0 ? 'table-light fw-semibold' : ''}>
                      <td style={{ paddingLeft: `${0.875 + depth * 1.25}rem` }}>
                        <i className={`bi bi-${depth === 0 ? 'diagram-2' : 'box'} me-1 text-muted`} style={{ fontSize: 11 }} />
                        {comp.paramName}
                      </td>
                      <td>
                        <span className="badge bg-light text-dark border" style={{ fontSize: '0.75rem' }}>
                          {STAGE_LABELS[comp.stage] ?? comp.stage}
                        </span>
                      </td>
                      <td>
                        <select
                          className="form-select form-select-sm"
                          value={comp.debrisShapeType ?? ''}
                          onChange={(e) => updateComponent(comp.id, { debrisShapeType: e.target.value })}
                        >
                          {SHAPE_TYPES.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="text-end">{numInput(comp.id, 'debrisCharLength', comp.debrisCharLength)}</td>
                      <td className="text-end">{numInput(comp.id, 'debrisDiameter', comp.debrisDiameter)}</td>
                      <td className="text-end">{numInput(comp.id, 'debrisArea', comp.debrisArea)}</td>
                      <td>
                        <input
                          className="form-control form-control-sm"
                          value={comp.debrisNote ?? ''}
                          placeholder="備考"
                          onChange={(e) => updateComponent(comp.id, { debrisNote: e.target.value })}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
