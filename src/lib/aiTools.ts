/**
 * aiTools.ts
 *
 * Gemini function calling 用のツール定義と実行ロジック。
 * analysisFlowStore / appStore を直接操作する。
 *
 * すべてのツールはここに集中させ、AIAssistant.tsx から import して使う。
 */

import { useAnalysisFlowStore } from '../stores/analysisFlowStore';
import { useAppStore } from '../stores/appStore';
import { useAnalysisStore } from '../stores/analysisStore';
import { useSizingStore } from '../stores/sizingStore';
import { useMassCaseStore } from '../stores/massCaseStore';
import { SERVICE_META } from '../components/analysis/analysisServiceMeta';
import { BUILTIN_FLOW_TEMPLATES, resolveSeedFromLabel } from '../components/analysis/flow/flowTemplates';
import { FLIGHT_VARIABLES, findFlightVariable } from '../components/analysis/charts/flightVariables';
import type { AppView } from '../types';
import type { AnalysisFlowStep } from '../types';

// ─── Gemini FunctionDeclaration 型 ──────────────────────────────────

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'OBJECT';
    properties: Record<string, GeminiParamSchema>;
    required?: string[];
  };
}

interface GeminiParamSchema {
  type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'ARRAY' | 'OBJECT';
  description?: string;
  items?: GeminiParamSchema;
  properties?: Record<string, GeminiParamSchema>;
  required?: string[];
  enum?: string[];
}

// ─── ツール定義 ──────────────────────────────────────────────────────

