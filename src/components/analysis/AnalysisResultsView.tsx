import React, { useRef, useState } from 'react';
import { useAnalysisStore } from '../../stores/analysisStore';
import { useAppStore } from '../../stores/appStore';
import type { AnalysisCase, AnalysisResult, AnalysisServiceType, AeroDataEntry, AeroDataSet } from '../../types';
import { SERVICE_META } from './analysisServiceMeta';
import { FlightAnalysisResultsView } from './FlightAnalysisResultsView';

interface FormState {
  label: string;
  value: string;
  unit: string;
  notes: string;
}

const emptyForm = (): FormState => ({ label: '', value: '', unit: '', notes: '' });

// ============================================================
// 空力解析専用ビュー
// ============================================================

const emptyAeroDataSet = (): AeroDataSet => ({
  referenceAreaM2: 0,
  referenceLengthM: 0,
  entries: [],
});

const AeroResultsView: React.FC<{ analysisCase: AnalysisCase }> = ({ analysisCase }) => {
  const updateCase = useAnalysisStore((s) => s.updateCase);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cond = analysisCase.condition ?? {};
  const aeroData: AeroDataSet = (cond.aeroData as AeroDataSet | undefined) ?? emptyAeroDataSet();

  const saveAeroData = (next: AeroDataSet) => {
    updateCase(analysisCase.id, { condition: { ...cond, aeroData: next } });
  };

  const updateRefArea = (v: number) => saveAeroData({ ...aeroData, referenceAreaM2: v });
  const updateRefLen = (v: number) => saveAeroData({ ...aeroData, referenceLengthM: v });

  const addRow = () => {
    const entries = [
      ...aeroData.entries,
      { mach: 1.0, aoaDeg: 0, ca: 0, cn: 0, xcpM: undefined },
    ];
    saveAeroData({ ...aeroData, entries });
  };

  const updateEntry = (idx: number, patch: Partial<AeroDataEntry>) => {
    const entries = aeroData.entries.map((e, i) => (i === idx ? { ...e, ...patch } : e));
    saveAeroData({ ...aeroData, entries });
  };

  const deleteEntry = (idx: number) => {
    const entries = aeroData.entries.filter((_, i) => i !== idx);
    saveAeroData({ ...aeroData, entries });
  };

  // CSV インポート: mach,aoa_deg,ca,cn,xcp_m (ヘッダー必須)
  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.trim().split('\n');
      if (lines.length < 2) return;
      const header = lines[0].toLowerCase().split(',').map((h) => h.trim());
      const iMach = header.indexOf('mach');
      const iAoa  = header.indexOf('aoa_deg');
      const iCa   = header.indexOf('ca');
      const iCn   = header.indexOf('cn');
      const iXcp  = header.indexOf('xcp_m');
      if (iMach < 0 || iAoa < 0 || iCa < 0 || iCn < 0) {
        alert('CSVヘッダーに mach, aoa_deg, ca, cn が必要です。');
        return;
      }
      const entries: AeroDataEntry[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.trim());
        const mach   = parseFloat(cols[iMach]);
        const aoaDeg = parseFloat(cols[iAoa]);
        const ca     = parseFloat(cols[iCa]);
        const cn     = parseFloat(cols[iCn]);
        const xcpM   = iXcp >= 0 ? parseFloat(cols[iXcp]) : undefined;
        if (isNaN(mach) || isNaN(aoaDeg) || isNaN(ca) || isNaN(cn)) continue;
        entries.push({ mach, aoaDeg, ca, cn, xcpM: xcpM !== undefined && !isNaN(xcpM) ? xcpM : undefined });
      }
      saveAeroData({ ...aeroData, entries: [...aeroData.entries, ...entries] });
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  // CSV エクスポート
  const handleCsvExport = () => {
    const rows = ['mach,aoa_deg,ca,cn,xcp_m'];
    for (const e of aeroData.entries) {
      rows.push(`${e.mach},${e.aoaDeg},${e.ca},${e.cn},${e.xcpM ?? ''}`);
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aero_${analysisCase.name}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const numCell = (
    value: number | undefined,
    onChange: (v: number) => void,
    step = '0.001',
    placeholder = '—',
  ) => (
    <input
      type="number"
      className="form-control form-control-sm text-end font-monospace"
      style={{ width: 90 }}
      step={step}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (!isNaN(v)) onChange(v);
      }}
    />
  );

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="page-title">
          <i className="bi bi-wind me-2 text-primary" />
          空力解析結果 — {analysisCase.name}
        </h1>
        <div className="d-flex gap-2">
          <button className="btn btn-sm btn-outline-secondary" onClick={handleCsvExport}>
            <i className="bi bi-download me-1" />CSVエクスポート
          </button>
          <label className="btn btn-sm btn-outline-primary mb-0" title="CSVインポート (mach,aoa_deg,ca,cn,xcp_m)">
            <i className="bi bi-upload me-1" />CSVインポート
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="d-none"
              onChange={handleCsvImport}
            />
          </label>
          <button className="btn btn-sm btn-primary" onClick={addRow}>
            <i className="bi bi-plus-lg me-1" />行を追加
          </button>
        </div>
      </div>

      {/* 基準値 */}
      <div className="card p-3 mb-3">
        <h6 className="fw-semibold mb-2" style={{ fontSize: '0.85rem' }}>
          <i className="bi bi-rulers me-2 text-primary" />基準値
        </h6>
        <div className="row g-3">
          <div className="col-auto">
            <label className="form-label mb-1" style={{ fontSize: '0.82rem' }}>
              基準面積 (m²)
            </label>
            <input
              type="number"
              className="form-control form-control-sm font-monospace"
              style={{ width: 120 }}
              step="0.0001"
              value={aeroData.referenceAreaM2 || ''}
              placeholder="例: 0.785"
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v)) updateRefArea(v);
              }}
            />
          </div>
          <div className="col-auto">
            <label className="form-label mb-1" style={{ fontSize: '0.82rem' }}>
              基準長さ (m)
            </label>
            <input
              type="number"
              className="form-control form-control-sm font-monospace"
              style={{ width: 120 }}
              step="0.001"
              value={aeroData.referenceLengthM || ''}
              placeholder="例: 1.0"
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v)) updateRefLen(v);
              }}
            />
          </div>
        </div>
      </div>

      {/* 空力係数テーブル */}
      <div className="card">
        <div className="card-header d-flex align-items-center gap-2" style={{ fontSize: '0.85rem' }}>
          <i className="bi bi-table text-primary" />
          <span className="fw-semibold">Mach × AoA 空力係数テーブル</span>
          <span className="text-muted ms-auto">
            {aeroData.entries.length} 行
          </span>
        </div>
        <div className="table-responsive">
          <table className="table table-hover mb-0" style={{ fontSize: '0.83rem' }}>
            <thead>
              <tr>
                <th style={{ width: 40 }}>No.</th>
                <th className="text-end" style={{ width: 110 }}>Mach</th>
                <th className="text-end" style={{ width: 100 }}>AoA (°)</th>
                <th className="text-end" style={{ width: 110 }}>Ca</th>
                <th className="text-end" style={{ width: 130 }}>Cn (1/rad)</th>
                <th className="text-end" style={{ width: 120 }}>Xcp (m)</th>
                <th style={{ width: 50 }}></th>
              </tr>
            </thead>
            <tbody>
              {aeroData.entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-muted py-5">
                    <i className="bi bi-wind fs-3 d-block mb-2 opacity-25" />
                    <div>データがありません</div>
                    <button className="btn btn-sm btn-primary mt-2" onClick={addRow}>
                      <i className="bi bi-plus-lg me-1" />最初の行を追加
                    </button>
                  </td>
                </tr>
              ) : (
                aeroData.entries.map((entry, idx) => (
                  <tr key={idx}>
                    <td className="text-center text-muted">{idx + 1}</td>
                    <td className="text-end">
                      {numCell(entry.mach, (v) => updateEntry(idx, { mach: v }), '0.01')}
                    </td>
                    <td className="text-end">
                      {numCell(entry.aoaDeg, (v) => updateEntry(idx, { aoaDeg: v }), '0.5')}
                    </td>
                    <td className="text-end">
                      {numCell(entry.ca, (v) => updateEntry(idx, { ca: v }), '0.001')}
                    </td>
                    <td className="text-end">
                      {numCell(entry.cn, (v) => updateEntry(idx, { cn: v }), '0.01')}
                    </td>
                    <td className="text-end">
                      {numCell(entry.xcpM, (v) => updateEntry(idx, { xcpM: v }), '0.001', '—')}
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-outline-danger"
                        style={{ padding: '1px 6px' }}
                        onClick={() => deleteEntry(idx)}
                        title="削除"
                      >
                        <i className="bi bi-trash" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-2 text-muted" style={{ fontSize: '0.75rem' }}>
        <i className="bi bi-info-circle me-1" />
        CSVインポート形式: <code>mach,aoa_deg,ca,cn,xcp_m</code>（ヘッダー必須。xcp_mは省略可）
      </div>
    </div>
  );
};

// ============================================================
// 汎用解析結果ビュー（既存）
// ============================================================

interface AnalysisResultsViewProps {
  /** モーダル等から直接渡す場合に使用。省略時は appStore の値を参照。 */
  caseId?: string;
  serviceTypeOverride?: AnalysisServiceType;
}

export const AnalysisResultsView: React.FC<AnalysisResultsViewProps> = ({ caseId: propCaseId, serviceTypeOverride }) => {
  const { analysisCaseId: storeCaseId, analysisService } = useAppStore();
  const analysisCaseId = propCaseId ?? storeCaseId;
  const getCase = useAnalysisStore((s) => s.getCase);
  const getResultsForCase = useAnalysisStore((s) => s.getResultsForCase);
  const addResult = useAnalysisStore((s) => s.addResult);
  const updateResult = useAnalysisStore((s) => s.updateResult);
  const deleteResult = useAnalysisStore((s) => s.deleteResult);

  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<AnalysisResult | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [confirmDelete, setConfirmDelete] = useState<AnalysisResult | null>(null);
  const [editCellId, setEditCellId] = useState<string | null>(null);
  const [editCellValue, setEditCellValue] = useState('');
  // 表示モード切替: table = 編集可能テーブル / document = 報告書ドキュメント
  const [viewMode, setViewMode] = useState<'table' | 'document'>('table');

  const serviceType = (serviceTypeOverride ?? analysisService) as AnalysisServiceType;
  const meta = serviceType ? SERVICE_META[serviceType] : null;
  const analysisCase = analysisCaseId ? getCase(analysisCaseId) : null;
  const results = analysisCaseId ? getResultsForCase(analysisCaseId) : [];

  if (!analysisCaseId || !analysisCase || !serviceType || !meta) {
    return <div className="text-muted p-4">解析ケースが選択されていません。</div>;
  }

  // 結果モーダル操作系 (飛行解析の文書モードでも使うので分岐前に宣言)
  const openAdd = () => {
    setEditTarget(null);
    setForm(emptyForm());
    setShowModal(true);
  };
  const openEdit = (r: AnalysisResult) => {
    setEditTarget(r);
    setForm({ label: r.label, value: r.value, unit: r.unit, notes: r.notes });
    setShowModal(true);
  };

  // 空力解析は専用ビューを返す
  if (serviceType === 'aeroAnalysis') {
    return <AeroResultsView analysisCase={analysisCase} />;
  }

  // 飛行解析は Grafana 風ダッシュボードを既定表示 (時系列複数チャート)
  // ただし テーブル / ドキュメント 表示にも切替可能
  if (serviceType === 'flightAnalysis' && viewMode === 'table') {
    // table モードは時系列ダッシュボードを既定にし、上部に切替ボタン
    // ↓ 通常 table モードの場合は dashboard を出す (既定動作)
  }
  if (serviceType === 'flightAnalysis') {
    return (
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
          <h1 className="page-title">
            <i className={`bi bi-${meta.icon} me-2 text-primary`} />
            飛行解析結果 — {analysisCase.name}
          </h1>
          <div className="d-flex align-items-center gap-2">
            {/* 表示モード切替: ダッシュボード / テーブル / ドキュメント */}
            <div className="btn-group btn-group-sm" role="group">
              <button
                type="button"
                className={`btn ${viewMode === 'table' ? 'btn-primary' : 'btn-outline-primary'}`}
                onClick={() => setViewMode('table')}
                title="グラフダッシュボード"
              >
                <i className="bi bi-graph-up me-1" />ダッシュボード
              </button>
              <button
                type="button"
                className={`btn ${viewMode === 'document' ? 'btn-primary' : 'btn-outline-primary'}`}
                onClick={() => setViewMode('document')}
                title="文書・テーブル表示"
              >
                <i className="bi bi-file-text me-1" />文書 / 数値
              </button>
            </div>
            {viewMode === 'document' && (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => window.print()}
                title="ブラウザ印刷 (PDF保存)"
              >
                <i className="bi bi-printer me-1" />印刷 / PDF
              </button>
            )}
            {viewMode === 'document' && (
              <button className="btn btn-primary btn-sm" onClick={openAdd}>
                <i className="bi bi-plus-lg me-1" />結果追加
              </button>
            )}
            {viewMode === 'table' && <small className="text-muted">時系列 (0〜400 秒)</small>}
          </div>
        </div>
        {viewMode === 'table' ? (
          <FlightAnalysisResultsView analysisCase={analysisCase} />
        ) : (
          <>
            {/* ドキュメント (報告書 + 数値結果テーブル) */}
            <DocumentReport analysisCase={analysisCase} results={results} meta={meta} />
            <div className="card mt-3">
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead>
                    <tr>
                      <th style={{ width: 50 }}>No.</th>
                      <th>結果ラベル</th>
                      <th>値</th>
                      <th style={{ width: 100 }}>単位</th>
                      <th>備考</th>
                      <th>記録日時</th>
                      <th className="col-actions">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center text-muted py-4">数値結果は未登録</td>
                      </tr>
                    ) : (
                      results.map((r) => (
                        <tr key={r.id}>
                          <td className="text-center text-muted">{r.no}</td>
                          <td>{r.label}</td>
                          <td className="font-monospace">{r.value}</td>
                          <td>{r.unit}</td>
                          <td className="text-muted">{r.notes}</td>
                          <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>
                            {new Date(r.createdAt).toLocaleDateString('ja-JP')}
                          </td>
                          <td className="col-actions">
                            <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => openEdit(r)}>
                              <i className="bi bi-pencil" />
                            </button>
                            <button className="btn btn-sm btn-outline-danger" onClick={() => setConfirmDelete(r)}>
                              <i className="bi bi-trash" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  const handleSave = () => {
    if (!form.label.trim() || !analysisCaseId) return;
    if (editTarget) {
      updateResult(editTarget.id, form);
    } else {
      addResult({ analysisCaseId, ...form });
    }
    setShowModal(false);
  };

  const handleDelete = () => {
    if (!confirmDelete) return;
    deleteResult(confirmDelete.id);
    setConfirmDelete(null);
  };

  // Inline edit helpers
  const startInline = (id: string, field: string, value: string) => {
    setEditCellId(`${id}:${field}`);
    setEditCellValue(value);
  };

  const commitInline = (id: string, field: keyof Pick<AnalysisResult, 'label' | 'value' | 'unit' | 'notes'>) => {
    updateResult(id, { [field]: editCellValue });
    setEditCellId(null);
  };

  const inlineCell = (result: AnalysisResult, field: keyof Pick<AnalysisResult, 'label' | 'value' | 'unit' | 'notes'>, placeholder = '') => {
    const key = `${result.id}:${field}`;
    if (editCellId === key) {
      return (
        <input
          className="form-control form-control-sm"
          style={{ minWidth: 80 }}
          value={editCellValue}
          onChange={(e) => setEditCellValue(e.target.value)}
          onBlur={() => commitInline(result.id, field)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitInline(result.id, field);
            if (e.key === 'Escape') setEditCellId(null);
          }}
          autoFocus
        />
      );
    }
    return (
      <span className="editable-cell" onClick={() => startInline(result.id, field, result[field])}>
        {result[field] || <span className="text-muted fst-italic">{placeholder}</span>}
      </span>
    );
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <h1 className="page-title">
          <i className="bi bi-table me-2 text-primary" />
          解析結果 — {analysisCase.name}
        </h1>
        <div className="d-flex align-items-center gap-2">
          {/* 表示モード切替 */}
          <div className="btn-group btn-group-sm" role="group">
            <button
              type="button"
              className={`btn ${viewMode === 'table' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setViewMode('table')}
              title="編集可能テーブル"
            >
              <i className="bi bi-table me-1" />テーブル
            </button>
            <button
              type="button"
              className={`btn ${viewMode === 'document' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setViewMode('document')}
              title="報告書スタイル (印刷可)"
            >
              <i className="bi bi-file-text me-1" />ドキュメント
            </button>
          </div>
          {viewMode === 'document' && (
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => window.print()}
              title="ブラウザ印刷 (PDF保存)"
            >
              <i className="bi bi-printer me-1" />印刷 / PDF
            </button>
          )}
          {viewMode === 'table' && (
            <button className="btn btn-primary btn-sm" onClick={openAdd}>
              <i className="bi bi-plus-lg me-1" />結果追加
            </button>
          )}
        </div>
      </div>

      {viewMode === 'document' ? (
        <DocumentReport analysisCase={analysisCase} results={results} meta={meta} />
      ) : (
      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th style={{ width: 50 }}>No.</th>
                <th>結果ラベル</th>
                <th>値</th>
                <th style={{ width: 100 }}>単位</th>
                <th>備考</th>
                <th>記録日時</th>
                <th className="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-muted py-5">
                    <i className="bi bi-table fs-3 d-block mb-2 opacity-25" />
                    <div>解析結果がありません</div>
                    <button className="btn btn-primary btn-sm mt-2" onClick={openAdd}>
                      <i className="bi bi-plus-lg me-1" />最初の結果を追加
                    </button>
                  </td>
                </tr>
              ) : (
                results.map((r) => (
                  <tr key={r.id}>
                    <td className="text-center text-muted">{r.no}</td>
                    <td>{inlineCell(r, 'label', 'ラベル')}</td>
                    <td className="font-monospace">{inlineCell(r, 'value', '値')}</td>
                    <td>{inlineCell(r, 'unit', '単位')}</td>
                    <td className="text-muted">{inlineCell(r, 'notes', '備考')}</td>
                    <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>
                      {new Date(r.createdAt).toLocaleDateString('ja-JP')}
                    </td>
                    <td className="col-actions">
                      <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => openEdit(r)} title="編集">
                        <i className="bi bi-pencil" />
                      </button>
                      <button className="btn btn-sm btn-outline-danger" onClick={() => setConfirmDelete(r)} title="削除">
                        <i className="bi bi-trash" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="bi bi-table me-2" />
                  {editTarget ? '結果編集' : '解析結果追加'}
                </h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label fw-medium">結果ラベル <span className="text-danger">*</span></label>
                  <input
                    className="form-control"
                    value={form.label}
                    onChange={(e) => setForm({ ...form, label: e.target.value })}
                    placeholder="例: 最大高度, 最大速度, 落下点緯度"
                    autoFocus
                  />
                </div>
                <div className="row g-2 mb-3">
                  <div className="col-8">
                    <label className="form-label fw-medium">値</label>
                    <input
                      className="form-control"
                      value={form.value}
                      onChange={(e) => setForm({ ...form, value: e.target.value })}
                      placeholder="例: 350.2"
                    />
                  </div>
                  <div className="col-4">
                    <label className="form-label fw-medium">単位</label>
                    <input
                      className="form-control"
                      value={form.unit}
                      onChange={(e) => setForm({ ...form, unit: e.target.value })}
                      placeholder="例: km"
                    />
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-medium">備考</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="例: 参照ツール: MATLAB R2024a"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>キャンセル</button>
                <button
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={!form.label.trim()}
                >
                  {editTarget ? '保存' : '追加'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {confirmDelete && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="modal-dialog modal-sm">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title text-danger">結果削除</h5>
                <button className="btn-close" onClick={() => setConfirmDelete(null)} />
              </div>
              <div className="modal-body">
                <strong>{confirmDelete.label}</strong> を削除しますか？
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>キャンセル</button>
                <button className="btn btn-danger" onClick={handleDelete}>削除</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── ドキュメント (報告書) ビュー ─────────────────────────────────────

interface DocumentReportProps {
  analysisCase: AnalysisCase;
  results: AnalysisResult[];
  meta: { label: string; icon: string };
}

const DocumentReport: React.FC<DocumentReportProps> = ({ analysisCase, results, meta }) => {
  const cond = analysisCase.condition ?? {};
  const conditionEntries = Object.entries(cond);
  return (
    <div
      className="card"
      style={{
        maxWidth: 880,
        margin: '0 auto',
        padding: '32px 48px',
        background: '#fff',
        boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
        fontFamily: '"Helvetica Neue", "Hiragino Kaku Gothic ProN", sans-serif',
      }}
    >
      {/* タイトル */}
      <div style={{ borderBottom: '2px solid #0d6efd', paddingBottom: 14, marginBottom: 20 }}>
        <div className="text-muted" style={{ fontSize: '0.78rem', letterSpacing: 1 }}>
          ANALYSIS REPORT
        </div>
        <h1 className="fw-bold mt-1 mb-0" style={{ fontSize: '1.55rem' }}>
          <i className={`bi bi-${meta.icon} me-2 text-primary`} />
          {meta.label} 解析報告書
        </h1>
      </div>

      {/* メタ情報 */}
      <table className="table table-sm mb-4" style={{ fontSize: '0.86rem' }}>
        <tbody>
          <tr>
            <th style={{ width: 140, background: '#f8f9fa' }}>解析ケース</th>
            <td>{analysisCase.name}</td>
          </tr>
          {analysisCase.memo && (
            <tr>
              <th style={{ background: '#f8f9fa' }}>概要 / メモ</th>
              <td style={{ whiteSpace: 'pre-wrap' }}>{analysisCase.memo}</td>
            </tr>
          )}
          <tr>
            <th style={{ background: '#f8f9fa' }}>作成者</th>
            <td>{analysisCase.createdBy || '—'}</td>
          </tr>
          <tr>
            <th style={{ background: '#f8f9fa' }}>作成日時</th>
            <td>{new Date(analysisCase.createdAt).toLocaleString('ja-JP')}</td>
          </tr>
          <tr>
            <th style={{ background: '#f8f9fa' }}>更新日時</th>
            <td>{new Date(analysisCase.updatedAt).toLocaleString('ja-JP')}</td>
          </tr>
        </tbody>
      </table>

      {/* 解析条件セクション */}
      <h2 className="fw-bold mt-3 mb-2" style={{ fontSize: '1.05rem', borderBottom: '1px solid #dee2e6', paddingBottom: 6 }}>
        1. 解析条件
      </h2>
      {conditionEntries.length === 0 ? (
        <p className="text-muted" style={{ fontSize: '0.88rem' }}>条件は入力されていません。</p>
      ) : (
        <table className="table table-sm" style={{ fontSize: '0.86rem' }}>
          <tbody>
            {conditionEntries.map(([k, v]) => (
              <tr key={k}>
                <th style={{ width: 200, background: '#f8f9fa', fontWeight: 600 }}>{k}</th>
                <td className="font-monospace" style={{ wordBreak: 'break-all' }}>
                  {formatConditionValue(v)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* 結果セクション */}
      <h2 className="fw-bold mt-4 mb-2" style={{ fontSize: '1.05rem', borderBottom: '1px solid #dee2e6', paddingBottom: 6 }}>
        2. 解析結果 ({results.length} 件)
      </h2>
      {results.length === 0 ? (
        <p className="text-muted" style={{ fontSize: '0.88rem' }}>結果はまだ登録されていません。</p>
      ) : (
        <ol style={{ paddingLeft: 24 }}>
          {results.map((r) => (
            <li key={r.id} style={{ marginBottom: 12, fontSize: '0.92rem' }}>
              <div className="d-flex flex-wrap align-items-baseline gap-2">
                <span className="fw-semibold">{r.label}</span>
                <span className="font-monospace" style={{ color: '#0d6efd', fontSize: '1.0rem', fontWeight: 600 }}>
                  {r.value}
                </span>
                {r.unit && <span className="text-muted">{r.unit}</span>}
              </div>
              {r.notes && (
                <div className="text-muted mt-1" style={{ fontSize: '0.82rem', paddingLeft: 4 }}>
                  ※ {r.notes}
                </div>
              )}
              <div className="text-muted mt-1" style={{ fontSize: '0.74rem' }}>
                記録日時: {new Date(r.createdAt).toLocaleString('ja-JP')}
              </div>
            </li>
          ))}
        </ol>
      )}

      {/* フッター */}
      <div className="text-muted mt-4 pt-3" style={{ borderTop: '1px solid #dee2e6', fontSize: '0.78rem', textAlign: 'center' }}>
        この報告書は rocketDB により自動生成されたものです / 印刷ボタンから PDF 保存可能
      </div>
    </div>
  );
};

function formatConditionValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return v.toLocaleString();
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
