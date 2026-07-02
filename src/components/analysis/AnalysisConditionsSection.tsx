import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAnalysisStore } from '../../stores/analysisStore';
import { useAnalysisFlowStore } from '../../stores/analysisFlowStore';
import { useProjectStore } from '../../stores/projectStore';
import { useVehicleUnitStore } from '../../stores/vehicleUnitStore';
import { SERVICE_META } from './analysisServiceMeta';
import { resolveSeedFromLabel } from './flow/flowTemplates';
import { AnalysisConditionView } from './AnalysisConditionView';
import { ensureAnalysisCaseForStep } from './analysisCaseSetup';
import type { AnalysisFlow, AnalysisServiceType } from '../../types';

const fmtVal = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

/** 比較タブ: 他プロジェクト/過去号機の同種解析ケースを並べて比較し、条件を引用できる。 */
const ConditionCompare: React.FC<{ serviceType: AnalysisServiceType; currentCaseId: string; onQuote: (cond: Record<string, unknown>) => void }> = ({ serviceType, currentCaseId, onQuote }) => {
  const cases = useAnalysisStore((s) => s.cases);
  const getProject = useProjectStore((s) => s.getProject);
  const units = useVehicleUnitStore((s) => s.units);
  const flows = useAnalysisFlowStore((s) => s.flows);
  const [openId, setOpenId] = useState<string | null>(null);

  const others = cases.filter((c) => c.serviceType === serviceType && c.id !== currentCaseId);

  const ownerLabel = (caseId: string, projectId: string): string => {
    const proj = getProject(projectId)?.name;
    const flow = flows.find((f) => f.steps.some((s) => s.analysisCaseId === caseId));
    let unitLabel: string | undefined;
    if (flow) {
      const u = units.find((x) => x.analyses.some((a) => a.flowId === flow.id));
      const entry = u?.analyses.find((a) => a.flowId === flow.id);
      if (u && entry) unitLabel = `${u.unitNo}号機 ${entry.name}`;
    }
    return [proj, unitLabel].filter(Boolean).join(' ／ ') || '（プロジェクト外）';
  };

  if (others.length === 0) {
    return (
      <div className="text-muted small py-4 text-center">
        <i className="bi bi-columns-gap fs-3 d-block mb-2 opacity-25" />
        他に同種（{SERVICE_META[serviceType].label}）の解析ケースがありません。<br />
        他プロジェクト・過去号機で同じ解析を設定すると、ここで比較できます。
      </div>
    );
  }

  return (
    <div>
      <p className="text-muted small mb-2">他プロジェクト・過去号機の同種解析と条件を比較できます。「この条件を引用」で現在のケースへコピーします。</p>
      {others.map((c) => {
        const open = openId === c.id;
        const entries = Object.entries(c.condition ?? {});
        return (
          <div key={c.id} className="border rounded-3 mb-2">
            <div className="d-flex align-items-center px-3 py-2" style={{ cursor: 'pointer' }} onClick={() => setOpenId(open ? null : c.id)}>
              <i className={`bi bi-chevron-${open ? 'down' : 'right'} me-2 text-muted`} />
              <span className="fw-medium small flex-grow-1">
                {c.name}
                <span className="text-muted ms-2" style={{ fontSize: '0.72rem' }}>{ownerLabel(c.id, c.projectId)}</span>
              </span>
              <span className="text-muted" style={{ fontSize: '0.7rem' }}>{new Date(c.updatedAt).toLocaleDateString('ja-JP')}</span>
            </div>
            {open && (
              <div className="border-top px-3 py-2">
                {entries.length === 0
                  ? <div className="text-muted small">条件は未入力です。</div>
                  : (
                    <table className="table table-sm mb-2">
                      <tbody>
                        {entries.map(([k, v]) => (
                          <tr key={k}>
                            <td className="text-muted small" style={{ width: '45%' }}>{k}</td>
                            <td className="small font-monospace">{fmtVal(v)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                <button
                  className="btn btn-sm btn-outline-primary"
                  disabled={entries.length === 0}
                  onClick={() => { if (confirm('現在の解析条件を、このケースの内容で上書きします。よろしいですか？')) onQuote(c.condition ?? {}); }}
                >
                  <i className="bi bi-arrow-down-square me-1" />この条件を引用
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

/** メモ・エビデンスタブ: パラメータごとに設定根拠とエビデンスを添付。 */
const ParamAnnotations: React.FC<{ caseId: string }> = ({ caseId }) => {
  const cases = useAnalysisStore((s) => s.cases);
  const updateCase = useAnalysisStore((s) => s.updateCase);
  const c = cases.find((x) => x.id === caseId);
  const anns = c?.annotations ?? [];
  const save = (next: typeof anns) => updateCase(caseId, { annotations: next });

  return (
    <div>
      <div className="d-flex align-items-center mb-2">
        <p className="text-muted small mb-0">各パラメータに設定根拠（メモ）とエビデンス（図番・報告書・URL 等）を添付できます。</p>
        <button className="btn btn-sm btn-outline-primary ms-auto py-0" onClick={() => save([...anns, { id: uuidv4(), param: '', memo: '', evidence: '' }])}>
          <i className="bi bi-plus-lg me-1" />追加
        </button>
      </div>
      {anns.length === 0 ? (
        <div className="text-muted small py-4 text-center">
          <i className="bi bi-journal-text fs-3 d-block mb-2 opacity-25" />
          まだ注記がありません。「追加」でパラメータのメモ・エビデンスを登録できます。
        </div>
      ) : (
        anns.map((a) => (
          <div key={a.id} className="border rounded-3 p-2 mb-2">
            <div className="row g-2">
              <div className="col-md-4">
                <label className="form-label small mb-1">パラメータ</label>
                <input className="form-control form-control-sm" value={a.param} placeholder="例: 打上方位角"
                  onChange={(e) => save(anns.map((x) => x.id === a.id ? { ...x, param: e.target.value } : x))} />
              </div>
              <div className="col-md-8">
                <label className="form-label small mb-1">エビデンス</label>
                <input className="form-control form-control-sm" value={a.evidence} placeholder="例: 設計書 STR-001 Rev.C / 試験report TR-2026-003 / URL"
                  onChange={(e) => save(anns.map((x) => x.id === a.id ? { ...x, evidence: e.target.value } : x))} />
              </div>
              <div className="col-12">
                <label className="form-label small mb-1">メモ（設定根拠）</label>
                <textarea className="form-control form-control-sm" rows={2} value={a.memo}
                  onChange={(e) => save(anns.map((x) => x.id === a.id ? { ...x, memo: e.target.value } : x))} />
              </div>
            </div>
            <div className="text-end mt-1">
              <button className="btn btn-sm btn-link text-danger p-0" onClick={() => save(anns.filter((x) => x.id !== a.id))}>
                <i className="bi bi-trash me-1" />削除
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

/** 解析フローのノードから開く条件モーダル（条件入力／比較／メモ・エビデンス）。 */
export const AnalysisConditionModal: React.FC<{ flow: AnalysisFlow; stepId: string; massCaseId: string | null; onClose: () => void }> = ({ flow, stepId, massCaseId, onClose }) => {
  const cases = useAnalysisStore((s) => s.cases);
  const updateCase = useAnalysisStore((s) => s.updateCase);
  const updateStep = useAnalysisFlowStore((s) => s.updateStep);
  const flowsLive = useAnalysisFlowStore((s) => s.flows);
  const [condTab, setCondTab] = useState<'input' | 'compare' | 'notes'>('input');
  const [caseId, setCaseId] = useState<string | null>(null);

  const flowLive = flowsLive.find((f) => f.id === flow.id) ?? flow;
  const step = flowLive.steps.find((s) => s.id === stepId) ?? null;
  const isCustom = !!step?.isCustom;
  const existingCase = step?.analysisCaseId ? cases.find((c) => c.id === step.analysisCaseId) : null;
  const seed = existingCase || isCustom ? null : (step ? resolveSeedFromLabel(step.label) : null);
  const service: AnalysisServiceType | null = existingCase
    ? existingCase.serviceType
    : (seed && seed.kind === 'analysis' ? seed.service : null);

  // 解析ステップなら条件ケースを用意（上流連結込み）。開いたステップが変わるたびに解決。
  useEffect(() => {
    if (isCustom) { setCaseId(null); return; }
    setCaseId(ensureAnalysisCaseForStep(flow.id, stepId, massCaseId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId]);

  const title = isCustom ? (step?.label || 'カスタム解析') : (service ? SERVICE_META[service].label : (step?.label ?? 'ステップ'));

  return (
    <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div className="modal-dialog modal-lg modal-dialog-scrollable" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header py-2">
            <h6 className="modal-title">
              <i className={`bi ${isCustom ? 'bi-puzzle' : 'bi-ui-checks'} me-2 text-primary`} />{title}{isCustom ? '' : ' の条件'}
            </h6>
            <button className="btn-close" onClick={onClose} />
          </div>
          {isCustom && step ? (
            /* カスタム解析: 名前・条件パラメータ・メモをこの画面で設定 */
            <div className="modal-body">
              <p className="text-muted small mb-3">カスタム解析ステップです。名称・条件パラメータ・内容メモをここで設定できます。</p>
              <label className="form-label small fw-medium mb-1">解析名</label>
              <input className="form-control form-control-sm mb-3" value={step.label}
                onChange={(e) => updateStep(flow.id, step.id, { label: e.target.value })} />

              <div className="d-flex align-items-center mb-1">
                <label className="form-label small fw-medium mb-0">条件パラメータ</label>
                <button
                  className="btn btn-sm btn-outline-primary ms-auto py-0"
                  onClick={() => updateStep(flow.id, step.id, { customParams: [...(step.customParams ?? []), { key: '', value: '' }] })}
                >
                  <i className="bi bi-plus-lg me-1" />追加
                </button>
              </div>
              {(step.customParams ?? []).length === 0 ? (
                <div className="text-muted small border rounded-2 px-2 py-2 mb-3">パラメータがありません。「追加」で任意の条件（名称と値）を登録できます。</div>
              ) : (
                <table className="table table-sm align-middle mb-3">
                  <thead>
                    <tr>
                      <th style={{ width: '40%' }}>パラメータ</th>
                      <th>値</th>
                      <th style={{ width: 40 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {(step.customParams ?? []).map((p, i) => (
                      <tr key={i}>
                        <td>
                          <input className="form-control form-control-sm" value={p.key} placeholder="例: 突入角"
                            onChange={(e) => updateStep(flow.id, step.id, { customParams: (step.customParams ?? []).map((x, j) => j === i ? { ...x, key: e.target.value } : x) })} />
                        </td>
                        <td>
                          <input className="form-control form-control-sm" value={p.value} placeholder="例: -1.5 deg"
                            onChange={(e) => updateStep(flow.id, step.id, { customParams: (step.customParams ?? []).map((x, j) => j === i ? { ...x, value: e.target.value } : x) })} />
                        </td>
                        <td>
                          <button className="btn btn-sm btn-link text-danger p-0" title="削除"
                            onClick={() => updateStep(flow.id, step.id, { customParams: (step.customParams ?? []).filter((_, j) => j !== i) })}>
                            <i className="bi bi-trash" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <label className="form-label small fw-medium mb-1">内容メモ（手順・想定・エビデンス等）</label>
              <textarea className="form-control form-control-sm" rows={4} value={step.notes}
                onChange={(e) => updateStep(flow.id, step.id, { notes: e.target.value })} />
            </div>
          ) : service && caseId ? (
            <>
              <div className="d-flex border-bottom px-2" style={{ gap: 2 }}>
                {([['input', '条件入力', 'sliders'], ['compare', '比較', 'columns-gap'], ['notes', 'メモ・エビデンス', 'journal-text']] as const).map(([id, label, icon]) => (
                  <button key={id} className="btn btn-sm" style={{ border: 'none', borderRadius: 0, padding: '6px 14px', borderBottom: condTab === id ? '2px solid #1558c0' : '2px solid transparent', color: condTab === id ? '#1558c0' : '#5b6b7c', fontWeight: condTab === id ? 700 : 500, background: 'transparent', fontSize: '0.82rem' }} onClick={() => setCondTab(id)}>
                    <i className={`bi bi-${icon} me-1`} />{label}
                  </button>
                ))}
              </div>
              <div className="modal-body">
                {condTab === 'input' && <AnalysisConditionView caseId={caseId} serviceType={service} />}
                {condTab === 'compare' && <ConditionCompare serviceType={service} currentCaseId={caseId} onQuote={(cond) => updateCase(caseId, { condition: { ...cond } })} />}
                {condTab === 'notes' && <ParamAnnotations caseId={caseId} />}
              </div>
            </>
          ) : (
            <div className="modal-body text-muted small">このステップには設定できる条件がありません（解析ステップを選んでください）。</div>
          )}
          <div className="modal-footer py-2">
            <button className="btn btn-sm btn-primary" onClick={onClose}>完了</button>
          </div>
        </div>
      </div>
    </div>
  );
};
