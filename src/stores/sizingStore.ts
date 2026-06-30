import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { cloudStorage } from '../utils/cloudStorage';
import { v4 as uuidv4 } from 'uuid';
import type { SizingCase, SizingResult, SizingCondition } from '../types';

interface SizingStore {
  cases: SizingCase[];
  results: SizingResult[];

  // Case operations
  addCase: (data: Omit<SizingCase, 'id' | 'createdAt' | 'updatedAt'>) => SizingCase;
  updateCase: (id: string, data: Partial<Omit<SizingCase, 'id' | 'createdAt'>>) => void;
  deleteCase: (id: string) => void;
  getCasesForProject: (projectId: string) => SizingCase[];
  getCasesForMassCase: (massCaseId: string) => SizingCase[];
  getCase: (id: string) => SizingCase | undefined;

  // Result operations (accumulate, never overwrite)
  addResult: (sizingCaseId: string, condition: SizingCondition, data: Omit<SizingResult, 'id' | 'sizingCaseId' | 'no' | 'condition' | 'createdAt'>) => SizingResult;
  deleteResult: (id: string) => void;
  getResultsForCase: (sizingCaseId: string) => SizingResult[];
}

const now = () => new Date().toISOString();

export const useSizingStore = create<SizingStore>()(
  persist(
    (set, get) => ({
      cases: [],
      results: [],

      addCase: (data) => {
        const sc: SizingCase = {
          id: uuidv4(),
          ...data,
          createdAt: now(),
          updatedAt: now(),
        };
        set((s) => ({ cases: [...s.cases, sc] }));
        return sc;
      },

      updateCase: (id, data) =>
        set((s) => ({
          cases: s.cases.map((c) =>
            c.id === id ? { ...c, ...data, updatedAt: now() } : c
          ),
        })),

      deleteCase: (id) =>
        set((s) => ({
          cases: s.cases.filter((c) => c.id !== id),
          results: s.results.filter((r) => r.sizingCaseId !== id),
        })),

      getCasesForProject: (projectId) =>
        get().cases.filter((c) => c.projectId === projectId),

      getCasesForMassCase: (massCaseId) =>
        get().cases.filter((c) => c.massCaseId === massCaseId),

      getCase: (id) => get().cases.find((c) => c.id === id),

      addResult: (sizingCaseId, condition, data) => {
        const existing = get().results.filter((r) => r.sizingCaseId === sizingCaseId);
        const no = existing.length + 1;
        const result: SizingResult = {
          id: uuidv4(),
          sizingCaseId,
          no,
          condition,
          ...data,
          createdAt: now(),
        };
        set((s) => ({ results: [...s.results, result] }));
        return result;
      },

      deleteResult: (id) =>
        set((s) => ({ results: s.results.filter((r) => r.id !== id) })),

      getResultsForCase: (sizingCaseId) =>
        get()
          .results.filter((r) => r.sizingCaseId === sizingCaseId)
          .sort((a, b) => a.no - b.no),
    }),
    {
      name: 'sizing-sizing-cases',
      storage: createJSONStorage(() => cloudStorage),
      skipHydration: true,
    }
  )
);
