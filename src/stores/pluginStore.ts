import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { StoredPlugin, PluginManifest, PluginAnalysisCase, PluginRunResult } from '../types/plugin';

const MAX_RESULT_HISTORY = 10;

const uuid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

interface PluginStore {
  plugins: StoredPlugin[];
  cases: PluginAnalysisCase[];
  // ── プラグイン (JS ファイル) ──
  addPlugin: (fileName: string, source: string, manifest: PluginManifest) => StoredPlugin;
  deletePlugin: (id: string) => void;
  loadPluginModule: (plugin: StoredPlugin) => Promise<{ manifest: PluginManifest; run: (params: Record<string, unknown>, ctx: unknown) => unknown }>;
  // ── 解析ケース ──
  addCase: (data: Omit<PluginAnalysisCase, 'id' | 'createdAt' | 'results'>) => PluginAnalysisCase;
  updateCase: (id: string, patch: Partial<Omit<PluginAnalysisCase, 'id' | 'createdAt'>>) => void;
  deleteCase: (id: string) => void;
  /** 実行結果を 1 件追加 (履歴は MAX_RESULT_HISTORY 件で打ち切り) */
  appendCaseResult: (id: string, result: PluginRunResult) => void;
}

/**
 * Blob URL 経由でソース文字列を動的 import する。
 * - import() は ES Module セマンティクスなので CSP の eval 系制限を回避できる
 * - URL.createObjectURL → import() → URL.revokeObjectURL の流れ
 */
async function importFromSource(source: string): Promise<unknown> {
  const blob = new Blob([source], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  try {
    /* @vite-ignore */
    return await import(/* @vite-ignore */ url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const usePluginStore = create<PluginStore>()(
  persist(
    (set) => ({
      plugins: [],
      cases: [],

      addPlugin: (fileName, source, manifest) => {
        const plugin: StoredPlugin = {
          id: uuid(),
          fileName,
          source,
          manifest,
          uploadedAt: new Date().toISOString(),
        };
        set((s) => ({ plugins: [...s.plugins, plugin] }));
        return plugin;
      },

      deletePlugin: (id) => {
        set((s) => ({ plugins: s.plugins.filter((p) => p.id !== id) }));
      },

      loadPluginModule: async (plugin) => {
        const mod = (await importFromSource(plugin.source)) as Record<string, unknown>;
        const manifest = mod.manifest as PluginManifest | undefined;
        const run = mod.run as ((params: Record<string, unknown>, ctx: unknown) => unknown) | undefined;
        if (!manifest || typeof run !== 'function') {
          throw new Error('プラグインに manifest または run 関数が見つかりません');
        }
        return { manifest, run };
      },

      addCase: (data) => {
        const c: PluginAnalysisCase = {
          id: uuid(),
          createdAt: new Date().toISOString(),
          results: [],
          ...data,
        };
        set((s) => ({ cases: [...s.cases, c] }));
        return c;
      },

      updateCase: (id, patch) => {
        set((s) => ({
          cases: s.cases.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        }));
      },

      deleteCase: (id) => {
        set((s) => ({ cases: s.cases.filter((c) => c.id !== id) }));
      },

      appendCaseResult: (id, result) => {
        set((s) => ({
          cases: s.cases.map((c) =>
            c.id === id
              ? { ...c, results: [result, ...c.results].slice(0, MAX_RESULT_HISTORY) }
              : c
          ),
        }));
      },
    }),
    {
      name: 'rocketdb-plugins',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

/**
 * プラグインソース文字列から manifest を取得 (アップロード時の検証用)。
 * import に失敗した場合は throw する。
 */
export async function extractManifestFromSource(source: string): Promise<PluginManifest> {
  const blob = new Blob([source], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  try {
    /* @vite-ignore */
    const mod = (await import(/* @vite-ignore */ url)) as Record<string, unknown>;
    const manifest = mod.manifest as PluginManifest | undefined;
    if (!manifest) throw new Error('export const manifest = {...} が見つかりません');
    if (!manifest.name) throw new Error('manifest.name は必須です');
    if (!Array.isArray(manifest.parameters)) throw new Error('manifest.parameters は配列で宣言してください');
    if (typeof mod.run !== 'function') throw new Error('export function run(params, context) {...} が見つかりません');
    return manifest;
  } finally {
    URL.revokeObjectURL(url);
  }
}
