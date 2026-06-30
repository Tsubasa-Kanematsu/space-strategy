import { type StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Parameter } from '../../types';
import { resolveShadowComponents, applyComponentOverride } from '../../utils/shadowModel';
import { useAppStore } from '../appStore';
import { getActiveCollab, isEmitSuppressed } from '../../ws/collabClient';
import type { MassCaseStore, ParameterSlice } from '../massCaseStore.types';

const PARAM_SKIP_FIELDS = new Set(['id', 'logicalId', 'massCaseId']);
function emitParameterFieldSets(logicalId: string, data: Record<string, unknown>) {
  const collab = getActiveCollab();
  if (!collab || isEmitSuppressed()) return;
  for (const [k, v] of Object.entries(data)) {
    if (PARAM_SKIP_FIELDS.has(k)) continue;
    if (v !== null && typeof v === 'object') continue;
    collab.sendFieldSet(logicalId, 'parameter', k, v);
  }
}

export const createParameterSlice: StateCreator<MassCaseStore, [], [], ParameterSlice> = (set, get) => ({
  parameters: [],

  addParameter: (data) => {
    const id = uuidv4();
    const activeCaseId = data.massCaseId || useAppStore.getState().massCaseId;
    const param: Parameter = { ...data, id, logicalId: id, massCaseId: activeCaseId! };
    set((s) => ({ parameters: [...s.parameters, param] }));
    const collab = getActiveCollab();
    if (collab && !isEmitSuppressed() && activeCaseId) {
      collab.sendEntityAdded('parameter', param.logicalId || param.id, data as Record<string, unknown>);
    }
    return param;
  },

  updateParameter: (id, data) => {
    const activeCaseId = useAppStore.getState().massCaseId;
    if (!activeCaseId) return;
    const param = get().parameters.find((p) => p.id === id);
    if (!param) return;
    const logicalId = param.logicalId || param.id;

    set((s) => ({
      parameters: applyComponentOverride<Parameter>(s.parameters, logicalId, activeCaseId, data, uuidv4) as Parameter[],
    }));
    emitParameterFieldSets(logicalId, data as Record<string, unknown>);
  },

  deleteParameter: (id) => {
    const activeCaseId = useAppStore.getState().massCaseId;
    if (!activeCaseId) return;
    const resolvedParams = resolveShadowComponents(activeCaseId, get().cases, get().parameters) as Parameter[];
    const param = resolvedParams.find((p) => p.id === id);
    if (!param) return;

    const logicalId = param.logicalId || param.id;
    set((s) => ({
      parameters: applyComponentOverride<Parameter>(s.parameters, logicalId, activeCaseId, { isDeleted: true }, uuidv4) as Parameter[],
    }));
    const collab = getActiveCollab();
    if (collab && !isEmitSuppressed()) collab.sendEntityDeleted('parameter', logicalId);
  },

  getParametersForCase: (massCaseId) =>
    resolveShadowComponents(massCaseId, get().cases, get().parameters) as Parameter[],
});
