import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { cloudStorage } from '../utils/cloudStorage';
import { v4 as uuidv4 } from 'uuid';
import type { VehicleUnit } from '../types';

interface VehicleUnitStore {
  units: VehicleUnit[];
  addUnit: (data: Omit<VehicleUnit, 'id' | 'createdAt' | 'updatedAt'>) => VehicleUnit;
  updateUnit: (id: string, data: Partial<Omit<VehicleUnit, 'id' | 'createdAt'>>) => void;
  deleteUnit: (id: string) => void;
  getUnit: (id: string) => VehicleUnit | undefined;
  unitsByProject: (projectId: string) => VehicleUnit[];
  /** 解析完了をマーク（完了済み配列に追加） */
  markAnalysisDone: (id: string, type: VehicleUnit['completedAnalyses'][number]) => void;
}

const now = () => new Date().toISOString();

export const useVehicleUnitStore = create<VehicleUnitStore>()(
  persist(
    (set, get) => ({
      units: [],

      addUnit: (data) => {
        const unit: VehicleUnit = {
          id: uuidv4(),
          ...data,
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

      markAnalysisDone: (id, type) =>
        set((s) => ({
          units: s.units.map((u) => {
            if (u.id !== id) return u;
            if (u.completedAnalyses.includes(type)) return u;
            return { ...u, completedAnalyses: [...u.completedAnalyses, type], updatedAt: now() };
          }),
        })),
    }),
    {
      name: 'vehicle-units',
      storage: createJSONStorage(() => cloudStorage),
      skipHydration: true,
    }
  )
);
