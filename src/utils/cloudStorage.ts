/**
 * Zustand persist 用クラウドストレージアダプター
 *
 * - API Gateway + Lambda 経由でクラウドに読み書きする
 * - massCaseStore は MassCase 単位に分割して保存する
 *   → DynamoDB 400KB / S3 オブジェクト単位の制限に対応
 *   → 旧フォーマット（全データが sizing-mass-cases に集約）との後方互換あり
 */

import { getAccessToken } from './auth';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

/** 401 が返ったときに呼ばれるコールバック（App.tsx がセットする） */
let onUnauthorized: (() => void) | null = null;
export function setOnUnauthorized(cb: () => void) { onUnauthorized = cb; }

/** クラウドへの書き込み失敗時に呼ばれるコールバック（App.tsx がセットする） */
let onWriteError: (() => void) | null = null;
export function setOnWriteError(cb: () => void) { onWriteError = cb; }

/** クラウドからの読み込み失敗時に呼ばれるコールバック（App.tsx がセットする） */
let onReadError: ((key: string, err: Error) => void) | null = null;
export function setOnReadError(cb: (key: string, err: Error) => void) { onReadError = cb; }

/** クラウドへの書き込みが進行中かどうか（rehydrate 競合防止用） */
let pendingWrites = 0;
export function hasPendingWrites() { return pendingWrites > 0; }

// ─────────────────────────────────────────────────────────────────
// 可読性向上のためのユーティリティ
// ─────────────────────────────────────────────────────────────────
const MASS_CASE_KEY = 'sizing-mass-cases';

/** 文字列をファイル名・パスとして安全かつ読みやすい形式に変換 */
function slugify(name: string, id: string): string {
  const slug = name
    .replace(/[^\w\s-]/g, '') // 記号削除
    .trim()
    .replace(/[\s_]+/g, '-')  // スペース・アンダースコアをハイフンに
    .toLowerCase();
  return `${slug || 'unnamed'}_${id.slice(0, 8)}`;
}

/**
 * 旧形式: masscase-data-UUID
 * 新形式: mc-{caseName_id}
 * ※ スラッシュを含むキーは API Gateway の {key} パスパラメータにマッチしないため使用しない
 */
function getHumanCaseKey(_projectId: string, caseId: string, cases: any[], _type: 'components' | 'parameters'): string {
  const mc = cases.find(c => c.id === caseId);
  const cName = mc ? mc.name : 'unknown-case';
  const cSlug = slugify(cName, caseId);
  return `mc-${cSlug}`;
}

/** 旧形式のキー（互換性用） */
const legacyMassCaseDataKey = (id: string) => `masscase-data-${id}`;

// ─────────────────────────────────────────────────────────────────
// グローバル同時リクエスト制限（Lambda スロットリング防止）
// 全ストアの getItem/setItem が同時に呼ばれても MAX_CONCURRENT に絞る
//   ※ 過去は 3 だったが、リハイドレートが遅すぎる問題があったため 8 に増やした。
//     Lambda 同時実行は AWS デフォルト 1000 まで、DSQL は接続プール ≥ 8 を想定。
//     503 を多発するようなら 6 に下げて様子を見る。
// ─────────────────────────────────────────────────────────────────
const MAX_CONCURRENT_REQUESTS = 8;
let activeRequests = 0;
const requestQueue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT_REQUESTS) {
    activeRequests++;
    return Promise.resolve();
  }
  return new Promise<void>(resolve => requestQueue.push(resolve));
}

function releaseSlot(): void {
  const next = requestQueue.shift();
  if (next) {
    next(); // activeRequests はそのまま（次のタスクに引き継ぐ）
  } else {
    activeRequests--;
  }
}

// ─────────────────────────────────────────────────────────────────
// 内部: 直接 API 読み書き（分割ロジックなし）
// ─────────────────────────────────────────────────────────────────

