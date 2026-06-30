import type { MassCase } from '../types';

/**
 * MassCaseの派生チェーン（先祖から自分まで）を取得する。
 * 例: [rootId, childId, myId]
 */
export function getCaseChain(caseId: string, cases: MassCase[]): string[] {
  const chain: string[] = [];
  let currentId: string | undefined = caseId;

  // 循環参照を防ぐためのセット
  const visited = new Set<string>();

  while (currentId) {
    if (visited.has(currentId)) {
      console.warn(`[ShadowModel] Circular dependency detected in case chain: ${currentId}`);
      break;
    }
    visited.add(currentId);
    chain.unshift(currentId); // 親を先頭に追加していく

    const pCase = cases.find((c) => c.id === currentId);
    currentId = pCase?.parentMassCaseId;
  }
  return chain;
}

/**
 * コンポーネント配列から、指定した caseId に関連する最新のオーバーライドツリーを復元する。
 */
export function resolveShadowComponents<T extends { massCaseId: string; logicalId?: string; id: string; isDeleted?: boolean }>(
  caseId: string, 
  cases: MassCase[], 
  allItems: T[]
): T[] {
  const chain = getCaseChain(caseId, cases);
  
  // マージ用のマップ。キーは `logicalId`（なければ互換性のため `id` を使う）
  const resolvedMap = new Map<string, T>();

  // チェーンの順（親 → 派生 → 自分）にオーバーライドを適用
  for (const cId of chain) {
    const caseItems = allItems.filter((item) => item.massCaseId === cId);
    for (const item of caseItems) {
      const lid = item.logicalId || item.id;
      if (item.isDeleted) {
        resolvedMap.delete(lid);
      } else {
        // オブジェクトのコピーを保持
        resolvedMap.set(lid, { ...item });
      }
    }
  }

  return Array.from(resolvedMap.values());
}

/**
 * 構成を更新する際、新しいオーバーライドレコード（または既存レコードの更新）を生成する。
 * 返り値は `新しい allItems 配列`。
 */
export function applyComponentOverride<T extends { massCaseId: string; logicalId?: string; id: string; isDeleted?: boolean }>(
  allItems: T[],
  targetLogicalId: string,
  currentCaseId: string,
  data: Partial<T>,
  generateId: () => string
): T[] {
  // 既に currentCaseId に紐付くオーバーライドレコードがあるか？
  const existingOverrideIndex = allItems.findIndex(
    (c) => c.massCaseId === currentCaseId && (c.logicalId || c.id) === targetLogicalId
  );

  if (existingOverrideIndex >= 0) {
    // 既存レコードを更新
    const items = [...allItems];
    items[existingOverrideIndex] = { ...items[existingOverrideIndex], ...data };
    return items;
  } else {
    // 親ケースのデータをベースに新しいオーバーライドレコードを作成
    // ※ベースとなるデータ（最新の解決済み状態）を探す
    const baseItem = [...allItems].reverse().find(
      (c) => (c.logicalId || c.id) === targetLogicalId
    );

    if (!baseItem) {
      // 異常系: ベースが見つからない場合は単に無視するか、新規作成扱い
      return allItems;
    }

    const newRecord = {
      ...baseItem,
      ...data,
      id: generateId(),
      massCaseId: currentCaseId,
      logicalId: targetLogicalId,
    } as T;

    return [...allItems, newRecord];
  }
}
