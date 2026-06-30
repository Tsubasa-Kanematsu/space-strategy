import type { Node, Edge } from '@xyflow/react';
import type { AnalysisFlowStep, AnalysisServiceType } from '../../../types';
import { MarkerType } from '@xyflow/react';
import { SERVICE_META } from '../analysisServiceMeta';

// ─── Node データ型 ────────────────────────────────────────────────────────────

export type FlowStepNodeData = {
  stepId: string;
  label: string;
  stepNumber: number;       // 1-based 表示番号
  status: 'pending' | 'in_progress' | 'done';
  linkedType: 'none' | 'analysis' | 'sizing' | 'db' | 'plugin';
  isLoopTarget: boolean;    // 他のステップのループ先になっているか
  /**
   * 自身がループ元 (判定ステップで loopBackToStepId が設定されている) ときの
   * ループ番号 (Fortran CONTINUE 風)。 ノードに "→①" を表示する。
   */
  loopOutLabel?: number;
  /**
   * 自身が他ステップのループ先になっているときの、入ってくる番号一覧。
   * ノードに "①→" "②→" を表示する。
   */
  loopInLabels?: number[];
  kind?: 'normal' | 'decision';
  /** ノード左側に表示する Bootstrap Icons 名 (アイコン部分) */
  iconName: string;
  /** 副題行 (例: "プロジェクト参照" / "サイジング" 等) */
  subtitle: string;
};

export type FlowStepNodeType = Node<FlowStepNodeData, 'flowStep'>;

// ─── 定数 ────────────────────────────────────────────────────────────────────

export const NODE_ROW_HEIGHT = 130;
export const NODE_WIDTH = 220;

// ─── グラフユーティリティ ─────────────────────────────────────────────────────

/**
 * フォワードエッジ (順次/分岐/合流) の隣接リストを返す。
 * いずれかのステップに nextStepIds が定義されていれば DAG として扱う。
 * 全てのステップで未定義 (旧データ) の場合は order ベースの線形フォールバック。
 */
export function getForwardAdjacency(steps: AnalysisFlowStep[]): Array<{ source: string; target: string }> {
  const hasExplicit = steps.some((s) => s.nextStepIds !== undefined);
  if (hasExplicit) {
    return steps.flatMap((s) =>
      (s.nextStepIds ?? []).map((target) => ({ source: s.id, target }))
    );
  }
  const sorted = [...steps].sort((a, b) => a.order - b.order);
  const edges: Array<{ source: string; target: string }> = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    edges.push({ source: sorted[i].id, target: sorted[i + 1].id });
  }
  return edges;
}

/** 指定ステップの前駆ステップID一覧 (フォワードエッジ基準) */
export function getPredecessorIds(stepId: string, steps: AnalysisFlowStep[]): string[] {
  const adj = getForwardAdjacency(steps);
  return adj.filter((e) => e.target === stepId).map((e) => e.source);
}

/** 指定ステップの後続ステップID一覧 (フォワードエッジ基準) */
export function getSuccessorIds(stepId: string, steps: AnalysisFlowStep[]): string[] {
  const adj = getForwardAdjacency(steps);
  return adj.filter((e) => e.source === stepId).map((e) => e.target);
}

/** ルートノード (前駆なし) のID一覧 */
export function getRootStepIds(steps: AnalysisFlowStep[]): string[] {
  const adj = getForwardAdjacency(steps);
  const hasIncoming = new Set(adj.map((e) => e.target));
  return steps.filter((s) => !hasIncoming.has(s.id)).map((s) => s.id);
}

/**
 * source→target をフォワードエッジとして追加するとサイクルを作るか判定する。
 * 既存のフォワードエッジのみを見る (ループエッジは別管理なので対象外)。
 */
export function wouldCreateCycle(
  source: string,
  target: string,
  steps: AnalysisFlowStep[]
): boolean {
  if (source === target) return true;
  // target から source への到達可能性を BFS でチェック
  const adj = getForwardAdjacency(steps);
  const children = new Map<string, string[]>();
  for (const e of adj) {
    if (!children.has(e.source)) children.set(e.source, []);
    children.get(e.source)!.push(e.target);
  }
  const visited = new Set<string>();
  const queue: string[] = [target];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === source) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const c of children.get(cur) ?? []) queue.push(c);
  }
  return false;
}

// ─── 変換ユーティリティ ───────────────────────────────────────────────────────

/**
 * AnalysisFlowStep 配列 → ReactFlow Node 配列。
 * options.serviceByCaseId を渡すと「解析」 タイプのノードに対し
 * 個別サービスのアイコンを引いて反映する (荷重解析→speedometer2 等)。
 */
