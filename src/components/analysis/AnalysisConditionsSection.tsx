import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAnalysisStore } from '../../stores/analysisStore';
import { useAnalysisFlowStore } from '../../stores/analysisFlowStore';
import { useProjectStore } from '../../stores/projectStore';
import { useVehicleUnitStore } from '../../stores/vehicleUnitStore';
import { SERVICE_META } from './analysisServiceMeta';
import { resolveSeedFromLabel } from './flow/flowTemplates';
import { AnalysisConditionView } from './AnalysisConditionView';
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
  const updateCase = useAnalysisStore((s) => s.updateCase);
  const updateStep = useAnalysisFlowStore((s) => s.updateStep);
  const [editing, setEditing] = useState<{ caseId: string; service: AnalysisServiceType } | null>(null);
  const [condTab, setCondTab] = useState<'input' | 'compare' | 'notes'>('input');

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
    setCondTab('input');
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
        <div className="row g-2">
          {items.map((item) => {
            const meta = SERVICE_META[item.service];
            const configured = isConfigured(item.caseId);
            return (
              <div key={item.stepId} className="col-6 col-md-4 col-xl-3">
                <button
                  className="w-100 text-start border rounded-3 p-2 h-100"
                  style={{ background: '#fff', borderColor: '#e5e7eb' }}
                  onClick={() => openCondition(item)}
                  title="クリックで条件を設定"
                >
                  <div className="d-flex align-items-center gap-2 mb-1">
                    <span className="d-inline-flex align-items-center justify-content-center rounded-2" style={{ width: 24, height: 24, background: '#05966918', color: '#059669', flexShrink: 0 }}>
                      <i className={`bi bi-${meta.icon}`} style={{ fontSize: '0.8rem' }} />
                    </span>
                    <span className="fw-medium small text-truncate">{meta.label}</span>
                    <i className="bi bi-pencil-square ms-auto text-muted" style={{ fontSize: '0.72rem' }} />
                  </div>
                  <div>
                    {configured
                      ? <span className="badge bg-success-subtle text-success-emphasis">設定済み</span>
                      : <span className="badge bg-light text-muted border">未設定</span>}
                  </div>
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
              <div className="d-flex border-bottom px-2" style={{ gap: 2 }}>
                {([['input', '条件入力', 'sliders'], ['compare', '比較', 'columns-gap'], ['notes', 'メモ・エビデンス', 'journal-text']] as const).map(([id, label, icon]) => (
                  <button
                    key={id}
                    className="btn btn-sm"
                    style={{
                      border: 'none', borderRadius: 0, padding: '6px 14px',
                      borderBottom: condTab === id ? '2px solid #1558c0' : '2px solid transparent',
                      color: condTab === id ? '#1558c0' : '#5b6b7c', fontWeight: condTab === id ? 700 : 500,
                      background: 'transparent', fontSize: '0.82rem',
                    }}
                    onClick={() => setCondTab(id)}
                  >
                    <i className={`bi bi-${icon} me-1`} />{label}
                  </button>
                ))}
              </div>
              <div className="modal-body">
                {condTab === 'input' && <AnalysisConditionView caseId={editing.caseId} serviceType={editing.service} />}
                {condTab === 'compare' && (
                  <ConditionCompare
                    serviceType={editing.service}
                    currentCaseId={editing.caseId}
                    onQuote={(cond) => updateCase(editing.caseId, { condition: { ...cond } })}
                  />
                )}
                {condTab === 'notes' && <ParamAnnotations caseId={editing.caseId} />}
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
