import { type StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { MassComponent } from '../../types';
import { resolveShadowComponents, applyComponentOverride } from '../../utils/shadowModel';
import { useAppStore } from '../appStore';
import { getActiveCollab, isEmitSuppressed } from '../../ws/collabClient';
import type { MassCaseStore, ComponentSlice } from '../massCaseStore.types';

/**
 * マスター→クローンに伝播するフィールドキー一覧。
 *
 * 含めるもの: 「同じ部品である」という意味から揃って当然の項目。
 *   - 物理量（質量・重心・慣性テンソル・材質・破片形状）
 *   - 部品属性（タグ・推進剤フラグ）
 *   - 部品参照（CAD取込情報・図面ドキュメント・誤差源）
 *   - 搭載位置（クローンも同じ位置情報を共有する想定。個別配置が必要なら
 *     リンクを外す運用）
 * 除外するもの: クローン毎に個別なものは載せない。
 *   - 名前・変数名(paramName/varName)、
 *     階層構造(level/order/parentId/stage)、自動算出(diff)、
 *     インスタンス毎の履歴(fieldHistory)、識別子・リンクメタ。
 */
export const LINK_SYNC_FIELDS: ReadonlySet<keyof MassComponent> = new Set([
  // 入力タイプ・式（クローンも同じ計算ロジックを共有）
  'inputType', 'valueOrFormula',
  // 質量
  'actualMass', 'allocatedMass', 'actualMassEvidence', 'actualMassHistory', 'actualMassMode',
  // 重心
  'cgX', 'cgY', 'cgZ', 'cgEvidence', 'cgReference',
  'localOriginX', 'localOriginY', 'localOriginZ',
  // 慣性テンソル
  'ixx', 'iyy', 'izz', 'ixy', 'ixz', 'iyz', 'inertiaEvidence',
  // 重心/慣性 集計モード(同じ部品なら同じモード)
  'cgInertiaMode',
  // 材質
  'materialName', 'materialDensity', 'materialDensityUnit', 'materialYoungModulus', 'materialNote',
  // 破片形状
  'debrisShapeType', 'debrisCharLength', 'debrisDiameter', 'debrisArea', 'debrisNote',
  // 部品属性（同じ部品なら共通）
  'tags', 'isPropellant',
  // 機体系誤差源（部品の不確かさモデル）
  'errorSources',
  // CAD 参照（同じ部品なら同じ CAD ソース）
  'cadFile', 'cadLastImported', 'cadSoftware', 'cadRevision', 'cadFilePath',
  // 図面・ドキュメント参照
  'documents',
  // 搭載位置・搭載範囲（質量等と同様にマスターから一括同期）
  'mountPosX', 'mountEndX', 'mountPosY', 'mountEndY', 'mountPosZ', 'mountEndZ', 'mountNote',
]);

/** 共同編集: data のスカラーフィールドを FIELD_SET で送信（配列/オブジェクト/識別子は除外） */
const COLLAB_SKIP_FIELDS = new Set(['id', 'logicalId', 'massCaseId']);
function emitComponentFieldSets(logicalId: string, data: Record<string, unknown>) {
  const collab = getActiveCollab();
  if (!collab || isEmitSuppressed()) return;
  for (const [k, v] of Object.entries(data)) {
    if (COLLAB_SKIP_FIELDS.has(k)) continue;
    if (v !== null && typeof v === 'object') continue; // fieldHistory等の配列/オブジェクトは対象外
    // undefined はサーバー側 (DSQL JSONB) で null と同値だが、生 undefined を送ると
    // value 比較で偽競合が出るため事前に null へ正規化する。
    collab.sendFieldSet(logicalId, 'component', k, v === undefined ? null : v);
  }
}

/** data から同期対象フィールドのみ抽出する */
function extractSyncPayload(data: Partial<Omit<MassComponent, 'id'>>): Partial<Omit<MassComponent, 'id'>> {
  const payload: Partial<Omit<MassComponent, 'id'>> = {};
  for (const key of Object.keys(data) as (keyof MassComponent)[]) {
    if (LINK_SYNC_FIELDS.has(key)) {
      (payload as Record<string, unknown>)[key] = (data as Record<string, unknown>)[key];
    }
  }
  return payload;
}

export const createComponentSlice: StateCreator<MassCaseStore, [], [], ComponentSlice> = (set, get) => ({
  components: [],

  addComponent: (data) => {
    const id = uuidv4();
    const activeCaseId = data.massCaseId || useAppStore.getState().massCaseId;
    const comp: MassComponent = { ...data, id, logicalId: id, massCaseId: activeCaseId! };
    set((s) => ({ components: [...s.components, comp] }));
    // undo entry: 追加を取り消す = 削除
    get().pushUndoEntry({
      description: `追加: ${comp.paramName ?? '(コンポーネント)'}`,
      op: { type: 'add', componentId: id, data },
      recordedAt: Date.now(),
    });
    // 共同編集: 追加を他クライアントへ通知（リモート適用中は抑制）
    const collab = getActiveCollab();
    if (collab && !isEmitSuppressed() && activeCaseId) {
      collab.sendEntityAdded('component', comp.logicalId || comp.id, data as Record<string, unknown>);
    }
    return comp;
  },

  /**
   * 大量追加用: 1 回の set で全コンポーネントを追加し、React 再描画/undo/WS 送信の
   * 反復コストを回避する。CSV インポート等で 1000+ 件追加するとき使う。
   *
   *  - components 配列への push を 1 回に集約
   *  - undo は「バッチ追加」1 件として記録 (個別に積まず)
   *  - WS 送信は呼び出し側がチャンク or 同期戦略を選べるよう、ここでは飛ばす
   *    (現状サーバー側で snapshot reconciliation により次回 JOIN で取り戻すか、
   *     呼び出し側でサーバーリロードを促す前提)
   */
  bulkAddComponents: (dataList) => {
    if (dataList.length === 0) return [];
    const activeCaseId = useAppStore.getState().massCaseId;
    const newComps: MassComponent[] = dataList.map((data) => {
      // CSV インポート等で 明示的に logicalId が指定されている場合は保持する。
      // round-trip (export → 別 DB へ import) 時に同一アイデンティティを維持できる。
      const explicitLid = (data as MassComponent).logicalId;
      const id = explicitLid || uuidv4();
      const caseId = data.massCaseId || activeCaseId!;
      return { ...data, id, logicalId: id, massCaseId: caseId } as MassComponent;
    });
    set((s) => ({ components: [...s.components, ...newComps] }));
    // undo: バッチ全体を 1 件として記録 (各 add の componentId を保持)
    get().pushUndoEntry({
      description: `一括追加: ${newComps.length}件`,
      op: { type: 'add', componentId: newComps[0].id, data: dataList[0] }, // 代表 1 件 (Phase 1 制約)
      recordedAt: Date.now(),
    });
    return newComps;
  },

  updateComponent: (id, data) => {
    const activeCaseId = useAppStore.getState().massCaseId;
    if (!activeCaseId) return;
    const resolvedComps = resolveShadowComponents(activeCaseId, get().cases, get().components);
    const comp = resolvedComps.find((c) => c.id === id);
    if (!comp) return;
    const logicalId = comp.logicalId || comp.id;
    // undo 用: 変更前の各 field 値を prevPatch として記録
    const prevPatch: Partial<Omit<MassComponent, 'id'>> = {};
    for (const key of Object.keys(data) as (keyof MassComponent)[]) {
      if (key === 'id') continue;
      (prevPatch as unknown as Record<string, unknown>)[key as string] = (comp as unknown as Record<string, unknown>)[key as string];
    }
    get().pushUndoEntry({
      description: `更新: ${comp.paramName ?? '(コンポーネント)'}`,
      op: { type: 'update', componentId: id, prevPatch, newPatch: data },
      recordedAt: Date.now(),
    });

    // クローンへの物理量更新は拒否（linkGroupId があり isLinkMaster でない場合）
    const isClone = !!(comp.linkGroupId && !comp.isLinkMaster);
    const syncPayload = extractSyncPayload(data);
    const hasSyncFields = Object.keys(syncPayload).length > 0;
    if (isClone && hasSyncFields) {
      // 物理量以外（個別項目）のみ適用
      const nonSyncData: Partial<Omit<MassComponent, 'id'>> = {};
      for (const key of Object.keys(data) as (keyof MassComponent)[]) {
        if (!LINK_SYNC_FIELDS.has(key)) {
          (nonSyncData as Record<string, unknown>)[key] = (data as Record<string, unknown>)[key];
        }
      }
      if (Object.keys(nonSyncData).length === 0) return;
      set((s) => ({
        components: applyComponentOverride<MassComponent>(s.components, logicalId, activeCaseId, nonSyncData, uuidv4),
      }));
      emitComponentFieldSets(logicalId, nonSyncData as Record<string, unknown>);
      return;
    }

    // 通常更新 + マスターの場合は同一 linkGroupId の全クローンにも同期
    set((s) => {
      let newComps = applyComponentOverride<MassComponent>(s.components, logicalId, activeCaseId, data, uuidv4);

      if (comp.isLinkMaster && comp.linkGroupId && hasSyncFields) {
        // 同じグループのクローン（解決済みコンポーネントから検索）
        const clones = resolvedComps.filter(
          (c) => c.linkGroupId === comp.linkGroupId && !c.isLinkMaster && (c.logicalId || c.id) !== logicalId,
        );
        for (const clone of clones) {
          const cloneLid = clone.logicalId || clone.id;
          newComps = applyComponentOverride<MassComponent>(newComps, cloneLid, activeCaseId, syncPayload, uuidv4);
        }
      }

      return { components: newComps };
    });
    // 共同編集: 変更したスカラーフィールドを送信（CAD取込/サイジング適用/手編集すべての更新経路をカバー）。
    // NOTE: リンクマスター→クローン伝播分のリモート同期は未対応（既知の制約）。
    emitComponentFieldSets(logicalId, data as Record<string, unknown>);
  },

  deleteComponent: (id) => {
    const activeCaseId = useAppStore.getState().massCaseId;
    if (!activeCaseId) return;
    const resolvedComps = resolveShadowComponents(activeCaseId, get().cases, get().components);
    const comp = resolvedComps.find((c) => c.id === id);
    if (!comp) return;

    const logicalId = comp.logicalId || comp.id;

    // 子孫を再帰的に削除
    const toDeleteIds = new Set<string>();
    const queue = [logicalId];
    while (queue.length) {
      const curLid = queue.pop()!;
      toDeleteIds.add(curLid);
      resolvedComps
        .filter((c) => c.parentId === curLid)
        .forEach((c) => queue.push(c.logicalId || c.id));
    }

    set((s) => {
      let newComps = s.components;
      for (const lid of toDeleteIds) {
        newComps = applyComponentOverride<MassComponent>(newComps, lid, activeCaseId, { isDeleted: true }, uuidv4);
      }

      // 削除影響を受ける全リンクグループを評価して整合化する。
      //  - マスター削除でクローンだけ残った場合 → 新マスター昇格 / 1人なら独立化
      //  - クローン削除でマスターが独りぼっちになった場合 → 独立化 (従来未対応のバグ)
      //  - 子孫カスケードで複数グループに影響する場合 → 各グループを個別に評価
      const affectedGroups = new Set<string>();
      for (const lid of toDeleteIds) {
        const c = resolvedComps.find((rc) => (rc.logicalId || rc.id) === lid);
        if (c?.linkGroupId) affectedGroups.add(c.linkGroupId);
      }
      for (const groupId of affectedGroups) {
        const remaining = resolvedComps.filter(
          (c) => c.linkGroupId === groupId && !toDeleteIds.has(c.logicalId || c.id),
        );
        if (remaining.length === 1) {
          // 1人だけ残った → 独立部品に戻す
          const lid = remaining[0].logicalId || remaining[0].id;
          newComps = applyComponentOverride<MassComponent>(newComps, lid, activeCaseId, {
            linkGroupId: undefined,
            isLinkMaster: undefined,
          }, uuidv4);
        } else if (remaining.length > 1 && !remaining.some((c) => c.isLinkMaster)) {
          // 2人以上残ったがマスター不在(マスターが削除された) → 最初の1人を新マスターに昇格
          const newMasterLid = remaining[0].logicalId || remaining[0].id;
          newComps = applyComponentOverride<MassComponent>(newComps, newMasterLid, activeCaseId, {
            isLinkMaster: true,
          }, uuidv4);
        }
        // remaining.length === 0 → グループ消滅(何もしない) / >= 2 でマスター在 → 何もしない
      }

      return { components: newComps };
    });

    // undo entry: 削除影響を受けた全 logicalId を {isDeleted:false} で undelete することで取り消す
    get().pushUndoEntry({
      description: `削除: ${comp.paramName ?? '(コンポーネント)'}`,
      op: { type: 'setDeleted', affectedComponentIds: Array.from(toDeleteIds), targetIsDeleted: false },
      recordedAt: Date.now(),
    });
    // 共同編集: 削除を他クライアントへ通知（リモート適用中は抑制）。子孫カスケードは各クライアントで再現。
    const collab = getActiveCollab();
    if (collab && !isEmitSuppressed()) collab.sendEntityDeleted('component', logicalId);
  },

  getComponentsForCase: (massCaseId) =>
    resolveShadowComponents(massCaseId, get().cases, get().components) as MassComponent[],
});
