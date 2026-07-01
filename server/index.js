/**
 * space-strategy — Render 用 Express バックエンド
 *
 * 役割:
 *   1. ビルド済み SPA (dist/) の配信
 *   2. /store/:key      — Zustand persist 用の Key-Value ストア (JSON ファイル永続化)
 *   3. /auth/*          — 共有パスワード認証 (JWT + httpOnly Cookie)
 *   4. /auth/config     — フィーチャーフラグ配信
 *   5. /api/external/*  — 外部解析ツール (ALMA/MONACO 等) 連携の入力API モック
 *   6. /api/standardize — 標準化API モック
 *
 * 元の rocketDB は AWS (Cognito + API Gateway + Lambda + DSQL) 依存だったが、
 * プロトタイプとして Render の単一 Web サービスで完結するよう置き換えている。
 * フロントの cloudStorage / auth は同一オリジン (VITE_API_URL='') を叩く。
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────────────
// 設定 (環境変数)
// ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
// 共有パスワード。Render では環境変数 APP_PASSWORD で上書きする。
const APP_PASSWORD = process.env.APP_PASSWORD || 'spacestrategy';
// JWT 署名鍵。Render では JWT_SECRET を必ず設定する。
const JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me';
const ACCESS_TTL_SEC = 60 * 60;            // AccessToken 1時間
const REFRESH_TTL_SEC = 60 * 60 * 24 * 30; // RefreshToken 30日
// データ保存先。Render の Persistent Disk をマウントする場合は DATA_DIR を指定。
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const STORE_DIR = path.join(DATA_DIR, 'store');

fs.mkdirSync(STORE_DIR, { recursive: true });

// ─────────────────────────────────────────────────────────────────
// Key-Value ストア (1 キー = 1 JSON ファイル)
// ─────────────────────────────────────────────────────────────────
function keyToFile(key) {
  // パストラバーサル防止: 安全な文字のみ許可し、それ以外は base64url 化
  const safe = /^[\w.-]+$/.test(key)
    ? key
    : Buffer.from(key).toString('base64url');
  return path.join(STORE_DIR, `${safe}.json`);
}

function readStore(key) {
  const file = keyToFile(key);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeStore(key, value) {
  const file = keyToFile(key);
  // アトミック書き込み (途中失敗で壊れたファイルが残らないよう temp→rename)
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.renameSync(tmp, file);
}

function removeStore(key) {
  const file = keyToFile(key);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

// ─────────────────────────────────────────────────────────────────
// 認証ヘルパ
// ─────────────────────────────────────────────────────────────────
function issueAccess() {
  return jwt.sign({ typ: 'access' }, JWT_SECRET, { expiresIn: ACCESS_TTL_SEC });
}
function issueRefresh() {
  return jwt.sign({ typ: 'refresh' }, JWT_SECRET, { expiresIn: REFRESH_TTL_SEC });
}
function setRefreshCookie(res, token) {
  res.cookie('ss_refresh', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: REFRESH_TTL_SEC * 1000,
    path: '/',
  });
}

/** Bearer AccessToken を検証するミドルウェア */
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'No token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.typ !== 'access') throw new Error('wrong type');
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

// ─────────────────────────────────────────────────────────────────
// アプリ
// ─────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '12mb' }));
app.use(cookieParser());

// ── 認証 ──────────────────────────────────────────────────────────
// 共有パスワード方式。email は識別ラベルとして受け取るが認可には使わない。
app.post('/auth/signin', (req, res) => {
  const { password } = req.body || {};
  if (password !== APP_PASSWORD) {
    return res.status(401).json({ message: 'パスワードが違います' });
  }
  setRefreshCookie(res, issueRefresh());
  res.json({ accessToken: issueAccess(), expiresIn: ACCESS_TTL_SEC });
});

app.post('/auth/refresh', (req, res) => {
  const token = req.cookies?.ss_refresh;
  if (!token) return res.status(401).json({ message: 'No session' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.typ !== 'refresh') throw new Error('wrong type');
  } catch {
    return res.status(401).json({ message: 'Session expired' });
  }
  // ローテーション
  setRefreshCookie(res, issueRefresh());
  res.json({ accessToken: issueAccess(), expiresIn: ACCESS_TTL_SEC });
});

app.post('/auth/signout', (req, res) => {
  res.clearCookie('ss_refresh', { path: '/' });
  res.json({ ok: true });
});

// ── Key-Value ストア ──────────────────────────────────────────────
app.get('/store/:key', requireAuth, (req, res) => {
  try {
    const data = readStore(req.params.key);
    if (data == null) return res.status(404).json({ message: 'Not found' });
    res.json(data);
  } catch (err) {
    console.error('[store] GET error', err);
    res.status(500).json({ message: 'Read error' });
  }
});

app.put('/store/:key', requireAuth, (req, res) => {
  try {
    writeStore(req.params.key, req.body);
    res.json({ ok: true });
  } catch (err) {
    console.error('[store] PUT error', err);
    res.status(500).json({ message: 'Write error' });
  }
});

app.delete('/store/:key', requireAuth, (req, res) => {
  try {
    removeStore(req.params.key);
    res.json({ ok: true });
  } catch (err) {
    console.error('[store] DELETE error', err);
    res.status(500).json({ message: 'Delete error' });
  }
});

// ── 外部解析ツール連携 (入力API モック) ───────────────────────────
// ALMA / MONACO / その他解析ツールからの解析結果取り込みを模す。
// 実運用では各ツールの出力フォーマットをパースして標準スキーマに正規化する。
import { runExternalAnalysis, standardize } from './externalMock.js';

app.post('/api/external/:tool', requireAuth, (req, res) => {
  const { tool } = req.params;
  const result = runExternalAnalysis(tool, req.body || {});
  res.json(result);
});

// ── 標準化API モック ──────────────────────────────────────────────
// 各解析の結果を内閣府申請向けの標準フォーマットに変換する。
app.post('/api/standardize', requireAuth, (req, res) => {
  res.json(standardize(req.body || {}));
});

// ── ヘルスチェック ────────────────────────────────────────────────
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// ── 静的配信 (ビルド済み SPA) ─────────────────────────────────────
const DIST = path.join(ROOT, 'dist');
app.use(express.static(DIST));
// SPA フォールバック (API 以外は index.html)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/store') || req.path.startsWith('/auth') || req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(DIST, 'index.html'));
});

// 明示的に 0.0.0.0 で待受（Render の内部ヘルスチェックは IPv4 で叩くため、
// Node 既定の IPv6(::) 単独待受だと /healthz がタイムアウトすることがある）。
app.listen(PORT, '0.0.0.0', () => {
  console.log(`space-strategy server listening on 0.0.0.0:${PORT}`);
  console.log(`  data dir: ${DATA_DIR}`);
});
