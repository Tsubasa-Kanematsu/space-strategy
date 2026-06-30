/**
 * rocketDB リアルタイム共同編集クライアント (MVP Phase 2d/2e)
 *
 * サーバー権威のコマンド/イベントモデル（docs/realtime-collab-design.md）。
 * マスケース単位の「部屋」に JOIN し、フィールド編集(FIELD_SET)・コンポーネント追加/削除
 * (ENTITY_ADDED/ENTITY_DELETED)をコマンドで送信、他者の変更を EVENT で受け取る。
 *
 * 既定では無効（フィーチャーフラグ）。本番のデータフローには影響しない。
 */
import { getAccessToken } from '../utils/auth';

// GA: 既定ON。緊急OFF(キルスイッチ)は localStorage rocketdb_collab='0' または ?collab=0。
//   - 全体を無効化するにはこの関数を false 既定へ戻して再デプロイ。
//   - 個別ブラウザで切るには localStorage.setItem('rocketdb_collab','0')。
export function isCollabEnabled(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    if (new URLSearchParams(window.location.search).get('collab') === '0') return false;
    if (window.localStorage.getItem('rocketdb_collab') === '0') return false;
    return true;
  } catch {
    return true;
  }
}

function wsBaseUrl(): string {
  const api = (import.meta.env.VITE_API_URL as string) || '';
  const host = api.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return `wss://${host}/ws`;
}

export type CollabStatus = 'connecting' | 'open' | 'closed' | 'reconnecting';

export interface RemoteFieldEvent {
  entityId: string; // logicalId
  entityType: string;
  field: string;
  value: unknown;
  resultFieldVersion: number;
  actor: string | null;
  seq: number;
}
export interface RemoteEntityAdded {
  entityType: string;
  entityId: string; // logicalId
  data: Record<string, unknown>;
  actor: string | null;
}
export interface RemoteEntityDeleted {
  entityType: string;
  entityId: string; // logicalId
  actor: string | null;
}

export interface CollabConflict {
  entityId: string;
  field: string;
  currentValue: unknown;
  currentFieldVersion: number;
  yourValue: unknown;
}

export interface SnapshotEntity {
  entityId: string;
  entityType: string;
  fields: Record<string, { value: unknown; version: number }>;
  deleted: boolean;
}

export interface CollabCallbacks {
  onSnapshot?: (entities: SnapshotEntity[], currentMaxSeq: number) => void;
  onEvent?: (ev: RemoteFieldEvent) => void;
  onEntityAdded?: (ev: RemoteEntityAdded) => void;
  onEntityDeleted?: (ev: RemoteEntityDeleted) => void;
  onConflict?: (c: CollabConflict) => void;
  onStatus?: (s: CollabStatus) => void;
}

export interface CollabHandle {
  sendFieldSet: (entityId: string, entityType: string, field: string, value: unknown, rationale?: string) => void;
  sendEntityAdded: (entityType: string, entityId: string, data: Record<string, unknown>) => void;
  sendEntityDeleted: (entityType: string, entityId: string) => void;
  close: () => void;
  status: () => CollabStatus;
}

// ── アクティブな接続のシングルトン（store スライスから参照するため）──
let activeCollab: CollabHandle | null = null;
export function getActiveCollab(): CollabHandle | null {
  return activeCollab;
}
// リモートイベント適用中は、store の add/delete が再びコマンド送信しないよう抑制する。
let emitSuppressed = false;
export function isEmitSuppressed(): boolean {
  return emitSuppressed;
}
export function withSuppressedEmit(fn: () => void): void {
  emitSuppressed = true;
  try { fn(); } finally { emitSuppressed = false; }
}

