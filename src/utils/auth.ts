/**
 * 認証ユーティリティ（space-strategy Express バックエンド経由）
 *
 * 元の rocketDB は Cognito だったが、プロトタイプでは「共有パスワード方式」に置換。
 * - signIn(password): サーバーがパスワードを検証し AccessToken(JWT) を返す
 *   + RefreshToken は httpOnly Cookie で保持
 * - silentRefresh(): Cookie が生きていれば AccessToken を復元
 *
 * 既存コードとの互換のため関数シグネチャ・例外型はそのまま残している。
 */

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export interface AuthTokens {
  accessToken: string;
  email: string;
  expiresAt: number; // ms
}

/** 互換用: 共有パスワード方式では使われないが、import 互換のため残す */
export class NewPasswordRequiredError extends Error {
  session: string;
  email: string;
  constructor(session: string, email: string) {
    super('NEW_PASSWORD_REQUIRED');
    this.session = session;
    this.email = email;
  }
}

// メモリ上のトークン保持（ページリロードで消える。RefreshTokenはhttpOnly Cookieで管理）
let _tokens: AuthTokens | null = null;

async function authPost(path: string, body: object): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error((data.message as string) ?? 'Authentication error');
  }
  return data;
}

export function getStoredTokens(): AuthTokens | null {
  return _tokens;
}

function saveTokens(data: Record<string, unknown>, email: string): AuthTokens {
  const tokens: AuthTokens = {
    accessToken: data.accessToken as string,
    email,
    expiresAt: Date.now() + (data.expiresIn as number) * 1000,
  };
  _tokens = tokens;
  return tokens;
}

/** ログイン。共有パスワード方式: email は識別ラベル、password のみ検証される。 */
export async function signIn(email: string, password: string): Promise<AuthTokens> {
  const data = await authPost('/auth/signin', { email, password });
  return saveTokens(data, email);
}

/** 互換用スタブ（共有パスワード方式では初回パスワード変更フローは無い） */
export async function changePassword(email: string, _session: string, newPassword: string): Promise<AuthTokens> {
  const data = await authPost('/auth/signin', { email, password: newPassword });
  return saveTokens(data, email);
}

// signOut の in-flight Promise (並列重複呼び出し防止)
let signOutInFlight: Promise<void> | null = null;

export async function signOut(): Promise<void> {
  if (signOutInFlight) return signOutInFlight;
  signOutInFlight = (async () => {
    try {
      await fetch(`${API_URL}/auth/signout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // ネットワーク失敗等は無視 (どのみち _tokens は破棄する)
    } finally {
      _tokens = null;
    }
  })();
  try {
    await signOutInFlight;
  } finally {
    signOutInFlight = null;
  }
}

// refresh の in-flight Promise (並列重複呼び出し防止)
let refreshInFlight: Promise<AuthTokens> | null = null;

async function refreshTokens(): Promise<AuthTokens> {
  if (refreshInFlight) return refreshInFlight;
  const p = (async () => {
    const data = await authPost('/auth/refresh', {});
    const email = _tokens?.email ?? '';
    return saveTokens(data, email);
  })();
  refreshInFlight = p;
  p.finally(() => { refreshInFlight = null; });
  return p;
}

/**
 * ページ起動直後にサイレント呼び出しして AccessToken を復元する。
 * Cookie が生きていれば成功、なければ null を返す（ログイン画面へ）。
 */
export async function silentRefresh(): Promise<AuthTokens | null> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    return saveTokens(data, '');
  } catch {
    return null;
  }
}

/** 有効な AccessToken を返す（期限切れなら自動リフレッシュ）。 */
export async function getAccessToken(): Promise<string | null> {
  if (!_tokens) return null;
  // 5分以内に期限切れ → refresh を試みる (dedupされる)
  if (Date.now() > _tokens.expiresAt - 5 * 60 * 1000) {
    try {
      await refreshTokens();
    } catch {
      _tokens = null;
      return null;
    }
  }
  return _tokens?.accessToken ?? null;
}

export function isAuthenticated(): boolean {
  return _tokens !== null;
}

// 機能フラグのアカウント別出し分けは廃止（全ユーザー同一の全機能セット）。
// 以前あった fetchFeatureFlags / /auth/config は削除した。
