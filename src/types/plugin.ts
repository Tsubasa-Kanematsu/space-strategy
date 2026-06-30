/**
 * カスタム解析プラグイン (ユーザー定義 JS モジュール)。
 *
 * プラグイン作者は ES Module を書き、 `export const manifest = { ... }` と
 * `export function run(params, context) { ... }` を提供する。
 * 本アプリは Blob URL + import() で動的にロードし、 manifest.parameters から
 * 入力フォームを自動生成、 run() を呼び出して結果を表示する。
 */

/** プラグインパラメータの 1 つの宣言 */
export interface PluginParameterDef {
  /** key (run の params オブジェクトのプロパティ名) */
  name: string;
  /** UI 表示用ラベル */
  label: string;
  /** 型 */
  type: 'number' | 'string' | 'boolean' | 'select';
  /** 単位 (UI のラベル横に表示) */
  unit?: string;
  /** 初期値 */
  default?: number | string | boolean;
  /** select 型の選択肢 */
  options?: { value: string; label: string }[];
  /** UI 補助の説明文 */
  description?: string;
}

/** プラグイン manifest (作者が宣言する) */
export interface PluginManifest {
  name: string;
  description?: string;
  /** バージョン (任意) */
  version?: string;
  /** 著者 (任意) */
  author?: string;
  /** 入力パラメータ宣言 */
  parameters: PluginParameterDef[];
  /** 結果表示の型ヒント (任意) */
  resultFormat?: 'json' | 'table' | 'text' | 'auto';
}

/** localStorage に保存するプラグインレコード */
export interface StoredPlugin {
  id: string;
  /** ユーザーがアップロードしたファイル名 */
  fileName: string;
  /** プラグインのソースコード (JS テキスト) */
  source: string;
  /** import 時に取得した manifest */
  manifest: PluginManifest;
  /** アップロード時刻 ISO */
  uploadedAt: string;
}

/** 実行コンテキスト: 現在の MassCase 関連データを渡す */
export interface PluginRunContext {
  massCaseId: string | null;
  components: unknown[];
  parameters: unknown[];
  /** アプリのバージョン (将来 plugin の互換性チェック用) */
  appVersion: string;
}

/** プラグイン実行結果 */
export interface PluginRunResult {
  ok: boolean;
  /** 結果データ (任意の JSON) */
  data?: unknown;
  /** エラーメッセージ (ok=false 時) */
  error?: string;
  /** 実行所要時間 ms */
  elapsedMs?: number;
  /** 実行時刻 ISO */
  runAt?: string;
}

/**
 * カスタム解析ケース。
 * 飛行解析や荷重解析と同様に、ケース単位で保存して一覧表示する。
 * プラグイン + パラメータ + 参照 MassCase + 結果履歴をまとめる。
 */
export interface PluginAnalysisCase {
  id: string;
  /** ケース名 (例: 「重心マージン #1」) */
  name: string;
  /** 参照プロジェクト */
  projectId: string;
  /** 参照ロケットDB (MassCase) */
  massCaseId: string;
  /** 実行に使うプラグイン */
  pluginId: string;
  /** パラメータ値 (manifest.parameters[*].name → value) */
  paramValues: Record<string, unknown>;
  /** メモ */
  memo: string;
  /** 作成者 */
  createdBy: string;
  /** 作成時刻 ISO */
  createdAt: string;
  /** 最新の実行結果 (最大 N 件で履歴保持) */
  results: PluginRunResult[];
}
