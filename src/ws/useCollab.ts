/**
 * リアルタイム共同編集の接続を「マスケースが開いている間」維持するフック。
 * MassModel だけでなく ParameterList など同じ massCaseId を扱う全ビューで有効にするため、
 * AppLayout（常時マウント）で呼ぶ。フラグ既定オフ。
 */
import { useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { useMassCaseStore } from '../stores/massCaseStore';
import { connectCollab, isCollabEnabled } from './collabClient';

export function useCollab(): void {
  const massCaseId = useAppStore((s) => s.massCaseId);

  useEffect(() => {
    if (!massCaseId || !isCollabEnabled()) return;

    const handle = connectCollab(massCaseId, {
      onSnapshot: (entities) => {
        // 2c 権威化: JOIN時に entities(サーバー) を正として突き合わせる（component/parameter両方）。
        const store = useMassCaseStore.getState();
        const reconcile = (entityType: string, localItems: Array<{ id: string; logicalId?: string }>) => {
          const snapOfType = entities.filter((e) => e.entityType === entityType);
          const snapActiveIds = new Set(snapOfType.filter((e) => !e.deleted).map((e) => e.entityId));
          // 1) ローカルにあって snapshot に無いもの → サーバーへ seed
          for (const it of localItems) {
            const lid = it.logicalId || it.id;
            if (!snapActiveIds.has(lid)) {
              const rest = { ...(it as unknown as Record<string, unknown>) };
              delete rest.id;
              handle.sendEntityAdded(entityType, lid, rest);
            }
          }
          // 2) snapshot を正としてローカルへ反映（復元・削除・スカラー突き合わせ）
          const localIds = new Set(localItems.map((it) => it.logicalId || it.id));
          for (const ent of snapOfType) {
            if (ent.deleted) {
              if (localIds.has(ent.entityId)) store.applyRemoteEntityDeleted(massCaseId, entityType, ent.entityId, null);
              continue;
            }
            if (!localIds.has(ent.entityId)) {
              const data: Record<string, unknown> = {};
              for (const [k, meta] of Object.entries(ent.fields ?? {})) data[k] = (meta as { value: unknown }).value;
              store.applyRemoteEntityAdded(massCaseId, entityType, ent.entityId, data, null);
            } else {
              store.applyRemoteSnapshotFields(massCaseId, entityType, ent.entityId, ent.fields);
            }
          }
        };
        reconcile('component', store.getComponentsForCase(massCaseId).filter((c) => !c.isDeleted));
        reconcile('parameter', store.getParametersForCase(massCaseId).filter((p) => !p.isDeleted));
      },
      onEvent: (ev) => {
        useMassCaseStore.getState().applyRemoteFieldSet(massCaseId, ev.entityType, ev.entityId, ev.field, ev.value, ev.actor);
      },
      onEntityAdded: (ev) => {
        useMassCaseStore.getState().applyRemoteEntityAdded(massCaseId, ev.entityType, ev.entityId, ev.data, ev.actor);
      },
      onEntityDeleted: (ev) => {
        useMassCaseStore.getState().applyRemoteEntityDeleted(massCaseId, ev.entityType, ev.entityId, ev.actor);
      },
      onConflict: (c) => {
        // 現状のクライアント側 baseFieldVersion 追跡が race / undo / バッチ送信で
        // ズレやすく、ほぼすべての CONFLICT が単一ユーザー編集時の false positive。
        // 修正にはサーバー側の field versioning 設計見直しが必要なため、
        // 暫定で alert はすべて黙殺し、コンソールのみに出す。
        // 本物の他者編集競合があった場合は最後勝ちで巻き戻る挙動になる (既知制約)。
        console.warn('[collab] CONFLICT suppressed:', c);
      },
    });
    return () => handle.close();
  }, [massCaseId]);
}
