import { v4 as uuidv4 } from 'uuid';
import type { AnalysisFlowStep, AnalysisServiceType } from '../../../types';
import { SERVICE_META, ALL_SERVICES } from '../analysisServiceMeta';

/**
 * 解析フロー テンプレート定義。
 * 既存フローに上書き適用される (flow.steps を置き換える)。
 *
 * 設計方針:
 * - 各ステップは "解析サービスへのリンクなし" の shell として作成 (analysisCaseId 等は空)。
 *   ユーザーが個別に「解析:」 ドロップダウンで具体的なサービスを選ぶ。
 * - DB (massCase) も空保存。プロジェクトのDBに自動で紐付けない。
 * - 座標は ReactFlow キャンバス上の x, y。
 */

const COL_LEFT = -260;
const COL_CENTER = 0;
const COL_RIGHT = 260;
const ROW_H = 140;

export interface FlowTemplate {
  key: string;
  name: string;
  description: string;
  icon: string;
  /** flow.steps を生成する関数 (毎回 uuid を新規発番するため関数化) */
  build: () => AnalysisFlowStep[];
}

/**
 * テンプレートの分類方針 (ロケット開発工程 × 規制整合)
 *
 *  A) 車両設計反復 (Phase A-B: Vehicle Design Iteration)
 *     ミッション要求 → サイジング → 空力 → 飛行 → 判定 → ループ
 *     設計収束させる「外側ループ」
 *
 *  B) 構造・熱 健全性評価 (Phase C: Structural & Thermal)
 *     飛行荷重環境 → 荷重・熱解析 並列 → 健全性判定
 *     軌道・荷重環境が決まった後で部位設計に使う
 *
 *  C) FAA 14 CFR Part 450 飛行安全解析 (Flight Safety Analysis)
 *     射場ライセンス申請に必要な FSA。 §450.117/§450.119/§450.131 等に対応:
 *       - §450.117  Trajectory analysis (公称・分散経路)
 *       - §450.119  Flight hazard area analysis (船舶/航空機/陸域)
 *       - §450.131  Debris risk analysis (Ec)
 *       - §450.133  Population exposure (Pi/Ec)
 *
 *  D) 軌道投入・通信運用 (Phase C-D: On-orbit & Comms)
 *     軌道寿命・経路回転率・RFリンク・GNSS など 軌道上運用の成立性確認
 */

// ─── A) 車両設計反復フロー (Conceptual / Preliminary Design) ────────

function templateVehicleSizingLoop(): AnalysisFlowStep[] {
  const id1 = uuidv4(), id2 = uuidv4(), id3 = uuidv4(), idJ = uuidv4(), idEnd = uuidv4();
  const base = { status: 'pending' as const, notes: '', dataBindings: [] };
  return [
    { id: id1,  order: 0, label: 'サイジング',     kind: 'normal',  position: { x: COL_CENTER, y: 0 },           nextStepIds: [id2], ...base },
    { id: id2,  order: 1, label: '空力解析',       kind: 'normal',  position: { x: COL_CENTER, y: ROW_H },        nextStepIds: [id3], ...base },
    { id: id3,  order: 2, label: '飛行解析',       kind: 'normal',  position: { x: COL_CENTER, y: ROW_H * 2 },    nextStepIds: [idJ], ...base },
    { id: idJ,  order: 3, label: '性能要求達成判定', kind: 'decision', position: { x: COL_CENTER, y: ROW_H * 3 },  nextStepIds: [idEnd], loopBackToStepId: id1, loopCondition: 'ΔV要求達成 かつ 質量マージン > 10%', ...base },
    { id: idEnd, order: 4, label: 'ベースライン確定', kind: 'normal',  position: { x: COL_CENTER, y: ROW_H * 4 }, nextStepIds: [], ...base },
  ];
}

// ─── B) 構造・熱 健全性評価フロー ──────────────────────────────────

function templateStructuralThermal(): AnalysisFlowStep[] {
  const id1 = uuidv4(), id2a = uuidv4(), id2b = uuidv4(), idJ = uuidv4(), idEnd = uuidv4();
  const base = { status: 'pending' as const, notes: '', dataBindings: [] };
  return [
    { id: id1,   order: 0, label: '飛行解析 (荷重環境)', kind: 'normal',   position: { x: COL_CENTER, y: 0 },        nextStepIds: [id2a, id2b], ...base },
    { id: id2a,  order: 1, label: '荷重解析',           kind: 'normal',   position: { x: COL_LEFT,   y: ROW_H },     nextStepIds: [idJ], ...base },
    { id: id2b,  order: 2, label: '溶融解析 (熱)',      kind: 'normal',   position: { x: COL_RIGHT,  y: ROW_H },     nextStepIds: [idJ], ...base },
    { id: idJ,   order: 3, label: '構造・熱 健全性判定', kind: 'decision', position: { x: COL_CENTER, y: ROW_H * 2 }, nextStepIds: [idEnd], loopBackToStepId: id1, loopCondition: '応力 ≤ 許容 かつ 温度 ≤ 許容', ...base },
    { id: idEnd, order: 4, label: '設計確定',           kind: 'normal',   position: { x: COL_CENTER, y: ROW_H * 3 }, nextStepIds: [], ...base },
  ];
}

