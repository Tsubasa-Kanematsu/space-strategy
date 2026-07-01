import React, { useState, useMemo } from 'react';
import { useMassCaseStore } from '../../stores/massCaseStore';
import { useAppStore } from '../../stores/appStore';
import { v4 as uuidv4 } from 'uuid';
import type { MassComponent, ErrorSourceEntry } from '../../types';

const STAGE_LABELS: Record<string, string> = {
  all: '全機', payload: 'PL', pbs: 'PBS',
  stage1: '1段', stage2: '2段', stage3: '3段', stage4: '4段',
};

const AXIS_OPTIONS = ['全軸', 'X', 'Y', 'Z', 'XY', 'XZ', 'YZ'];
const UNIT_PRESETS = ['m/s²', 'deg/s', 'deg', 'mm', 'm', '%', 'Pa', 'N'];

interface EntryRowProps {
  entry: ErrorSourceEntry;
  onUpdate: (e: ErrorSourceEntry) => void;
  onDelete: () => void;
}

const EntryRow: React.FC<EntryRowProps> = ({ entry, onUpdate, onDelete }) => {
  const [editField, setEditField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const startEdit = (field: string, current: string) => { setEditField(field); setEditValue(current); };
  const commit = (field: keyof ErrorSourceEntry) => {
    if (field === 'value3sigma') {
      onUpdate({ ...entry, [field]: editValue === '' ? null : parseFloat(editValue) });
    } else {
      onUpdate({ ...entry, [field]: editValue });
    }
    setEditField(null);
  };

  const cell = (field: keyof ErrorSourceEntry, placeholder = '') => {
    if (editField === field) {
      return (
        <input
          className="form-control form-control-sm"
          style={{ minWidth: 80 }}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => commit(field)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(field); if (e.key === 'Escape') setEditField(null); }}
          autoFocus
        />
      );
    }
    const val = entry[field];
    return (
      <span className="editable-cell" onClick={() => startEdit(field, val?.toString() ?? '')}>
        {val !== null && val !== undefined && val !== '' ? val : <span className="text-muted fst-italic">{placeholder}</span>}
      </span>
    );
  };

  return (
    <tr>
      <td>{cell('errorType', '誤差タイプ')}</td>
      <td>
        {editField === 'axis' ? (
          <select
            className="form-select form-select-sm"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => commit('axis')}
            autoFocus
          >
            {AXIS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <span className="badge bg-light text-dark border editable-cell" onClick={() => startEdit('axis', entry.axis || '全軸')}>
            {entry.axis || '全軸'}
          </span>
        )}
      </td>
      <td className="font-monospace">{cell('value3sigma', '—')}</td>
      <td>
        {editField === 'unit' ? (
          <select
            className="form-select form-select-sm"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => commit('unit')}
            autoFocus
          >
            <option value="">—</option>
            {UNIT_PRESETS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        ) : (
          <span className="editable-cell" onClick={() => startEdit('unit', entry.unit)}>
            {entry.unit || <span className="text-muted fst-italic">単位</span>}
          </span>
        )}
      </td>
      <td>{cell('note', '—')}</td>
      <td className="col-actions">
        <button className="btn btn-sm btn-outline-danger" onClick={onDelete} title="削除">
          <i className="bi bi-trash" />
        </button>
      </td>
    </tr>
  );
};

interface ComponentSectionProps {
  comp: MassComponent;
  depth: number;
  isCollapsed: boolean;
  hasChildren: boolean;
  onToggle: () => void;
  onAddEntry: () => void;
  onUpdateEntry: (entryId: string, e: ErrorSourceEntry) => void;
  onDeleteEntry: (entryId: string) => void;
}

const ComponentSection: React.FC<ComponentSectionProps> = ({
  comp, depth, isCollapsed, hasChildren, onToggle, onAddEntry, onUpdateEntry, onDeleteEntry,
}) => {
  const entries = comp.errorSources ?? [];

  return (
    <>
      <tr className={`table-light ${depth === 0 ? 'fw-semibold' : ''}`}>
        <td colSpan={6} style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}>
          <div className="d-flex align-items-center gap-2">
            {hasChildren ? (
              <button
                className="btn btn-sm p-0 text-muted"
                style={{ width: 20, height: 20, lineHeight: 1 }}
                onClick={onToggle}
              >
                <i className={`bi bi-chevron-${isCollapsed ? 'right' : 'down'}`} style={{ fontSize: 11 }} />
              </button>
            ) : <span style={{ width: 20, display: 'inline-block' }} />}
            <i className={`bi bi-${hasChildren ? 'diagram-2' : 'box'} text-muted`} style={{ fontSize: 11 }} />
            <span>{comp.paramName}</span>
            <span className="badge bg-light text-dark border ms-1" style={{ fontSize: '0.68rem' }}>
              {STAGE_LABELS[comp.stage] ?? comp.stage}
            </span>
            <button className="btn btn-sm btn-outline-primary ms-auto py-0 px-1" onClick={onAddEntry} title="誤差源を追加">
              <i className="bi bi-plus" style={{ fontSize: 11 }} /> 誤差源追加
            </button>
          </div>
        </td>
      </tr>
      {entries.map((entry) => (
        <EntryRow
          key={entry.id}
          entry={entry}
          onUpdate={(e) => onUpdateEntry(entry.id, e)}
          onDelete={() => onDeleteEntry(entry.id)}
        />
      ))}
    </>
  );
};