export const FLOW_TOOL_DECLARATIONS: GeminiFunctionDeclaration[] = [
  {
    name: 'list_flows',
    description: '全解析フローの id/name/projectId を一覧で返す。現在の文脈把握・確認用。',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'get_current_flow',
    description: '現在選択中のフロー（appStore.analysisFlowId）の詳細を返す。各ステップは id/label/kind/linkedType/status/nextStepIds/loopBackToStepId の抜粋。',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'add_step',
    description: '解析フローにステップを追加する。serviceType を渡すと解析/サイジングケースを自動生成して紐付ける。返り値は作成したステップのID。',
    parameters: {
      type: 'OBJECT',
      properties: {
        kind: {
          type: 'STRING',
          enum: ['normal', 'decision'],
          description: 'ステップ種別。通常は "normal"、判定分岐は "decision"。',
        },
        label: {
          type: 'STRING',
          description: 'ステップの表示ラベル（例: "空力解析", "性能要求達成判定"）',
        },
        parentStepId: {
          type: 'STRING',
          description: '親ステップのID。指定するとその後段に繋がる。省略時は末尾に追加。',
        },
        serviceType: {
          type: 'STRING',
          description: '解析サービス種別。例: "aeroAnalysis", "flightAnalysis", "sizing"（サイジングは "sizing" を渡す）。省略可。',
          enum: [
            'aeroAnalysis',
            'flightAnalysis',
            'dispersedFlight',
            'loadAnalysis',
            'shipHazard',
            'piEc',
            'debrisImpact',
            'rfLink',
            'ablation',
            'orbitLifetime',
            'pathRotationRate',
            'gnssSatellite',
            'sizing',
          ],
        },
      },
      required: ['label'],
    },
  },
  {
    name: 'delete_step',
    description: 'フローからステップを削除する。前駆→後続のエッジは自動的につなぎ直す。',
    parameters: {
      type: 'OBJECT',
      properties: {
        stepId: {
          type: 'STRING',
          description: '削除対象のステップID',
        },
      },
      required: ['stepId'],
    },
  },
  {
    name: 'connect_steps',
    description: '2つのステップ間に前向きエッジを追加する（sourceId → targetId）。',
    parameters: {
      type: 'OBJECT',
      properties: {
        sourceId: {
          type: 'STRING',
          description: '接続元ステップID',
        },
        targetId: {
          type: 'STRING',
          description: '接続先ステップID',
        },
      },
      required: ['sourceId', 'targetId'],
    },
  },
  {
    name: 'set_loop',
    description: '判定ステップ（kind="decision"）にループ設定をする。decisionStepId が decision 以外の場合はエラーを返す。',
    parameters: {
      type: 'OBJECT',
      properties: {
        decisionStepId: {
          type: 'STRING',
          description: 'ループ判定ステップID（kind が "decision" のステップ）',
        },
        targetStepId: {
          type: 'STRING',
          description: 'ループ先（戻り先）ステップID',
        },
        condition: {
          type: 'STRING',
          description: 'ループ条件メモ（例: "質量マージン 10% 以上"）。省略可。',
        },
      },
      required: ['decisionStepId', 'targetStepId'],
    },
  },
  {
    name: 'run_full_flow',
    description: '現在のフロー全体を実行する（トポロジカル順に順次 in_progress → done）。',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'run_single_step',
    description: '指定ステップのみを実行する（in_progress → done。後続への伝播なし）。',
    parameters: {
      type: 'OBJECT',
      properties: {
        stepId: {
          type: 'STRING',
          description: '実行するステップID',
        },
      },
      required: ['stepId'],
    },
  },
  {
    name: 'reset_all_steps',
    description: '現在のフローの全ステップを pending（未着手）に戻す。',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'apply_template',
    description: '組み込みフローテンプレートを現在のフローに適用する（既存ステップを上書き）。',
    parameters: {
      type: 'OBJECT',
      properties: {
        templateKey: {
          type: 'STRING',
          enum: ['vehicle-sizing-loop', 'structural-thermal', 'faa-part450-fsa', 'orbital-ops'],
          description: 'テンプレートキー。vehicle-sizing-loop=機体サイジング収束ループ, structural-thermal=構造・熱健全性, faa-part450-fsa=飛行安全解析(FAA Part 450), orbital-ops=軌道投入・通信運用',
        },
      },
      required: ['templateKey'],
    },
  },
  {
    name: 'list_analysis_cases',
    description: '解析ケース一覧を返す。projectId を指定するとそのプロジェクトのみに絞れる。',
    parameters: {
      type: 'OBJECT',
      properties: {
        projectId: { type: 'STRING', description: 'プロジェクトID (省略時は全件)' },
      },
    },
  },
  {
    name: 'get_current_analysis_case',
    description: '現在画面で開いている解析ケース (analysisCaseId) の condition と基本情報を返す。',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'get_analysis_condition',
    description: '指定 caseId の解析条件 (condition オブジェクト) を返す。',
    parameters: {
      type: 'OBJECT',
      properties: {
        caseId: { type: 'STRING', description: '解析ケースID' },
      },
      required: ['caseId'],
    },
  },
  {
    name: 'set_analysis_condition',
    description:
      '指定 caseId の解析条件を 完全上書き する。condition は JSON object。' +
      '部分更新したい時は patch_analysis_condition を使うこと。' +
      'まず get_analysis_condition で現在値を見てから上書きするのが安全。',
    parameters: {
      type: 'OBJECT',
      properties: {
        caseId: { type: 'STRING', description: '解析ケースID' },
        condition: { type: 'OBJECT', description: '新しい condition オブジェクト' },
      },
      required: ['caseId', 'condition'],
    },
  },
  {
    name: 'patch_analysis_condition',
    description:
      '指定 caseId の解析条件 にパッチをマージ (shallow merge) する。' +
      '個別フィールドを設定したいだけの時はこちら。',
    parameters: {
      type: 'OBJECT',
      properties: {
        caseId: { type: 'STRING', description: '解析ケースID' },
        patch: { type: 'OBJECT', description: 'マージしたいキー/値のオブジェクト' },
      },
      required: ['caseId', 'patch'],
    },
  },
  {
    name: 'list_flight_chart_variables',
    description:
      '飛行解析タイムシリーズで描画可能な変数の一覧を返す。' +
      'カスタムチャート追加時の series[].path に指定可能な値の辞書になる。',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'list_flight_custom_charts',
    description: '指定 caseId の カスタムチャート一覧を返す。',
    parameters: {
      type: 'OBJECT',
      properties: {
        caseId: { type: 'STRING', description: '解析ケースID (省略時は現在画面のケース)' },
      },
    },
  },
  {
    name: 'add_flight_custom_chart',
    description:
      '指定 caseId の飛行解析にカスタムチャートを追加する。' +
      'series[].path は list_flight_chart_variables で得た値を使う。',
    parameters: {
      type: 'OBJECT',
      properties: {
        caseId: { type: 'STRING', description: '解析ケースID (省略時は現在画面のケース)' },
        title:  { type: 'STRING', description: 'チャートタイトル (例: "速度と動圧の比較")' },
        unit:   { type: 'STRING', description: '単位 (任意)' },
        series: {
          type: 'ARRAY',
          description: '系列定義 (最大 5)',
          items: {
            type: 'OBJECT',
            properties: {
              name:  { type: 'STRING', description: '凡例名' },
              color: { type: 'STRING', description: 'CSS色 (#34d399 等)。省略時は変数の defaultColor を使う' },
              path:  { type: 'STRING', description: '変数 path (例: "altitude", "euler.roll", "velocityNED.vN")' },
            },
            required: ['name', 'path'],
          },
        },
      },
      required: ['title', 'series'],
    },
  },
  {
    name: 'remove_flight_custom_chart',
    description: '指定 caseId からカスタムチャートを ID で削除する。',
    parameters: {
      type: 'OBJECT',
      properties: {
        caseId:  { type: 'STRING', description: '解析ケースID (省略時は現在画面のケース)' },
        chartId: { type: 'STRING', description: '削除するチャートのID' },
      },
      required: ['chartId'],
    },
  },
  {
    name: 'navigate',
    description: 'アプリの画面を切り替える。例: "analysisFlow"=解析フロー一覧, "projects"=プロジェクト一覧。',
    parameters: {
      type: 'OBJECT',
      properties: {
        view: {
          type: 'STRING',
          description: '遷移先の画面名',
          enum: [
            'projects',
            'massCases',
            'analysisFlow',
            'analysisCases',
            'sizingCases',
            'analysisHub',
            'masterDataHub',
            'antennaData',
            'pluginCases',
          ],
        },
      },
      required: ['view'],
    },
  },
];

