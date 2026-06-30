import { type StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { ChangeRecord, ActualMassEntry, ComponentFieldEntry, MassComponent, Parameter } from '../../types';
import { resolveShadowComponents, applyComponentOverride } from '../../utils/shadowModel';
import { useAppStore } from '../appStore';
import { getActiveCollab, isEmitSuppressed, withSuppressedEmit } from '../../ws/collabClient';
import type { MassCaseStore, ChangeSlice } from '../massCaseStore.types';
import { LINK_SYNC_FIELDS } from './componentSlice';

/** changeSlice の addFieldEntry 系は applyComponentOverride を直接呼ぶため
 *  collab に emit していなかった (= server に保存されない data loss バグ)。
 *  componentSlice.emitComponentFieldSets と同じ規約で送信する。 */
function emitFieldSetsFromChange(logicalId: string, data: Record<string, unknown>) {
  const collab = getActiveCollab();
  if (!collab || isEmitSuppressed()) return;
  const SKIP = new Set(['id', 'logicalId', 'massCaseId', 'fieldHistory', 'actualMassHistory']);
  for (const [k, v] of Object.entries(data)) {
    if (SKIP.has(k)) continue;
    if (v !== null && typeof v === 'object') continue; // 配列/オブジェクトは対象外
    collab.sendFieldSet(logicalId, 'component', k, v === undefined ? null : v);
  }
}

const now = () => new Date().toISOString();

/** マスターであれば同 linkGroup のクローンにも synced 部分を伝播する(updateComponent と同じ挙動)。 */
function propagateLinkSync(
  comps: MassComponent[],
  master: MassComponent,
  resolvedComps: MassComponent[],
  activeCaseId: string,
  syncedData: Partial<Omit<MassComponent, 'id'>>,
): MassComponent[] {
  if (!master.isLinkMaster || !master.linkGroupId) return comps;
  if (Object.keys(syncedData).length === 0) return comps;
  const masterLid = master.logicalId || master.id;
  const clones = resolvedComps.filter(
    (c) => c.linkGroupId === master.linkGroupId && !c.isLinkMaster && (c.logicalId || c.id) !== masterLid,
  );
  let next = comps;
  for (const clone of clones) {
    const cloneLid = clone.logicalId || clone.id;
    next = applyComponentOverride<MassComponent>(next, cloneLid, activeCaseId, syncedData, uuidv4);
  }
  return next;
}

/** data から LINK_SYNC_FIELDS に該当するフィールドだけ抽出する(fieldHistory 等は除外)。 */
function pickSyncedFields(data: Partial<Omit<MassComponent, 'id'>>): Partial<Omit<MassComponent, 'id'>> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(data)) {
    if (LINK_SYNC_FIELDS.has(key as keyof MassComponent)) {
      out[key] = (data as Record<string, unknown>)[key];
    }
  }
  return out as Partial<Omit<MassComponent, 'id'>>;
}

