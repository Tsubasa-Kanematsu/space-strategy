import React, { useState } from 'react';
import { useAnalysisFlowStore } from '../../stores/analysisFlowStore';
import { useAppStore } from '../../stores/appStore';
import { useVehicleUnitStore } from '../../stores/vehicleUnitStore';
import { CommonParams } from './CommonParams';
import type { AnalysisFlow } from '../../types';
import { FlowCanvas } from './flow/FlowCanvas';
import { ExecutionStatusBar } from './flow/ExecutionStatusBar';
import { BUILTIN_FLOW_TEMPLATES, customToFlowTemplate, resolveSeedFromLabel, type FlowTemplate } from './flow/flowTemplates';
import { useFlowTemplateStore } from '../../stores/flowTemplateStore';
import { useAnalysisStore } from '../../stores/analysisStore';
import { useSizingStore } from '../../stores/sizingStore';
import { useMassCaseStore } from '../../stores/massCaseStore';
import { SERVICE_META } from './analysisServiceMeta';
import type { AnalysisFlowStep } from '../../types';
import { createPortal } from 'react-dom';

// ─── フローカード ─────────────────────────────────────────────────────────────

const FlowCard: React.FC<{
  flow: AnalysisFlow;
  projectId: string;
  /** 詳細画面で使う時はカードヘッダー (折りたたみ/名前編集/削除) を非表示にする。
   *  ページヘッダーが代替を提供するため。*/
  hideHeader?: boolean;
}> = ({ flow, projectId, hideHeader = false }) => {
  const updateFlow = useAnalysisFlowStore((s) => s.updateFlow);
  const deleteFlow = useAnalysisFlowStore((s) => s.deleteFlow);
  const addStep = useAnalysisFlowStore((s) => s.addStep);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(flow.name);
  const [collapsed, setCollapsed] = useState(false);
  // hideHeader時は常時展開
  const effectiveCollapsed = hideHeader ? false : collapsed;
  // 選択中ステップ: FlowCanvas でクリック選択された ID。
  // 追加 / 実行 ボタンが「選択ステップの後段に追加」「選択ステップのみ実行」を可能にする
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  const totalSteps = flow.steps.length;
  const doneCount = flow.steps.filter((s) => s.status === 'done').length;
  const inProgressCount = flow.steps.filter((s) => s.status === 'in_progress').length;
  const progress = totalSteps > 0 ? (doneCount / totalSteps) * 100 : 0;
  const flowStatus: 'pending' | 'in_progress' | 'done' =
    totalSteps > 0 && doneCount === totalSteps
      ? 'done'
      : inProgressCount > 0 || doneCount > 0
      ? 'in_progress'
      : 'pending';

  /**
   * 空フロー時のみ使う「最初のステップ」追加。
   * 既存ステップへの 後段追加/並列追加/削除 は FlowCanvas のノード右クリックメニューに集約済。
   */
  const handleAddStep = () => {
    addStep(
      flow.id,
      {
        order: flow.steps.length,
        label: `Step ${flow.steps.length + 1}`,
        status: 'pending',
        notes: '',
        dataBindings: [],
      },
      null
    );
  };

  return (
    <div className="card mb-4">
      {/* カードヘッダー (詳細画面では非表示。ページヘッダーが代替を提供) */}
      {!hideHeader && (
      <div className="card-header d-flex align-items-center gap-2 py-2" style={{ fontSize: '0.85rem' }}>
        <button
          className="btn btn-link p-0 text-muted"
          style={{ fontSize: '0.78rem' }}
          onClick={() => setCollapsed(!collapsed)}
        >
          <i className={`bi bi-chevron-${collapsed ? 'right' : 'down'}`} />
        </button>

        {editingName ? (
          <input
            className="form-control form-control-sm fw-semibold"
            style={{ maxWidth: 300 }}
            value={nameDraft}
            autoFocus
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => { updateFlow(flow.id, { name: nameDraft }); setEditingName(false); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { updateFlow(flow.id, { name: nameDraft }); setEditingName(false); }
              if (e.key === 'Escape') { setNameDraft(flow.name); setEditingName(false); }
            }}
          />
        ) : (
          <span
            className="fw-semibold flex-grow-1"
            style={{ cursor: 'pointer' }}
            onClick={() => { setNameDraft(flow.name); setEditingName(true); }}
            title="クリックして編集"
          >
            {flow.name}
          </span>
        )}

        {/* フロー全体ステータスバッジ */}
        {totalSteps > 0 && (
          <span
            className={`badge ${
              flowStatus === 'done'        ? 'bg-success' :
              flowStatus === 'in_progress' ? 'bg-warning text-dark' :
              'bg-secondary'
            }`}
            style={{ fontSize: '0.66rem' }}
          >
            {flowStatus === 'done'        ? '完了' :
             flowStatus === 'in_progress' ? '実施中' :
             '未実施'}
            {` ${doneCount}/${totalSteps}`}
          </span>
        )}

        <button
          className="btn btn-xs btn-outline-danger ms-1"
          style={{ fontSize: '0.68rem', padding: '1px 6px' }}
          title="フロー削除"
          onClick={() => {
            if (confirm(`「${flow.name}」を削除しますか?`)) deleteFlow(flow.id);
          }}
        >
          <i className="bi bi-trash" />
        </button>
      </div>
      )}

      {/* カードボディ */}
      {!effectiveCollapsed && (
        <div className="card-body p-0">
          {/* プログレスバー */}
          {totalSteps > 0 && (
            <div className="px-3 pt-2">
              <div className="progress" style={{ height: 4 }}>
                <div
                  className="progress-bar bg-success"
                  style={{ width: `${progress}%`, transition: 'width 0.3s' }}
                />
              </div>
            </div>
          )}

          {/* 実行状態バー (現在実行中ステップ / 経過時間 / 予想残り時間) */}
          {totalSteps > 0 && <ExecutionStatusBar flow={flow} />}

          {/* ステップなし */}
          {totalSteps === 0 ? (
            <div className="text-center text-muted py-4" style={{ fontSize: '0.82rem' }}>
              <i className="bi bi-diagram-3 d-block fs-3 mb-2 opacity-25" />
              ステップがありません
            </div>
          ) : (
            /* ReactFlow キャンバス */
            <div className="px-0 pt-2">
              <FlowCanvas
                flow={flow}
                projectId={projectId}
                selectedStepId={selectedStepId}
                onSelectedStepIdChange={setSelectedStepId}
              />
            </div>
          )}

          {/* 空フロー時の最初ステップ追加ヘルパー (実行ボタンはキャンバス左上に浮動配置) */}
          {totalSteps === 0 && (
            <div className="text-center px-3 pb-3 pt-2" style={{ fontSize: '0.78rem' }}>
              <button className="btn btn-sm btn-outline-secondary" onClick={() => handleAddStep()}>
                <i className="bi bi-plus-lg me-1" />最初のステップを追加
              </button>
              <div className="text-muted mt-1" style={{ fontSize: '0.72rem' }}>
                ※ 追加後はキャンバス上のブロックを右クリックで「後段追加 / 並列追加 / 削除」 が可能です
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── メインコンポーネント ─────────────────────────────────────────────────────

/**
 * 解析フロー詳細画面: appStore.analysisFlowId で指定された 1 フローを編集する。
 * 一覧画面 (AnalysisFlowList) からクリックして遷移する想定。
 */
export const AnalysisFlowEditor: React.FC = () => {
  const { analysisFlowId, navigate } = useAppStore();
  const flows = useAnalysisFlowStore((s) => s.flows);
  const updateFlow = useAnalysisFlowStore((s) => s.updateFlow);
  const deleteFlow = useAnalysisFlowStore((s) => s.deleteFlow);
  const units = useVehicleUnitStore((s) => s.units);

  const flow = analysisFlowId ? flows.find((f) => f.id === analysisFlowId) : null;
  // このフローを所有する号機（PT/FT）。あれば共通パラメータ（マスタ/機体諸元）を上部に出す。
  const ownerUnit = flow ? units.find((u) => u.pt.flowId === flow.id || u.ft.flowId === flow.id) ?? null : null;
  const ownerPhase: 'PT' | 'FT' | null = ownerUnit && flow
    ? (ownerUnit.pt.flowId === flow.id ? 'PT' : 'FT')
    : null;

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(flow?.name ?? '');
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  if (!flow) {
    return (
      <div className="text-center text-muted py-5" style={{ fontSize: '0.9rem' }}>
        <i className="bi bi-diagram-3 d-block fs-1 mb-3 opacity-25" />
        フローが見つかりません
        <div className="mt-3">
          <button className="btn btn-outline-primary btn-sm" onClick={() => navigate('analysisFlow')}>
            <i className="bi bi-arrow-left me-1" />一覧へ戻る
          </button>
        </div>
      </div>
    );
  }

  const totalSteps = flow.steps.length;
  const doneCount = flow.steps.filter((s) => s.status === 'done').length;
  const inProgressCount = flow.steps.filter((s) => s.status === 'in_progress').length;
  const flowStatus: 'pending' | 'in_progress' | 'done' =
    totalSteps > 0 && doneCount === totalSteps
      ? 'done'
      : inProgressCount > 0 || doneCount > 0
      ? 'in_progress'
      : 'pending';

  const handleDelete = () => {
    if (confirm(`「${flow.name}」を削除しますか?`)) {
      deleteFlow(flow.id);
      navigate('analysisFlow');
    }
  };

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      {/* 全解析の共通パラメータ（号機フェーズのフローのみ）。選択サマリのみ表示し、
          各行の「変更」でモーダルから選択を変更（質量諸元・誤差源もマスタデータ扱い）。 */}
      {ownerUnit && ownerPhase && (
        <CommonParams unit={ownerUnit} phase={ownerPhase} />
      )}

      {/* フロー操作ツールバー（コンテキストは上部の号機ワークバー/パンくずが提供） */}
      <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
        {!ownerUnit && (
          <>
            <button className="btn btn-outline-secondary btn-sm" onClick={() => navigate('analysisFlow')} title="解析フロー一覧へ">
              <i className="bi bi-arrow-left me-1" />一覧
            </button>
            {editingName ? (
              <input
                className="form-control form-control-sm fw-semibold"
                style={{ maxWidth: 320 }}
                value={nameDraft}
                autoFocus
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => { if (nameDraft.trim()) updateFlow(flow.id, { name: nameDraft.trim() }); setEditingName(false); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { if (nameDraft.trim()) updateFlow(flow.id, { name: nameDraft.trim() }); setEditingName(false); }
                  if (e.key === 'Escape') { setNameDraft(flow.name); setEditingName(false); }
                }}
              />
            ) : (
              <span className="fw-semibold" style={{ cursor: 'pointer' }} onClick={() => { setNameDraft(flow.name); setEditingName(true); }} title="クリックして名前を編集">
                {flow.name}
              </span>
            )}
          </>
        )}
        <button
          className="btn btn-outline-primary btn-sm"
          onClick={() => setShowTemplateModal(true)}
          title="テンプレートから流し込み"
        >
          <i className="bi bi-stars me-1" />テンプレート
        </button>
        {totalSteps > 0 && (
          <span
            className={`badge ${
              flowStatus === 'done'        ? 'bg-success' :
              flowStatus === 'in_progress' ? 'bg-warning text-dark' :
              'bg-secondary'
            }`}
            style={{ fontSize: '0.72rem' }}
          >
            {flowStatus === 'done' ? '完了' : flowStatus === 'in_progress' ? '実施中' : '未実施'}
            {` ${doneCount}/${totalSteps}`}
          </span>
        )}
        {!ownerUnit && (
          <button className="btn btn-outline-danger btn-sm ms-auto" onClick={handleDelete} title="フローを削除">
            <i className="bi bi-trash" />
          </button>
        )}
      </div>

      <FlowCard flow={flow} projectId={flow.projectId} hideHeader />

      {showTemplateModal && (
        <TemplateModal
          flow={flow}
          hasExistingSteps={totalSteps > 0}
          onClose={() => setShowTemplateModal(false)}
        />
      )}

    </div>
  );
};

// ─── テンプレートモーダル (ビルトイン + ユーザー保存) ────────────────

const TemplateModal: React.FC<{
  hasExistingSteps: boolean;
  flow: AnalysisFlow;
  onClose: () => void;
}> = ({ hasExistingSteps, flow, onClose }) => {
  const customTemplates = useFlowTemplateStore((s) => s.templates);
  const saveTemplate = useFlowTemplateStore((s) => s.saveTemplate);
  const deleteTemplate = useFlowTemplateStore((s) => s.deleteTemplate);
  const updateFlow = useAnalysisFlowStore((s) => s.updateFlow);

  // テンプレ適用時に解析ケース等を自動作成するために stores を引く
  const allMassCases = useMassCaseStore((s) => s.cases).filter((c) => c.projectId === flow.projectId);
  const addAnalysisCase = useAnalysisStore((s) => s.addCase);
  const addSizingCase = useSizingStore((s) => s.addCase);
  const firstMassCaseId = allMassCases[0]?.id;

  const [showSaveForm, setShowSaveForm] = React.useState(false);
  const [saveName, setSaveName] = React.useState('');
  const [saveDesc, setSaveDesc] = React.useState('');

  /**
   * テンプレートの各ステップに対し label からサービス種別を解決し、
   * 必要なケース (AnalysisCase / SizingCase) を作って ID を流し込む。
   * 結果として「ピッカーで既に選択済み」 の状態でフロー適用される。
   */
  const hydrateSteps = (rawSteps: AnalysisFlowStep[]): AnalysisFlowStep[] => {
    if (!firstMassCaseId) return rawSteps; // DB未作成 ならスケルトンのまま
    return rawSteps.map((step) => {
      if (step.kind === 'decision') return step;
      const seed = resolveSeedFromLabel(step.label);
      if (!seed) return step;
      if (seed.kind === 'analysis') {
        const meta = SERVICE_META[seed.service];
        const ac = addAnalysisCase({
          serviceType: seed.service,
          projectId: flow.projectId,
          massCaseId: firstMassCaseId,
          name: meta.label,
          memo: '',
          createdBy: '',
          upstreamCaseId: '',
          condition: {},
        });
        return { ...step, analysisCaseId: ac.id, label: ac.name };
      }
      if (seed.kind === 'sizing') {
        const sc = addSizingCase({
          projectId: flow.projectId,
          massCaseId: firstMassCaseId,
          name: 'サイジング',
          memo: '',
          createdBy: '',
        });
        return { ...step, sizingCaseId: sc.id, label: sc.name };
      }
      if (seed.kind === 'db') {
        return { ...step, linkedMassCaseId: firstMassCaseId, label: `DB更新` };
      }
      return step;
    });
  };

  const handleApply = (tpl: FlowTemplate) => {
    if (hasExistingSteps) {
      const ok = window.confirm(`現在のステップは全て置き換えられます。「${tpl.name}」を適用しますか?`);
      if (!ok) return;
    }
    const hydrated = hydrateSteps(tpl.build());
    updateFlow(flow.id, { steps: hydrated });
    onClose();
  };

  const handleSave = () => {
    if (!saveName.trim()) return;
    saveTemplate({ name: saveName, description: saveDesc, steps: flow.steps });
    setSaveName(''); setSaveDesc(''); setShowSaveForm(false);
  };

  return createPortal(
    <div
      className="modal d-block"
      style={{ background: 'rgba(0,0,0,0.45)', zIndex: 1060 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-dialog modal-lg modal-dialog-scrollable" style={{ maxHeight: '90vh' }}>
        <div className="modal-content">
          <div className="modal-header py-2">
            <h6 className="modal-title">
              <i className="bi bi-stars me-2 text-primary" />
              テンプレート
            </h6>
            <button className="btn-close btn-sm" onClick={onClose} />
          </div>
          <div className="modal-body">
            {hasExistingSteps && (
              <div className="alert alert-warning py-2 mb-3" style={{ fontSize: '0.82rem' }}>
                <i className="bi bi-exclamation-triangle me-1" />
                テンプレート適用時、現在のステップは置き換えられます
              </div>
            )}

            {/* 現在のフローを保存 */}
            <div className="card p-3 mb-3" style={{ background: '#f8fafc', borderStyle: 'dashed' }}>
              {!showSaveForm ? (
                <button
                  className="btn btn-outline-success btn-sm align-self-start"
                  style={{ fontSize: '0.82rem' }}
                  onClick={() => setShowSaveForm(true)}
                  disabled={!hasExistingSteps}
                  title={hasExistingSteps ? '現在のフローをテンプレ保存 (DB選択は空で保存)' : 'ステップを作成してから保存できます'}
                >
                  <i className="bi bi-bookmark-plus me-1" />現在のフローをテンプレートとして保存
                </button>
              ) : (
                <div>
                  <div className="mb-2">
                    <label className="form-label" style={{ fontSize: '0.78rem' }}>テンプレート名 <span className="text-danger">*</span></label>
                    <input
                      className="form-control form-control-sm"
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      placeholder="例: 弊社標準 基本設計フロー"
                      autoFocus
                    />
                  </div>
                  <div className="mb-2">
                    <label className="form-label" style={{ fontSize: '0.78rem' }}>説明 (任意)</label>
                    <input
                      className="form-control form-control-sm"
                      value={saveDesc}
                      onChange={(e) => setSaveDesc(e.target.value)}
                      placeholder="使い方や前提"
                    />
                  </div>
                  <div className="d-flex gap-2">
                    <button className="btn btn-sm btn-success" onClick={handleSave} disabled={!saveName.trim()}>
                      <i className="bi bi-check-lg me-1" />保存
                    </button>
                    <button className="btn btn-sm btn-secondary" onClick={() => { setShowSaveForm(false); setSaveName(''); setSaveDesc(''); }}>
                      キャンセル
                    </button>
                    <span className="text-muted ms-auto align-self-center" style={{ fontSize: '0.72rem' }}>
                      ※ 保存時、ロケットDB / ケースID / バインド情報は空にしてから保存します
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* マイテンプレート (カスタム) */}
            {customTemplates.length > 0 && (
              <>
                <div className="text-uppercase fw-bold text-muted mb-2" style={{ fontSize: '0.72rem', letterSpacing: 0.5 }}>
                  <i className="bi bi-bookmark me-1" />マイテンプレート
                </div>
                <div className="row g-3 mb-4">
                  {customTemplates.map((c) => {
                    const tpl = customToFlowTemplate(c);
                    return (
                      <div key={c.id} className="col-12">
                        <div
                          className="card p-0"
                          style={{ borderLeft: '4px solid #10b981', background: '#fff' }}
                        >
                          <div className="card-body p-3 d-flex align-items-start gap-3">
                            <div
                              className="d-flex align-items-center justify-content-center"
                              style={{ width: 44, height: 44, borderRadius: 8, background: '#d1fae5', color: '#047857', flexShrink: 0 }}
                            >
                              <i className={`bi bi-${tpl.icon}`} style={{ fontSize: 22 }} />
                            </div>
                            <div className="flex-grow-1" style={{ cursor: 'pointer' }} onClick={() => handleApply(tpl)}>
                              <div className="fw-semibold mb-1" style={{ fontSize: '0.95rem' }}>{tpl.name}</div>
                              <div className="text-muted" style={{ fontSize: '0.78rem', lineHeight: 1.4 }}>
                                {tpl.description}
                              </div>
                              <div className="text-muted mt-1" style={{ fontSize: '0.70rem' }}>
                                {c.steps.length} ステップ ・ 保存日: {new Date(c.createdAt).toLocaleDateString('ja-JP')}
                              </div>
                            </div>
                            <button
                              className="btn btn-sm btn-outline-primary"
                              style={{ fontSize: '0.75rem' }}
                              onClick={() => handleApply(tpl)}
                            >
                              適用
                            </button>
                            <button
                              className="btn btn-sm btn-outline-danger"
                              style={{ fontSize: '0.75rem' }}
                              title="このテンプレを削除"
                              onClick={() => {
                                if (window.confirm(`「${c.name}」を削除しますか?`)) deleteTemplate(c.id);
                              }}
                            >
                              <i className="bi bi-trash" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* ビルトイン (ロケット工程) */}
            <div className="text-uppercase fw-bold text-muted mb-2" style={{ fontSize: '0.72rem', letterSpacing: 0.5 }}>
              <i className="bi bi-stars me-1" />ロケット開発工程テンプレート
            </div>
            <div className="row g-3">
              {BUILTIN_FLOW_TEMPLATES.map((tpl) => (
                <div key={tpl.key} className="col-12">
                  <button
                    className="card p-0 text-start w-100"
                    style={{ borderLeft: '4px solid #2563eb', cursor: 'pointer', background: '#fff' }}
                    onClick={() => handleApply(tpl)}
                  >
                    <div className="card-body p-3 d-flex align-items-start gap-3">
                      <div
                        className="d-flex align-items-center justify-content-center"
                        style={{ width: 44, height: 44, borderRadius: 8, background: '#dbeafe', color: '#1d4ed8', flexShrink: 0 }}
                      >
                        <i className={`bi bi-${tpl.icon}`} style={{ fontSize: 22 }} />
                      </div>
                      <div className="flex-grow-1">
                        <div className="fw-semibold mb-1" style={{ fontSize: '0.95rem' }}>{tpl.name}</div>
                        <div className="text-muted" style={{ fontSize: '0.80rem', lineHeight: 1.4 }}>
                          {tpl.description}
                        </div>
                      </div>
                      <i className="bi bi-arrow-right text-muted" style={{ fontSize: 16 }} />
                    </div>
                  </button>
                </div>
              ))}
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
