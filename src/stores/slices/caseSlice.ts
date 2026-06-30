import { type StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { MassCase } from '../../types';
import { resolveShadowComponents } from '../../utils/shadowModel';
import type { MassCaseStore, CaseSlice } from '../massCaseStore.types';

const now = () => new Date().toISOString();

export const createCaseSlice: StateCreator<MassCaseStore, [], [], CaseSlice> = (set, get) => ({
  cases: [],

  addCase: (data) => {
    const mc: MassCase = { id: uuidv4(), tagDefinitions: [], ...data, createdAt: now(), updatedAt: now() };
    set((s) => ({ cases: [...s.cases, mc] }));
    return mc;
  },

  copyCase: (id) => {
    const original = get().cases.find((c) => c.id === id);
    if (!original) return null;

    const newCase: MassCase = {
      ...original,
      id: uuidv4(),
      name: `${original.name} (コピー)`,
      createdAt: now(),
      updatedAt: now(),
      sizingResultApplied: undefined,
      parentMassCaseId: undefined, // 独立コピー
    };
    const newId = newCase.id;

    const resolvedComps = resolveShadowComponents(id, get().cases, get().components);
    const resolvedParams = resolveShadowComponents(id, get().cases, get().parameters);

    const idMap = new Map<string, string>();
    const newComponents = resolvedComps.map((c) => {
      const newCompId = uuidv4();
      const logical = c.logicalId || c.id;
      idMap.set(logical, newCompId);
      return { ...c, id: newCompId, massCaseId: newId, logicalId: newCompId };
    });
    newComponents.forEach((c) => {
      if (c.parentId) c.parentId = idMap.get(c.parentId) ?? c.parentId;
    });

    const newParams = resolvedParams.map((p) => ({
      ...p, id: uuidv4(), massCaseId: newId, logicalId: uuidv4(),
    }));

    set((s) => ({
      cases: [...s.cases, newCase],
      components: [...s.components, ...newComponents],
      parameters: [...s.parameters, ...newParams],
    }));
    return newCase;
  },

  forkCase: (id, newName) => {
    const original = get().cases.find((c) => c.id === id);
    if (!original) return null;

    const forkedCase: MassCase = {
      ...original,
      id: uuidv4(),
      name: newName,
      parentMassCaseId: id, // 派生元を記録 → コンポーネントは引き継ぎ
      sizingResultApplied: undefined,
      createdAt: now(),
      updatedAt: now(),
    };
    set((s) => ({ cases: [...s.cases, forkedCase] }));
    return forkedCase;
  },

  updateCase: (id, data) =>
    set((s) => ({
      cases: s.cases.map((c) => (c.id === id ? { ...c, ...data, updatedAt: now() } : c)),
    })),

  deleteCase: (id) =>
    set((s) => ({
      cases: s.cases.filter((c) => c.id !== id),
      components: s.components.filter((c) => c.massCaseId !== id),
      parameters: s.parameters.filter((p) => p.massCaseId !== id),
    })),

  getCasesForProject: (projectId) => get().cases.filter((c) => c.projectId === projectId),

  getCase: (id) => get().cases.find((c) => c.id === id),
});