export function stepsToNodes(
  sortedSteps: AnalysisFlowStep[],
  options?: { serviceByCaseId?: Map<string, AnalysisServiceType> },
): FlowStepNodeType[] {
  const svcMap = options?.serviceByCaseId;
  const loopTargets = new Set(
    sortedSteps
      .map((s) => s.loopBackToStepId)
      .filter((id): id is string => Boolean(id))
  );

  // Fortran CONTINUE 風のループ番号割り当て
  // ループ元 (loopBackToStepId が定義された step) ごとに ①②③… を発番。
  // 番号は sortedSteps の出現順で安定化させる。
  const loopSourceLabelMap = new Map<string, number>();    // sourceStepId → 番号
  const loopInLabelsOf     = new Map<string, number[]>();  // targetStepId → 入ってくる番号配列
  const sources = sortedSteps.filter((s) => s.loopBackToStepId);
  sources.forEach((s, idx) => {
    const num = idx + 1;
    loopSourceLabelMap.set(s.id, num);
    const arr = loopInLabelsOf.get(s.loopBackToStepId!) ?? [];
    arr.push(num);
    loopInLabelsOf.set(s.loopBackToStepId!, arr);
  });

  return sortedSteps.map((step, idx) => {
    const linkedType: FlowStepNodeData['linkedType'] = step.analysisCaseId
      ? 'analysis'
      : step.sizingCaseId
      ? 'sizing'
      : step.pluginCaseId
      ? 'plugin'
      : step.linkedMassCaseId
      ? 'db'
      : 'none';
    const isDecision = step.kind === 'decision';
    // アイコンと副題を決定
    // title (data.label = ステップ名) と subtitle が同じ語にならないよう、
    // subtitle はあくまで「役割カテゴリ」 (解析 / サイジング / 判定 等) で固定する。
    // 具体的なサービス名 (荷重解析 等) は title 側で示す。
    let iconName = 'circle';
    let subtitle = '未設定';
    if (isDecision) {
      iconName = 'question-diamond';
      subtitle = '判定';
    } else if (linkedType === 'analysis') {
      const svc = step.analysisCaseId ? svcMap?.get(step.analysisCaseId) : undefined;
      iconName = (svc && SERVICE_META[svc]?.icon) || 'cpu';
      subtitle = '解析';
    } else if (linkedType === 'sizing') {
      iconName = 'calculator';
      subtitle = 'サイジング';
    } else if (linkedType === 'plugin') {
      iconName = 'puzzle';
      subtitle = 'カスタム解析';
    } else if (linkedType === 'db') {
      iconName = 'database';
      subtitle = 'DB更新';
    } else {
      iconName = 'circle';
      subtitle = '未設定';
    }
    return {
      id: step.id,
      type: 'flowStep' as const,
      position: step.position ?? { x: 0, y: idx * NODE_ROW_HEIGHT },
      data: {
        stepId: step.id,
        label: step.label,
        stepNumber: idx + 1,
        status: step.status,
        linkedType,
        isLoopTarget: loopTargets.has(step.id),
        loopOutLabel: loopSourceLabelMap.get(step.id),
        loopInLabels: loopInLabelsOf.get(step.id),
        kind: step.kind ?? 'normal',
        iconName,
        subtitle,
      },
      style: { width: NODE_WIDTH },
      deletable: false,
    };
  });
}

/** AnalysisFlowStep 配列 → ReactFlow Edge 配列に変換（ソート済みを渡すこと）*/
export function stepsToEdges(sortedSteps: AnalysisFlowStep[]): Edge[] {
  const edges: Edge[] = [];

  // フォワードエッジ (nextStepIds 由来 or 線形フォールバック)
  // 旧データ互換のため、明示 nextStepIds がない場合は削除不可・選択不可とする
  const hasExplicit = sortedSteps.some((s) => s.nextStepIds !== undefined);
  for (const e of getForwardAdjacency(sortedSteps)) {
    edges.push({
      id: `seq-${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      // 横（左→右）フロー: 右ハンドルから出て左ハンドルへ入る
      sourceHandle: 'right',
      targetHandle: 'left',
      type: 'default',
      style: { stroke: '#94a3b8', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
      deletable: hasExplicit,
      selectable: hasExplicit,
      focusable: hasExplicit,
    });
  }

  // ループは線で繋がず、FlowStepNode 側で Fortran CONTINUE 風 (→① / ①→) ラベル表示。
  // 線が交差して読みにくいフローでも対応関係が番号で分かる。

  return edges;
}
