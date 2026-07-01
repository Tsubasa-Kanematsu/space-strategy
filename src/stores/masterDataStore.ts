import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { cloudStorage } from '../utils/cloudStorage';
import { v4 as uuidv4 } from 'uuid';
import type {
  AntennaData, ComponentCategoryPreset, PropulsionMaster,
  ShapeMaster, AeroCoeffMaster, WindMaster, FailureRateMaster, DebrisMaster,
} from '../types';

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

  shapes: ShapeMaster[];
  addShape: (data: Omit<ShapeMaster, 'id' | 'createdAt' | 'updatedAt'>) => ShapeMaster;
  updateShape: (id: string, data: Partial<Omit<ShapeMaster, 'id' | 'createdAt'>>) => void;
  deleteShape: (id: string) => void;

  aeroCoeffs: AeroCoeffMaster[];
  addAeroCoeff: (data: Omit<AeroCoeffMaster, 'id' | 'createdAt' | 'updatedAt'>) => AeroCoeffMaster;
  updateAeroCoeff: (id: string, data: Partial<Omit<AeroCoeffMaster, 'id' | 'createdAt'>>) => void;
  deleteAeroCoeff: (id: string) => void;

  winds: WindMaster[];
  addWind: (data: Omit<WindMaster, 'id' | 'createdAt' | 'updatedAt'>) => WindMaster;
  updateWind: (id: string, data: Partial<Omit<WindMaster, 'id' | 'createdAt'>>) => void;
  deleteWind: (id: string) => void;

  failureRates: FailureRateMaster[];
  addFailureRate: (data: Omit<FailureRateMaster, 'id' | 'createdAt' | 'updatedAt'>) => FailureRateMaster;
  updateFailureRate: (id: string, data: Partial<Omit<FailureRateMaster, 'id' | 'createdAt'>>) => void;
  deleteFailureRate: (id: string) => void;

  debris: DebrisMaster[];
  addDebris: (data: Omit<DebrisMaster, 'id' | 'createdAt' | 'updatedAt'>) => DebrisMaster;
  updateDebris: (id: string, data: Partial<Omit<DebrisMaster, 'id' | 'createdAt'>>) => void;
  deleteDebris: (id: string) => void;

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

      shapes: [],
      addShape: (data) => {
        const x: ShapeMaster = { id: uuidv4(), ...data, createdAt: now(), updatedAt: now() };
        set((s) => ({ shapes: [...s.shapes, x] }));
        return x;
      },
      updateShape: (id, data) =>
        set((s) => ({ shapes: s.shapes.map((x) => x.id === id ? { ...x, ...data, updatedAt: now() } : x) })),
      deleteShape: (id) =>
        set((s) => ({ shapes: s.shapes.filter((x) => x.id !== id) })),

      aeroCoeffs: [],
      addAeroCoeff: (data) => {
        const x: AeroCoeffMaster = { id: uuidv4(), ...data, createdAt: now(), updatedAt: now() };
        set((s) => ({ aeroCoeffs: [...s.aeroCoeffs, x] }));
        return x;
      },
      updateAeroCoeff: (id, data) =>
        set((s) => ({ aeroCoeffs: s.aeroCoeffs.map((x) => x.id === id ? { ...x, ...data, updatedAt: now() } : x) })),
      deleteAeroCoeff: (id) =>
        set((s) => ({ aeroCoeffs: s.aeroCoeffs.filter((x) => x.id !== id) })),

      winds: [],
      addWind: (data) => {
        const x: WindMaster = { id: uuidv4(), ...data, createdAt: now(), updatedAt: now() };
        set((s) => ({ winds: [...s.winds, x] }));
        return x;
      },
      updateWind: (id, data) =>
        set((s) => ({ winds: s.winds.map((x) => x.id === id ? { ...x, ...data, updatedAt: now() } : x) })),
      deleteWind: (id) =>
        set((s) => ({ winds: s.winds.filter((x) => x.id !== id) })),

      failureRates: [],
      addFailureRate: (data) => {
        const x: FailureRateMaster = { id: uuidv4(), ...data, createdAt: now(), updatedAt: now() };
        set((s) => ({ failureRates: [...s.failureRates, x] }));
        return x;
      },
      updateFailureRate: (id, data) =>
        set((s) => ({ failureRates: s.failureRates.map((x) => x.id === id ? { ...x, ...data, updatedAt: now() } : x) })),
      deleteFailureRate: (id) =>
        set((s) => ({ failureRates: s.failureRates.filter((x) => x.id !== id) })),

      debris: [],
      addDebris: (data) => {
        const x: DebrisMaster = { id: uuidv4(), ...data, createdAt: now(), updatedAt: now() };
        set((s) => ({ debris: [...s.debris, x] }));
        return x;
      },
      updateDebris: (id, data) =>
        set((s) => ({ debris: s.debris.map((x) => x.id === id ? { ...x, ...data, updatedAt: now() } : x) })),
      deleteDebris: (id) =>
        set((s) => ({ debris: s.debris.filter((x) => x.id !== id) })),

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
