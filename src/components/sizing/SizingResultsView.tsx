import React, { useState } from 'react';
import { useSizingStore } from '../../stores/sizingStore';
import { useMassCaseStore } from '../../stores/massCaseStore';
import { useAppStore } from '../../stores/appStore';
import type { SizingResult } from '../../types';
import { exportSizingResultsToCSV, downloadFile } from '../../utils/importExport';
import { setMassModelInitialTab } from '../analysis/dbSetMeta';

type ApplyMode = 'overwrite' | 'newVersion';

interface ApplyState {
  result: SizingResult;
  mode: ApplyMode;
  newName: string;
}

export const SizingResultsView: React.FC = () => {
  const { sizingCaseId, projectId, navigate } = useAppStore();
  const getCase = useSizingStore((s) => s.getCase);
  const getResultsForCase = useSizingStore((s) => s.getResultsForCase);
  const deleteResult = useSizingStore((s) => s.deleteResult);

  const getMassCase = useMassCaseStore((s) => s.getCase);
  const applyAllocatedMasses = useMassCaseStore((s) => s.applyAllocatedMasses);
  const copyCaseAndApply = useMassCaseStore((s) => s.copyCaseAndApply);

  const sizingCase = sizingCaseId ? getCase(sizingCaseId) : null;
  const results = sizingCaseId ? getResultsForCase(sizingCaseId) : [];
  const massCase = sizingCase ? getMassCase(sizingCase.massCaseId) : null;

  const [sortKey, setSortKey] = useState<'no' | 'totalMass' | 'grossPayloadRatio'>('no');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [confirmDelete, setConfirmDelete] = useState<SizingResult | null>(null);
  const [search, setSearch] = useState('');
  const [applyState, setApplyState] = useState<ApplyState | null>(null);
  const [applyDone, setApplyDone] = useState<string | null>(null);

  const maxStages = results.length > 0
    ? Math.max(...results.map((r) => r.propellantMassPerStage.length))
    : 2;

  const sortedResults = [...results]
    .filter((r) => !search || String(r.no).includes(search) ||
      String(r.condition.deltaV).includes(search))
    .sort((a, b) => {
      let diff = 0;
      if (sortKey === 'no') diff = a.no - b.no;
      else if (sortKey === 'totalMass') diff = a.totalMass - b.totalMass;
      else if (sortKey === 'grossPayloadRatio') diff = a.grossPayloadRatio - b.grossPayloadRatio;
      return sortDir === 'asc' ? diff : -diff;
    });

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SortIcon: React.FC<{ col: typeof sortKey }> = ({ col }) => {
    if (sortKey !== col) return <i className="bi bi-arrow-down-up text-muted ms-1" style={{ fontSize: 11 }} />;
    return sortDir === 'asc'
      ? <i className="bi bi-sort-up ms-1" style={{ fontSize: 11 }} />
      : <i className="bi bi-sort-down ms-1" style={{ fontSize: 11 }} />;
  };

  const handleExportCSV = () => {
    if (!sizingCase) return;
    const csv = exportSizingResultsToCSV(sizingCase, results);
    downloadFile(csv, `${sizingCase.name}_サイジング結果.csv`, 'text/csv;charset=utf-8;');
  };

  const openApplyModal = (result: SizingResult) => {
    const idx = results.findIndex((r) => r.id === result.id);
    const suffix = String.fromCharCode(65 + (idx % 26));
    setApplyState({
      result,
      mode: 'overwrite',
      newName: massCase ? `${massCase.name} Rev.${suffix}` : '',
    });
  };

  const handleApply = () => {
    if (!applyState || !sizingCase || !massCase) return;
    const { result, mode, newName } = applyState;
    const masses = result.componentMasses;

    if (mode === 'overwrite') {
      applyAllocatedMasses(sizingCase.massCaseId, masses, result.id);
      setApplyDone(`「${massCase.name}」の配分質量を No.${result.no} の結果で更新しました。`);
    } else {
      const created = copyCaseAndApply(sizingCase.massCaseId, masses, result.id, newName.trim() || `${massCase.name} (コピー)`);
      if (created) {
        setApplyDone(`新バージョン「${created.name}」を作成しました。`);
      }
    }
    setApplyState(null);
  };

  if (!sizingCaseId || !sizingCase) {
    return <div className="text-muted p-4">サイジングケースが選択されていません。</div>;
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="page-title">解析結果 — {sizingCase.name}</h1>
        <div className="action-toolbar">
          <button
            className="btn btn-outline-primary btn-sm"
            onClick={() => navigate('sizingCondition', { projectId, sizingCaseId })}
          >
            <i className="bi bi-gear me-1" />
            解析条件
          </button>
          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={handleExportCSV}
            disabled={results.length === 0}
          >
            <i className="bi bi-download me-1" />
            CSV出力
          </button>
        </div>
      </div>

      {/* Applied result info banner */}
      {massCase?.sizingResultApplied && (() => {
        const appliedResult = results.find((r) => r.id === massCase.sizingResultApplied);
        return appliedResult ? (
          <div className="alert alert-success d-flex align-items-center gap-2 py-2 mb-3" style={{ fontSize: '0.83rem' }}>
            <i className="bi bi-check-circle-fill flex-shrink-0" />
            <span>
              現在 <strong>{massCase.name}</strong> には No.{appliedResult.no}（ΔV={appliedResult.condition.deltaV.toLocaleString()} m/s、総質量={appliedResult.totalMass.toLocaleString('ja-JP', { maximumFractionDigits: 1 })} kg）の結果が反映されています。
            </span>
            <button
              className="btn btn-sm btn-outline-success ms-auto flex-shrink-0"
              onClick={() => { setMassModelInitialTab('mass'); navigate('massModel', { projectId, massCaseId: sizingCase.massCaseId }); }}
            >
              <i className="bi bi-boxes me-1" />質量データを確認
            </button>
          </div>
        ) : null;
      })()}

      {/* Apply done notification */}
      {applyDone && (
        <div className="alert alert-info d-flex align-items-center gap-2 py-2 mb-3" style={{ fontSize: '0.83rem' }}>
          <i className="bi bi-check-circle-fill flex-shrink-0" />
          <span>{applyDone}</span>
          <button className="btn-close btn-sm ms-auto" onClick={() => setApplyDone(null)} />
        </div>
      )}

      {/* Summary cards */}
      {results.length > 0 && (
        <div className="row g-3 mb-3">
          <div className="col-auto">
            <div className="card px-3 py-2">
              <small className="text-muted">総件数</small>
              <div className="fw-bold">{results.length} ケース</div>
            </div>
          </div>
          <div className="col-auto">
            <div className="card px-3 py-2">
              <small className="text-muted">最小総質量</small>
              <div className="fw-bold font-monospace">
                {Math.min(...results.map((r) => r.totalMass)).toLocaleString('ja-JP', { maximumFractionDigits: 1 })} kg
              </div>
            </div>
          </div>
          <div className="col-auto">
            <div className="card px-3 py-2">
              <small className="text-muted">最大 GPR</small>
              <div className="fw-bold font-monospace">
                {(Math.max(...results.map((r) => r.grossPayloadRatio)) * 100).toFixed(2)}%
              </div>
            </div>
          </div>
          {massCase && (
            <div className="col-auto">
              <div className="card px-3 py-2">
                <small className="text-muted">参照ロケットDB</small>
                <div className="fw-bold">
                  <button
                    className="btn btn-link btn-sm p-0 text-primary"
                    style={{ textDecoration: 'none' }}
                    onClick={() => { setMassModelInitialTab('mass'); navigate('massModel', { projectId, massCaseId: sizingCase.massCaseId }); }}
                  >
                    <i className="bi bi-database me-1" />{massCase.name}
                    {massCase.sizingResultApplied && (
                      <i className="bi bi-check-circle-fill text-success ms-1" title="サイジング結果反映済み" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="filter-bar mb-3 rounded">
        <div className="input-group input-group-sm" style={{ maxWidth: 250 }}>
          <span className="input-group-text bg-white"><i className="bi bi-search" /></span>
          <input
            className="form-control"
            placeholder="No. / ΔV で絞り込み"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <small className="text-muted ms-auto">{sortedResults.length} 件表示</small>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover mb-0" style={{ fontSize: '0.82rem' }}>
            <thead>
              <tr>
                <th style={{ cursor: 'pointer', minWidth: 60 }} onClick={() => toggleSort('no')}>
                  No. <SortIcon col="no" />
                </th>
                <th style={{ minWidth: 80 }}>ΔV (m/s)</th>
                {Array.from({ length: maxStages }, (_, i) => (
                  <th key={i} style={{ minWidth: 70 }}>Isp S{i + 1} (s)</th>
                ))}
                <th className="text-end" style={{ cursor: 'pointer', minWidth: 100 }} onClick={() => toggleSort('totalMass')}>
                  総質量 (kg) <SortIcon col="totalMass" />
                </th>
                <th className="text-end" style={{ cursor: 'pointer', minWidth: 80 }} onClick={() => toggleSort('grossPayloadRatio')}>
                  GPR <SortIcon col="grossPayloadRatio" />
                </th>
                {Array.from({ length: maxStages }, (_, i) => (
                  <th key={i} className="text-end" style={{ minWidth: 90 }}>推進剤 S{i + 1} (kg)</th>
                ))}
                {Array.from({ length: maxStages }, (_, i) => (
                  <th key={i} className="text-end" style={{ minWidth: 80 }}>推進剤比 S{i + 1}</th>
                ))}
                {Array.from({ length: maxStages }, (_, i) => (
                  <th key={i} className="text-end" style={{ minWidth: 80 }}>構造効率 S{i + 1}</th>
                ))}
                <th className="col-actions" style={{ minWidth: 80 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {sortedResults.length === 0 ? (
                <tr>
                  <td colSpan={5 + maxStages * 3} className="text-center text-muted py-4">
                    <i className="bi bi-calculator fs-4 d-block mb-2" />
                    解析結果がありません。解析条件を設定して計算を実行してください。
                  </td>
                </tr>
              ) : (
                sortedResults.map((r) => {
                  const isApplied = massCase?.sizingResultApplied === r.id;
                  return (
                    <tr key={r.id} className={isApplied ? 'table-success' : undefined}>
                      <td className="fw-medium">
                        {r.no}
                        {isApplied && (
                          <span className="badge bg-success ms-1" style={{ fontSize: '0.65rem' }}>
                            <i className="bi bi-check me-1" />DB反映済
                          </span>
                        )}
                      </td>
                      <td className="font-monospace">{r.condition.deltaV.toLocaleString()}</td>
                      {Array.from({ length: maxStages }, (_, i) => (
                        <td key={i} className="font-monospace">{r.condition.ispPerStage[i] ?? '—'}</td>
                      ))}
                      <td className="text-end font-monospace">
                        {r.totalMass.toLocaleString('ja-JP', { maximumFractionDigits: 1 })}
                      </td>
                      <td className="text-end font-monospace">
                        {(r.grossPayloadRatio * 100).toFixed(2)}%
                      </td>
                      {Array.from({ length: maxStages }, (_, i) => (
                        <td key={i} className="text-end font-monospace">
                          {r.propellantMassPerStage[i] !== undefined
                            ? r.propellantMassPerStage[i].toLocaleString('ja-JP', { maximumFractionDigits: 1 })
                            : '—'}
                        </td>
                      ))}
                      {Array.from({ length: maxStages }, (_, i) => (
                        <td key={i} className="text-end font-monospace">
                          {r.propellantRatioPerStage[i] !== undefined
                            ? (r.propellantRatioPerStage[i] * 100).toFixed(1) + '%'
                            : '—'}
                        </td>
                      ))}
                      {Array.from({ length: maxStages }, (_, i) => (
                        <td key={i} className="text-end font-monospace">
                          {r.structuralEfficiencyPerStage[i] !== undefined
                            ? (r.structuralEfficiencyPerStage[i] * 100).toFixed(1) + '%'
                            : '—'}
                        </td>
                      ))}
                      <td className="col-actions">
                        <button
                          className="btn btn-sm btn-outline-primary me-1"
                          onClick={() => openApplyModal(r)}
                          title="ロケットDBに配分質量を反映"
                          disabled={!massCase || r.componentMasses.length === 0}
                        >
                          <i className="bi bi-database-up" />
                        </button>
                        <button
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => setConfirmDelete(r)}
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

      {/* Apply to DB Modal */}
      {applyState && massCase && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="bi bi-database-up me-2 text-primary" />
                  ロケットDBに反映 — No.{applyState.result.no}
                </h5>
                <button className="btn-close" onClick={() => setApplyState(null)} />
              </div>
              <div className="modal-body">
                <div className="mb-3 p-2 rounded" style={{ background: '#f8f9fa', fontSize: '0.83rem' }}>
                  <div className="text-muted mb-1">反映内容</div>
                  <span className="me-3">ΔV: <strong>{applyState.result.condition.deltaV.toLocaleString()} m/s</strong></span>
                  <span className="me-3">総質量: <strong>{applyState.result.totalMass.toLocaleString('ja-JP', { maximumFractionDigits: 1 })} kg</strong></span>
                  <span>GPR: <strong>{(applyState.result.grossPayloadRatio * 100).toFixed(2)}%</strong></span>
                  <div className="mt-1 text-muted">
                    {applyState.result.componentMasses.length} コンポーネントの配分質量を更新
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label fw-medium">反映先</label>
                  <div className="d-flex flex-column gap-2">
                    <label className="d-flex align-items-start gap-2 p-2 rounded border" style={{ cursor: 'pointer', background: applyState.mode === 'overwrite' ? '#f0f4ff' : undefined }}>
                      <input
                        type="radio"
                        className="form-check-input mt-1 flex-shrink-0"
                        checked={applyState.mode === 'overwrite'}
                        onChange={() => setApplyState({ ...applyState, mode: 'overwrite' })}
                      />
                      <div>
                        <div className="fw-medium">
                          <i className="bi bi-database me-1 text-primary" />
                          現在のDBを上書き更新
                        </div>
                        <small className="text-muted">
                          「{massCase.name}」の各コンポーネントの配分質量を直接上書きします。
                          {massCase.sizingResultApplied && <span className="text-warning ms-1">既存の反映結果は上書きされます。</span>}
                        </small>
                      </div>
                    </label>

                    <label className="d-flex align-items-start gap-2 p-2 rounded border" style={{ cursor: 'pointer', background: applyState.mode === 'newVersion' ? '#f0fff4' : undefined }}>
                      <input
                        type="radio"
                        className="form-check-input mt-1 flex-shrink-0"
                        checked={applyState.mode === 'newVersion'}
                        onChange={() => setApplyState({ ...applyState, mode: 'newVersion' })}
                      />
                      <div className="flex-grow-1">
                        <div className="fw-medium">
                          <i className="bi bi-database-add me-1 text-success" />
                          新バージョンとして保存（推奨）
                        </div>
                        <small className="text-muted">
                          「{massCase.name}」をコピーして、コピー先に結果を反映します。元のDBは変更されません。
                        </small>
                        {applyState.mode === 'newVersion' && (
                          <input
                            className="form-control form-control-sm mt-2"
                            placeholder="新しいDB名"
                            value={applyState.newName}
                            onChange={(e) => setApplyState({ ...applyState, newName: e.target.value })}
                            autoFocus
                          />
                        )}
                      </div>
                    </label>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setApplyState(null)}>キャンセル</button>
                <button
                  className="btn btn-primary"
                  onClick={handleApply}
                  disabled={applyState.mode === 'newVersion' && !applyState.newName.trim()}
                >
                  <i className="bi bi-database-up me-1" />
                  {applyState.mode === 'overwrite' ? '上書き反映' : '新バージョン作成'}
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
                No. {confirmDelete.no} の結果を削除しますか？
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>キャンセル</button>
                <button
                  className="btn btn-danger"
                  onClick={() => { deleteResult(confirmDelete.id); setConfirmDelete(null); }}
                >
                  削除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
