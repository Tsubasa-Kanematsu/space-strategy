import { useAnalysisStore } from '../../stores/analysisStore';
import { useAnalysisFlowStore } from '../../stores/analysisFlowStore';
import { SERVICE_UPSTREAM } from './dbSetMeta';
import { resolveSeedFromLabel } from './flow/flowTemplates';
import { SERVICE_META } from './analysisServiceMeta';
import type { AnalysisFlowStep, AnalysisServiceType, AnalysisCase } from '../../types';

/** ステップが表す解析サービス（バインド済みケース優先、無ければラベルから解決）。 */
export function serviceOfStep(step: AnalysisFlowStep, cases: AnalysisCase[]): AnalysisServiceType | null {
  const ac = step.analysisCaseId ? cases.find((c) => c.id === step.analysisCaseId) : null;
  if (ac) return ac.serviceType;
  if (step.isCustom) return null;
  const seed = resolveSeedFromLabel(step.label);
  return seed && seed.kind === 'analysis' ? seed.service : null;
}

/**
 * ステップの解析ケースを用意（無ければ作成）。
 * SERVICE_UPSTREAM に沿って上流の解析ケースを先に作成し、upstreamCaseId を正しく設定する。
 * これにより テンプレート/サンプルから解析を設定した際に上流解析ケースが正しく連結される。
 */
export function ensureAnalysisCaseForStep(flowId: string, stepId: string, massCaseId: string | null): string | null {
  const flow = useAnalysisFlowStore.getState().flows.find((f) => f.id === flowId);
  if (!flow) return null;
  const step = flow.steps.find((s) => s.id === stepId);
  if (!step) return null;
  if (step.analysisCaseId) return step.analysisCaseId;
  if (step.isCustom) return null;

  const service = serviceOfStep(step, useAnalysisStore.getState().cases);
  if (!service) return null;

  // 上流解析ケースを先に用意（存在すれば連結、無ければ同じフローから作成）
  let upstreamCaseId = '';
  const upSvc = SERVICE_UPSTREAM[service];
  if (upSvc) {
    const upStep = flow.steps.find((s) => serviceOfStep(s, useAnalysisStore.getState().cases) === upSvc);
    if (upStep) upstreamCaseId = ensureAnalysisCaseForStep(flowId, upStep.id, massCaseId) ?? '';
  }

  const ac = useAnalysisStore.getState().addCase({
    serviceType: service,
    projectId: flow.projectId,
    massCaseId: massCaseId ?? '',
    name: SERVICE_META[service].label,
    memo: '',
    createdBy: '',
    upstreamCaseId,
    condition: {},
  });
  useAnalysisFlowStore.getState().updateStep(flowId, stepId, { analysisCaseId: ac.id, label: ac.name });
  return ac.id;
}
