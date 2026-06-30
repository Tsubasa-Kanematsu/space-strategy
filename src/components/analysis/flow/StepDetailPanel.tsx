import React, { useState } from 'react';
import { DeleteConfirmModal } from '../../common/DeleteConfirmModal';
import { useAnalysisFlowStore } from '../../../stores/analysisFlowStore';
import { useAnalysisStore } from '../../../stores/analysisStore';
import { useSizingStore } from '../../../stores/sizingStore';
import { useAppStore } from '../../../stores/appStore';
import type { AnalysisFlow, AnalysisFlowStep } from '../../../types';
import {
  LinkedCasePicker,
  getLinkedType,
  LINKED_TYPE_COLOR,
  LINKED_TYPE_LABEL,
} from '../StepComponents';

/**
 * ステップ詳細パネル: 右側に表示される。
 * - 上: 設定 (解析タイプ + 設定モーダル + メモ)
 * - 下: 結果へのジャンプ (1ステップ = 1ケース = 1結果)
 *
 * 判定ステップ (kind='decision') の場合は専用 UI:
 *   - 判定条件 (自由記述)
 *   - ループ先 (フロー内の任意ステップを選択)
 */

interface StepDetailPanelProps {
  flow: AnalysisFlow;
  step: AnalysisFlowStep;
  projectId: string;
  allSteps: AnalysisFlowStep[];
  onClose: () => void;
}

