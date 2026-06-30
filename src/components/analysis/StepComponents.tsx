import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAnalysisFlowStore } from '../../stores/analysisFlowStore';
import { useAnalysisStore } from '../../stores/analysisStore';
import { useMassCaseStore } from '../../stores/massCaseStore';
import { useSizingStore } from '../../stores/sizingStore';
import { usePluginStore } from '../../stores/pluginStore';
import { useAppStore } from '../../stores/appStore';
import type { AnalysisFlow, AnalysisFlowStep, AnalysisServiceType } from '../../types';
import { SERVICE_META, ALL_SERVICES } from './analysisServiceMeta';
import { AnalysisConditionView } from './AnalysisConditionView';
import { SizingConditionView } from '../sizing/SizingConditionView';

// ─── 型・ユーティリティ ──────────────────────────────────────────────────────

export type LinkedType = 'none' | 'analysis' | 'sizing' | 'db' | 'plugin';

export function getLinkedType(step: AnalysisFlowStep): LinkedType {
  if (step.analysisCaseId)   return 'analysis';
  if (step.sizingCaseId)     return 'sizing';
  if (step.linkedMassCaseId) return 'db';
  if (step.pluginCaseId)     return 'plugin';
  return 'none';
}

export const STATUS_STYLE: Record<string, { bg: string; color: string; icon: string }> = {
  pending:     { bg: '#f1f5f9', color: '#64748b', icon: 'circle' },
  in_progress: { bg: '#fef9c3', color: '#854d0e', icon: 'circle-half' },
  done:        { bg: '#dcfce7', color: '#166534', icon: 'check-circle-fill' },
};

export const STATUS_LABEL: Record<string, string> = {
  pending: '未着手',
  in_progress: '進行中',
  done: '完了',
};

export const LINKED_TYPE_LABEL: Record<LinkedType, string> = {
  none:     'なし',
  analysis: '解析',
  sizing:   'サイジング',
  db:       'DB',
  plugin:   'カスタム',
};

export const LINKED_TYPE_COLOR: Record<LinkedType, string> = {
  none:     '#64748b',
  analysis: '#2563eb',
  sizing:   '#7c3aed',
  db:       '#0891b2',
  plugin:   '#db2777',
};

// ─── バインド設定モーダル ─────────────────────────────────────────────────────

