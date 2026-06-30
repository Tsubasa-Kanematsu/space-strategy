import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { cloudStorage } from '../utils/cloudStorage';
import { v4 as uuidv4 } from 'uuid';
import type { AnalysisCase, AnalysisResult, AnalysisServiceType } from '../types';

interface AnalysisStore {
  cases: AnalysisCase[];
  results: AnalysisResult[];

  addCase: (data: Omit<AnalysisCase, 'id' | 'createdAt' | 'updatedAt'>) => AnalysisCase;
  updateCase: (id: string, data: Partial<Omit<AnalysisCase, 'id' | 'createdAt'>>) => void;
  deleteCase: (id: string) => void;
  getCase: (id: string) => AnalysisCase | undefined;
  getCasesForService: (serviceType: AnalysisServiceType) => AnalysisCase[];

  addResult: (data: Omit<AnalysisResult, 'id' | 'no' | 'createdAt'>) => AnalysisResult;
  updateResult: (id: string, data: Partial<Omit<AnalysisResult, 'id' | 'analysisCaseId' | 'no' | 'createdAt'>>) => void;
  deleteResult: (id: string) => void;
  getResultsForCase: (analysisCaseId: string) => AnalysisResult[];
}

const now = () => new Date().toISOString();

export const useAnalysisStore = create<AnalysisStore>()(
  persist(
    (set, get) => ({
      cases: [],
      results: [],

      addCase: (data) => {
        const ac: AnalysisCase = { id: uuidv4(), ...data, createdAt: now(), updatedAt: now() };
        set((s) => ({ cases: [...s.cases, ac] }));
        return ac;
      },

      updateCase: (id, data) =>
        set((s) => ({
          cases: s.cases.map((c) => c.id === id ? { ...c, ...data, updatedAt: now() } : c),
        })),

      deleteCase: (id) =>
        set((s) => ({
          cases: s.cases.filter((c) => c.id !== id),
          results: s.results.filter((r) => r.analysisCaseId !== id),
        })),

      getCase: (id) => get().cases.find((c) => c.id === id),

      getCasesForService: (serviceType) =>
        get().cases.filter((c) => c.serviceType === serviceType),

      addResult: (data) => {
        const existing = get().results.filter((r) => r.analysisCaseId === data.analysisCaseId);
        const no = existing.length + 1;
        const result: AnalysisResult = { id: uuidv4(), no, ...data, createdAt: now() };
        set((s) => ({ results: [...s.results, result] }));
        return result;
      },

      updateResult: (id, data) =>
        set((s) => ({
          results: s.results.map((r) => r.id === id ? { ...r, ...data } : r),
        })),

      deleteResult: (id) =>
        set((s) => ({ results: s.results.filter((r) => r.id !== id) })),

      getResultsForCase: (analysisCaseId) =>
        get().results
          .filter((r) => r.analysisCaseId === analysisCaseId)
          .sort((a, b) => a.no - b.no),
    }),
    {
      name: 'rocketdb-analysis-store',
      storage: createJSONStorage(() => cloudStorage),
      skipHydration: true,
    }
  )
);