export const StepDetailPanel: React.FC<StepDetailPanelProps> = ({
  flow,
  step,
  projectId,
  allSteps,
  onClose,
}) => {
  const updateStep = useAnalysisFlowStore((s) => s.updateStep);
  const deleteStep = useAnalysisFlowStore((s) => s.deleteStep);
  const { navigate } = useAppStore();

  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const isDecision = step.kind === 'decision';
  const linkedType = getLinkedType(step);
  const currentIndex = allSteps.findIndex((s) => s.id === step.id);

  const openResults = () => {
    if (step.analysisCaseId) {
      const ac = useAnalysisStore.getState().cases.find((c) => c.id === step.analysisCaseId);
      if (ac) navigate('analysisResults', { analysisCaseId: ac.id, analysisService: ac.serviceType, projectId: ac.projectId });
    } else if (step.sizingCaseId) {
      const sc = useSizingStore.getState().cases.find((c) => c.id === step.sizingCaseId);
      if (sc) navigate('sizingResults', { sizingCaseId: sc.id, projectId: sc.projectId, massCaseId: sc.massCaseId });
    } else if (step.pluginCaseId) {
      navigate('pluginCondition', { pluginCaseId: step.pluginCaseId });
    }
  };

  // 判定ステップ: ループ先候補 = フロー内の全ステップ (自分以外)
  const loopTargetOptions = allSteps.filter((s) => s.id !== step.id);
  const isDone = step.status === 'done';
  const hasLinkedCase = !!(step.analysisCaseId || step.sizingCaseId || step.pluginCaseId);

  return (
    <div
      style={{
        width: 340,
        minWidth: 340,
        borderLeft: '1px solid #e9ecef',
        display: 'flex',
        flexDirection: 'column',
        background: '#ffffff',
        overflow: 'hidden',
      }}
    >
      {/* ヘッダー (ステータスバッジは撤去。種別バッジと閉じるのみ) */}
      <div
        style={{
          padding: '8px 14px',
          borderBottom: '1px solid #e9ecef',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: '#f8fafc',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, flexShrink: 0 }}>
          Step {currentIndex + 1}
        </span>
        {isDecision ? (
          <span
            className="badge"
            style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', fontSize: '0.58rem' }}
          >
            判定
          </span>
        ) : (
          linkedType !== 'none' && (
            <span
              className="badge"
              style={{
                background: `${LINKED_TYPE_COLOR[linkedType]}18`,
                color: LINKED_TYPE_COLOR[linkedType],
                border: `1px solid ${LINKED_TYPE_COLOR[linkedType]}40`,
                fontSize: '0.58rem',
              }}
            >
              {LINKED_TYPE_LABEL[linkedType]}
            </span>
          )
        )}
        <button
          className="btn btn-link p-0 text-muted ms-auto"
          style={{ fontSize: '0.8rem', lineHeight: 1 }}
          onClick={onClose}
          title="閉じる"
        >
          <i className="bi bi-x-lg" />
        </button>
      </div>

      {/* ボディ (スクロール可能) */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* ─── 設定セクション ─────────────────────────────────────────── */}
        <div style={{ padding: '12px 14px', flex: '1 0 auto' }}>
          <div className="text-uppercase fw-bold text-muted mb-2" style={{ fontSize: '0.68rem', letterSpacing: 0.5 }}>
            <i className="bi bi-gear me-1" />設定
          </div>

          {isDecision ? (
            // 判定ステップ専用 UI
            <>
              <div className="mb-3">
                <label style={{ fontSize: '0.70rem', color: '#6b7280', display: 'block', marginBottom: 3 }}>
                  判定条件 (自由記述)
                </label>
                <textarea
                  className="form-control form-control-sm"
                  rows={3}
                  style={{ fontSize: '0.78rem' }}
                  placeholder="例: 質量マージン > 10% かつ ΔV >= 9500 m/s"
                  value={step.loopCondition ?? ''}
                  onChange={(e) => updateStep(flow.id, step.id, { loopCondition: e.target.value })}
                />
                <div className="form-text" style={{ fontSize: '0.7rem' }}>
                  満たさない場合はループ先に戻る。満たせば後続ステップへ進む
                </div>
              </div>
              <div className="mb-3">
                <label style={{ fontSize: '0.70rem', color: '#6b7280', display: 'block', marginBottom: 3 }}>
                  ループ先 (条件未達時に戻る)
                </label>
                <select
                  className="form-select form-select-sm"
                  value={step.loopBackToStepId ?? ''}
                  onChange={(e) => updateStep(flow.id, step.id, { loopBackToStepId: e.target.value || undefined })}
                >
                  <option value="">（未設定）</option>
                  {loopTargetOptions.map((s) => {
                    const idx = allSteps.findIndex((x) => x.id === s.id);
                    return (
                      <option key={s.id} value={s.id}>Step {idx + 1}: {s.label || '(未設定)'}</option>
                    );
                  })}
                </select>
              </div>
            </>
          ) : (
            // 通常ステップ: 解析タイプ ピッカー
            <div className="mb-3">
              <LinkedCasePicker key={step.id} flow={flow} step={step} projectId={projectId} />
            </div>
          )}

          {/* メモ */}
          <div className="mb-2">
            <label style={{ fontSize: '0.70rem', color: '#6b7280', display: 'block', marginBottom: 3 }}>
              メモ
            </label>
            <textarea
              className="form-control form-control-sm"
              rows={3}
              style={{ fontSize: '0.78rem', resize: 'vertical' }}
              placeholder="任意のメモ..."
              value={step.notes}
              onChange={(e) => updateStep(flow.id, step.id, { notes: e.target.value })}
            />
          </div>
        </div>

        {/* ─── 結果セクション (1ステップ=1ケース=1結果) ─────────────── */}
        {!isDecision && (
          <div
            style={{
              padding: '12px 14px',
              borderTop: '1px solid #e9ecef',
              background: '#fafafa',
              flexShrink: 0,
            }}
          >
            <div className="text-uppercase fw-bold text-muted mb-2" style={{ fontSize: '0.68rem', letterSpacing: 0.5 }}>
              <i className="bi bi-bar-chart-line me-1" />結果
            </div>
            <button
              className="btn btn-outline-primary btn-sm w-100"
              style={{ fontSize: '0.82rem' }}
              disabled={!hasLinkedCase || !isDone}
              onClick={openResults}
              title={
                !hasLinkedCase
                  ? '先に解析タイプを選択してください'
                  : !isDone
                  ? '解析が完了するとジャンプできます'
                  : 'このケースの結果画面へジャンプ'
              }
            >
              <i className="bi bi-box-arrow-up-right me-1" />
              {isDone ? '結果を見る (ケースへジャンプ)' : '結果未生成'}
            </button>
          </div>
        )}
      </div>

      {/* フッター: 削除 */}
      <div
        style={{
          padding: '8px 14px',
          borderTop: '1px solid #e9ecef',
          display: 'flex',
          gap: 6,
          flexShrink: 0,
        }}
      >
        <button
          className="btn btn-sm btn-outline-danger ms-auto"
          style={{ fontSize: '0.72rem' }}
          onClick={() => setShowDeleteModal(true)}
        >
          <i className="bi bi-trash me-1" />削除
        </button>
        {showDeleteModal && (
          <DeleteConfirmModal
            itemName={step.label}
            onConfirm={() => { deleteStep(flow.id, step.id); onClose(); }}
            onCancel={() => setShowDeleteModal(false)}
          />
        )}
      </div>
    </div>
  );
};
