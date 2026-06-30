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