export const ErrorSourceView: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { massCaseId } = useAppStore();
  const cases = useMassCaseStore((s) => s.cases);
  const allComponents = useMassCaseStore((s) => s.components);
  const getComponentsForCase = useMassCaseStore((s) => s.getComponentsForCase);
  const updateComponent = useMassCaseStore((s) => s.updateComponent);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const massCase = cases.find((c) => c.id === massCaseId) ?? null;
  const components = useMemo(
    () => massCaseId ? getComponentsForCase(massCaseId) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allComponents, massCaseId],
  );

  const childrenOf = useMemo(() => {
    const map = new Map<string | null, MassComponent[]>();
    components.forEach((c) => {
      const key = c.parentId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    });
    map.forEach((arr) => arr.sort((a, b) => a.order - b.order));
    return map;
  }, [components]);

  const flattenTree = (parentId: string | null, depth: number): { comp: MassComponent; depth: number }[] => {
    const children = childrenOf.get(parentId) ?? [];
    const result: { comp: MassComponent; depth: number }[] = [];
    for (const child of children) {
      result.push({ comp: child, depth });
      if (!collapsed.has(child.id)) {
        result.push(...flattenTree(child.logicalId || child.id, depth + 1));
      }
    }
    return result;
  };

  const rows = flattenTree(null, 0);

  const addEntry = (comp: MassComponent) => {
    const newEntry: ErrorSourceEntry = {
      id: uuidv4(),
      errorType: '',
      axis: '全軸',
      value3sigma: null,
      unit: '',
      note: '',
    };
    updateComponent(comp.id, { errorSources: [...(comp.errorSources ?? []), newEntry] });
  };

  const updateEntry = (comp: MassComponent, entryId: string, updated: ErrorSourceEntry) => {
    updateComponent(comp.id, {
      errorSources: (comp.errorSources ?? []).map((e) => e.id === entryId ? updated : e),
    });
  };

  const deleteEntry = (comp: MassComponent, entryId: string) => {
    updateComponent(comp.id, {
      errorSources: (comp.errorSources ?? []).filter((e) => e.id !== entryId),
    });
  };

  if (!massCaseId || !massCase) {
    return <div className="text-muted p-4">ロケットデータベースが選択されていません。</div>;
  }

  return (
    <div>
      {!embedded && (
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h1 className="page-title">
            <i className="bi bi-exclamation-diamond me-2 text-primary" />
            誤差源 — {massCase.name}
          </h1>
          <small className="text-muted">コンポーネントごとに誤差源を管理します。クリックで編集。</small>
        </div>
      )}

      <div className="card">
        <div className="table-responsive">
          <table className="table table-sm mb-0">
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>コンポーネント / 誤差タイプ</th>
                <th style={{ width: 80 }}>軸</th>
                <th style={{ width: 100 }}>3σ値</th>
                <th style={{ width: 90 }}>単位</th>
                <th>備考</th>
                <th className="col-actions" style={{ width: 60 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-5">
                    <i className="bi bi-exclamation-diamond fs-3 d-block mb-2 opacity-25" />
                    コンポーネントがありません。先にコンポーネント構成を作成してください。
                  </td>
                </tr>
              ) : (
                rows.map(({ comp, depth }) => (
                  <ComponentSection
                    key={comp.id}
                    comp={comp}
                    depth={depth}
                    isCollapsed={collapsed.has(comp.id)}
                    hasChildren={(childrenOf.get(comp.logicalId || comp.id)?.length ?? 0) > 0}
                    onToggle={() => setCollapsed((prev) => {
                      const next = new Set(prev);
                      if (next.has(comp.id)) next.delete(comp.id); else next.add(comp.id);
                      return next;
                    })}
                    onAddEntry={() => addEntry(comp)}
                    onUpdateEntry={(entryId, e) => updateEntry(comp, entryId, e)}
                    onDeleteEntry={(entryId) => deleteEntry(comp, entryId)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
