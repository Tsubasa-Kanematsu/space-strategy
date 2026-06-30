import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { cloudStorage } from '../utils/cloudStorage';
import { v4 as uuidv4 } from 'uuid';
import type { AnalysisPhase, PhaseState, VehicleUnit } from '../types';

interface VehicleUnitStore {
  units: VehicleUnit[];
  addUnit: (data: Omit<VehicleUnit, 'id' | 'createdAt' | 'updatedAt'>) => VehicleUnit;
  updateUnit: (id: string, data: Partial<Omit<VehicleUnit, 'id' | 'createdAt'>>) => void;
  deleteUnit: (id: string) => void;
  getUnit: (id: string) => VehicleUnit | undefined;
  unitsByProject: (projectId: string) => VehicleUnit[];
  /** フェーズ（PT/FT）の状態を更新する（機体諸元ID・フローID・ステータス） */
  updatePhase: (id: string, phase: AnalysisPhase, patch: Partial<PhaseState>) => void;
}

const now = () => new Date().toISOString();
const phaseKey = (phase: AnalysisPhase): 'pt' | 'ft' => (phase === 'PT' ? 'pt' : 'ft');

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

      updatePhase: (id, phase, patch) =>
        set((s) => ({
          units: s.units.map((u) => {
            if (u.id !== id) return u;
            const key = phaseKey(phase);
            return { ...u, [key]: { ...u[key], ...patch }, updatedAt: now() };
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