export const createChangeSlice: StateCreator<MassCaseStore, [], [], ChangeSlice> = (set, get) => ({
  // ── ΔV Budget ────────────────────────────────────────────

  updateDeltaVBudget: (massCaseId, budget) =>
    set((s) => ({
      cases: s.cases.map((c) =>
        c.id === massCaseId ? { ...c, deltaVBudget: budget, updatedAt: now() } : c
      ),
    })),

  // ── Change Log ───────────────────────────────────────────

  addChangeRecord: (massCaseId, record) => {
    const entry: ChangeRecord = { id: uuidv4(), changedAt: now(), ...record };
    set((s) => ({
      cases: s.cases.map((c) =>
        c.id === massCaseId
          ? { ...c, changeLog: [...(c.changeLog ?? []), entry], updatedAt: now() }
          : c
      ),
    }));
  },

  // ── Actual Mass History ──────────────────────────────────

  addActualMassEntry: (componentId, entry, mode) => {
    const activeCaseId = useAppStore.getState().massCaseId;
    if (!activeCaseId) return;
    const resolvedComps = resolveShadowComponents(activeCaseId, get().cases, get().components);
    const comp = resolvedComps.find((c) => c.id === componentId);
    if (!comp) return;

    const logicalId = comp.logicalId || comp.id;
    const newEntry: ActualMassEntry = { id: uuidv4(), recordedAt: now(), ...entry };
    // actualMass/Evidence/History/Mode は全て LINK_SYNC_FIELDS なのでマスター時は丸ごとクローンへ
    const syncedData: Partial<MassComponent> = {
      actualMass: entry.value,
      actualMassEvidence: entry.evidence,
      actualMassHistory: [...(comp.actualMassHistory ?? []), newEntry],
      ...(mode !== undefined ? { actualMassMode: mode } : {}),
    };
    // undo 用: 変更前の値を捕捉
    const prevPatch: Partial<MassComponent> = {
      actualMass: comp.actualMass,
      actualMassEvidence: comp.actualMassEvidence,
      actualMassHistory: comp.actualMassHistory ?? [],
      ...(mode !== undefined ? { actualMassMode: comp.actualMassMode } : {}),
    };

    set((s) => {
      let next = applyComponentOverride<MassComponent>(s.components, logicalId, activeCaseId, syncedData, uuidv4);
      next = propagateLinkSync(next, comp, resolvedComps, activeCaseId, syncedData);
      return { components: next };
    });
    emitFieldSetsFromChange(logicalId, syncedData as Record<string, unknown>);
    get().pushUndoEntry({
      description: `実質量更新: ${comp.paramName ?? ''}`,
      op: { type: 'update', componentId, prevPatch, newPatch: syncedData },
      recordedAt: Date.now(),
    });
  },

  addFieldEntry: (componentId, entry, fieldUpdate) => {
    const activeCaseId = useAppStore.getState().massCaseId;
    if (!activeCaseId) return;
    const resolvedComps = resolveShadowComponents(activeCaseId, get().cases, get().components);
    const comp = resolvedComps.find((c) => c.id === componentId);
    if (!comp) return;
    const logicalId = comp.logicalId || comp.id;
    const newEntry: ComponentFieldEntry = { id: uuidv4(), changedAt: now(), ...entry };
    const newHistory = [...(comp.fieldHistory ?? []), newEntry];
    const newPatch = { ...fieldUpdate, fieldHistory: newHistory };
    // undo 用: 変更前の各 field 値 + 元の fieldHistory を捕捉
    const prevPatch: Record<string, unknown> = { fieldHistory: comp.fieldHistory ?? [] };
    for (const key of Object.keys(fieldUpdate)) {
      prevPatch[key] = (comp as unknown as Record<string, unknown>)[key];
    }
    set((s) => {
      let next = applyComponentOverride<MassComponent>(s.components, logicalId, activeCaseId, newPatch, uuidv4);
      // マスターなら fieldUpdate の同期対象部分だけクローンへ(fieldHistory は伝播しない)
      next = propagateLinkSync(next, comp, resolvedComps, activeCaseId, pickSyncedFields(fieldUpdate));
      return { components: next };
    });
    emitFieldSetsFromChange(logicalId, fieldUpdate as Record<string, unknown>);
    get().pushUndoEntry({
      description: `更新: ${comp.paramName ?? ''}`,
      op: { type: 'update', componentId, prevPatch: prevPatch as Partial<Omit<MassComponent, 'id'>>, newPatch: newPatch as Partial<Omit<MassComponent, 'id'>> },
      recordedAt: Date.now(),
    });
  },

  // ── リアルタイム共同編集: 他者の FIELD_SET イベントを反映 ──
  // logicalId をキーに、指定マスケースのコンポーネントへ値＋履歴を適用する。
  // ローカルにそのコンポーネントが無い場合は何もしない（MVP）。
  applyRemoteFieldSet: (massCaseId, entityType, logicalId, field, value, actor) => {
    if (entityType === 'parameter') {
      const rp = resolveShadowComponents(massCaseId, get().cases, get().parameters) as Parameter[];
      if (!rp.find((p) => (p.logicalId || p.id) === logicalId)) return;
      set((s) => ({
        parameters: applyComponentOverride<Parameter>(s.parameters, logicalId, massCaseId, { [field]: value }, uuidv4) as Parameter[],
      }));
      return;
    }
    const resolved = resolveShadowComponents(massCaseId, get().cases, get().components);
    const comp = resolved.find((c) => (c.logicalId || c.id) === logicalId);
    if (!comp) return;
    const entry: ComponentFieldEntry = {
      id: uuidv4(),
      changedAt: now(),
      changedBy: actor || '(共同編集)',
      field,
      fieldLabel: field,
      value: value == null ? null : String(value),
      evidence: '',
      status: 'input',
    };
    set((s) => ({
      components: applyComponentOverride(s.components, logicalId, massCaseId, {
        [field]: value,
        fieldHistory: [...(comp.fieldHistory ?? []), entry],
      }, uuidv4),
    }));
  },

  // ── リアルタイム共同編集: 他者のコンポーネント追加/削除を反映 ──
  applyRemoteEntityAdded: (massCaseId, entityType, logicalId, data) => {
    if (entityType === 'parameter') {
      const rp = resolveShadowComponents(massCaseId, get().cases, get().parameters) as Parameter[];
      if (rp.some((p) => (p.logicalId || p.id) === logicalId)) return;
      const param = { ...(data as object), id: logicalId, logicalId, massCaseId } as Parameter;
      set((s) => ({ parameters: [...s.parameters, param] }));
      return;
    }
    const resolved = resolveShadowComponents(massCaseId, get().cases, get().components);
    if (resolved.some((c) => (c.logicalId || c.id) === logicalId)) return; // 冪等
    const comp = { ...(data as object), id: logicalId, logicalId, massCaseId } as MassComponent;
    set((s) => ({ components: [...s.components, comp] }));
  },

  // JOIN時の SNAPSHOT 突き合わせ。スカラー値が異なるフィールドだけ静かに適用（履歴は付けない）。
  applyRemoteSnapshotFields: (massCaseId, entityType, logicalId, fields) => {
    const pickScalarDiff = (item: unknown): Record<string, unknown> => {
      const upd: Record<string, unknown> = {};
      for (const [k, meta] of Object.entries(fields)) {
        const v = (meta as { value: unknown }).value;
        if (v !== null && typeof v === 'object') continue; // 配列/オブジェクトは対象外
        if ((item as Record<string, unknown>)[k] !== v) upd[k] = v;
      }
      return upd;
    };
    if (entityType === 'parameter') {
      const rp = resolveShadowComponents(massCaseId, get().cases, get().parameters) as Parameter[];
      const p = rp.find((x) => (x.logicalId || x.id) === logicalId);
      if (!p) return;
      const upd = pickScalarDiff(p);
      if (Object.keys(upd).length === 0) return;
      set((s) => ({ parameters: applyComponentOverride<Parameter>(s.parameters, logicalId, massCaseId, upd, uuidv4) as Parameter[] }));
      return;
    }
    const resolved = resolveShadowComponents(massCaseId, get().cases, get().components);
    const comp = resolved.find((c) => (c.logicalId || c.id) === logicalId);
    if (!comp) return;
    const update = pickScalarDiff(comp);
    if (Object.keys(update).length === 0) return;
    set((s) => ({
      components: applyComponentOverride(s.components, logicalId, massCaseId, update, uuidv4),
    }));
  },

  applyRemoteEntityDeleted: (massCaseId, entityType, logicalId) => {
    if (entityType === 'parameter') {
      const rp = resolveShadowComponents(massCaseId, get().cases, get().parameters) as Parameter[];
      const p = rp.find((x) => (x.logicalId || x.id) === logicalId);
      if (!p) return;
      withSuppressedEmit(() => get().deleteParameter(p.id));
      return;
    }
    const resolved = resolveShadowComponents(massCaseId, get().cases, get().components);
    const comp = resolved.find((c) => (c.logicalId || c.id) === logicalId);
    if (!comp) return;
    // 通常の deleteComponent を流用（子孫カスケード/リンク昇格を忠実に再現）。
    // 抑制フラグで再送（ループ）を防ぐ。
    withSuppressedEmit(() => get().deleteComponent(comp.id));
  },

  addFieldEntries: (componentId, entries, fieldUpdate) => {
    const activeCaseId = useAppStore.getState().massCaseId;
    if (!activeCaseId) return;
    const resolvedComps = resolveShadowComponents(activeCaseId, get().cases, get().components);
    const comp = resolvedComps.find((c) => c.id === componentId);
    if (!comp) return;
    const logicalId = comp.logicalId || comp.id;
    const sharedAt = now();
    const newEntries: ComponentFieldEntry[] = entries.map((e) => ({ id: uuidv4(), changedAt: sharedAt, ...e }));
    const newHistory = [...(comp.fieldHistory ?? []), ...newEntries];
    const newPatch = { ...fieldUpdate, fieldHistory: newHistory };
    // undo 用: 変更前の各 field 値 + 元の fieldHistory を捕捉
    const prevPatch: Record<string, unknown> = { fieldHistory: comp.fieldHistory ?? [] };
    for (const key of Object.keys(fieldUpdate)) {
      prevPatch[key] = (comp as unknown as Record<string, unknown>)[key];
    }
    set((s) => {
      let next = applyComponentOverride<MassComponent>(s.components, logicalId, activeCaseId, newPatch, uuidv4);
      // マスターなら fieldUpdate の同期対象部分だけクローンへ(fieldHistory は伝播しない)
      next = propagateLinkSync(next, comp, resolvedComps, activeCaseId, pickSyncedFields(fieldUpdate));
      return { components: next };
    });
    emitFieldSetsFromChange(logicalId, fieldUpdate as Record<string, unknown>);
    get().pushUndoEntry({
      description: `更新: ${comp.paramName ?? ''} (${entries.length}件)`,
      op: { type: 'update', componentId, prevPatch: prevPatch as Partial<Omit<MassComponent, 'id'>>, newPatch: newPatch as Partial<Omit<MassComponent, 'id'>> },
      recordedAt: Date.now(),
    });
  },

  confirmFieldEntry: (componentId, entryId, confirmedBy) => {
    const activeCaseId = useAppStore.getState().massCaseId;
    if (!activeCaseId) return;
    const resolvedComps = resolveShadowComponents(activeCaseId, get().cases, get().components);
    const comp = resolvedComps.find((c) => c.id === componentId);
    if (!comp) return;
    const logicalId = comp.logicalId || comp.id;
    const history = (comp.fieldHistory ?? []).map((e) =>
      e.id === entryId
        ? { ...e, status: 'confirmed' as const, confirmedBy, confirmedAt: now() }
        : e
    );
    set((s) => ({
      components: applyComponentOverride(s.components, logicalId, activeCaseId, { fieldHistory: history }, uuidv4),
    }));
  },

  confirmActualMassEntry: (componentId, entryId, confirmedBy) => {
    const activeCaseId = useAppStore.getState().massCaseId;
    if (!activeCaseId) return;
    const resolvedComps = resolveShadowComponents(activeCaseId, get().cases, get().components);
    const comp = resolvedComps.find((c) => c.id === componentId);
    if (!comp) return;

    const logicalId = comp.logicalId || comp.id;
    const history = (comp.actualMassHistory ?? []).map((e) =>
      e.id === entryId
        ? { ...e, status: 'confirmed' as const, confirmedBy, confirmedAt: now() }
        : e
    );

    set((s) => ({
      components: applyComponentOverride(s.components, logicalId, activeCaseId, { actualMassHistory: history }, uuidv4),
    }));
  },
});
