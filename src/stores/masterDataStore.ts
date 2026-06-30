import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { cloudStorage } from '../utils/cloudStorage';
import { v4 as uuidv4 } from 'uuid';
import type { AntennaData, ComponentCategoryPreset, PropulsionMaster } from '../types';

interface MasterDataStore {
  antennas: AntennaData[];
  addAntenna: (data: Omit<AntennaData, 'id' | 'createdAt' | 'updatedAt'>) => AntennaData;
  updateAntenna: (id: string, data: Partial<Omit<AntennaData, 'id' | 'createdAt'>>) => void;
  deleteAntenna: (id: string) => void;
  getAntenna: (id: string) => AntennaData | undefined;

  propulsions: PropulsionMaster[];
  addPropulsion: (data: Omit<PropulsionMaster, 'id' | 'createdAt' | 'updatedAt'>) => PropulsionMaster;
  updatePropulsion: (id: string, data: Partial<Omit<PropulsionMaster, 'id' | 'createdAt'>>) => void;
  deletePropulsion: (id: string) => void;

  componentCategoryPresets: ComponentCategoryPreset[];
  addComponentCategoryPreset: (data: Omit<ComponentCategoryPreset, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => ComponentCategoryPreset;
  updateComponentCategoryPreset: (id: string, data: Partial<Omit<ComponentCategoryPreset, 'id' | 'createdAt'>>) => void;
  deleteComponentCategoryPreset: (id: string) => void;
}

const now = () => new Date().toISOString();

const DEFAULT_CATEGORY_PRESETS: ComponentCategoryPreset[] = [
  { id: 'structure',  name: '構造系',     color: 'bg-secondary-subtle text-secondary', builtin: true, order: 0, createdAt: '1970-01-01T00:00:00.000Z', updatedAt: '1970-01-01T00:00:00.000Z' },
  { id: 'propulsion', name: '推進系',     color: 'bg-danger-subtle text-danger',       builtin: true, order: 1, createdAt: '1970-01-01T00:00:00.000Z', updatedAt: '1970-01-01T00:00:00.000Z' },
  { id: 'avionics',   name: 'アビオニクス', color: 'bg-primary-subtle text-primary',     builtin: true, order: 2, createdAt: '1970-01-01T00:00:00.000Z', updatedAt: '1970-01-01T00:00:00.000Z' },
  { id: 'payload',    name: 'ペイロード',   color: 'bg-success-subtle text-success',     builtin: true, order: 3, createdAt: '1970-01-01T00:00:00.000Z', updatedAt: '1970-01-01T00:00:00.000Z' },
  { id: 'power',      name: '電源系',     color: 'bg-warning-subtle text-warning',     builtin: true, order: 4, createdAt: '1970-01-01T00:00:00.000Z', updatedAt: '1970-01-01T00:00:00.000Z' },
  { id: 'thermal',    name: '熱制御系',    color: 'bg-info-subtle text-info',           builtin: true, order: 5, createdAt: '1970-01-01T00:00:00.000Z', updatedAt: '1970-01-01T00:00:00.000Z' },
  { id: 'other',      name: 'その他',     color: 'bg-light text-muted',                builtin: true, order: 6, createdAt: '1970-01-01T00:00:00.000Z', updatedAt: '1970-01-01T00:00:00.000Z' },
];

export const useMasterDataStore = create<MasterDataStore>()(
  persist(
    (set, get) => ({
      antennas: [],

      addAntenna: (data) => {
        const antenna: AntennaData = { id: uuidv4(), ...data, createdAt: now(), updatedAt: now() };
        set((s) => ({ antennas: [...s.antennas, antenna] }));
        return antenna;
      },

      updateAntenna: (id, data) =>
        set((s) => ({
          antennas: s.antennas.map((a) => a.id === id ? { ...a, ...data, updatedAt: now() } : a),
        })),

      deleteAntenna: (id) =>
        set((s) => ({ antennas: s.antennas.filter((a) => a.id !== id) })),

      getAntenna: (id) => get().antennas.find((a) => a.id === id),

      propulsions: [],

      addPropulsion: (data) => {
        const p: PropulsionMaster = { id: uuidv4(), ...data, createdAt: now(), updatedAt: now() };
        set((s) => ({ propulsions: [...s.propulsions, p] }));
        return p;
      },

      updatePropulsion: (id, data) =>
        set((s) => ({
          propulsions: s.propulsions.map((p) => p.id === id ? { ...p, ...data, updatedAt: now() } : p),
        })),

      deletePropulsion: (id) =>
        set((s) => ({ propulsions: s.propulsions.filter((p) => p.id !== id) })),

      componentCategoryPresets: DEFAULT_CATEGORY_PRESETS,

      addComponentCategoryPreset: (data) => {
        const { id: providedId, ...rest } = data;
        const preset: ComponentCategoryPreset = { id: providedId ?? uuidv4(), ...rest, createdAt: now(), updatedAt: now() };
        set((s) => ({ componentCategoryPresets: [...s.componentCategoryPresets, preset] }));
        return preset;
      },

      updateComponentCategoryPreset: (id, data) =>
        set((s) => ({
          componentCategoryPresets: s.componentCategoryPresets.map((p) => p.id === id ? { ...p, ...data, updatedAt: now() } : p),
        })),

      deleteComponentCategoryPreset: (id) =>
        set((s) => ({ componentCategoryPresets: s.componentCategoryPresets.filter((p) => p.id !== id) })),
    }),
    {
      name: 'rocketdb-master-data',
      storage: createJSONStorage(() => cloudStorage),
      skipHydration: true,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<MasterDataStore>;
        const presets = p.componentCategoryPresets && p.componentCategoryPresets.length > 0
          ? p.componentCategoryPresets
          : DEFAULT_CATEGORY_PRESETS;
        // 既存ユーザーで builtin プリセットが欠けている場合は補完
        const existingIds = new Set(presets.map((x) => x.id));
        const merged = [...presets];
        for (const def of DEFAULT_CATEGORY_PRESETS) {
          if (!existingIds.has(def.id)) merged.push(def);
        }
        return { ...current, ...p, componentCategoryPresets: merged };
      },
    }
  )
);