// ─── ツール実行ロジック ───────────────────────────────────────────────

export type ToolResult = { ok: true; result: unknown } | { ok: false; error: string };

/**
 * hydrateStepsForAi — テンプレート適用時にケースを自動生成して流し込む。
 * AnalysisFlowEditor.tsx の hydrateSteps と同等ロジック。
 */
function hydrateStepsForAi(rawSteps: AnalysisFlowStep[], flowProjectId: string): AnalysisFlowStep[] {
  const massCases = useMassCaseStore.getState().cases.filter((c) => c.projectId === flowProjectId);
  const firstMassCaseId = massCases[0]?.id;
  if (!firstMassCaseId) return rawSteps;

  const addAnalysisCase = useAnalysisStore.getState().addCase;
  const addSizingCase = useSizingStore.getState().addCase;

  return rawSteps.map((step) => {
    if (step.kind === 'decision') return step;
    const seed = resolveSeedFromLabel(step.label);
    if (!seed) return step;
    if (seed.kind === 'analysis') {
      const meta = SERVICE_META[seed.service];
      const ac = addAnalysisCase({
        serviceType: seed.service,
        projectId: flowProjectId,
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
        projectId: flowProjectId,
        massCaseId: firstMassCaseId,
        name: 'サイジング',
        memo: '',
        createdBy: '',
      });
      return { ...step, sizingCaseId: sc.id, label: sc.name };
    }
    if (seed.kind === 'db') {
      return { ...step, linkedMassCaseId: firstMassCaseId, label: 'DB更新' };
    }
    return step;
  });
}

/**
 * hydrateStepByServiceType — add_step で serviceType が渡された時に
 * AnalysisCase / SizingCase を自動生成して step に紐付ける。
 */
