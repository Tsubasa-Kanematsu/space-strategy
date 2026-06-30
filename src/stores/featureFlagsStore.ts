import { create } from 'zustand';
import { FEATURE_FLAGS } from '../featureFlags';

type FeatureFlags = typeof FEATURE_FLAGS;

/**
 * 機能フラグストア。
 *
 * アカウント（グループ）による機能の出し分けは廃止。全ユーザーが
 * featureFlags.ts の同一セット（= 全機能）を使う。サーバーからの上書きは行わない。
 */
interface FeatureFlagsStore {
  flags: FeatureFlags;
}

export const useFeatureFlagsStore = create<FeatureFlagsStore>(() => ({
  flags: FEATURE_FLAGS,
}));

export const useFlags = () => useFeatureFlagsStore((s) => s.flags);
