import type {
  MassCase,
  MassComponent,
  Parameter,
  DeltaVBudget,
  ChangeRecord,
  ActualMassEntry,
  ComponentFieldEntry,
} from '../types';

// ── スライス型 ────────────────────────────────────────────

export interface CaseSlice {
  cases: MassCase[];
  addCase: (data: Omit<MassCase, 'id' | 'createdAt' | 'updatedAt'>) => MassCase;
  copyCase: (id: string) => MassCase | null;
  forkCase: (id: string, newName: string) => MassCase | null;
  updateCase: (id: string, data: Partial<Omit<MassCase, 'id' | 'createdAt'>>) => void;
  deleteCase: (id: string) => void;
  getCasesForProject: (projectId: string) => MassCase[];
  getCase: (id: string) => MassCase | undefined;
}

export interface ComponentSlice {
  components: MassComponent[];
  addComponent: (data: Omit<MassComponent, 'id'>) => MassComponent;
  /** 大量追加用 (CSV インポート等)。1 回の set にまとめて React/undo/WS の反復コストを回避 */
  bulkAddComponents: (dataList: Omit<MassComponent, 'id'>[]) => MassComponent[];
  updateComponent: (id: string, data: Partial<Omit<MassComponent, 'id'>>) => void;
  deleteComponent: (id: string) => void;
  getComponentsForCase: (massCaseId: string) => MassComponent[];
}

export interface ParameterSlice {
  parameters: Parameter[];
  addParameter: (data: Omit<Parameter, 'id'>) => Parameter;
  updateParameter: (id: string, data: Partial<Omit<Parameter, 'id'>>) => void;
  deleteParameter: (id: string) => void;
  getParametersForCase: (massCaseId: string) => Parameter[];
}

export interface MassApplySlice {
  applyAllocatedMasses: (massCaseId: string, masses: { componentId: string; mass: number }[], sizingResultId: string) => void;
  copyCaseAndApply: (id: string, masses: { componentId: string; mass: number }[], sizingResultId: string, newName: string) => MassCase | null;
}

export interface ChangeSlice {
  updateDeltaVBudget: (massCaseId: string, budget: DeltaVBudget) => void;
  addChangeRecord: (massCaseId: string, record: Omit<ChangeRecord, 'id' | 'changedAt'>) => void;
  addActualMassEntry: (componentId: string, entry: Omit<ActualMassEntry, 'id' | 'recordedAt'>, mode?: 'aggregate' | 'fixed') => void;
  confirmActualMassEntry: (componentId: string, entryId: string, confirmedBy: string) => void;
  addFieldEntry: (componentId: string, entry: Omit<ComponentFieldEntry, 'id' | 'changedAt'>, fieldUpdate: Record<string, unknown>) => void;
  applyRemoteFieldSet: (massCaseId: string, entityType: string, logicalId: string, field: string, value: unknown, actor: string | null) => void;
  applyRemoteEntityAdded: (massCaseId: string, entityType: string, logicalId: string, data: Record<string, unknown>, actor: string | null) => void;
  applyRemoteEntityDeleted: (massCaseId: string, entityType: string, logicalId: string, actor: string | null) => void;
  applyRemoteSnapshotFields: (massCaseId: string, entityType: string, logicalId: string, fields: Record<string, { value: unknown; version: number }>) => void;
  addFieldEntries: (componentId: string, entries: Omit<ComponentFieldEntry, 'id' | 'changedAt'>[], fieldUpdate: Record<string, unknown>) => void;
  confirmFieldEntry: (componentId: string, entryId: string, confirmedBy: string) => void;
}

// ── ストア全体 ────────────────────────────────────────────

import type { UndoSlice } from './slices/undoSlice';
export type MassCaseStore = CaseSlice & ComponentSlice & ParameterSlice & MassApplySlice & ChangeSlice & UndoSlice;