function hydrateByServiceType(
  step: Omit<AnalysisFlowStep, 'id'>,
  serviceType: string,
  flowProjectId: string
): Omit<AnalysisFlowStep, 'id'> {
  const massCases = useMassCaseStore.getState().cases.filter((c) => c.projectId === flowProjectId);
  const firstMassCaseId = massCases[0]?.id;
  if (!firstMassCaseId) return step;

  const addAnalysisCase = useAnalysisStore.getState().addCase;
  const addSizingCase = useSizingStore.getState().addCase;

  if (serviceType === 'sizing') {
    const sc = addSizingCase({
      projectId: flowProjectId,
      massCaseId: firstMassCaseId,
      name: step.label || 'サイジング',
      memo: '',
      createdBy: '',
    });
    return { ...step, sizingCaseId: sc.id };
  }

  // AnalysisServiceType
  const meta = SERVICE_META[serviceType as keyof typeof SERVICE_META];
  if (meta) {
    const ac = addAnalysisCase({
      serviceType: serviceType as import('../types').AnalysisServiceType,
      projectId: flowProjectId,
      massCaseId: firstMassCaseId,
      name: step.label || meta.label,
      memo: '',
      createdBy: '',
      upstreamCaseId: '',
      condition: {},
    });
    return { ...step, analysisCaseId: ac.id };
  }

  return step;
}

/** 現在の flowId を取得。なければエラー文字列を返す */
function requireFlowId(): { flowId: string } | { error: string } {
  const flowId = useAppStore.getState().analysisFlowId;
  if (!flowId) {
    return { error: '現在選択中のフローがありません。先にフローを選択してください。' };
  }
  return { flowId };
}

/** stepの linkedType を判定 */
function getLinkedType(step: AnalysisFlowStep): string {
  if (step.analysisCaseId) return 'analysis';
  if (step.sizingCaseId) return 'sizing';
  if (step.linkedMassCaseId) return 'db';
  if (step.pluginCaseId) return 'plugin';
  return 'none';
}

// ─── 各ツールの実装 ──────────────────────────────────────────────────

function toolListFlows(): ToolResult {
  const flows = useAnalysisFlowStore.getState().flows;
  const result = flows.map((f) => ({
    id: f.id,
    name: f.name,
    projectId: f.projectId,
    stepCount: f.steps.length,
  }));
  return { ok: true, result };
}

function toolGetCurrentFlow(): ToolResult {
  const r = requireFlowId();
  if ('error' in r) return { ok: false, error: r.error };
  const { flowId } = r;

  const flow = useAnalysisFlowStore.getState().flows.find((f) => f.id === flowId);
  if (!flow) return { ok: false, error: `フロー ID ${flowId} が見つかりません。` };

  return {
    ok: true,
    result: {
      id: flow.id,
      name: flow.name,
      projectId: flow.projectId,
      steps: flow.steps.map((s) => ({
        id: s.id,
        label: s.label,
        kind: s.kind ?? 'normal',
        linkedType: getLinkedType(s),
        status: s.status,
        nextStepIds: s.nextStepIds ?? [],
        loopBackToStepId: s.loopBackToStepId ?? null,
      })),
    },
  };
}

function toolAddStep(args: {
  kind?: string;
  label: string;
  parentStepId?: string;
  serviceType?: string;
}): ToolResult {
  const r = requireFlowId();
  if ('error' in r) return { ok: false, error: r.error };
  const { flowId } = r;

  const flow = useAnalysisFlowStore.getState().flows.find((f) => f.id === flowId);
  if (!flow) return { ok: false, error: `フロー ID ${flowId} が見つかりません。` };

  const kind = (args.kind === 'decision' ? 'decision' : 'normal') as 'normal' | 'decision';

  let stepData: Omit<AnalysisFlowStep, 'id'> = {
    order: flow.steps.length,
    label: args.label,
    kind,
    status: 'pending',
    notes: '',
    dataBindings: [],
    nextStepIds: [],
  };

  if (args.serviceType) {
    stepData = hydrateByServiceType(stepData, args.serviceType, flow.projectId);
  }

  const newId = useAnalysisFlowStore
    .getState()
    .addStep(flowId, stepData, args.parentStepId ?? null);

  return { ok: true, result: { stepId: newId, label: args.label, kind } };
}

function toolDeleteStep(args: { stepId: string }): ToolResult {
  const r = requireFlowId();
  if ('error' in r) return { ok: false, error: r.error };
  const { flowId } = r;

  useAnalysisFlowStore.getState().deleteStep(flowId, args.stepId);
  return { ok: true, result: { deleted: args.stepId } };
}

