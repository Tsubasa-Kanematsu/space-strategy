/**
 * Undo/Redo スライス (Phase 1 MVP - inverse-operation 方式)。
 *
 * 設計:
 *  - 各 mutation は「自身の逆操作」を記録する (snapshot 再適用ではない)
 *  - shadow model (applyComponentOverride による shadow 行追加) と整合させるため
 *    update は updateComponent(id, prevPatch) を呼ぶことで逆を実現する
 *  - delete は isDeleted: false を上書きして undelete (link group 整合化は復元しない既知制約)
 *  - undo/redo 中は isUndoRedoActive=true にして再帰記録を防ぐ
 *
 * 既知制約 (Phase 2 で対応予定):
 *  - 削除 → undo した後の link group rebalance は復元されない
 *  - 共同編集との競合検出なし (最後勝ち)
 *  - field 履歴 (addFieldEntries 等) は対象外 — updateComponent 経由部分のみ
 */
import type { StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { applyComponentOverride } from '../../utils/shadowModel';
import { useAppStore } from '../appStore';
import type { MassCaseStore } from '../massCaseStore.types';
import type { MassComponent } from '../../types';

const MAX_STACK = 50;

type UndoOp =
  /** 追加した entity を取り消す: deleteComponent(componentId) */
  | { type: 'add'; componentId: string; data: Omit<MassComponent, 'id'> }
  /** 更新を取り消す: updateComponent(componentId, prevPatch) */
  | { type: 'update'; componentId: string; prevPatch: Partial<Omit<MassComponent, 'id'>>; newPatch: Partial<Omit<MassComponent, 'id'>> }
  /** 削除状態をトグル: 影響受けた logicalId 群を {isDeleted: targetIsDeleted} で上書き
   *  undo of delete → targetIsDeleted=false (undelete)
   *  redo of undelete → targetIsDeleted=true (再削除) */
  | { type: 'setDeleted'; affectedComponentIds: string[]; targetIsDeleted: boolean };

export interface UndoEntry {
  description: string;
  op: UndoOp;
  recordedAt: number;
}

export interface UndoSlice {
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
  isUndoRedoActive: boolean;

  /** componentSlice から呼ぶ: 任意の操作を undo stack に積む */
  pushUndoEntry: (entry: UndoEntry) => void;
  undo: () => boolean;
  redo: () => boolean;
  clearUndoHistory: () => void;
}

/** UndoOp の説明文を生成 (UI tooltip 用) */
export function describeOp(op: UndoOp): string {
  switch (op.type) {
    case 'add':        return '追加';
    case 'update':     return '更新';
    case 'setDeleted': return op.targetIsDeleted ? '削除' : '復元';
  }
}

/** UndoOp を適用 (undo or redo の本体)。store + set を受け取って components 配列を直接いじれる */
function applyOp(
  op: UndoOp,
  store: MassCaseStore,
  setRaw: (partial: Partial<MassCaseStore>) => void,
): UndoOp | null {
  switch (op.type) {
    case 'add': {
      // 追加を取り消し → 削除。redo 用に setDeleted(false) で復元
      const exists = store.components.some((c) => c.id === op.componentId);
      if (!exists) return null;
      const target = store.components.find((c) => c.id === op.componentId);
      const logicalId = target?.logicalId || op.componentId;
      store.deleteComponent(op.componentId);
      return { type: 'setDeleted', affectedComponentIds: [logicalId], targetIsDeleted: false };
    }
    case 'update': {
      const exists = store.components.some((c) => c.id === op.componentId);
      if (!exists) return null;
      store.updateComponent(op.componentId, op.prevPatch);
      // redo = 新 patch を再適用する update
      return { type: 'update', componentId: op.componentId, prevPatch: op.newPatch, newPatch: op.prevPatch };
    }
    case 'setDeleted': {
      // 削除状態トグル: updateComponent は削除済 logicalId を resolved から拾えないため
      // 直接 applyComponentOverride で shadow row を積む
      const caseId = useAppStore.getState().massCaseId;
      if (!caseId) return null;
      let next = store.components;
      for (const logicalId of op.affectedComponentIds) {
        next = applyComponentOverride<MassComponent>(next, logicalId, caseId, { isDeleted: op.targetIsDeleted }, uuidv4);
      }
      setRaw({ components: next });
      // 反転を redo として返す
      return { type: 'setDeleted', affectedComponentIds: op.affectedComponentIds, targetIsDeleted: !op.targetIsDeleted };
    }
  }
}

export const createUndoSlice: StateCreator<MassCaseStore, [], [], UndoSlice> = (set, get) => ({
  undoStack: [],
  redoStack: [],
  isUndoRedoActive: false,

  pushUndoEntry: (entry) => {
    if (get().isUndoRedoActive) return;
    set((s) => ({
      undoStack: [...s.undoStack, entry].slice(-MAX_STACK),
      redoStack: [],
    }));
  },

  undo: () => {
    const state = get();
    if (state.undoStack.length === 0) return false;
    const entry = state.undoStack[state.undoStack.length - 1];
    set({ isUndoRedoActive: true });
    let inverse: UndoOp | null = null;
    try {
      inverse = applyOp(entry.op, get(), set as (partial: Partial<MassCaseStore>) => void);
    } catch (e) {
      console.error('[undo] failed:', e);
    } finally {
      set((s) => ({
        isUndoRedoActive: false,
        undoStack: s.undoStack.slice(0, -1),
        redoStack: inverse
          ? [...s.redoStack, { description: entry.description, op: inverse, recordedAt: Date.now() }].slice(-MAX_STACK)
          : s.redoStack,
      }));
    }
    return !!inverse;
  },

  redo: () => {
    const state = get();
    if (state.redoStack.length === 0) return false;
    const entry = state.redoStack[state.redoStack.length - 1];
    set({ isUndoRedoActive: true });
    let inverse: UndoOp | null = null;
    try {
      inverse = applyOp(entry.op, get(), set as (partial: Partial<MassCaseStore>) => void);
    } catch (e) {
      console.error('[redo] failed:', e);
    } finally {
      set((s) => ({
        isUndoRedoActive: false,
        redoStack: s.redoStack.slice(0, -1),
        undoStack: inverse
          ? [...s.undoStack, { description: entry.description, op: inverse, recordedAt: Date.now() }].slice(-MAX_STACK)
          : s.undoStack,
      }));
    }
    return !!inverse;
  },

  clearUndoHistory: () => set({ undoStack: [], redoStack: [] }),
});
