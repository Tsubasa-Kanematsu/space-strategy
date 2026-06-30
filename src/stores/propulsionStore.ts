import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { cloudStorage } from '../utils/cloudStorage';
import type { PropulsionStage } from '../types';

const uuid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

interface PropulsionStore {
  stages: PropulsionStage[];

  getStagesForCase: (massCaseId: string) => PropulsionStage[];
  addStage: (massCaseId: string, stageNo?: number) => PropulsionStage;
  updateStage: (id: string, patch: Partial<Omit<PropulsionStage, 'id' | 'massCaseId'>>) => void;
  deleteStage: (id: string) => void;
  copyStages: (fromMassCaseId: string, toMassCaseId: string) => void;
}

export const usePropulsionStore = create<PropulsionStore>()(
  persist(
    (set, get) => ({
      stages: [],

      getStagesForCase: (massCaseId) =>
        get().stages
          .filter((s) => s.massCaseId === massCaseId)
          .sort((a, b) => a.stageNo - b.stageNo),

      addStage: (massCaseId, stageNo) => {
        const existing = get().stages.filter((s) => s.massCaseId === massCaseId);
        const nextStageNo = stageNo ?? (existing.length > 0
          ? Math.max(...existing.map((s) => s.stageNo)) + 1
          : 1);
        const stage: PropulsionStage = {
          id: uuid(),
          massCaseId,
          stageNo: nextStageNo,
          engineName: '',
          engineCount: 1,
          propellantType: 'LOX/RP-1',
          thrustVacKN: null,
          thrustSLKN: null,
          ispVacS: null,
          ispSLS: null,
          chamberPressureMPa: null,
          expansionRatio: null,
          burnTimeSec: null,
          propellantMassKg: null,
          ofRatio: null,
          note: '',
        };
        set((s) => ({ stages: [...s.stages, stage] }));
        return stage;
      },

      updateStage: (id, patch) => {
        set((s) => ({
          stages: s.stages.map((st) => (st.id === id ? { ...st, ...patch } : st)),
        }));
      },

      deleteStage: (id) => {
        set((s) => ({ stages: s.stages.filter((st) => st.id !== id) }));
      },

      copyStages: (fromMassCaseId, toMassCaseId) => {
        const src = get().stages.filter((s) => s.massCaseId === fromMassCaseId);
        if (src.length === 0) return;
        const copies = src.map((s) => ({
          ...s,
          id: uuid(),
          massCaseId: toMassCaseId,
        }));
        set((s) => ({
          stages: [
            ...s.stages.filter((st) => st.massCaseId !== toMassCaseId),
            ...copies,
          ],
        }));
      },
    }),
    {
      name: 'rocketdb-propulsion-store',
      storage: createJSONStorage(() => cloudStorage),
      skipHydration: true,
    },
  ),
);