function toolConnectSteps(args: { sourceId: string; targetId: string }): ToolResult {
  const r = requireFlowId();
  if ('error' in r) return { ok: false, error: r.error };
  const { flowId } = r;

  useAnalysisFlowStore.getState().addForwardEdge(flowId, args.sourceId, args.targetId);
  return { ok: true, result: { connected: `${args.sourceId} → ${args.targetId}` } };
}

function toolSetLoop(args: {
  decisionStepId: string;
  targetStepId: string;
  condition?: string;
}): ToolResult {
  const r = requireFlowId();
  if ('error' in r) return { ok: false, error: r.error };
  const { flowId } = r;

  const flow = useAnalysisFlowStore.getState().flows.find((f) => f.id === flowId);
  if (!flow) return { ok: false, error: `フロー ID ${flowId} が見つかりません。` };

  const step = flow.steps.find((s) => s.id === args.decisionStepId);
  if (!step) return { ok: false, error: `ステップ ID ${args.decisionStepId} が見つかりません。` };
  if ((step.kind ?? 'normal') !== 'decision') {
    return {
      ok: false,
      error: `ステップ "${step.label}" は kind="${step.kind ?? 'normal'}" です。set_loop は decision ステップにのみ使えます。`,
    };
  }

  useAnalysisFlowStore.getState().updateStep(flowId, args.decisionStepId, {
    loopBackToStepId: args.targetStepId,
    loopCondition: args.condition ?? '',
  });

  return {
    ok: true,
    result: {
      decisionStepId: args.decisionStepId,
      loopBackToStepId: args.targetStepId,
      condition: args.condition ?? '',
    },
  };
}

function toolRunFullFlow(): ToolResult {
  const r = requireFlowId();
  if ('error' in r) return { ok: false, error: r.error };
  const { flowId } = r;

  useAnalysisFlowStore.getState().runFullFlow(flowId);
  return { ok: true, result: { message: 'フロー全体の実行を開始しました。' } };
}

function toolRunSingleStep(args: { stepId: string }): ToolResult {
  const r = requireFlowId();
  if ('error' in r) return { ok: false, error: r.error };
  const { flowId } = r;

  useAnalysisFlowStore.getState().runSingleStep(flowId, args.stepId);
  return { ok: true, result: { message: `ステップ ${args.stepId} の実行を開始しました。` } };
}

function toolResetAllSteps(): ToolResult {
  const r = requireFlowId();
  if ('error' in r) return { ok: false, error: r.error };
  const { flowId } = r;

  useAnalysisFlowStore.getState().resetAllSteps(flowId);
  return { ok: true, result: { message: '全ステップを pending にリセットしました。' } };
}

function toolApplyTemplate(args: { templateKey: string }): ToolResult {
  const r = requireFlowId();
  if ('error' in r) return { ok: false, error: r.error };
  const { flowId } = r;

  const flow = useAnalysisFlowStore.getState().flows.find((f) => f.id === flowId);
  if (!flow) return { ok: false, error: `フロー ID ${flowId} が見つかりません。` };

  const tpl = BUILTIN_FLOW_TEMPLATES.find((t) => t.key === args.templateKey);
  if (!tpl) {
    return {
      ok: false,
      error: `テンプレートキー "${args.templateKey}" が見つかりません。有効なキー: ${BUILTIN_FLOW_TEMPLATES.map((t) => t.key).join(', ')}`,
    };
  }

  const rawSteps = tpl.build();
  const hydrated = hydrateStepsForAi(rawSteps, flow.projectId);
  useAnalysisFlowStore.getState().updateFlow(flowId, { steps: hydrated });

  return {
    ok: true,
    result: {
      templateKey: args.templateKey,
      templateName: tpl.name,
      stepCount: hydrated.length,
      message: `テンプレート「${tpl.name}」を適用しました（${hydrated.length} ステップ）。`,
    },
  };
}

function toolNavigate(args: { view: string }): ToolResult {
  useAppStore.getState().navigate(args.view as AppView);
  return { ok: true, result: { navigated: args.view } };
}

// ─── 解析条件 (condition) 操作ツール ──────────────────────────────────
// AI がモーダル上の入力 (飛行解析の打上方位角など) を埋められる様にする。