export const BindingConfigModal: React.FC<{
  flowId: string;
  step: AnalysisFlowStep;
  projectId: string;
  onClose: () => void;
}> = ({ flowId, step, projectId, onClose }) => {
  const allCases = useAnalysisStore((s) => s.cases);
  const allMassCases = useMassCaseStore((s) => s.cases);
  const addBinding = useAnalysisFlowStore((s) => s.addBinding);
  const deleteBinding = useAnalysisFlowStore((s) => s.deleteBinding);

  const projectAnalysisCases = allCases.filter((c) => c.projectId === projectId);
  const projectMassCases = allMassCases.filter((c) => c.projectId === projectId);

  const [fromAnalysisCaseId, setFromAnalysisCaseId] = useState(step.analysisCaseId ?? '');
  const [fromResultLabel, setFromResultLabel] = useState('');
  const [toDeltaVEntryKey, setToDeltaVEntryKey] = useState('');
  const [toMassCaseId, setToMassCaseId] = useState('');

  const resultsForCase = useAnalysisStore((s) =>
    fromAnalysisCaseId ? s.getResultsForCase(fromAnalysisCaseId) : []
  );

  const selectedMassCase = allMassCases.find((c) => c.id === toMassCaseId);
  const dvEntries = selectedMassCase?.deltaVBudget?.entries ?? [];

  const handleAdd = () => {
    if (!fromAnalysisCaseId || !fromResultLabel.trim() || !toDeltaVEntryKey || !toMassCaseId) return;
    addBinding(flowId, step.id, {
      fromAnalysisCaseId,
      fromResultLabel: fromResultLabel.trim(),
      toType: 'deltaV',
      toDeltaVEntryKey,
      massCaseId: toMassCaseId,
    });
    setFromResultLabel('');
    setToDeltaVEntryKey('');
  };

  return createPortal(
    <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.35)', zIndex: 1060 }}>
      <div className="modal-dialog modal-lg">
        <div className="modal-content">
          <div className="modal-header py-2">
            <h6 className="modal-title">
              <i className="bi bi-link-45deg me-2 text-info" />
              データバインド設定 — {step.label}
            </h6>
            <button className="btn-close btn-sm" onClick={onClose} />
          </div>
          <div className="modal-body" style={{ fontSize: '0.85rem' }}>
            {step.dataBindings.length > 0 && (
              <div className="mb-3">
                <div className="fw-semibold mb-1 text-muted" style={{ fontSize: '0.78rem' }}>登録済みバインド</div>
                {step.dataBindings.map((b) => {
                  const ac = allCases.find((c) => c.id === b.fromAnalysisCaseId);
                  const mc = allMassCases.find((c) => c.id === b.massCaseId);
                  const dvLabel = mc?.deltaVBudget?.entries.find((e) => e.key === b.toDeltaVEntryKey)?.label;
                  return (
                    <div key={b.id} className="d-flex align-items-center gap-2 p-2 mb-1 rounded border" style={{ background: '#f8fafc' }}>
                      <span className="text-truncate flex-grow-1" style={{ fontSize: '0.80rem' }}>
                        <code>{ac?.name ?? '?'}</code>
                        <i className="bi bi-arrow-right mx-1 text-muted" />
                        <span className="text-secondary">「{b.fromResultLabel}」</span>
                        <i className="bi bi-arrow-right mx-1 text-muted" />
                        <span>{mc?.name ?? '?'} / {dvLabel ?? b.toDeltaVEntryKey}</span>
                      </span>
                      <button
                        className="btn btn-xs btn-outline-danger"
                        style={{ fontSize: '0.7rem', padding: '1px 6px' }}
                        onClick={() => deleteBinding(flowId, step.id, b.id)}
                      >
                        <i className="bi bi-x" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="fw-semibold mb-2 text-muted" style={{ fontSize: '0.78rem' }}>新規バインドを追加</div>
            <div className="row g-2 align-items-end">
              <div className="col-md-4">
                <label className="form-label" style={{ fontSize: '0.78rem' }}>解析ケース</label>
                <select
                  className="form-select form-select-sm"
                  value={fromAnalysisCaseId}
                  onChange={(e) => { setFromAnalysisCaseId(e.target.value); setFromResultLabel(''); }}
                >
                  <option value="">（選択）</option>
                  {projectAnalysisCases.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label" style={{ fontSize: '0.78rem' }}>結果フィールド名</label>
                {resultsForCase.length > 0 ? (
                  <select
                    className="form-select form-select-sm"
                    value={fromResultLabel}
                    onChange={(e) => setFromResultLabel(e.target.value)}
                  >
                    <option value="">（選択）</option>
                    {resultsForCase.map((r) => (
                      <option key={r.id} value={r.label}>{r.label}{r.unit ? ` [${r.unit}]` : ''}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="form-control form-control-sm"
                    placeholder="例: 空力損失"
                    value={fromResultLabel}
                    onChange={(e) => setFromResultLabel(e.target.value)}
                  />
                )}
              </div>
              <div className="col-md-4">
                <label className="form-label" style={{ fontSize: '0.78rem' }}>ΔVエントリ</label>
                <div className="d-flex gap-1">
                  <select
                    className="form-select form-select-sm"
                    style={{ minWidth: 90 }}
                    value={toMassCaseId}
                    onChange={(e) => { setToMassCaseId(e.target.value); setToDeltaVEntryKey(''); }}
                  >
                    <option value="">DB...</option>
                    {projectMassCases.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <select
                    className="form-select form-select-sm"
                    value={toDeltaVEntryKey}
                    onChange={(e) => setToDeltaVEntryKey(e.target.value)}
                    disabled={!toMassCaseId}
                  >
                    <option value="">項目...</option>
                    {dvEntries.map((e) => (
                      <option key={e.key} value={e.key}>{e.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="mt-2">
              <button
                className="btn btn-sm btn-primary"
                onClick={handleAdd}
                disabled={!fromAnalysisCaseId || !fromResultLabel.trim() || !toDeltaVEntryKey || !toMassCaseId}
              >
                <i className="bi bi-plus-lg me-1" />追加
              </button>
            </div>
          </div>
          <div className="modal-footer py-2">
            <button className="btn btn-secondary btn-sm" onClick={onClose}>閉じる</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ─── 解析条件モーダル ────────────────────────────────────────────────────────

export const AnalysisConditionModal: React.FC<{
  analysisCaseId: string;
  serviceType: AnalysisServiceType;
  caseName: string;
  onClose: () => void;
}> = ({ analysisCaseId, serviceType, caseName, onClose }) => createPortal(
  <div
    className="modal d-block"
    style={{ background: 'rgba(0,0,0,0.45)', zIndex: 1060 }}
    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
  >
    <div className="modal-dialog modal-xl modal-dialog-scrollable" style={{ maxHeight: '90vh' }}>
      <div className="modal-content">
        <div className="modal-header py-2">
          <h6 className="modal-title">
            <i className="bi bi-gear me-2 text-primary" />
            解析条件 — {caseName}
          </h6>
          <button className="btn-close btn-sm" onClick={onClose} />
        </div>
        <div className="modal-body">
          <AnalysisConditionView caseId={analysisCaseId} serviceType={serviceType} />
        </div>
        <div className="modal-footer py-2">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  </div>,
  document.body
);

// ─── サイジング条件モーダル ─────────────────────────────────────────────────

export const SizingConditionModal: React.FC<{
  sizingCaseId: string;
  caseName: string;
  onClose: () => void;
}> = ({ sizingCaseId, caseName, onClose }) => createPortal(
  <div
    className="modal d-block"
    style={{ background: 'rgba(0,0,0,0.45)', zIndex: 1060 }}
    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
  >
    <div className="modal-dialog modal-xl modal-dialog-scrollable" style={{ maxHeight: '90vh' }}>
      <div className="modal-content">
        <div className="modal-header py-2">
          <h6 className="modal-title">
            <i className="bi bi-calculator me-2 text-primary" />
            サイジング条件 — {caseName}
          </h6>
          <button className="btn-close btn-sm" onClick={onClose} />
        </div>
        <div className="modal-body">
          <SizingConditionView caseId={sizingCaseId} hideTitle />
        </div>
        <div className="modal-footer py-2">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  </div>,
  document.body
);

// ─── 関連ケースピッカー ──────────────────────────────────────────────────────

export const LinkedCasePicker: React.FC<{
  flow: AnalysisFlow;
  step: AnalysisFlowStep;
  projectId: string;
}> = ({ flow, step, projectId }) => {
  const updateStep = useAnalysisFlowStore((s) => s.updateStep);
  const { navigate } = useAppStore();

  const allAnalysisCases = useAnalysisStore((s) => s.cases).filter((c) => c.projectId === projectId);
  const addAnalysisCase = useAnalysisStore((s) => s.addCase);
  const allMassCases = useMassCaseStore((s) => s.cases).filter((c) => c.projectId === projectId);
  const addSizingCase = useSizingStore((s) => s.addCase);
  const allSizingCases = useSizingStore((s) => s.cases);
  const projectMassCaseIds = new Set(allMassCases.map((c) => c.id));
  const projectSizingCases = allSizingCases.filter((sc) => projectMassCaseIds.has(sc.massCaseId));
  // カスタム解析(プラグイン)
  const allPluginCases = usePluginStore((s) => s.cases).filter((c) => c.projectId === projectId);
  const allPlugins = usePluginStore((s) => s.plugins);

  const [pendingType, setPendingType] = useState<LinkedType>('none');
  const [newAnalysisService, setNewAnalysisService] = useState<AnalysisServiceType | ''>('');
  const [conditionModal, setConditionModal] = useState<{ caseId: string; serviceType: AnalysisServiceType; name: string } | null>(null);
  const [sizingModal, setSizingModal] = useState<{ caseId: string; name: string } | null>(null);

  const linkedType = getLinkedType(step);
  const displayType = linkedType !== 'none' ? linkedType : pendingType;

  /**
   * 統一セレクトの値表現:
   *   ''                : 未選択
   *   'analysis:<svc>'  : 解析サービス
   *   'sizing'          : サイジング
   *   'plugin'          : カスタム解析
   *   'db'              : DB更新
   */
  const unifiedValue: string = (() => {
    if (linkedType === 'analysis') {
      const ac = allAnalysisCases.find((c) => c.id === step.analysisCaseId);
      return ac ? `analysis:${ac.serviceType}` : (newAnalysisService ? `analysis:${newAnalysisService}` : 'analysis:');
    }
    if (linkedType === 'sizing') return 'sizing';
    if (linkedType === 'db') return 'db';
    if (linkedType === 'plugin') return 'plugin';
    if (pendingType === 'analysis') return newAnalysisService ? `analysis:${newAnalysisService}` : '';
    if (pendingType === 'sizing') return 'sizing';
    if (pendingType === 'plugin') return 'plugin';
    if (pendingType === 'db') return 'db';
    return '';
  })();

  // プロジェクト内の最初の massCase を「とりあえずの参照DB」 として使う。
  // 後でケース個別画面 (設定モーダル) から変更してもらう想定。
  const firstMassCaseId = allMassCases[0]?.id;

  const handleUnifiedChange = (val: string) => {
    // 既存リンクを解除。label も一旦クリアして、新しいタイプ選択時に上書きする
    // (以前の解析名が残り続ける違和感を防ぐ)
    updateStep(flow.id, step.id, {
      analysisCaseId:   undefined,
      sizingCaseId:     undefined,
      linkedMassCaseId: undefined,
      pluginCaseId:     undefined,
      label:            '',
    });
    if (val === '') {
      setPendingType('none');
      setNewAnalysisService('');
      return;
    }
    if (val === 'sizing') {
      setPendingType('sizing');
      setNewAnalysisService('');
      if (!firstMassCaseId || !projectId) {
        updateStep(flow.id, step.id, { label: 'サイジング' });
        return;
      }
      const sc = addSizingCase({
        projectId,
        massCaseId: firstMassCaseId,
        name: 'サイジング',
        memo: '',
        createdBy: '',
      });
      updateStep(flow.id, step.id, { sizingCaseId: sc.id, label: sc.name });
      return;
    }
    if (val === 'plugin') {
      setPendingType('plugin');
      setNewAnalysisService('');
      updateStep(flow.id, step.id, { label: 'カスタム解析' });
      return;
    }
    if (val === 'db') {
      setPendingType('db');
      setNewAnalysisService('');
      updateStep(flow.id, step.id, { label: 'DB更新' });
      return;
    }
    if (val.startsWith('analysis:')) {
      const svc = val.slice('analysis:'.length) as AnalysisServiceType;
      setPendingType('analysis');
      setNewAnalysisService(svc);
      const label = SERVICE_META[svc]?.label ?? '解析';
      if (!svc || !firstMassCaseId || !projectId) {
        updateStep(flow.id, step.id, { label });
        return;
      }
      const ac = addAnalysisCase({
        serviceType: svc,
        projectId,
        massCaseId: firstMassCaseId,
        name: label,
        memo: '',
        createdBy: '',
        upstreamCaseId: '',
        condition: {},
      });
      updateStep(flow.id, step.id, { analysisCaseId: ac.id, label: ac.name });
    }
  };

  const handleOpenDB = () => {
    if (!step.linkedMassCaseId) return;
    navigate('massModel', { massCaseId: step.linkedMassCaseId });
  };

  return (
    <div className="d-flex align-items-start gap-2 flex-wrap mt-1">
      <span className="text-muted" style={{ fontSize: '0.74rem', minWidth: 60, paddingTop: 3 }}>解析:</span>

      <div className="d-flex flex-column gap-1 flex-grow-1">
        {/* 統一タイプ ドロップダウン (解析サービス / サイジング / カスタム / DB) */}
        <select
          className="form-select form-select-sm"
          style={{ fontSize: '0.78rem' }}
          value={unifiedValue}
          onChange={(e) => handleUnifiedChange(e.target.value)}
        >
          <option value="">（未選択）</option>
          <optgroup label="解析サービス">
            {ALL_SERVICES.map((s) => (
              <option key={s} value={`analysis:${s}`}>{SERVICE_META[s].label}</option>
            ))}
          </optgroup>
          <optgroup label="その他">
            <option value="sizing">サイジング</option>
            <option value="plugin">カスタム解析</option>
            <option value="db">DB更新</option>
          </optgroup>
        </select>

        {/* DB を作る必要があるか の警告 */}
        {(displayType === 'analysis' || displayType === 'sizing') && !firstMassCaseId && (
          <div className="form-text text-warning" style={{ fontSize: '0.72rem' }}>
            <i className="bi bi-exclamation-triangle me-1" />
            このプロジェクトにロケットDBがありません。先に作成してください
          </div>
        )}

        {/* DB: 参照DBを選ぶ (DB だけは型として「どの DB を更新するか」 を選ぶ必要があるので残す) */}
        {displayType === 'db' && (
          <div className="d-flex align-items-center gap-1">
            <select
              className="form-select form-select-sm"
              style={{ maxWidth: 240, fontSize: '0.78rem' }}
              value={step.linkedMassCaseId ?? ''}
              onChange={(e) => {
                const mc = allMassCases.find((c) => c.id === e.target.value);
                updateStep(flow.id, step.id, {
                  linkedMassCaseId: e.target.value || undefined,
                  ...(mc ? { label: `DB更新: ${mc.name}` } : {}),
                });
              }}
            >
              <option value="">（DB選択）</option>
              {allMassCases.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* カスタム解析: 既存ケース選択 (plugin は事前アップロード必須なので自動作成しない) */}
        {displayType === 'plugin' && !step.pluginCaseId && (
          <div className="d-flex align-items-center gap-1 flex-wrap">
            <select
              className="form-select form-select-sm"
              style={{ maxWidth: 240, fontSize: '0.78rem' }}
              value=""
              onChange={(e) => {
                const pc = allPluginCases.find((c) => c.id === e.target.value);
                updateStep(flow.id, step.id, {
                  pluginCaseId: e.target.value || undefined,
                  ...(pc ? { label: pc.name } : {}),
                });
              }}
            >
              <option value="">（カスタム解析ケースを選択）</option>
              {allPluginCases.map((c) => {
                const plg = allPlugins.find((p) => p.id === c.pluginId);
                return (
                  <option key={c.id} value={c.id}>
                    {c.name} {plg ? `(${plg.manifest.name})` : ''}
                  </option>
                );
              })}
            </select>
            {allPluginCases.length === 0 && (
              <div className="form-text text-warning" style={{ fontSize: '0.72rem' }}>
                <i className="bi bi-exclamation-triangle me-1" />カスタム解析タブで先にケースを作成してください
              </div>
            )}
          </div>
        )}

        {/* 設定ボタン: 常時表示。タイプ未選択 (またはケース未紐付) ならグレーアウト */}
        {(() => {
          let onClick: (() => void) | null = null;
          let title = '解析タイプを選択してください';
          if (displayType === 'analysis' && step.analysisCaseId) {
            const ac = allAnalysisCases.find((c) => c.id === step.analysisCaseId);
            if (ac) {
              onClick = () => setConditionModal({ caseId: ac.id, serviceType: ac.serviceType, name: ac.name });
              title = '解析条件を設定';
            }
          } else if (displayType === 'sizing' && step.sizingCaseId) {
            const sc = projectSizingCases.find((c) => c.id === step.sizingCaseId);
            if (sc) {
              onClick = () => setSizingModal({ caseId: sc.id, name: sc.name });
              title = 'サイジング条件を設定';
            }
          } else if (displayType === 'plugin' && step.pluginCaseId) {
            const pc = allPluginCases.find((c) => c.id === step.pluginCaseId);
            if (pc) {
              onClick = () => navigate('pluginCondition', { pluginCaseId: pc.id });
              title = 'カスタム解析を設定';
            }
          } else if (displayType === 'db' && step.linkedMassCaseId) {
            onClick = handleOpenDB;
            title = 'DBを開く';
          }
          return (
            <button
              className={`btn btn-sm ${onClick ? 'btn-outline-primary' : 'btn-outline-secondary'}`}
              style={{ fontSize: '0.78rem', padding: '4px 12px', alignSelf: 'flex-start' }}
              disabled={!onClick}
              onClick={() => onClick && onClick()}
              title={title}
            >
              <i className="bi bi-gear me-1" />設定
            </button>
          );
        })()}
      </div>

      {conditionModal && (
        <AnalysisConditionModal
          analysisCaseId={conditionModal.caseId}
          serviceType={conditionModal.serviceType}
          caseName={conditionModal.name}
          onClose={() => setConditionModal(null)}
        />
      )}
      {sizingModal && (
        <SizingConditionModal
          sizingCaseId={sizingModal.caseId}
          caseName={sizingModal.name}
          onClose={() => setSizingModal(null)}
        />
      )}
    </div>
  );
};

// ─── ステップサマリ ──────────────────────────────────────────────────────────

export const StepAnalysisSummary: React.FC<{ analysisCaseId: string; bindingCount: number }> = ({ analysisCaseId, bindingCount }) => {
  const resultCount = useAnalysisStore((s) =>
    s.results.filter((r) => r.analysisCaseId === analysisCaseId).length
  );
  const conditionFilled = useAnalysisStore((s) => {
    const c = s.cases.find((x) => x.id === analysisCaseId);
    return Boolean(c && Object.keys(c.condition ?? {}).length > 0);
  });

  return (
    <div className="d-flex gap-2 mt-1 flex-wrap" style={{ fontSize: '0.70rem' }}>
      <span className={`badge ${conditionFilled ? 'bg-success-subtle text-success' : 'bg-secondary-subtle text-secondary'}`}>
        <i className={`bi bi-${conditionFilled ? 'check-circle' : 'circle'} me-1`} />条件 {conditionFilled ? '入力済' : '未入力'}
      </span>
      <span className={`badge ${resultCount > 0 ? 'bg-primary-subtle text-primary' : 'bg-secondary-subtle text-secondary'}`}>
        <i className="bi bi-bar-chart-line me-1" />結果 {resultCount} 件
      </span>
      {bindingCount > 0 && (
        <span className="badge bg-info-subtle text-info">
          <i className="bi bi-link-45deg me-1" />バインド {bindingCount} 件
        </span>
      )}
    </div>
  );
};

export const StepSizingSummary: React.FC<{ sizingCaseId: string }> = ({ sizingCaseId }) => {
  const resultCount = useSizingStore((s) =>
    s.results.filter((r) => r.sizingCaseId === sizingCaseId).length
  );
  return (
    <div className="d-flex gap-2 mt-1" style={{ fontSize: '0.70rem' }}>
      <span className={`badge ${resultCount > 0 ? 'bg-primary-subtle text-primary' : 'bg-secondary-subtle text-secondary'}`}>
        <i className="bi bi-calculator me-1" />計算結果 {resultCount} 件
      </span>
    </div>
  );
};