// ─── C) FAA 14 CFR Part 450 飛行安全解析フロー ────────────────────

function templateFaa450FlightSafety(): AnalysisFlowStep[] {
  const id1 = uuidv4(), id2 = uuidv4();
  const id3a = uuidv4(), id3b = uuidv4();
  const id4 = uuidv4(), idJ = uuidv4(), idEnd = uuidv4();
  const base = { status: 'pending' as const, notes: '', dataBindings: [] };
  return [
    // §450.117 Trajectory analysis: 公称
    { id: id1,   order: 0, label: '飛行解析 (公称経路)',           kind: 'normal',   position: { x: COL_CENTER, y: 0 },         nextStepIds: [id2], ...base },
    // §450.117 Trajectory analysis: 分散
    { id: id2,   order: 1, label: '分散飛行経路解析 (Monte Carlo)', kind: 'normal',   position: { x: COL_CENTER, y: ROW_H },     nextStepIds: [id3a, id3b], ...base },
    // §450.119 Flight hazard area: 海上
    { id: id3a,  order: 2, label: '海上船舶危険解析',               kind: 'normal',   position: { x: COL_LEFT,   y: ROW_H * 2 }, nextStepIds: [id4], ...base },
    // §450.131 Debris risk: 落下域
    { id: id3b,  order: 3, label: '投棄物落下域解析',               kind: 'normal',   position: { x: COL_RIGHT,  y: ROW_H * 2 }, nextStepIds: [id4], ...base },
    // §450.133 Population exposure: Pi/Ec
    { id: id4,   order: 4, label: 'Pi/Ec解析 (集団リスク)',         kind: 'normal',   position: { x: COL_CENTER, y: ROW_H * 3 }, nextStepIds: [idJ], ...base },
    { id: idJ,   order: 5, label: 'FAA Part 450 基準達成判定',     kind: 'decision', position: { x: COL_CENTER, y: ROW_H * 4 }, nextStepIds: [idEnd], loopBackToStepId: id1, loopCondition: 'Ec ≤ 1×10⁻⁴ かつ 個人リスク ≤ 1×10⁻⁶ (Part 450 §450.101)', ...base },
    { id: idEnd, order: 6, label: 'FSA 報告書化',                  kind: 'normal',   position: { x: COL_CENTER, y: ROW_H * 5 }, nextStepIds: [], ...base },
  ];
}

// ─── D) 軌道投入・通信運用解析フロー ─────────────────────────────

function templateOrbitalOps(): AnalysisFlowStep[] {
  const id1 = uuidv4(), id2 = uuidv4(), id3a = uuidv4(), id3b = uuidv4(), idJ = uuidv4(), idEnd = uuidv4();
  const base = { status: 'pending' as const, notes: '', dataBindings: [] };
  return [
    { id: id1,   order: 0, label: '軌道上寿命解析',     kind: 'normal',   position: { x: COL_CENTER, y: 0 },         nextStepIds: [id2], ...base },
    { id: id2,   order: 1, label: '経路回転率解析',     kind: 'normal',   position: { x: COL_CENTER, y: ROW_H },     nextStepIds: [id3a, id3b], ...base },
    { id: id3a,  order: 2, label: 'RFリンク解析',       kind: 'normal',   position: { x: COL_LEFT,   y: ROW_H * 2 }, nextStepIds: [idJ], ...base },
    { id: id3b,  order: 3, label: '測位衛星通信解析',   kind: 'normal',   position: { x: COL_RIGHT,  y: ROW_H * 2 }, nextStepIds: [idJ], ...base },
    { id: idJ,   order: 4, label: '軌道運用成立性判定', kind: 'decision', position: { x: COL_CENTER, y: ROW_H * 3 }, nextStepIds: [idEnd], loopBackToStepId: id1, loopCondition: '寿命要求達成 かつ リンクマージン ≥ 3 dB', ...base },
    { id: idEnd, order: 5, label: 'ミッション計画確定', kind: 'normal',   position: { x: COL_CENTER, y: ROW_H * 4 }, nextStepIds: [], ...base },
  ];
}