function toolListAnalysisCases(args: { projectId?: string }): ToolResult {
  const cases = useAnalysisStore.getState().cases.filter(
    (c) => !args.projectId || c.projectId === args.projectId,
  );
  return {
    ok: true,
    result: cases.map((c) => ({
      id: c.id,
      name: c.name,
      serviceType: c.serviceType,
      projectId: c.projectId,
      massCaseId: c.massCaseId,
      hasCondition: Object.keys(c.condition ?? {}).length > 0,
    })),
  };
}

function toolGetAnalysisCondition(args: { caseId: string }): ToolResult {
  const c = useAnalysisStore.getState().cases.find((x) => x.id === args.caseId);
  if (!c) return { ok: false, error: `解析ケースが見つかりません: ${args.caseId}` };
  return {
    ok: true,
    result: { caseId: c.id, name: c.name, serviceType: c.serviceType, condition: c.condition ?? {} },
  };
}

function toolSetAnalysisCondition(args: { caseId: string; condition: Record<string, unknown> }): ToolResult {
  const cases = useAnalysisStore.getState().cases;
  const c = cases.find((x) => x.id === args.caseId);
  if (!c) return { ok: false, error: `解析ケースが見つかりません: ${args.caseId}` };
  if (!args.condition || typeof args.condition !== 'object' || Array.isArray(args.condition)) {
    return { ok: false, error: 'condition はオブジェクト ({ ... }) で指定してください' };
  }
  useAnalysisStore.getState().updateCase(args.caseId, { condition: args.condition });
  return { ok: true, result: { caseId: args.caseId, replacedKeys: Object.keys(args.condition) } };
}

function toolPatchAnalysisCondition(args: { caseId: string; patch: Record<string, unknown> }): ToolResult {
  const c = useAnalysisStore.getState().cases.find((x) => x.id === args.caseId);
  if (!c) return { ok: false, error: `解析ケースが見つかりません: ${args.caseId}` };
  if (!args.patch || typeof args.patch !== 'object' || Array.isArray(args.patch)) {
    return { ok: false, error: 'patch はオブジェクト ({ ... }) で指定してください' };
  }
  const merged = { ...(c.condition ?? {}), ...args.patch };
  useAnalysisStore.getState().updateCase(args.caseId, { condition: merged });
  return { ok: true, result: { caseId: args.caseId, patchedKeys: Object.keys(args.patch) } };
}

function toolGetCurrentAnalysisCase(): ToolResult {
  const s = useAppStore.getState();
  if (!s.analysisCaseId) return { ok: false, error: '現在開いている解析ケースがありません' };
  return toolGetAnalysisCondition({ caseId: s.analysisCaseId });
}

// ─── 飛行解析 カスタムチャート ────────────────────────────────────

function resolveCaseId(maybe?: string): { ok: false; error: string } | { ok: true; caseId: string } {
  if (maybe) return { ok: true, caseId: maybe };
  const id = useAppStore.getState().analysisCaseId;
  if (!id) return { ok: false, error: 'caseId 未指定 かつ 現在画面で解析ケースが開かれていません' };
  return { ok: true, caseId: id };
}

function toolListFlightChartVariables(): ToolResult {
  return { ok: true, result: FLIGHT_VARIABLES };
}

function toolListFlightCustomCharts(args: { caseId?: string }): ToolResult {
  const r = resolveCaseId(args.caseId);
  if (!r.ok) return r;
  const c = useAnalysisStore.getState().cases.find((x) => x.id === r.caseId);
  if (!c) return { ok: false, error: `解析ケースが見つかりません: ${r.caseId}` };
  const cond = (c.condition ?? {}) as Record<string, unknown>;
  return { ok: true, result: { caseId: r.caseId, customCharts: cond.customCharts ?? [] } };
}

