import { v4 as uuidv4 } from 'uuid';
import type { AnalysisFlowStep, AnalysisServiceType } from '../../../types';
import { SERVICE_META, ALL_SERVICES } from '../analysisServiceMeta';

/**
 * 解析フロー テンプレート定義。
 * 既存フローに上書き適用される (flow.steps を置き換える)。
 *
 * 運用版では PT解析（計画時）／FT解析（飛行時）の2テンプレートを用意する。
 * 両者とも運用向けの解析（飛行・分散・荷重・船舶・Pi/Ec・落下域・RF・溶融・軌道寿命・
 * 経路回転率・測位衛星）を一通り回すパイプラインで、末尾の判定だけが異なる:
 *   - PT解析: 申請基準達成判定 → 内閣府申請に使用
 *   - FT解析: PT想定への包含判定 → 打ち上げ可否
 *
 * 設計方針:
 * - 各ステップは "解析サービスへのリンクなし" の shell として作成 (analysisCaseId 等は空)。
 *   ユーザーが個別に「解析:」 ドロップダウンで具体的なサービスを選ぶ。
 * - DB (massCase) も空保存。プロジェクトのDBに自動で紐付けない。
 * - 座標は ReactFlow キャンバス上の x, y。
 */

// 横（左→右）フロー用のレイアウト定数。
// x = 列（処理の進行方向）、y = 分岐（並列は上下にオフセット）
const COL_W = 300;      // 列ピッチ（処理の進行方向＝右）

export interface FlowTemplate {
  key: string;
  name: string;
  description: string;
  icon: string;
  /** flow.steps を生成する関数 (毎回 uuid を新規発番するため関数化) */
  build: () => AnalysisFlowStep[];
}

// ─── PT解析 / FT解析 共通の運用解析パイプライン ──────────────────────
interface PhaseFlowOpts {
  decisionLabel: string;
  decisionCondition: string;
  endLabel: string;
}

/**
 * 運用向け 飛行安全解析パイプラインを生成する（依存関係は運用版の標準フローに準拠）。
 *  飛行解析 → 分散飛行経路解析 → { 軌道上寿命→溶融, 海上船舶危険, 地上Ec,
 *                                 投棄物落下域, GNSS可視, 射場内建屋危険, RFリンク }
 *  飛行解析 → 経路回転率解析 → 破片抗力落下予測域解析 → ゲート侵犯可否
 *  各末端解析 → 判定 → 確定
 * ※ ラベルは SERVICE_META と一致させる（ノードの解析種別解決に使用）。
 */
function buildPhaseFlow(opts: PhaseFlowOpts): AnalysisFlowStep[] {
  const f = uuidv4(), df = uuidv4(), prr = uuidv4(), ddf = uuidv4(),
    ol = uuidv4(), ab = uuidv4(), sh = uuidv4(), pec = uuidv4(), di = uuidv4(),
    gn = uuidv4(), lsb = uuidv4(), rf = uuidv4(), gi = uuidv4(), J = uuidv4(), end = uuidv4();
  const base = { status: 'pending' as const, notes: '', dataBindings: [] };
  const X = (c: number) => COL_W * c;
  return [
    { id: f,   order: 0,  label: '飛行解析',              kind: 'normal',   position: { x: X(0), y: 0 },    nextStepIds: [df, prr], ...base },
    { id: df,  order: 1,  label: '分散飛行経路解析',       kind: 'normal',   position: { x: X(1), y: -120 }, nextStepIds: [ol, sh, pec, di, gn, lsb, rf], ...base },
    { id: ol,  order: 2,  label: '軌道上寿命解析',         kind: 'normal',   position: { x: X(2), y: -430 }, nextStepIds: [ab], ...base },
    { id: ab,  order: 3,  label: '溶融解析',              kind: 'normal',   position: { x: X(3), y: -430 }, nextStepIds: [J], ...base },
    { id: sh,  order: 4,  label: '海上船舶危険解析',       kind: 'normal',   position: { x: X(2), y: -300 }, nextStepIds: [J], ...base },
    { id: pec, order: 5,  label: '地上落下傷害予測数解析', kind: 'normal',   position: { x: X(2), y: -170 }, nextStepIds: [J], ...base },
    { id: di,  order: 6,  label: '投棄物落下域解析',       kind: 'normal',   position: { x: X(2), y: -40 },  nextStepIds: [J], ...base },
    { id: gn,  order: 7,  label: 'GNSS可視解析/COLA',      kind: 'normal',   position: { x: X(2), y: 90 },   nextStepIds: [J], ...base },
    { id: lsb, order: 8,  label: '射場内建屋危険解析',     kind: 'normal',   position: { x: X(2), y: 220 },  nextStepIds: [J], ...base },
    { id: rf,  order: 9,  label: 'RFリンク解析',           kind: 'normal',   position: { x: X(2), y: 350 },  nextStepIds: [J], ...base },
    { id: prr, order: 10, label: '経路回転率解析',         kind: 'normal',   position: { x: X(1), y: 540 },  nextStepIds: [ddf], ...base },
    { id: ddf, order: 11, label: '破片抗力落下予測域解析', kind: 'normal',   position: { x: X(2), y: 540 },  nextStepIds: [gi], ...base },
    { id: gi,  order: 12, label: 'ゲート侵犯可否',         kind: 'normal',   position: { x: X(3), y: 540 },  nextStepIds: [J], ...base },
    { id: J,   order: 13, label: opts.decisionLabel,       kind: 'decision', position: { x: X(4), y: 0 },   nextStepIds: [end], loopBackToStepId: f, loopCondition: opts.decisionCondition, ...base },
    { id: end, order: 14, label: opts.endLabel,            kind: 'normal',   position: { x: X(5), y: 0 },   nextStepIds: [], ...base },
  ];
}

export const PT_TEMPLATE_KEY = 'pt-analysis';
export const FT_TEMPLATE_KEY = 'ft-analysis';

export const BUILTIN_FLOW_TEMPLATES: FlowTemplate[] = [
  {
    key: PT_TEMPLATE_KEY,
    name: 'PT解析',
    description: '計画時解析。想定（包絡）条件で運用解析を一通り実施し、申請基準の達成を判定する。内閣府への打ち上げ許可申請に使用。',
    icon: 'clipboard-data',
    build: () => buildPhaseFlow({
      decisionLabel: '申請基準達成判定',
      decisionCondition: 'Ec ≤ 1×10⁻⁴ 等の申請基準を満たす',
      endLabel: 'PT解析 確定（申請用）',
    }),
  },
  {
    key: FT_TEMPLATE_KEY,
    name: 'FT解析',
    description: '飛行時解析。打上直前の実条件で同じ運用解析を実施し、結果が PT解析の想定範囲に包含されることを確認する。',
    icon: 'shield-check',
    build: () => buildPhaseFlow({
      decisionLabel: 'PT想定への包含判定',
      decisionCondition: 'FT結果が PT解析の想定範囲に包含される',
      endLabel: 'FT解析 確定（打上可否）',
    }),
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
 * テンプレ内の label = 「荷重解析」 / 「飛行解析」 等を SERVICE_META 照合で解決する。
 * decision ステップや 確定 等は null を返す (ケース作成しない)。
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