export const BUILTIN_FLOW_TEMPLATES: FlowTemplate[] = [
  {
    key: 'vehicle-sizing-loop',
    name: '機体サイジング・性能収束',
    description: '概念〜基本設計 (Phase A-B)。サイジング ↔ 空力 ↔ 飛行 を反復し、性能要求に収束させる外側ループ',
    icon: 'arrow-repeat',
    build: templateVehicleSizingLoop,
  },
  {
    key: 'structural-thermal',
    name: '構造・熱 健全性検証',
    description: '詳細設計 (Phase C)。飛行解析で得た荷重環境から 荷重・熱解析 を並列実行し、応力/温度の許容判定を行う',
    icon: 'speedometer2',
    build: templateStructuralThermal,
  },
  {
    key: 'faa-part450-fsa',
    name: '飛行安全解析 (FAA Part 450)',
    description: '商用打上げライセンス必須の Flight Safety Analysis。公称・分散経路 → 危険域 (海上/落下) → Pi/Ec まで §450.117/119/131/133 に整合',
    icon: 'shield-check',
    build: templateFaa450FlightSafety,
  },
  {
    key: 'orbital-ops',
    name: '軌道投入・通信運用',
    description: '投入後の運用検証 (Phase C-D)。軌道寿命 → 姿勢 → RFリンク / 測位衛星通信 を統合判定',
    icon: 'broadcast',
    build: templateOrbitalOps,
  },
];

/**
 * 永続化したカスタムテンプレート定義 (useTemplateStore で保存される実体)。
 * BUILTIN_FLOW_TEMPLATES と同じ shape で扱えるよう build() を生やす変換ヘルパー付き。
 */
export interface CustomTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** 保存時にDB(massCaseId)/解析ケース(analysisCaseId)/サイジング/プラグインケースID は空にクリアして保存する */
  steps: AnalysisFlowStep[];
  createdAt: string;
}

/** CustomTemplate → FlowTemplate (build時にuuidを再発番) */
export function customToFlowTemplate(c: CustomTemplate): FlowTemplate {
  return {
    key: `custom:${c.id}`,
    name: c.name,
    description: c.description || 'ユーザー保存テンプレート',
    icon: c.icon || 'bookmark-star',
    build: () => {
      // uuid を再発番してID衝突を避ける。nextStepIds / loopBackToStepId のリンクは旧→新IDで張り替える
      const idMap = new Map<string, string>();
      for (const s of c.steps) idMap.set(s.id, uuidv4());
      return c.steps.map((s) => ({
        ...s,
        id: idMap.get(s.id)!,
        nextStepIds: (s.nextStepIds ?? []).map((nid) => idMap.get(nid) ?? nid),
        loopBackToStepId: s.loopBackToStepId ? idMap.get(s.loopBackToStepId) : undefined,
        // ステータスは未実行に戻す (テンプレ適用後はクリーン状態が期待値)
        status: 'pending' as const,
      }));
    },
  };
}

/**
 * 「現在のフローを保存」する時に呼ぶ正規化関数。
 * - 解析/サイジング/プラグインのケースID と DB (linkedMassCaseId) を空に
 * - ステータスを pending に
 * - dataBindings を空に
 * これにより別プロジェクトでも再利用可能な「型」だけが残る。
 */
export function normalizeStepsForTemplateSave(steps: AnalysisFlowStep[]): AnalysisFlowStep[] {
  return steps.map((s) => ({
    ...s,
    analysisCaseId: undefined,
    sizingCaseId: undefined,
    pluginCaseId: undefined,
    linkedMassCaseId: undefined,
    status: 'pending' as const,
    dataBindings: [],
  }));
}

// ─── テンプレ適用時の「型」 → 「実ケース」 の解決ヘルパー ──────────────

export type TemplateSeed =
  | { kind: 'analysis'; service: AnalysisServiceType }
  | { kind: 'sizing' }
  | { kind: 'db' };

/**
 * ステップラベルから「このスロットは何の解析か」 を判定する。
 * テンプレ内の label = 「荷重解析」 / 「サイジング」 / 「飛行解析 (公称経路)」 等を
 * SERVICE_META や 'サイジング' などのキーワード照合で解決する。
 * decision ステップや 結果統合 / ベースライン確定 等は null を返す (ケース作成しない)。
 */
export function resolveSeedFromLabel(label: string): TemplateSeed | null {
  if (!label) return null;
  // SERVICE_META.label の長いキーワードから優先的にマッチ (短い '解析' が先に当たらないように)
  const sortedServices = [...ALL_SERVICES].sort(
    (a, b) => SERVICE_META[b].label.length - SERVICE_META[a].label.length,
  );
  for (const svc of sortedServices) {
    if (label.includes(SERVICE_META[svc].label)) return { kind: 'analysis', service: svc };
  }
  if (label.includes('サイジング')) return { kind: 'sizing' };
  if (label.includes('DB更新')) return { kind: 'db' };
  return null;
}
