import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { cloudStorage } from '../utils/cloudStorage';
import type { RocketGeometry, RocketNoseCone, RocketBodySection, RocketFinSet } from '../types';

const now = () => new Date().toISOString();

const DEFAULT_NOSE_CONE: RocketNoseCone = {
  type: 'ogive',
  lengthM: 2.0,
  baseDiameterM: 1.0,
};

interface RocketShapeStore {
  geometries: RocketGeometry[];
  getGeometry: (massCaseId: string) => RocketGeometry | undefined;
  upsertGeometry: (
    massCaseId: string,
    patch: Partial<Omit<RocketGeometry, 'massCaseId' | 'updatedAt'>>,
  ) => void;
  copyGeometry: (fromMassCaseId: string, toMassCaseId: string) => void;
  deleteGeometry: (massCaseId: string) => void;

  // Body sections
  addBodySection: (massCaseId: string, section: Omit<RocketBodySection, 'id'>) => void;
  updateBodySection: (massCaseId: string, id: string, patch: Partial<Omit<RocketBodySection, 'id'>>) => void;
  deleteBodySection: (massCaseId: string, id: string) => void;

  // Fin sets
  addFinSet: (massCaseId: string, finSet: Omit<RocketFinSet, 'id'>) => void;
  updateFinSet: (massCaseId: string, id: string, patch: Partial<Omit<RocketFinSet, 'id'>>) => void;
  deleteFinSet: (massCaseId: string, id: string) => void;
}

const uuid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const ensureGeometry = (geometries: RocketGeometry[], massCaseId: string): RocketGeometry => {
  const existing = geometries.find((g) => g.massCaseId === massCaseId);
  if (existing) return existing;
  return {
    massCaseId,
    noseCone: { ...DEFAULT_NOSE_CONE },
    bodySections: [],
    finSets: [],
    updatedAt: now(),
  };
};

export const useRocketShapeStore = create<RocketShapeStore>()(
  persist(
    (set, get) => ({
      geometries: [],

      getGeometry: (massCaseId) =>
        get().geometries.find((g) => g.massCaseId === massCaseId),

      upsertGeometry: (massCaseId, patch) => {
        set((s) => {
          const existing = s.geometries.find((g) => g.massCaseId === massCaseId);
          if (existing) {
            return {
              geometries: s.geometries.map((g) =>
                g.massCaseId === massCaseId
                  ? { ...g, ...patch, updatedAt: now() }
                  : g,
              ),
            };
          }
          const base = ensureGeometry(s.geometries, massCaseId);
          return {
            geometries: [...s.geometries, { ...base, ...patch, updatedAt: now() }],
          };
        });
      },

      copyGeometry: (fromMassCaseId, toMassCaseId) => {
        const src = get().geometries.find((g) => g.massCaseId === fromMassCaseId);
        if (!src) return;
        const copy: RocketGeometry = {
          ...src,
          massCaseId: toMassCaseId,
          bodySections: src.bodySections.map((bs) => ({ ...bs, id: uuid() })),
          finSets: src.finSets.map((fs) => ({ ...fs, id: uuid() })),
          updatedAt: now(),
        };
        set((s) => {
          const filtered = s.geometries.filter((g) => g.massCaseId !== toMassCaseId);
          return { geometries: [...filtered, copy] };
        });
      },

      deleteGeometry: (massCaseId) => {
        set((s) => ({
          geometries: s.geometries.filter((g) => g.massCaseId !== massCaseId),
        }));
      },

      addBodySection: (massCaseId, section) => {
        const geom = ensureGeometry(get().geometries, massCaseId);
        const newSection: RocketBodySection = { ...section, id: uuid() };
        set((s) => {
          const existing = s.geometries.find((g) => g.massCaseId === massCaseId);
          if (existing) {
            return {
              geometries: s.geometries.map((g) =>
                g.massCaseId === massCaseId
                  ? { ...g, bodySections: [...g.bodySections, newSection], updatedAt: now() }
                  : g,
              ),
            };
          }
          return {
            geometries: [
              ...s.geometries,
              { ...geom, bodySections: [...geom.bodySections, newSection], updatedAt: now() },
            ],
          };
        });
      },

      updateBodySection: (massCaseId, id, patch) => {
        set((s) => ({
          geometries: s.geometries.map((g) =>
            g.massCaseId === massCaseId
              ? {
                  ...g,
                  bodySections: g.bodySections.map((bs) =>
                    bs.id === id ? { ...bs, ...patch } : bs,
                  ),
                  updatedAt: now(),
                }
              : g,
          ),
        }));
      },

      deleteBodySection: (massCaseId, id) => {
        set((s) => ({
          geometries: s.geometries.map((g) =>
            g.massCaseId === massCaseId
              ? {
                  ...g,
                  bodySections: g.bodySections.filter((bs) => bs.id !== id),
                  updatedAt: now(),
                }
              : g,
          ),
        }));
      },

      addFinSet: (massCaseId, finSet) => {
        const geom = ensureGeometry(get().geometries, massCaseId);
        const newFinSet: RocketFinSet = { ...finSet, id: uuid() };
        set((s) => {
          const existing = s.geometries.find((g) => g.massCaseId === massCaseId);
          if (existing) {
            return {
              geometries: s.geometries.map((g) =>
                g.massCaseId === massCaseId
                  ? { ...g, finSets: [...g.finSets, newFinSet], updatedAt: now() }
                  : g,
              ),
            };
          }
          return {
            geometries: [
              ...s.geometries,
              { ...geom, finSets: [...geom.finSets, newFinSet], updatedAt: now() },
            ],
          };
        });
      },

      updateFinSet: (massCaseId, id, patch) => {
        set((s) => ({
          geometries: s.geometries.map((g) =>
            g.massCaseId === massCaseId
              ? {
                  ...g,
                  finSets: g.finSets.map((fs) =>
                    fs.id === id ? { ...fs, ...patch } : fs,
                  ),
                  updatedAt: now(),
                }
              : g,
          ),
        }));
      },

      deleteFinSet: (massCaseId, id) => {
        set((s) => ({
          geometries: s.geometries.map((g) =>
            g.massCaseId === massCaseId
              ? {
                  ...g,
                  finSets: g.finSets.filter((fs) => fs.id !== id),
                  updatedAt: now(),
                }
              : g,
          ),
        }));
      },
    }),
    {
      name: 'rocketdb-rocket-shape-store',
      storage: createJSONStorage(() => cloudStorage),
      skipHydration: true,
    },
  ),
);
