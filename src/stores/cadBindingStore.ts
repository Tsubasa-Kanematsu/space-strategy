import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { cloudStorage } from '../utils/cloudStorage';
import { v4 as uuidv4 } from 'uuid';
import type { CadSetup, ParamBinding, ComponentBinding } from '../types';

const now = () => new Date().toISOString();

interface CadBindingStore {
  setups: CadSetup[];

  // Setup CRUD
  getSetups: (massCaseId: string) => CadSetup[];
  addSetup: (massCaseId: string, patch?: Partial<Omit<CadSetup, 'id' | 'massCaseId'>>) => CadSetup;
  upsertSetup: (setupId: string, patch: Partial<Omit<CadSetup, 'id' | 'massCaseId'>>) => void;
  deleteSetup: (setupId: string) => void;

  // Param bindings (setupId ベース)
  addParamBinding: (setupId: string, binding: Omit<ParamBinding, 'id'>) => void;
  updateParamBinding: (setupId: string, id: string, patch: Partial<Omit<ParamBinding, 'id'>>) => void;
  deleteParamBinding: (setupId: string, id: string) => void;

  // Component bindings (setupId ベース)
  addComponentBinding: (setupId: string, binding: Omit<ComponentBinding, 'id'>) => void;
  updateComponentBinding: (setupId: string, id: string, patch: Partial<Omit<ComponentBinding, 'id'>>) => void;
  deleteComponentBinding: (setupId: string, id: string) => void;

  markGenerated: (setupId: string) => void;
}

const makeSetup = (massCaseId: string, patch: Partial<Omit<CadSetup, 'id' | 'massCaseId'>> = {}): CadSetup => ({
  id: uuidv4(),
  massCaseId,
  label: 'CADモデル',
  cadType: 'step',
  s3Key: '',
  paramBindings: [],
  componentBindings: [],
  updatedAt: now(),
  ...patch,
});

const patchSetup = (setups: CadSetup[], setupId: string, patch: Partial<CadSetup>): CadSetup[] =>
  setups.map((s) => (s.id === setupId ? { ...s, ...patch, updatedAt: now() } : s));

export const useCadBindingStore = create<CadBindingStore>()(
  persist(
    (set, get) => ({
      setups: [],

      getSetups: (massCaseId) => get().setups.filter((s) => s.massCaseId === massCaseId),

      addSetup: (massCaseId, patch = {}) => {
        const setup = makeSetup(massCaseId, patch);
        set((s) => ({ setups: [...s.setups, setup] }));
        return setup;
      },

      upsertSetup: (setupId, patch) => {
        set((s) => {
          const exists = s.setups.some((x) => x.id === setupId);
          if (!exists) return s;
          return { setups: patchSetup(s.setups, setupId, patch) };
        });
      },

      deleteSetup: (setupId) => {
        set((s) => ({ setups: s.setups.filter((x) => x.id !== setupId) }));
      },

      addParamBinding: (setupId, binding) => {
        set((s) => ({
          setups: patchSetup(s.setups, setupId, {
            paramBindings: [
              ...(s.setups.find((x) => x.id === setupId)?.paramBindings ?? []),
              { ...binding, id: uuidv4() },
            ],
          }),
        }));
      },

      updateParamBinding: (setupId, id, patch) => {
        set((s) => ({
          setups: s.setups.map((setup) =>
            setup.id !== setupId
              ? setup
              : {
                  ...setup,
                  paramBindings: setup.paramBindings.map((b) => (b.id === id ? { ...b, ...patch } : b)),
                  updatedAt: now(),
                },
          ),
        }));
      },

      deleteParamBinding: (setupId, id) => {
        set((s) => ({
          setups: s.setups.map((setup) =>
            setup.id !== setupId
              ? setup
              : { ...setup, paramBindings: setup.paramBindings.filter((b) => b.id !== id), updatedAt: now() },
          ),
        }));
      },

      addComponentBinding: (setupId, binding) => {
        set((s) => ({
          setups: patchSetup(s.setups, setupId, {
            componentBindings: [
              ...(s.setups.find((x) => x.id === setupId)?.componentBindings ?? []),
              { ...binding, id: uuidv4() },
            ],
          }),
        }));
      },

      updateComponentBinding: (setupId, id, patch) => {
        set((s) => ({
          setups: s.setups.map((setup) =>
            setup.id !== setupId
              ? setup
              : {
                  ...setup,
                  componentBindings: setup.componentBindings.map((b) => (b.id === id ? { ...b, ...patch } : b)),
                  updatedAt: now(),
                },
          ),
        }));
      },

      deleteComponentBinding: (setupId, id) => {
        set((s) => ({
          setups: s.setups.map((setup) =>
            setup.id !== setupId
              ? setup
              : { ...setup, componentBindings: setup.componentBindings.filter((b) => b.id !== id), updatedAt: now() },
          ),
        }));
      },

      markGenerated: (setupId) => {
        set((s) => ({ setups: patchSetup(s.setups, setupId, { lastGeneratedAt: now() }) }));
      },
    }),
    {
      name: 'cad-bindings',
      storage: createJSONStorage(() => cloudStorage),
      skipHydration: true,
    },
  ),
);
