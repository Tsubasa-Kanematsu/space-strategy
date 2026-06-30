import { create } from 'zustand';
import { FEATURE_FLAGS } from '../featureFlags';

type FeatureFlags = typeof FEATURE_FLAGS;

interface FeatureFlagsStore {
  flags: FeatureFlags;
  group: string;
  setFlags: (group: string, flags: FeatureFlags) => void;
}

export const useFeatureFlagsStore = create<FeatureFlagsStore>((set) => ({
  flags: FEATURE_FLAGS,
  group: 'standard',
  setFlags: (group, flags) => set({ group, flags }),
}));

export const useFlags = () => useFeatureFlagsStore((s) => s.flags);
