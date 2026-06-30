# space-strategy — ミッション解析共通基盤（運用版）プロトタイプ

rocketDB（開発向けミッション解析ツール）をベースに構築した、**ロケット運用フェーズ向け**の
ミッション解析管理ツールのプロトタイプ。号機ごとの解析管理と、内閣府への打ち上げ許可
申請書の作成までをカバーする。

- フロント: React 19 + Vite + TypeScript + Zustand（rocketDB から流用・改修）
- バックエンド: Express 単一サービス（SPA 配信 + Key-Value ストア + 認証 + 外部API/標準化APIモック）
- 永続化: サーバー側 JSON ファイルストア（`DATA_DIR`）
- 認証: 共有パスワード方式（JWT AccessToken + httpOnly Cookie の RefreshToken）
- ホスティング: **Render**（単一 Web サービス）

## rocketDB からの主な差分（運用版）

| 項目 | rocketDB（開発版） | space-strategy（運用版） |
|------|------|------|
| サイドバー | プロジェクト/解析/マスタデータ | **+申請書** の4タブ |
| プロジェクト詳細 | 設計変遷ツリー | **号機一覧テーブル** |
| 解析項目 | 全12種（空力・サイジング含む） | **運用向け11種**（空力・サイジングUI削除） |
| 空力/サイジング | 解析UIあり | UI削除、データは**マスタデータ**として保持 |
| 申請書 | なし | **新規**（解析済み/申請済みミッション・自動生成・印刷/DL） |
| 外部ツール連携 | なし | **ALMA/MONACO/P4SD 入力API + 標準化API**（モック） |
| バックエンド | AWS Cognito + API Gateway + Lambda | **Express 単一サービス（Render）** |

## ローカル開発

```bash
npm install

# ターミナル1: API サーバー（:3000）
APP_PASSWORD=demo JWT_SECRET=dev npm run server

# ターミナル2: Vite 開発サーバー（:5173, /store /auth /api は :3000 にプロキシ）
npm run dev
```

ブラウザで http://localhost:5173 を開き、パスワード `demo` でログイン。

### 本番相当（ビルド成果物を Express が配信）

```bash
npm run build
APP_PASSWORD=demo JWT_SECRET=dev PORT=3000 npm start
# http://localhost:3000
```

## Render へのデプロイ

1. このリポジトリを GitHub に push する。
2. Render Dashboard → **New → Blueprint** → リポジトリを選択（`render.yaml` を自動検出）。
3. 環境変数を設定:
   - `APP_PASSWORD` … 共有ログインパスワード（必須・任意の値）
   - `JWT_SECRET` … `render.yaml` の `generateValue: true` で自動生成される
   - `DATA_DIR` … `/var/data`（永続ディスクのマウント先、`render.yaml` 既定）
4. デプロイ完了後、発行された URL を開きパスワードでログイン。

`render.yaml` は永続ディスク（1GB）を `/var/data` にマウントし、データが再デプロイで
消えないようにしている。ヘルスチェックは `/healthz`。

### 手動設定（Blueprint を使わない場合）
- Environment: **Node**
- Build Command: `npm install && npm run build`
- Start Command: `npm start`
- 環境変数: 上記 `APP_PASSWORD` / `JWT_SECRET` / `DATA_DIR`
- 必要に応じて Persistent Disk を `DATA_DIR` にマウント。

## 環境変数

| 変数 | 用途 | 既定 |
|------|------|------|
| `VITE_API_URL` | フロントの API ベースURL（同一オリジンなら空） | 空 |
| `APP_PASSWORD` | 共有ログインパスワード | `spacestrategy` |
| `JWT_SECRET` | JWT 署名鍵 | （本番は必ず設定） |
| `DATA_DIR` | サーバー側データ保存先 | `./data` |
| `PORT` | 待受ポート（Render が注入） | `3000` |

## ディレクトリ構成（追加・改修ぶん）

```
server/
  index.js          Express: SPA配信 + /store + /auth + /api
  externalMock.js   外部解析ツール・標準化API のモック
src/
  components/project/VehicleUnitList.tsx      号機一覧テーブル（プロジェクト詳細）
  components/project/VehicleUnitDetail.tsx    号機詳細・解析進捗・申請書生成
  components/applications/Applications.tsx    申請書一覧（解析済み/申請済み）
  components/applications/ApplicationDetail.tsx 申請書本文・印刷/DL・提出
  components/masterData/ShapeMasterView.tsx   機体形状データ
  components/masterData/AeroCoeffView.tsx     空力係数データ
  components/masterData/DebrisMasterView.tsx  代表破片データ
  components/analysis/ExternalToolsPanel.tsx  外部ツール連携（入力API/標準化API）
  stores/vehicleUnitStore.ts                  号機ストア
  stores/applicationStore.ts                  申請書ストア
  utils/applicationGen.ts                     申請書自動生成ロジック
```

## 注意（プロトタイプ）
- 認証は単一の共有パスワード。マルチユーザー／権限管理は未実装。
- 外部解析ツール（ALMA/MONACO等）・標準化API はモック。実連携は `server/externalMock.js` を差し替える。
- 解析結果値・Ec 等の数値は決定論的なダミー値。