function toolAddFlightCustomChart(args: {
  caseId?: string;
  title: string;
  unit?: string;
  series: Array<{ name: string; color?: string; path: string }>;
}): ToolResult {
  const r = resolveCaseId(args.caseId);
  if (!r.ok) return r;
  if (!args.title || !args.title.trim()) return { ok: false, error: 'title は必須' };
  if (!Array.isArray(args.series) || args.series.length === 0) return { ok: false, error: 'series が空' };
  // 各 series の path 検証 + color 補完
  const enriched = args.series.slice(0, 5).map((s) => {
    const def = findFlightVariable(s.path);
    if (!def) throw new Error(`未知の変数 path: "${s.path}". list_flight_chart_variables で確認のこと`);
    return { name: s.name || def.label, color: s.color || def.defaultColor, path: def.path };
  });
  let validated;
  try { validated = enriched; } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const c = useAnalysisStore.getState().cases.find((x) => x.id === r.caseId)!;
  const cond = (c.condition ?? {}) as Record<string, unknown>;
  const existing = (cond.customCharts ?? []) as Array<{ id: string }>;
  const newChart = {
    id: `cc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: args.title.trim(),
    unit: args.unit,
    series: validated,
  };
  useAnalysisStore.getState().updateCase(r.caseId, {
    condition: { ...cond, customCharts: [...existing, newChart] },
  });
  return { ok: true, result: { caseId: r.caseId, chart: newChart } };
}

function toolRemoveFlightCustomChart(args: { caseId?: string; chartId: string }): ToolResult {
  const r = resolveCaseId(args.caseId);
  if (!r.ok) return r;
  if (!args.chartId) return { ok: false, error: 'chartId 必須' };
  const c = useAnalysisStore.getState().cases.find((x) => x.id === r.caseId);
  if (!c) return { ok: false, error: `解析ケースが見つかりません: ${r.caseId}` };
  const cond = (c.condition ?? {}) as Record<string, unknown>;
  const existing = (cond.customCharts ?? []) as Array<{ id: string }>;
  const next = existing.filter((x) => x.id !== args.chartId);
  if (next.length === existing.length) {
    return { ok: false, error: `chartId "${args.chartId}" が見つかりません` };
  }
  useAnalysisStore.getState().updateCase(r.caseId, {
    condition: { ...cond, customCharts: next },
  });
  return { ok: true, result: { caseId: r.caseId, removed: args.chartId, remaining: next.length } };
}

// ─── ディスパッチャ ───────────────────────────────────────────────────

export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  switch (name) {
    case 'list_flows':
      return toolListFlows();
    case 'get_current_flow':
      return toolGetCurrentFlow();
    case 'add_step':
      return toolAddStep(args as Parameters<typeof toolAddStep>[0]);
    case 'delete_step':
      return toolDeleteStep(args as Parameters<typeof toolDeleteStep>[0]);
    case 'connect_steps':
      return toolConnectSteps(args as Parameters<typeof toolConnectSteps>[0]);
    case 'set_loop':
      return toolSetLoop(args as Parameters<typeof toolSetLoop>[0]);
    case 'run_full_flow':
      return toolRunFullFlow();
    case 'run_single_step':
      return toolRunSingleStep(args as Parameters<typeof toolRunSingleStep>[0]);
    case 'reset_all_steps':
      return toolResetAllSteps();
    case 'apply_template':
      return toolApplyTemplate(args as Parameters<typeof toolApplyTemplate>[0]);
    case 'navigate':
      return toolNavigate(args as Parameters<typeof toolNavigate>[0]);
    case 'list_analysis_cases':
      return toolListAnalysisCases(args as Parameters<typeof toolListAnalysisCases>[0]);
    case 'get_analysis_condition':
      return toolGetAnalysisCondition(args as Parameters<typeof toolGetAnalysisCondition>[0]);
    case 'set_analysis_condition':
      return toolSetAnalysisCondition(args as Parameters<typeof toolSetAnalysisCondition>[0]);
    case 'patch_analysis_condition':
      return toolPatchAnalysisCondition(args as Parameters<typeof toolPatchAnalysisCondition>[0]);
    case 'get_current_analysis_case':
      return toolGetCurrentAnalysisCase();
    case 'list_flight_chart_variables':
      return toolListFlightChartVariables();
    case 'list_flight_custom_charts':
      return toolListFlightCustomCharts(args as Parameters<typeof toolListFlightCustomCharts>[0]);
    case 'add_flight_custom_chart':
      return toolAddFlightCustomChart(args as Parameters<typeof toolAddFlightCustomChart>[0]);
    case 'remove_flight_custom_chart':
      return toolRemoveFlightCustomChart(args as Parameters<typeof toolRemoveFlightCustomChart>[0]);
    default:
      return { ok: false, error: `未知のツール: ${name}` };
  }
}
