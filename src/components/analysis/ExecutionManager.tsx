import React from 'react';
import { useAnalysisStore } from '../../stores/analysisStore';
import { useAnalysisFlowStore } from '../../stores/analysisFlowStore';
import { SERVICE_META } from './analysisServiceMeta';
import { resolveSeedFromLabel } from './flow/flowTemplates';
import type { AnalysisFlow, AnalysisFlowStep, AnalysisServiceType } from '../../types';

const STATUS_META: Record<AnalysisFlowStep['status'], { label: string; cls: string }> = {
  pending: { label: '未実行', cls: 'bg-light text-muted border' },
  in_progress: { label: '実行中', cls: 'bg-warning text-dark' },
  done: { label: '完了', cls: 'bg-success' },
};

/**
 * 実行管理タブ。設定済みの解析を実際に実行し、進捗・成否を管理するダッシュボード。
 * 条件設定タブで組んだフローの各解析について、条件状態・実行状態を表で見て、
 * 個別実行/全実行/リセットを行う。
 */
export const ExecutionManager: React.FC<{ flow: AnalysisFlow; onGoConditions: () => void }> = ({ flow, onGoConditions }) => {
  const cases = useAnalysisStore((s) => s.cases);
  const runFullFlow = useAnalysisFlowStore((s) => s.runFullFlow);
  const runSingleStep = useAnalysisFlowStore((s) => s.runSingleStep);
  const resetAllSteps = useAnalysisFlowStore((s) => s.resetAllSteps);

  const steps = [...flow.steps].filter((s) => (s.kind ?? 'normal') === 'normal').sort((a, b) => a.order - b.order);
  const total = steps.length;
  const done = steps.filter((s) => s.status === 'done').length;
  const running = steps.some((s) => s.status === 'in_progress');
  const allDone = total > 0 && done === total;

  const serviceOf = (step: AnalysisFlowStep): AnalysisServiceType | null => {
    const ac = step.analysisCaseId ? cases.find((c) => c.id === step.analysisCaseId) : null;
    if (ac) return ac.serviceType;
    const seed = resolveSeedFromLabel(step.label);
    return seed && seed.kind === 'analysis' ? seed.service : null;
  };
  const condConfigured = (step: AnalysisFlowStep): boolean => {
    const ac = step.analysisCaseId ? cases.find((c) => c.id === step.analysisCaseId) : null;
    return !!ac && !!ac.condition && Object.keys(ac.condition).length > 0;
  };

  if (total === 0) {
    return (
      <div className="text-center text-muted py-5">
        <i className="bi bi-play-circle fs-1 d-block mb-2 opacity-25" />
        実行できる解析がありません。「条件設定」タブで解析フローを組み立ててください。
        <div className="mt-3">
          <button className="btn btn-outline-primary btn-sm" onClick={onGoConditions}>
            <i className="bi bi-sliders me-1" />条件設定へ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* 全体アクション */}
      <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
        <span className="fw-semibold"><i className="bi bi-play-circle me-1 text-primary" />実行管理</span>
        <span className={`badge ${allDone ? 'bg-success' : done > 0 ? 'bg-warning text-dark' : 'bg-secondary'}`}>{done}/{total} 完了</span>
        {running && <span className="badge bg-warning text-dark"><i className="bi bi-arrow-repeat me-1" />実行中</span>}
        <button className="btn btn-sm btn-primary ms-auto" onClick={() => runFullFlow(flow.id)} disabled={running}>
          <i className="bi bi-play-fill me-1" />全解析を実行
        </button>
        <button
          className="btn btn-sm btn-outline-secondary"
          onClick={() => { if (window.confirm('全解析の実行状態を「未実行」に戻します。よろしいですか？')) resetAllSteps(flow.id); }}
        >
          <i className="bi bi-arrow-counterclockwise me-1" />リセット
        </button>
      </div>

      {/* 解析ごとの実行状態テーブル */}
      <div className="card">
        <table className="table table-hover mb-0 align-middle">
          <thead>
            <tr>
              <th style={{ width: 40 }} className="text-center">#</th>
              <th>解析</th>
              <th style={{ width: 120 }}>条件</th>
              <th style={{ width: 110 }}>実行状態</th>
              <th style={{ width: 130 }} className="text-end">アクション</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((step, i) => {
              const service = serviceOf(step);
              const meta = service ? SERVICE_META[service] : null;
              const configured = condConfigured(step);
              const st = STATUS_META[step.status] ?? STATUS_META.pending;
              return (
                <tr key={step.id}>
                  <td className="text-center text-muted small">{i + 1}</td>
                  <td>
                    <span className="d-inline-flex align-items-center gap-2">
                      <span className="d-inline-flex align-items-center justify-content-center rounded-2" style={{ width: 24, height: 24, background: '#05966918', color: '#059669', flexShrink: 0 }}>
                        <i className={`bi bi-${meta?.icon ?? 'cpu'}`} style={{ fontSize: '0.8rem' }} />
                      </span>
                      <span className="fw-medium small">{meta?.label ?? step.label}</span>
                    </span>
                  </td>
                  <td>
                    {configured
                      ? <span className="badge bg-success-subtle text-success-emphasis">設定済み</span>
                      : <button className="btn btn-sm btn-link p-0 text-warning" onClick={onGoConditions}>未設定</button>}
                  </td>
                  <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                  <td className="text-end">
                    <button
                      className="btn btn-sm btn-outline-primary py-0"
                      onClick={() => runSingleStep(flow.id, step.id)}
                      disabled={running}
                      title={step.status === 'done' ? '再実行' : '実行'}
                    >
                      <i className="bi bi-play me-1" />{step.status === 'done' ? '再実行' : '実行'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-muted small mt-2 mb-0">
        <i className="bi bi-info-circle me-1" />「全解析を実行」はフローの依存順に沿って順次実行します。結果の詳細は「結果」タブで確認できます。
      </p>
    </div>
  );
};
