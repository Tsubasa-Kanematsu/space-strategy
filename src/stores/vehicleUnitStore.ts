import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { cloudStorage } from '../utils/cloudStorage';
import { v4 as uuidv4 } from 'uuid';
import type { AnalysisEntry, VehicleUnit } from '../types';
import { DEFAULT_ANALYSES } from '../types';

/** addUnit 入力: analyses は id なしで渡せる（省略時は PT/FT を既定追加）。 */
type AddUnitInput = Omit<VehicleUnit, 'id' | 'createdAt' | 'updatedAt' | 'analyses'> & {
  analyses?: Array<Omit<AnalysisEntry, 'id'>>;
};

interface VehicleUnitStore {
  units: VehicleUnit[];
  addUnit: (data: AddUnitInput) => VehicleUnit;
  updateUnit: (id: string, data: Partial<Omit<VehicleUnit, 'id' | 'createdAt'>>) => void;
  deleteUnit: (id: string) => void;
  getUnit: (id: string) => VehicleUnit | undefined;
  unitsByProject: (projectId: string) => VehicleUnit[];
  /** 解析エントリの状態を更新する（機体諸元ID・フローID・ステータス・マスタ選択） */
  updateAnalysis: (unitId: string, entryId: string, patch: Partial<Omit<AnalysisEntry, 'id'>>) => void;
  /** 解析エントリを追加する */
  addAnalysis: (unitId: string, entry: Omit<AnalysisEntry, 'id'>) => AnalysisEntry | undefined;
  /** 解析エントリを削除する */
  deleteAnalysis: (unitId: string, entryId: string) => void;
}

const now = () => new Date().toISOString();
const seedEntry = (e: Omit<AnalysisEntry, 'id'>): AnalysisEntry => ({ id: uuidv4(), ...e });

export const useVehicleUnitStore = create<VehicleUnitStore>()(
  persist(
    (set, get) => ({
      units: [],

      addUnit: (data) => {
        const { analyses, ...rest } = data;
        const seed = (analyses && analyses.length > 0)
          ? analyses
          : DEFAULT_ANALYSES.map((d) => ({ ...d, status: '未着手' as const }));
        const unit: VehicleUnit = {
          id: uuidv4(),
          ...rest,
          analyses: seed.map(seedEntry),
          createdAt: now(),
          updatedAt: now(),
        };
        set((s) => ({ units: [...s.units, unit] }));
        return unit;
      },

      updateUnit: (id, data) =>
        set((s) => ({
          units: s.units.map((u) =>
            u.id === id ? { ...u, ...data, updatedAt: now() } : u
          ),
        })),

      deleteUnit: (id) =>
        set((s) => ({ units: s.units.filter((u) => u.id !== id) })),

      getUnit: (id) => get().units.find((u) => u.id === id),

      unitsByProject: (projectId) =>
        get().units.filter((u) => u.projectId === projectId),

      updateAnalysis: (unitId, entryId, patch) =>
        set((s) => ({
          units: s.units.map((u) =>
            u.id === unitId
              ? { ...u, analyses: u.analyses.map((a) => a.id === entryId ? { ...a, ...patch } : a), updatedAt: now() }
              : u
          ),
        })),

      addAnalysis: (unitId, entry) => {
        const created = seedEntry(entry);
        set((s) => ({
          units: s.units.map((u) =>
            u.id === unitId ? { ...u, analyses: [...u.analyses, created], updatedAt: now() } : u
          ),
        }));
        return created;
      },

      deleteAnalysis: (unitId, entryId) =>
        set((s) => ({
          units: s.units.map((u) =>
            u.id === unitId ? { ...u, analyses: u.analyses.filter((a) => a.id !== entryId), updatedAt: now() } : u
          ),
        })),
    }),
    {
      name: 'vehicle-units',
      storage: createJSONStorage(() => cloudStorage),
      skipHydration: true,
    }
  )
);
