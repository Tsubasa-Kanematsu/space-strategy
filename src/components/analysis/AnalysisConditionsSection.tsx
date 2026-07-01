import React, { useState } from 'react';
import { useAnalysisStore } from '../../stores/analysisStore';
import { useAnalysisFlowStore } from '../../stores/analysisFlowStore';
import { SERVICE_META } from './analysisServiceMeta';
import { resolveSeedFromLabel } from './flow/flowTemplates';
import { AnalysisConditionView } from './AnalysisConditionView';
import type { AnalysisFlow, AnalysisServiceType } from '../../types';

interface Item {
  stepId: string;
  service: AnalysisServiceType;
  caseId: string | null;
}

/**
 * 条件設定ページの「解析別の条件」セクション。
 * フロー内の各解析ステップについて、その解析固有の条件をこの場で設定できる。
 * ケース未作成のステップは、条件を開いた時点で解析ケースを作成して紐付ける。
 */
export const AnalysisConditionsSection: React.FC<{ flow: AnalysisFlow; massCaseId: string | null }> = ({ flow, massCaseId }) => {
  const cases = useAnalysisStore((s) => s.cases);
  const addCase = useAnalysisStore((s) => s.addCase);
  const updateStep = useAnalysisFlowStore((s) => s.updateStep);
  const [editing, setEditing] = useState<{ caseId: string; service: AnalysisServiceType } | null>(null);

  // フロー内の「解析」ステップを service に解決（既存ケース優先、無ければ label から）
  const items: Item[] = flow.steps
    .filter((s) => (s.kind ?? 'normal') === 'normal')
    .sort((a, b) => a.order - b.order)
    .map((s): Item | null => {
      const ac = s.analysisCaseId ? cases.find((c) => c.id === s.analysisCaseId) : null;
      if (ac) return { stepId: s.id, service: ac.serviceType, caseId: ac.id };
      const seed = resolveSeedFromLabel(s.label);
      if (seed && seed.kind === 'analysis') return { stepId: s.id, service: seed.service, caseId: null };
      return null;
    })
    .filter((x): x is Item => x !== null);

  const openCondition = (item: Item) => {
    let caseId = item.caseId;
    if (!caseId) {
      const label = SERVICE_META[item.service].label;
      const ac = addCase({
        serviceType: item.service,
        projectId: flow.projectId,
        massCaseId: massCaseId ?? '',
        name: label,
        memo: '',
        createdBy: '',
        upstreamCaseId: '',
        condition: {},
      });
      caseId = ac.id;
      updateStep(flow.id, item.stepId, { analysisCaseId: ac.id, label: ac.name });
    }
    setEditing({ caseId, service: item.service });
  };

  const isConfigured = (caseId: string | null) => {
    if (!caseId) return false;
    const c = cases.find((x) => x.id === caseId);
    return !!c && !!c.condition && Object.keys(c.condition).length > 0;
  };

  const editingName = editing ? SERVICE_META[editing.service].label : '';

  return (
    <div className="mt-4">
      <div className="d-flex align-items-center mb-2">
        <span className="fw-semibold small"><i className="bi bi-ui-checks me-1 text-primary" />解析別の条件</span>
        <span className="text-muted ms-2" style={{ fontSize: '0.75rem' }}>各解析に固有の条件（共通パラメータ以外）を設定します</span>
      </div>

      {items.length === 0 ? (
        <div className="text-muted small border rounded-3 px-3 py-3">
          このフローには解析ステップがありません。「実行管理」タブでテンプレートから追加してください。
        </div>
      ) : (
        <div className="border rounded-3">
          {items.map((item, i) => {
            const meta = SERVICE_META[item.service];
            const configured = isConfigured(item.caseId);
            return (
              <div key={item.stepId} className={`d-flex align-items-center px-3 py-2 ${i < items.length - 1 ? 'border-bottom' : ''}`}>
                <span className="d-inline-flex align-items-center gap-2" style={{ flexShrink: 0 }}>
                  <span className="d-inline-flex align-items-center justify-content-center rounded-2" style={{ width: 26, height: 26, background: '#05966918', color: '#059669', flexShrink: 0 }}>
                    <i className={`bi bi-${meta.icon}`} style={{ fontSize: '0.85rem' }} />
                  </span>
                  <span className="fw-medium small">{meta.label}</span>
                </span>
                <span className="flex-grow-1 text-end me-2">
                  {configured
                    ? <span className="badge bg-success-subtle text-success-emphasis">設定済み</span>
                    : <span className="badge bg-light text-muted border">未設定</span>}
                </span>
                <button className="btn btn-sm btn-outline-primary py-0" onClick={() => openCondition(item)}>
                  <i className="bi bi-pencil-square me-1" />{configured ? '編集' : '条件を設定'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setEditing(null)}>
          <div className="modal-dialog modal-lg modal-dialog-scrollable" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header py-2">
                <h6 className="modal-title"><i className="bi bi-ui-checks me-2 text-primary" />{editingName} の条件</h6>
                <button className="btn-close" onClick={() => setEditing(null)} />
              </div>
              <div className="modal-body">
                <AnalysisConditionView caseId={editing.caseId} serviceType={editing.service} />
              </div>
              <div className="modal-footer py-2">
                <button className="btn btn-sm btn-primary" onClick={() => setEditing(null)}>完了</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