const uuid = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export function connectCollab(massCaseId: string, cb: CollabCallbacks): CollabHandle {
  let ws: WebSocket | null = null;
  let closedByUs = false;
  let status: CollabStatus = 'connecting';
  let reconnectDelay = 1000;
  let pingTimer: ReturnType<typeof setInterval> | null = null;

  const versions = new Map<string, Map<string, number>>();
  const getVer = (e: string, f: string) => versions.get(e)?.get(f) ?? 0;
  const setVer = (e: string, f: string, v: number) => {
    let m = versions.get(e);
    if (!m) { m = new Map(); versions.set(e, m); }
    m.set(f, v);
  };

  const setStatus = (s: CollabStatus) => { status = s; cb.onStatus?.(s); };

  async function open() {
    setStatus(ws ? 'reconnecting' : 'connecting');
    let token = '';
    try { token = (await getAccessToken()) ?? ''; } catch { /* ignore */ }
    if (closedByUs) return;

    const url = `${wsBaseUrl()}?token=${encodeURIComponent(token)}`;
    const sock = new WebSocket(url);
    ws = sock;

    sock.onopen = () => {
      reconnectDelay = 1000;
      setStatus('open');
      sock.send(JSON.stringify({ type: 'JOIN', massCaseId }));
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ type: 'PING' }));
      }, 60000);
    };

    sock.onmessage = (e) => {
      let m: any;
      try { m = JSON.parse(e.data); } catch { return; }
      switch (m.type) {
        case 'SNAPSHOT':
          for (const ent of m.entities ?? []) {
            for (const [f, meta] of Object.entries(ent.fields ?? {})) {
              setVer(ent.entityId, f, (meta as any)?.version ?? 0);
            }
          }
          cb.onSnapshot?.(m.entities ?? [], m.currentMaxSeq ?? 0);
          break;
        case 'EVENT': {
          const ev = m.event;
          if (ev?.type === 'FIELD_SET') {
            setVer(ev.entityId, ev.field, ev.resultFieldVersion);
            cb.onEvent?.({
              entityId: ev.entityId, entityType: ev.entityType, field: ev.field,
              value: ev.value, resultFieldVersion: ev.resultFieldVersion, actor: ev.actor ?? null, seq: m.seq,
            });
          } else if (ev?.type === 'ENTITY_ADDED') {
            cb.onEntityAdded?.({ entityType: ev.entityType, entityId: ev.entityId, data: ev.data ?? {}, actor: ev.actor ?? null });
          } else if (ev?.type === 'ENTITY_DELETED') {
            cb.onEntityDeleted?.({ entityType: ev.entityType, entityId: ev.entityId, actor: ev.actor ?? null });
          }
          break;
        }
        case 'CMD_ACK':
          if (m.entityId && m.field && typeof m.resultFieldVersion === 'number') {
            setVer(m.entityId, m.field, m.resultFieldVersion);
          }
          break;
        case 'CONFLICT':
          setVer(m.entityId, m.field, m.currentFieldVersion);
          cb.onConflict?.({
            entityId: m.entityId, field: m.field, currentValue: m.currentValue,
            currentFieldVersion: m.currentFieldVersion, yourValue: m.yourValue,
          });
          break;
        case 'RETRY':
          break;
      }
    };

    sock.onclose = () => {
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
      if (closedByUs) { setStatus('closed'); return; }
      setStatus('reconnecting');
      setTimeout(() => { if (!closedByUs) open(); }, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    };

    sock.onerror = () => { try { sock.close(); } catch { /* ignore */ } };
  }

  open();

  const handle: CollabHandle = {
    sendFieldSet: (entityId, entityType, field, value, rationale) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const clientCmdId = uuid();
      const baseFieldVersion = getVer(entityId, field);
      ws.send(JSON.stringify({
        type: 'CMD', cmd: 'FIELD_SET', massCaseId,
        entityType, entityId, field, value, baseFieldVersion,
        rationale: rationale ?? null, clientCmdId,
      }));
      setVer(entityId, field, baseFieldVersion + 1);
    },
    sendEntityAdded: (entityType, entityId, data) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({
        type: 'CMD', cmd: 'ENTITY_ADDED', massCaseId, entityType, entityId, data, clientCmdId: uuid(),
      }));
    },
    sendEntityDeleted: (entityType, entityId) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({
        type: 'CMD', cmd: 'ENTITY_DELETED', massCaseId, entityType, entityId, clientCmdId: uuid(),
      }));
    },
    close: () => {
      closedByUs = true;
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
      try { ws?.close(); } catch { /* ignore */ }
      if (activeCollab === handle) activeCollab = null;
      setStatus('closed');
    },
    status: () => status,
  };
  activeCollab = handle;
  return handle;
}