async function apiFetch(key: string, options?: RequestInit): Promise<Response> {
  await acquireSlot();
  try {
    const token = await getAccessToken();
    const res = await fetch(`${API_URL}/store/${encodeURIComponent(key)}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers,
      },
    });
    if (res.status === 401) onUnauthorized?.();
    return res;
  } finally {
    releaseSlot();
  }
}

async function directGet(key: string, retriesLeft = 2): Promise<string | null> {
  // 重要:
  //   - 404 のみ null を返す (キーが存在しない＝初期化OK)
  //   - それ以外のエラー (5xx, ネットワークエラー, JSONパース失敗) は throw する
  //   - throw すると Zustand persist の rehydrate が失敗扱いになり、in-memory state が
  //     初期値で上書きされない → データ消失を防ぐ
  //   - 過去ここで catch して null を返していたが、それが原因で「リロード時にデータ消失」
  //     のバグが発生していた (rehydrate→空state→空writeで cloud 上書き)
  let res: Response;
  try {
    res = await apiFetch(key);
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error(`[cloudStorage] getItem network error for "${key}":`, e);
    onReadError?.(key, e);
    throw e;
  }
  if (res.status === 404) return null;
  if (res.status === 503 && retriesLeft > 0) {
    // 指数バックオフ: 1回目 300ms, 2回目 900ms (合計最大 1.2s)
    const delay = retriesLeft === 2 ? 300 : 900;
    await new Promise(r => setTimeout(r, delay));
    return directGet(key, retriesLeft - 1);
  }
  if (!res.ok) {
    const e = new Error(`[cloudStorage] getItem HTTP ${res.status} for "${key}"`);
    console.error(e.message);
    onReadError?.(key, e);
    throw e;
  }
  try {
    const data = await res.json();
    if (data == null) return null;
    // gzip エンベロープなら展開して元 JSON 文字列を返す (透過)
    return await unpackFromDownload(data);
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error(`[cloudStorage] getItem JSON parse / gunzip failed for "${key}":`, e);
    onReadError?.(key, e);
    throw e;
  }
}

// ─────────────────────────────────────────────────────────────────
// gzip 透過層
// DSQL TEXT は 1 MiB ハード制限のため、大きなペイロードは gzip+base64 して
// {"_gz": "..."} のエンベロープに包んで送る。読み込み時に展開する。
// ─────────────────────────────────────────────────────────────────
const COMPRESS_THRESHOLD = 256 * 1024; // 256 KiB を超えたら圧縮

function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000; // String.fromCharCode の引数数上限対策
  let out = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
  }
  return btoa(out);
}
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < bytes.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
async function gzipString(input: string): Promise<string> {
  const stream = new Blob([input]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return bytesToBase64(new Uint8Array(buf));
}
async function gunzipString(b64: string): Promise<string> {
  const bytes = base64ToBytes(b64);
  // TypeScript strict mode で Uint8Array<ArrayBufferLike> が BlobPart の
  // Uint8Array<ArrayBuffer> と非互換になるため、明示 cast でかわす
  const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}
/** value (JSON 文字列) を必要なら圧縮してリクエスト用 body 文字列にする */
async function packForUpload(value: string): Promise<string> {
  if (value.length <= COMPRESS_THRESHOLD) return value;
  const gz = await gzipString(value);
  const ratio = ((gz.length / value.length) * 100).toFixed(1);
  console.info(`[cloudStorage] gzip ${(value.length / 1024).toFixed(0)}KiB → ${(gz.length / 1024).toFixed(0)}KiB (${ratio}%)`);
  return JSON.stringify({ _gz: gz });
}
/** 取得した data (任意の値) が圧縮エンベロープなら展開して元 JSON 文字列を返す */
async function unpackFromDownload(data: unknown): Promise<string | null> {
  if (data == null) return null;
  if (typeof data === 'object' && data !== null && '_gz' in data && typeof (data as { _gz: unknown })._gz === 'string') {
    return await gunzipString((data as { _gz: string })._gz);
  }
  return JSON.stringify(data);
}

async function directSetInner(key: string, value: string, retriesLeft: number): Promise<boolean> {
  try {
    // 圧縮判定 → JSON エンベロープにする。閾値以下なら parse → stringify でそのまま
    const bodyString = await packForUpload(value);
    // Lambda 側は event.body を JSON.parse して INSERT する。圧縮ありなら
    // {"_gz": "..."} の小さいオブジェクトを、無しなら元の state オブジェクトを送る。
    const body = bodyString === value ? JSON.stringify(JSON.parse(value)) : bodyString;
    const res = await apiFetch(key, {
      method: 'PUT',
      body,
    });
    if (res.status === 503 && retriesLeft > 0) {
      await new Promise(r => setTimeout(r, 600));
      return directSetInner(key, value, retriesLeft - 1);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  } catch (err) {
    console.error(`[cloudStorage] setItem failed for "${key}":`, err);
    return false;
  }
}

async function directSet(key: string, value: string): Promise<boolean> {
  pendingWrites++;
  try {
    return await directSetInner(key, value, 2);
  } finally {
    pendingWrites--;
  }
}

async function directRemove(key: string): Promise<void> {
  try {
    await apiFetch(key, { method: 'DELETE' });
  } catch (err) {
    console.warn(`[cloudStorage] removeItem failed for "${key}":`, err);
  }
}

// ─────────────────────────────────────────────────────────────────
// MassCase 書き込みデバウンス + 排他ロック
//
// 問題: trailing debounce だけではタイマー発火後に非同期書き込みが走っている
//       間に新規呼び出しが来ると、2本目のタイマーが起動して並行書き込みになる。
//
// 解決: `massCaseWriteActive` フラグで排他制御。
//   - 書き込み中に新しい値が来たら `pendingMassCaseValue` を更新するだけ。
//   - 書き込みが終わったらループで最新値を再書き込み。
//   - 書き込み中でない場合は trailing debounce (300ms) で起動。
// ─────────────────────────────────────────────────────────────────
let massCaseWriteTimer: ReturnType<typeof setTimeout> | null = null;
let pendingMassCaseValue: string | null = null;
let massCaseWriteActive = false;

function scheduleMassCaseWrite(value: string): void {
  pendingMassCaseValue = value;

  // 書き込み実行中 → 値だけ更新して戻る（完了後ループで処理される）
  if (massCaseWriteActive) return;

  // Trailing debounce: 呼び出しのたびにタイマーをリセット
  if (massCaseWriteTimer) {
    clearTimeout(massCaseWriteTimer);
    massCaseWriteTimer = null;
  } else {
    pendingWrites++;
  }

  massCaseWriteTimer = setTimeout(async () => {
    massCaseWriteTimer = null;
    massCaseWriteActive = true;

    // 書き込みループ: 実行中に届いた最新値も必ず1回書く
    while (pendingMassCaseValue !== null) {
      const val = pendingMassCaseValue;
      pendingMassCaseValue = null;
      try {
        await setMassCaseStore(val);
      } catch { /* エラーは setMassCaseStore 内で処理済み */ }
    }

    massCaseWriteActive = false;
    pendingWrites--;
  }, 300);
}

// ─────────────────────────────────────────────────────────────────
// MassCase 分割ロジック
// ─────────────────────────────────────────────────────────────────

interface PersistEnvelope {
  state: {
    projects?: Array<{ id: string, name: string }>;
    cases?: Array<{ id: string, name: string, projectId: string }>;
    components?: Array<{ massCaseId: string }>;
    parameters?: Array<{ massCaseId: string }>;
    [key: string]: unknown;
  };
  version: number;
}

function parsePersist(raw: string | null): PersistEnvelope | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as PersistEnvelope; }
  catch { return null; }
}

/**
 * massCaseStore 読み込み。
 */
async function getMassCaseStore(): Promise<string | null> {
  const indexRaw = await directGet(MASS_CASE_KEY);
  const parsed = parsePersist(indexRaw);
  if (!parsed) return indexRaw;

  const {
    cases = [],
  } = parsed.state;

  const componentsByCase = new Map<string, object[]>();
  const paramsByCase = new Map<string, object[]>();

  // 各 MassCase のデータを並列読み込み。
  // acquireSlot が MAX_CONCURRENT_REQUESTS で抑制してくれるので、バッチ分割不要。
  // 過去は BATCH_SIZE=3 で同期ループしていたが、ロードが直列気味になり遅かった。
  const t0 = performance.now();
  await Promise.all(
    cases.map(async (mc) => {
      // 新形式パスを優先、なければ旧形式から読み込む（後方互換）
      const newKey = getHumanCaseKey(mc.projectId, mc.id, cases, 'components');
      const legacyKey = legacyMassCaseDataKey(mc.id);

      let raw = await directGet(newKey);
      if (!raw) {
        raw = await directGet(legacyKey); // フォールバック (404 のみ)
      }

      if (!raw) return;
      try {
        const { components = [], parameters = [] } = JSON.parse(raw) as {
          components: object[];
          parameters: object[];
        };
        componentsByCase.set(mc.id, components);
        paramsByCase.set(mc.id, parameters);
      } catch { /* ignore */ }
    })
  );
  console.info(`[cloudStorage] getMassCaseStore loaded ${cases.length} cases in ${Math.round(performance.now() - t0)}ms`);

  const allComponents = [...componentsByCase.values()].flat();
  const allParameters = [...paramsByCase.values()].flat();

  return JSON.stringify({
    ...parsed,
    state: { ...parsed.state, cases, components: allComponents, parameters: allParameters },
  });
}

/**
 * massCaseStore 書き込み。
 */
async function setMassCaseStore(value: string): Promise<void> {
  const parsed = parsePersist(value);
  if (!parsed) {
    const ok = await directSet(MASS_CASE_KEY, value);
    if (!ok) onWriteError?.();
    return;
  }

  const { cases = [], components = [], parameters = [] } = parsed.state;

  // 各 MassCase のデータを保存（同時リクエスト数を3に制限して503を防ぐ）
  const BATCH_SIZE = 3;
  const results: boolean[] = [];
  for (let i = 0; i < cases.length; i += BATCH_SIZE) {
    const batch = cases.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (mc) => {
        const caseComponents = components.filter((c) => c.massCaseId === mc.id);
        const caseParameters = parameters.filter((p) => p.massCaseId === mc.id);
        const newKey = getHumanCaseKey(mc.projectId, mc.id, cases, 'components');
        return directSet(
          newKey,
          JSON.stringify({ components: caseComponents, parameters: caseParameters })
        );
      })
    );
    results.push(...batchResults);
  }

  // インデックスの保存
  const indexOk = await directSet(
    MASS_CASE_KEY,
    JSON.stringify({ ...parsed, state: { ...parsed.state, components: [], parameters: [] } })
  );

  if (!indexOk || results.some((ok) => !ok)) {
    onWriteError?.();
  }
}

// ─────────────────────────────────────────────────────────────────
// 汎用キーの書き込みデバウンス + 排他ロック
//
// 問題: zustand persist は state 変更ごとに「全 state」を setItem する。
//   サンプルデータ投入などで同一キーへ短時間に N 回 setItem が走ると、
//   directSet の PUT が並行発火し、ネットワークの完了順次第で「古い state を
//   含む PUT が最後に着地」してデータが巻き戻る（= 書き込みロスト）。
//
// 解決: massCase 用の仕組みを汎用化。キー単位で
//   - trailing debounce (120ms) で連続書き込みをまとめ、
//   - 書き込み中は最新値だけ保持して直列に再書き込みする（並行 PUT を作らない）。
//   persist は full state を毎回送るので、最新値だけ書けば正しい。
// ─────────────────────────────────────────────────────────────────
interface KeyWriteState {
  timer: ReturnType<typeof setTimeout> | null;
  pending: string | null;
  active: boolean;
}
const keyWrites = new Map<string, KeyWriteState>();

function scheduleKeyWrite(key: string, value: string): void {
  let st = keyWrites.get(key);
  if (!st) {
    st = { timer: null, pending: null, active: false };
    keyWrites.set(key, st);
  }
  st.pending = value;

  // 書き込み実行中 → 値だけ更新（完了後ループで処理される）
  if (st.active) return;

  if (st.timer) {
    clearTimeout(st.timer);
  } else {
    pendingWrites++;
  }
  st.timer = setTimeout(async () => {
    st!.timer = null;
    st!.active = true;
    // 実行中に届いた最新値まで必ず1回書く（直列・並行 PUT なし）
    while (st!.pending !== null) {
      const val = st!.pending;
      st!.pending = null;
      const ok = await directSet(key, val);
      if (!ok) onWriteError?.();
    }
    st!.active = false;
    pendingWrites--;
  }, 120);
}

// ─────────────────────────────────────────────────────────────────
// 公開インターフェース（Zustand persist が使用）
// ─────────────────────────────────────────────────────────────────

export const cloudStorage = {
  getItem: async (key: string): Promise<string | null> => {
    return (key === MASS_CASE_KEY) ? getMassCaseStore() : directGet(key);
  },

  setItem: async (key: string, value: string): Promise<void> => {
    if (key === MASS_CASE_KEY) {
      scheduleMassCaseWrite(value);
      return;
    }
    scheduleKeyWrite(key, value);
  },

  removeItem: async (key: string): Promise<void> => {
    return directRemove(key);
  },
};
