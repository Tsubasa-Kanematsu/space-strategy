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
import { useVehicleUnitStore } from '../stores/vehicleUnitStore';
import { useProjectStore } from '../stores/projectStore';
import { useMasterDataStore } from '../stores/masterDataStore';
import { useApplicationStore } from '../stores/applicationStore';
import { SERVICE_META } from '../components/analysis/analysisServiceMeta';
import {
  BUILTIN_FLOW_TEMPLATES,
  resolveSeedFromLabel,
  PT_TEMPLATE_KEY,
  FT_TEMPLATE_KEY,
} from '../components/analysis/flow/flowTemplates';
import { MASTER_CATEGORIES } from '../components/analysis/masterCatalog';
import { FLIGHT_VARIABLES, findFlightVariable } from '../components/analysis/charts/flightVariables';
import { buildApplicationData } from '../utils/applicationGen';
import type { AppView } from '../types';
import type { AnalysisFlowStep, AnalysisEntry, VehicleUnit, PhaseStatus } from '../types';

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
    description:
      'アプリの画面を切り替える。例: "analysisFlow"=解析フロー一覧, "projects"=プロジェクト一覧, ' +
      '"vehicleUnits"=号機一覧, "masterDataHub"=マスタデータ, "applications"=申請書一覧, "massCases"=質量諸元データ。',
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
            'vehicleUnits',
            'vehicleUnitDetail',
            'applications',
            'applicationDetail',
          ],
        },
      },
      required: ['view'],
    },
  },
  // ─── 号機・共通パラメータ・マスタ・申請書 ────────────────────────────
  {
    name: 'list_projects',
    description: 'プロジェクト一覧 (id, name) を返す。',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'list_vehicle_units',
    description: '号機一覧を返す (unitNo/missionName/status と解析の要約)。projectId で絞り込み可。',
    parameters: {
      type: 'OBJECT',
      properties: {
        projectId: { type: 'STRING', description: 'プロジェクトID (省略時は全件)' },
      },
    },
  },
  {
    name: 'get_vehicle_unit',
    description: '号機1件の詳細を返す。unitId または unitNo で指定。',
    parameters: {
      type: 'OBJECT',
      properties: {
        unitId: { type: 'STRING', description: '号機ID' },
        unitNo: { type: 'STRING', description: '号機番号 (例: "1")' },
      },
    },
  },
  {
    name: 'add_unit_analysis',
    description: '号機にカスタム解析を追加する。',
    parameters: {
      type: 'OBJECT',
      properties: {
        unitId: { type: 'STRING', description: '号機ID' },
        name: { type: 'STRING', description: '解析名 (例: "追加解析")' },
      },
      required: ['unitId', 'name'],
    },
  },
  {
    name: 'open_unit_analysis',
    description: '号機の解析のフロー画面を開く。フロー未作成なら kind に応じたテンプレートで作成して紐付ける。',
    parameters: {
      type: 'OBJECT',
      properties: {
        unitId: { type: 'STRING', description: '号機ID' },
        analysisName: { type: 'STRING', description: '解析名 (例: "PT解析")' },
      },
      required: ['unitId', 'analysisName'],
    },
  },
  {
    name: 'get_common_params',
    description: '現在開いているフローの所有解析エントリの共通パラメータ (質量諸元ケース・マスタ選択) を返す。',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'set_common_mass_case',
    description: '現在フローの所有解析エントリに質量諸元ケースを設定する。massCaseName か massCaseId のどちらかで指定。',
    parameters: {
      type: 'OBJECT',
      properties: {
        massCaseName: { type: 'STRING', description: '質量諸元ケース名' },
        massCaseId: { type: 'STRING', description: '質量諸元ケースID' },
      },
    },
  },
  {
    name: 'set_common_master_selection',
    description: '現在フローの所有解析エントリのマスタ選択を設定する。names はマスタレコード名で指定 (list_master_records で確認)。',
    parameters: {
      type: 'OBJECT',
      properties: {
        category: {
          type: 'STRING',
          description: 'マスタ種別',
          enum: MASTER_CATEGORIES.map((c) => c.key),
        },
        names: {
          type: 'ARRAY',
          description: '選択するレコード名の配列',
          items: { type: 'STRING' },
        },
      },
      required: ['category', 'names'],
    },
  },
  {
    name: 'list_master_records',
    description: '指定マスタ種別のレコード一覧 (id, name) を返す。',
    parameters: {
      type: 'OBJECT',
      properties: {
        category: {
          type: 'STRING',
          description: 'マスタ種別',
          enum: MASTER_CATEGORIES.map((c) => c.key),
        },
      },
      required: ['category'],
    },
  },
  {
    name: 'list_mass_cases',
    description: '質量諸元ケース一覧 (id, name, 部品数) を返す。projectId で絞り込み可。',
    parameters: {
      type: 'OBJECT',
      properties: {
        projectId: { type: 'STRING', description: 'プロジェクトID (省略時は全件)' },
      },
    },
  },
  {
    name: 'get_analysis_results',
    description: '解析ケースの結果一覧 (label, value, unit, notes) を返す。caseId 省略時は現在画面のケース。',
    parameters: {
      type: 'OBJECT',
      properties: {
        caseId: { type: 'STRING', description: '解析ケースID (省略時は現在画面のケース)' },
      },
    },
  },
  {
    name: 'list_applications',
    description: '申請書一覧 (unitNo, missionName, status) を返す。',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'generate_application',
    description: '号機の申請書を生成 (既存があれば本文更新) して applicationId を返す。画面遷移はしない。',
    parameters: {
      type: 'OBJECT',
      properties: {
        unitId: { type: 'STRING', description: '号機ID' },
      },
      required: ['unitId'],
    },
  },
  {
    name: 'set_unit_analysis_status',
    description: '号機の解析エントリのステータスを変更する。',
    parameters: {
      type: 'OBJECT',
      properties: {
        unitId: { type: 'STRING', description: '号機ID' },
        analysisName: { type: 'STRING', description: '解析名 (例: "PT解析")' },
        status: {
          type: 'STRING',
          enum: ['未着手', '実施中', '完了'],
          description: '新しいステータス',
        },
      },
      required: ['unitId', 'analysisName', 'status'],
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

// ─── 号機・共通パラメータ・マスタ・申請書ツール ──────────────────────

/** unitId または unitNo で号機を解決する。 */
function findUnit(args: { unitId?: string; unitNo?: string }): VehicleUnit | undefined {
  const units = useVehicleUnitStore.getState().units;
  if (args.unitId) return units.find((u) => u.id === args.unitId);
  if (args.unitNo) return units.find((u) => u.unitNo === args.unitNo);
  return undefined;
}

/** 号機内の解析エントリを名前で解決する（完全一致優先、次に部分一致）。 */
function findEntry(unit: VehicleUnit, analysisName: string): AnalysisEntry | undefined {
  return (
    unit.analyses.find((a) => a.name === analysisName) ??
    unit.analyses.find((a) => a.name.includes(analysisName))
  );
}

/** flowId を持つ号機/解析エントリ（共通パラメータの所有者）を探す。 */
function findFlowOwner(flowId: string): { unit: VehicleUnit; entry: AnalysisEntry } | null {
  for (const u of useVehicleUnitStore.getState().units) {
    const entry = u.analyses.find((a) => a.flowId === flowId);
    if (entry) return { unit: u, entry };
  }
  return null;
}

/** 現在フローの所有エントリを取得（無ければエラー）。 */
function requireFlowOwner():
  | { unit: VehicleUnit; entry: AnalysisEntry; flowId: string }
  | { error: string } {
  const r = requireFlowId();
  if ('error' in r) return r;
  const owner = findFlowOwner(r.flowId);
  if (!owner) {
    return { error: 'このフローを所有する号機の解析エントリが見つかりません。号機の解析から開いたフローで使ってください。' };
  }
  return { ...owner, flowId: r.flowId };
}

/** マスタ種別 key → masterDataStore のレコード配列。 */
function masterRecordsFor(category: string): Array<{ id: string; name: string }> | null {
  const s = useMasterDataStore.getState();
  switch (category) {
    case 'shape': return s.shapes;
    case 'aero': return s.aeroCoeffs;
    case 'propulsion': return s.propulsions;
    case 'wind': return s.winds;
    case 'debris': return s.debris;
    case 'failure': return s.failureRates;
    case 'vAntenna': return s.antennas.filter((a) => a.type === 'rocket');
    case 'gAntenna': return s.antennas.filter((a) => a.type === 'ground');
    default: return null;
  }
}

function toolListProjects(): ToolResult {
  const projects = useProjectStore.getState().projects;
  return { ok: true, result: projects.map((p) => ({ id: p.id, name: p.name })) };
}

function summarizeUnit(u: VehicleUnit) {
  return {
    id: u.id,
    projectId: u.projectId,
    unitNo: u.unitNo,
    missionName: u.missionName,
    status: u.status,
    analyses: u.analyses.map((a) => ({
      name: a.name,
      kind: a.kind,
      status: a.status,
      hasFlow: !!a.flowId,
    })),
  };
}

function toolListVehicleUnits(args: { projectId?: string }): ToolResult {
  const units = useVehicleUnitStore
    .getState()
    .units.filter((u) => !args.projectId || u.projectId === args.projectId);
  return { ok: true, result: units.map(summarizeUnit) };
}

function toolGetVehicleUnit(args: { unitId?: string; unitNo?: string }): ToolResult {
  if (!args.unitId && !args.unitNo) return { ok: false, error: 'unitId か unitNo のどちらかを指定してください。' };
  const unit = findUnit(args);
  if (!unit) return { ok: false, error: `号機が見つかりません: ${args.unitId ?? args.unitNo}` };
  const massCases = useMassCaseStore.getState().cases;
  return {
    ok: true,
    result: {
      id: unit.id,
      projectId: unit.projectId,
      unitNo: unit.unitNo,
      missionName: unit.missionName,
      launchDate: unit.launchDate,
      status: unit.status,
      memo: unit.memo ?? '',
      analyses: unit.analyses.map((a) => ({
        id: a.id,
        name: a.name,
        kind: a.kind,
        status: a.status,
        flowId: a.flowId ?? null,
        massCaseId: a.massCaseId ?? null,
        massCaseName: a.massCaseId ? massCases.find((c) => c.id === a.massCaseId)?.name ?? null : null,
        masterSelections: a.masterSelections ?? {},
      })),
    },
  };
}

function toolAddUnitAnalysis(args: { unitId: string; name: string }): ToolResult {
  const unit = findUnit({ unitId: args.unitId });
  if (!unit) return { ok: false, error: `号機が見つかりません: ${args.unitId}` };
  const name = (args.name ?? '').trim();
  if (!name) return { ok: false, error: 'name は必須です。' };
  const created = useVehicleUnitStore.getState().addAnalysis(unit.id, {
    name,
    icon: 'graph-up',
    kind: 'custom',
    status: '未着手',
  });
  if (!created) return { ok: false, error: '解析の追加に失敗しました。' };
  return {
    ok: true,
    result: { entryId: created.id, name: created.name, message: `${unit.unitNo}号機に解析「${name}」を追加しました。` },
  };
}

function toolOpenUnitAnalysis(args: { unitId: string; analysisName: string }): ToolResult {
  const unit = findUnit({ unitId: args.unitId });
  if (!unit) return { ok: false, error: `号機が見つかりません: ${args.unitId}` };
  const entry = findEntry(unit, args.analysisName);
  if (!entry) {
    return {
      ok: false,
      error: `解析「${args.analysisName}」が見つかりません。この号機の解析: ${unit.analyses.map((a) => a.name).join(', ')}`,
    };
  }

  let fid = entry.flowId;
  let createdFlow = false;
  if (!fid) {
    const tplKey = entry.kind === 'PT' ? PT_TEMPLATE_KEY : entry.kind === 'FT' ? FT_TEMPLATE_KEY : null;
    const tpl = tplKey ? BUILTIN_FLOW_TEMPLATES.find((t) => t.key === tplKey) : null;
    const f = useAnalysisFlowStore.getState().addFlow({
      projectId: unit.projectId,
      name: `${unit.unitNo}号機 ${entry.name} 解析フロー`,
      steps: tpl ? tpl.build() : [],
    });
    fid = f.id;
    useVehicleUnitStore.getState().updateAnalysis(unit.id, entry.id, { flowId: fid });
    createdFlow = true;
  }

  useAppStore.getState().navigate('analysisFlowDetail', { analysisFlowId: fid, projectId: unit.projectId });
  return {
    ok: true,
    result: {
      flowId: fid,
      message: `${unit.unitNo}号機「${entry.name}」のフローを開きました${createdFlow ? '（テンプレートから新規作成）' : ''}。`,
    },
  };
}

function toolGetCommonParams(): ToolResult {
  const r = requireFlowOwner();
  if ('error' in r) return { ok: false, error: r.error };
  const { unit, entry } = r;

  const massCase = entry.massCaseId
    ? useMassCaseStore.getState().cases.find((c) => c.id === entry.massCaseId)
    : undefined;

  const selections: Record<string, Array<{ id: string; name: string }>> = {};
  for (const cat of MASTER_CATEGORIES) {
    const ids = entry.masterSelections?.[cat.key] ?? [];
    if (ids.length === 0) continue;
    const records = masterRecordsFor(cat.key) ?? [];
    selections[cat.key] = ids.map((id) => ({ id, name: records.find((x) => x.id === id)?.name ?? '(不明)' }));
  }

  return {
    ok: true,
    result: {
      unitNo: unit.unitNo,
      analysisName: entry.name,
      massCaseId: entry.massCaseId ?? null,
      massCaseName: massCase?.name ?? null,
      masterSelections: selections,
    },
  };
}

function toolSetCommonMassCase(args: { massCaseName?: string; massCaseId?: string }): ToolResult {
  const r = requireFlowOwner();
  if ('error' in r) return { ok: false, error: r.error };
  const { unit, entry } = r;

  if (!args.massCaseId && !args.massCaseName) {
    return { ok: false, error: 'massCaseName か massCaseId のどちらかを指定してください。' };
  }
  const cases = useMassCaseStore.getState().cases;
  const target = args.massCaseId
    ? cases.find((c) => c.id === args.massCaseId)
    : cases.find((c) => c.name === args.massCaseName) ?? cases.find((c) => c.name.includes(args.massCaseName!));
  if (!target) {
    return {
      ok: false,
      error: `質量諸元ケースが見つかりません: ${args.massCaseId ?? args.massCaseName}。list_mass_cases で確認してください。`,
    };
  }

  useVehicleUnitStore.getState().updateAnalysis(unit.id, entry.id, { massCaseId: target.id });
  return {
    ok: true,
    result: { massCaseId: target.id, message: `${unit.unitNo}号機「${entry.name}」の質量諸元ケースを「${target.name}」に設定しました。` },
  };
}

function toolSetCommonMasterSelection(args: { category: string; names: string[] }): ToolResult {
  const r = requireFlowOwner();
  if ('error' in r) return { ok: false, error: r.error };
  const { unit, entry } = r;

  const cat = MASTER_CATEGORIES.find((c) => c.key === args.category);
  if (!cat) {
    return { ok: false, error: `未知のマスタ種別: ${args.category}。有効: ${MASTER_CATEGORIES.map((c) => c.key).join(', ')}` };
  }
  if (!Array.isArray(args.names)) return { ok: false, error: 'names は文字列配列で指定してください。' };

  const records = masterRecordsFor(cat.key) ?? [];
  const ids: string[] = [];
  const missing: string[] = [];
  for (const name of args.names) {
    const rec = records.find((x) => x.name === name) ?? records.find((x) => x.name.includes(name));
    if (rec) ids.push(rec.id);
    else missing.push(name);
  }
  if (missing.length > 0) {
    return {
      ok: false,
      error: `レコードが見つかりません: ${missing.join(', ')}。有効な${cat.label}: ${records.map((x) => x.name).join(', ') || '(なし)'}`,
    };
  }
  if (!cat.multi && ids.length > 1) {
    return { ok: false, error: `${cat.label} は1件のみ選択可能です。` };
  }

  const next = { ...(entry.masterSelections ?? {}), [cat.key]: ids };
  useVehicleUnitStore.getState().updateAnalysis(unit.id, entry.id, { masterSelections: next });
  return {
    ok: true,
    result: {
      category: cat.key,
      selected: ids,
      message: `${unit.unitNo}号機「${entry.name}」の${cat.label}を設定しました（${ids.length}件）。`,
    },
  };
}

function toolListMasterRecords(args: { category: string }): ToolResult {
  const cat = MASTER_CATEGORIES.find((c) => c.key === args.category);
  if (!cat) {
    return { ok: false, error: `未知のマスタ種別: ${args.category}。有効: ${MASTER_CATEGORIES.map((c) => c.key).join(', ')}` };
  }
  const records = masterRecordsFor(cat.key) ?? [];
  return {
    ok: true,
    result: { category: cat.key, label: cat.label, records: records.map((x) => ({ id: x.id, name: x.name })) },
  };
}

function toolListMassCases(args: { projectId?: string }): ToolResult {
  const s = useMassCaseStore.getState();
  const cases = s.cases.filter((c) => !args.projectId || c.projectId === args.projectId);
  return {
    ok: true,
    result: cases.map((c) => ({
      id: c.id,
      name: c.name,
      projectId: c.projectId,
      componentCount: s.getComponentsForCase(c.id).length,
    })),
  };
}

function toolGetAnalysisResults(args: { caseId?: string }): ToolResult {
  const r = resolveCaseId(args.caseId);
  if (!r.ok) return r;
  const c = useAnalysisStore.getState().cases.find((x) => x.id === r.caseId);
  if (!c) return { ok: false, error: `解析ケースが見つかりません: ${r.caseId}` };
  const rows = useAnalysisStore.getState().getResultsForCase(r.caseId);
  return {
    ok: true,
    result: {
      caseId: c.id,
      caseName: c.name,
      serviceType: c.serviceType,
      results: rows.map((x) => ({ label: x.label, value: x.value, unit: x.unit, notes: x.notes })),
    },
  };
}

function toolListApplications(): ToolResult {
  const apps = useApplicationStore.getState().applications;
  return {
    ok: true,
    result: apps.map((a) => ({
      id: a.id,
      unitNo: a.unitNo,
      missionName: a.missionName,
      status: a.status,
    })),
  };
}

function toolGenerateApplication(args: { unitId: string }): ToolResult {
  const unit = findUnit({ unitId: args.unitId });
  if (!unit) return { ok: false, error: `号機が見つかりません: ${args.unitId}` };
  const project = useProjectStore.getState().getProject(unit.projectId);
  const data = buildApplicationData({ unit, projectName: project?.name ?? '' });
  const app = useApplicationStore.getState().upsertForUnit(data);
  return {
    ok: true,
    result: { applicationId: app.id, message: `${unit.unitNo}号機の申請書を生成しました（ステータス: ${app.status}）。` },
  };
}

function toolSetUnitAnalysisStatus(args: { unitId: string; analysisName: string; status: string }): ToolResult {
  const unit = findUnit({ unitId: args.unitId });
  if (!unit) return { ok: false, error: `号機が見つかりません: ${args.unitId}` };
  const entry = findEntry(unit, args.analysisName);
  if (!entry) {
    return {
      ok: false,
      error: `解析「${args.analysisName}」が見つかりません。この号機の解析: ${unit.analyses.map((a) => a.name).join(', ')}`,
    };
  }
  const valid: PhaseStatus[] = ['未着手', '実施中', '完了'];
  if (!valid.includes(args.status as PhaseStatus)) {
    return { ok: false, error: `status は ${valid.join(' / ')} のいずれかで指定してください。` };
  }
  useVehicleUnitStore.getState().updateAnalysis(unit.id, entry.id, { status: args.status as PhaseStatus });
  return {
    ok: true,
    result: { message: `${unit.unitNo}号機「${entry.name}」のステータスを「${args.status}」にしました。` },
  };
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
    case 'list_projects':
      return toolListProjects();
    case 'list_vehicle_units':
      return toolListVehicleUnits(args as Parameters<typeof toolListVehicleUnits>[0]);
    case 'get_vehicle_unit':
      return toolGetVehicleUnit(args as Parameters<typeof toolGetVehicleUnit>[0]);
    case 'add_unit_analysis':
      return toolAddUnitAnalysis(args as Parameters<typeof toolAddUnitAnalysis>[0]);
    case 'open_unit_analysis':
      return toolOpenUnitAnalysis(args as Parameters<typeof toolOpenUnitAnalysis>[0]);
    case 'get_common_params':
      return toolGetCommonParams();
    case 'set_common_mass_case':
      return toolSetCommonMassCase(args as Parameters<typeof toolSetCommonMassCase>[0]);
    case 'set_common_master_selection':
      return toolSetCommonMasterSelection(args as Parameters<typeof toolSetCommonMasterSelection>[0]);
    case 'list_master_records':
      return toolListMasterRecords(args as Parameters<typeof toolListMasterRecords>[0]);
    case 'list_mass_cases':
      return toolListMassCases(args as Parameters<typeof toolListMassCases>[0]);
    case 'get_analysis_results':
      return toolGetAnalysisResults(args as Parameters<typeof toolGetAnalysisResults>[0]);
    case 'list_applications':
      return toolListApplications();
    case 'generate_application':
      return toolGenerateApplication(args as Parameters<typeof toolGenerateApplication>[0]);
    case 'set_unit_analysis_status':
      return toolSetUnitAnalysisStatus(args as Parameters<typeof toolSetUnitAnalysisStatus>[0]);
    default:
      return { ok: false, error: `未知のツール: ${name}` };
  }
}

// ── デバッグフック ─────────────────────────────────────────────────────────
// ブラウザコンソールから AIツールを直接検証できるようにする（デモ用途）。
//   window.__aiDebug.executeTool('list_vehicle_units', {})
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__aiDebug = { executeTool, FLOW_TOOL_DECLARATIONS };
}
