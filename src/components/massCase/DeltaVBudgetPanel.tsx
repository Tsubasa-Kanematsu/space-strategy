import React, { useState } from 'react';
import { useMassCaseStore } from '../../stores/massCaseStore';
import { useAnalysisStore } from '../../stores/analysisStore';
import type { DeltaVEntry, DeltaVBudget } from '../../types';
import { v4 as uuidv4 } from 'uuid';

interface Props {
  massCaseId: string;
}

const DEFAULT_ENTRIES: DeltaVEntry[] = [
  { key: 'required',      label: '要求ΔV',  varName: 'dv_required', value: 9500, source: 'manual' },
  { key: 'gravity_loss',  label: '重力損失', varName: 'dv_gravity',  value: 1200, source: 'manual' },
  { key: 'aero_loss',     label: '空力損失', varName: 'dv_aero',     value: 200,  source: 'manual' },
  { key: 'control_loss',  label: '制御損失', varName: 'dv_control',  value: 50,   source: 'manual' },
  { key: 'pressure_loss', label: '圧力損失', varName: 'dv_pressure', value: 100,  source: 'manual' },
];

const DEFAULT_BUDGET: DeltaVBudget = {
  entries: DEFAULT_ENTRIES,
  totalVarName: 'dv_total',
};

// BindModal: ΔVエントリに解析ケースをバインドする設定ダイアログ
const BindModal: React.FC<{
  entry: DeltaVEntry;
  projectId: string;
  onSave: (entry: DeltaVEntry) => void;
  onClose: () => void;
}> = ({ entry, projectId, onSave, onClose }) => {
  const allCases = useAnalysisStore((s) => s.cases);
  const projectCases = allCases.filter((c) => c.projectId === projectId);
  const [analysisCaseId, setAnalysisCaseId] = useState(entry.analysisBind?.analysisCaseId ?? '');
  const [resultLabel, setResultLabel] = useState(entry.analysisBind?.resultLabel ?? '');

  const resultsForCase = useAnalysisStore((s) =>
    analysisCaseId ? s.getResultsForCase(analysisCaseId) : []
  );

  const handleSave = () => {
    if (!analysisCaseId || !resultLabel.trim()) return;
    onSave({
      ...entry,
      source: 'analysis_bind',
      analysisBind: { analysisCaseId, resultLabel: resultLabel.trim() },
    });
  };

  const handleClear = () => {
    onSave({ ...entry, source: 'manual', analysisBind: undefined });
  };

  return (
    <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.35)', zIndex: 1060 }}>
      <div className="modal-dialog modal-sm">
        <div className="modal-content">
          <div className="modal-header py-2">
            <h6 className="modal-title" style={{ fontSize: '0.9rem' }}>
              <i className="bi bi-link-45deg me-2 text-info" />
              解析バインド設定
              <span className="ms-2 text-muted fw-normal" style={{ fontSize: '0.78rem' }}>
                {entry.label}
              </span>
            </h6>
            <button className="btn-close btn-sm" onClick={onClose} />
          </div>
          <div className="modal-body" style={{ fontSize: '0.85rem' }}>
            <div className="mb-3">
              <label className="form-label fw-medium">解析ケース</label>
              <select
                className="form-select form-select-sm"
                value={analysisCaseId}
                onChange={(e) => { setAnalysisCaseId(e.target.value); setResultLabel(''); }}
              >
                <option value="">（選択してください）</option>
                {projectCases.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="mb-3">
              <label className="form-label fw-medium">結果フィールド名</label>
              {resultsForCase.length > 0 ? (
                <select
                  className="form-select form-select-sm"
                  value={resultLabel}
                  onChange={(e) => setResultLabel(e.target.value)}
                >
                  <option value="">（選択してください）</option>
                  {resultsForCase.map((r) => (
                    <option key={r.id} value={r.label}>
                      {r.label}{r.unit ? ` [${r.unit}]` : ''} = {r.value}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="form-control form-control-sm"
                  placeholder="例: 空力損失"
                  value={resultLabel}
                  onChange={(e) => setResultLabel(e.target.value)}
                />
              )}
              <div className="form-text">解析結果のラベルと部分一致でバインドされます。</div>
            </div>

            {entry.source === 'analysis_bind' && (
              <button
                className="btn btn-sm btn-outline-danger w-100 mb-2"
                onClick={handleClear}
              >
                <i className="bi bi-x-circle me-1" />バインドを解除（手動に戻す）
              </button>
            )}
          </div>
          <div className="modal-footer py-2">
            <button className="btn btn-secondary btn-sm" onClick={onClose}>キャンセル</button>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleSave}
              disabled={!analysisCaseId || !resultLabel.trim()}
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// インライン編集セル
const EditableCell: React.FC<{
  value: string;
  onCommit: (v: string) => void;
  style?: React.CSSProperties;
  placeholder?: string;
}> = ({ value, onCommit, style, placeholder }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <input
        className="form-control form-control-sm"
        style={{ minWidth: 60, ...style }}
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { onCommit(draft); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { onCommit(draft); setEditing(false); }
          if (e.key === 'Escape') { setDraft(value); setEditing(false); }
        }}
        placeholder={placeholder}
      />
    );
  }
  return (
    <span
      style={{ cursor: 'pointer', ...style }}
      title="クリックして編集"
      onClick={() => { setDraft(value); setEditing(true); }}
    >
      {value || <span className="text-muted fst-italic" style={{ fontSize: '0.75em' }}>{placeholder ?? '—'}</span>}
    </span>
  );
};

export const DeltaVBudgetPanel: React.FC<Props> = ({ massCaseId }) => {
  const massCase = useMassCaseStore((s) => s.getCase(massCaseId));
  const updateDeltaVBudget = useMassCaseStore((s) => s.updateDeltaVBudget);

  const budget: DeltaVBudget = massCase?.deltaVBudget ?? DEFAULT_BUDGET;
  const entries = budget.entries;

  const [bindTarget, setBindTarget] = useState<string | null>(null); // key of entry being configured

  const totalDv = entries.reduce((sum, e) => sum + (e.value || 0), 0);
  const projectId = massCase?.projectId ?? '';

  const updateEntry = (key: string, patch: Partial<DeltaVEntry>) => {
    const newEntries = entries.map((e) => (e.key === key ? { ...e, ...patch } : e));
    updateDeltaVBudget(massCaseId, { ...budget, entries: newEntries });
  };

  const removeEntry = (key: string) => {
    const newEntries = entries.filter((e) => e.key !== key);
    updateDeltaVBudget(massCaseId, { ...budget, entries: newEntries });
  };

  const addEntry = () => {
    const newKey = `custom_${uuidv4().slice(0, 8)}`;
    const newEntry: DeltaVEntry = {
      key: newKey,
      label: '新しい項目',
      varName: `dv_custom_${entries.length + 1}`,
      value: 0,
      source: 'manual',
    };
    updateDeltaVBudget(massCaseId, { ...budget, entries: [...entries, newEntry] });
  };

  const bindingEntry = bindTarget ? entries.find((e) => e.key === bindTarget) : null;

  return (
    <div className="card mb-3">
      <div className="card-header d-flex align-items-center gap-2" style={{ fontSize: '0.85rem' }}>
        <i className="bi bi-graph-up text-primary" />
        <span className="fw-semibold">ΔVバジェット</span>
        <span className="text-muted ms-1" style={{ fontSize: '0.75rem' }}>
          （合計値は <code>dv_total</code> として formula スコープで参照可能）
        </span>
      </div>

      <div className="card-body p-0">
        <div className="table-responsive">
          <table className="table table-sm table-hover mb-0" style={{ fontSize: '0.83rem' }}>
            <thead className="table-light">
              <tr>
                <th style={{ width: 130 }}>ラベル</th>
                <th style={{ width: 120 }}>変数名</th>
                <th style={{ width: 100, textAlign: 'right' }}>値 (m/s)</th>
                <th style={{ width: 140 }}>ソース</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.key}>
                  <td>
                    <EditableCell
                      value={entry.label}
                      onCommit={(v) => updateEntry(entry.key, { label: v })}
                      placeholder="ラベル"
                    />
                  </td>
                  <td>
                    <EditableCell
                      value={entry.varName}
                      onCommit={(v) => updateEntry(entry.key, { varName: v })}
                      placeholder="変数名"
                      style={{ fontFamily: 'monospace', fontSize: '0.80rem' }}
                    />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <EditableCell
                      value={entry.value.toString()}
                      onCommit={(v) => {
                        const n = parseFloat(v);
                        if (!isNaN(n)) updateEntry(entry.key, { value: n });
                      }}
                      style={{ textAlign: 'right', minWidth: 70 }}
                    />
                  </td>
                  <td>
                    {entry.source === 'analysis_bind' && entry.analysisBind ? (
                      <span className="badge bg-info-subtle text-info border border-info-subtle d-inline-flex align-items-center gap-1" style={{ fontSize: '0.68rem' }}>
                        <i className="bi bi-link-45deg" />
                        自動バインド
                      </span>
                    ) : (
                      <span className="text-muted" style={{ fontSize: '0.75rem' }}>手動</span>
                    )}
                  </td>
                  <td>
                    <div className="d-flex gap-1 justify-content-end">
                      <button
                        className="btn btn-xs btn-outline-info"
                        style={{ fontSize: '0.68rem', padding: '1px 5px' }}
                        title="解析バインドを設定"
                        onClick={() => setBindTarget(entry.key)}
                      >
                        <i className="bi bi-link-45deg" />
                      </button>
                      <button
                        className="btn btn-xs btn-outline-danger"
                        style={{ fontSize: '0.68rem', padding: '1px 5px' }}
                        title="削除"
                        onClick={() => removeEntry(entry.key)}
                      >
                        <i className="bi bi-x" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="table-light fw-semibold">
                <td>合計</td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.80rem', color: '#0f172a' }}>
                  {budget.totalVarName}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {totalDv.toLocaleString('ja-JP', { maximumFractionDigits: 1 })}
                </td>
                <td><span className="text-muted" style={{ fontSize: '0.75rem' }}>自動計算</span></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="p-2 border-top">
          <button className="btn btn-sm btn-outline-secondary" onClick={addEntry} style={{ fontSize: '0.78rem' }}>
            <i className="bi bi-plus-lg me-1" />エントリ追加
          </button>
        </div>
      </div>

      {/* 注意書き */}
      <div className="card-footer py-1 px-3" style={{ background: '#f8fafc', fontSize: '0.73rem', color: '#64748b' }}>
        <i className="bi bi-info-circle me-1" />
        各変数名は formula コンポーネントの式から直接参照できます。例: <code>exp(dv_total / (isp * 9.80665)) - 1</code>
      </div>

      {/* バインドモーダル */}
      {bindingEntry && (
        <BindModal
          entry={bindingEntry}
          projectId={projectId}
          onSave={(updated) => {
            updateEntry(bindingEntry.key, updated);
            setBindTarget(null);
          }}
          onClose={() => setBindTarget(null)}
        />
      )}
    </div>
  );
};
