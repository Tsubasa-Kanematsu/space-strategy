/**
 * アプリ内ナビゲーションの「戻る」ヘルパー。
 *
 * useUrlSync が画面遷移ごとに history.pushState する（= ブラウザ履歴がアプリ状態と一致）。
 * その前進回数を数えておき、goBack() でブラウザ履歴を1つ戻す。
 * 直リンク等で戻る先が無い場合は何もしない（呼び出し側で fallback を出す）。
 */
let inAppDepth = 0;

/** useUrlSync が history.pushState したとき呼ぶ（前進1回） */
export function noteForwardNav(): void {
  inAppDepth += 1;
}

/** popstate（戻る/進む）で呼ぶ（深さを1戻す） */
export function notePopNav(): void {
  if (inAppDepth > 0) inAppDepth -= 1;
}

/** アプリ内で戻れる履歴があるか */
export function canGoBack(): boolean {
  return inAppDepth > 0;
}

/** 1つ前の画面へ戻る（履歴が無ければ何もしない） */
export function goBack(): void {
  if (inAppDepth > 0) window.history.back();
}

// ─────────────────────────────────────────────────────────────────
// サイドバーの「括り」（4グループ）を跨ぐ遷移は新規ウィンドウで開く。
// ─────────────────────────────────────────────────────────────────
import { navToUrl } from './urlSync';
import type { AppView, AppNavState } from '../types';

export type NavSection = 'project' | 'analysis' | 'master' | 'application';

const SECTION_OF: Partial<Record<AppView, NavSection>> = {
  // マスタデータ
  masterDataHub: 'master', antennaData: 'master', groundAntennaData: 'master', vehicleAntennaData: 'master',
  shapeMaster: 'master', aeroCoeffMaster: 'master', debrisMaster: 'master',
  propulsionMaster: 'master', windMaster: 'master', failureRateMaster: 'master',
  // 申請書
  applications: 'application', applicationDetail: 'application',
  // 解析（ハブ由来のスタンドアロン。※号機フェーズ配下の massModel/analysisFlowDetail は project 扱い）
  analysisHub: 'analysis', analysisCases: 'analysis', analysisCondition: 'analysis', analysisResults: 'analysis',
  analysisFlow: 'analysis', sizingCases: 'analysis', sizingCondition: 'analysis', sizingResults: 'analysis',
  pluginCases: 'analysis', pluginCondition: 'analysis',
};

/** view が属する括り（未定義は project 扱い＝号機/フロー/機体諸元など） */
export function sectionOf(view: AppView): NavSection {
  return SECTION_OF[view] ?? 'project';
}

/** view + params から URL を生成（新規ウィンドウ用） */
export function buildUrl(view: AppView, params: Partial<AppNavState> = {}): string {
  const state: AppNavState = {
    view,
    projectId: null, massCaseId: null, sizingCaseId: null, analysisCaseId: null,
    analysisService: null, pluginCaseId: null, analysisFlowId: null,
    vehicleUnitId: null, applicationId: null,
    ...params,
  };
  return navToUrl(state);
}

/** 別グループを新規ウィンドウで開く */
export function openInNewWindow(view: AppView, params: Partial<AppNavState> = {}): void {
  window.open(buildUrl(view, params), '_blank', 'noopener');
}

/**
 * 括りを跨ぐ場合は新規ウィンドウ、同じ括り内なら通常遷移。
 * navigate は appStore の navigate を渡す。
 */
export function navigateSectionAware(
  currentView: AppView,
  targetView: AppView,
  params: Partial<AppNavState>,
  navigate: (view: AppView, params?: Partial<Omit<AppNavState, 'view'>>) => void,
): void {
  if (sectionOf(currentView) === sectionOf(targetView)) {
    navigate(targetView, params);
  } else {
    openInNewWindow(targetView, params);
  }
}
