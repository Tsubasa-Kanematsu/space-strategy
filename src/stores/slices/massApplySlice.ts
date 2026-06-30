import { type StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { MassCase } from '../../types';
import { resolveShadowComponents, applyComponentOverride } from '../../utils/shadowModel';
import type { MassCaseStore, MassApplySlice } from '../massCaseStore.types';

const now = () => new Date().toISOString();

export const createMassApplySlice: StateCreator<MassCaseStore, [], [], MassApplySlice> = (set, get) => ({
  applyAllocatedMasses: (massCaseId, masses, sizingResultId) => {
    const massMap = new Map(masses.map((m) => [m.componentId, m.mass]));
    const resolvedComps = resolveShadowComponents(massCaseId, get().cases, get().components);

    set((s) => {
      let newComps = s.components;
      for (const c of resolvedComps) {
        const logicalId = c.logicalId || c.id;
        const newMass = massMap.get(c.id) ?? massMap.get(logicalId);
        if (newMass !== undefined) {
          newComps = applyComponentOverride(newComps, logicalId, massCaseId, { allocatedMass: newMass }, uuidv4);
        }
      }
      return {
        components: newComps,
        cases: s.cases.map((c) =>
          c.id === massCaseId ? { ...c, sizingResultApplied: sizingResultId, updatedAt: now() } : c
        ),
      };
    });
  },

  copyCaseAndApply: (id, masses, sizingResultId, newName) => {
    const original = get().cases.find((c) => c.id === id);
    if (!original) return null;
    const newId = uuidv4();

    const newCase: MassCase = {
      ...original,
      id: newId,
      name: newName,
      sizingResultApplied: sizingResultId,
      parentMassCaseId: id,
      createdAt: now(),
      updatedAt: now(),
    };

    const resolvedComps = resolveShadowComponents(id, get().cases, get().components);
    const massMap = new Map(masses.map((m) => [m.componentId, m.mass]));

    let newComps = get().components;
    for (const c of resolvedComps) {
      const logicalId = c.logicalId || c.id;
      const newMass = massMap.get(c.id) ?? massMap.get(logicalId);
      if (newMass !== undefined) {
        newComps = applyComponentOverride(newComps, logicalId, newId, { allocatedMass: newMass }, uuidv4);
      }
    }

    set((s) => ({ cases: [...s.cases, newCase], components: newComps }));
    return newCase;
  },
});
