import { useEffect, useState, useCallback } from 'react';
import { useProjectStore } from './stores/projectStore';
import { useMassCaseStore } from './stores/massCaseStore';
import { useSizingStore } from './stores/sizingStore';
import { useMasterDataStore } from './stores/masterDataStore';
import { useAnalysisStore } from './stores/analysisStore';
import { useAnalysisFlowStore } from './stores/analysisFlowStore';
import { useRocketShapeStore } from './stores/rocketShapeStore';
import { usePropulsionStore } from './stores/propulsionStore';
import { useCadBindingStore } from './stores/cadBindingStore';
import { useVehicleUnitStore } from './stores/vehicleUnitStore';
import { useApplicationStore } from './stores/applicationStore';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './components/auth/LoginPage';
import { loadSampleData, isSampleDataLoaded } from './utils/sampleData';
import { signOut, silentRefresh } from './utils/auth';
import { setOnUnauthorized, setOnWriteError, setOnReadError } from './utils/cloudStorage';

// 全ストアの明示的 rehydrate (認証成功後に呼ぶ)。
// 各ストアの persist は skipHydration:true で起動時自動 hydrate を抑止しているため、
// このタイミングで初めてクラウドから読み込む。
async function hydrateAllStores(): Promise<void> {
  // 各ストアの型は厳密に違うが persist.rehydrate() の型シグネチャは同じ。
  // unknown を経由してまとめて扱う。
  const stores: Array<[string, { persist: { rehydrate: () => void | Promise<void> } }]> = [
    ['project', useProjectStore as unknown as { persist: { rehydrate: () => void | Promise<void> } }],
    ['massCase', useMassCaseStore as unknown as { persist: { rehydrate: () => void | Promise<void> } }],
    ['sizing', useSizingStore as unknown as { persist: { rehydrate: () => void | Promise<void> } }],
    ['masterData', useMasterDataStore as unknown as { persist: { rehydrate: () => void | Promise<void> } }],
    ['analysis', useAnalysisStore as unknown as { persist: { rehydrate: () => void | Promise<void> } }],
    ['analysisFlow', useAnalysisFlowStore as unknown as { persist: { rehydrate: () => void | Promise<void> } }],
    ['rocketShape', useRocketShapeStore as unknown as { persist: { rehydrate: () => void | Promise<void> } }],
    ['propulsion', usePropulsionStore as unknown as { persist: { rehydrate: () => void | Promise<void> } }],
    ['cadBinding', useCadBindingStore as unknown as { persist: { rehydrate: () => void | Promise<void> } }],
    ['vehicleUnit', useVehicleUnitStore as unknown as { persist: { rehydrate: () => void | Promise<void> } }],
    ['application', useApplicationStore as unknown as { persist: { rehydrate: () => void | Promise<void> } }],
  ];
  const overallT0 = performance.now();
  await Promise.all(
    stores.map(async ([name, store]) => {
      const t0 = performance.now();
      try {
        await Promise.resolve(store.persist.rehydrate());
        console.info(`[hydration] ${name} done in ${Math.round(performance.now() - t0)}ms`);
      } catch (err) {
        // クラウド失敗 (404以外) は throw されるが、無視してアプリは起動させる。
        // ユーザーには readError バナーが既に表示されているはず。
        console.warn(`[hydration] ${name} failed after ${Math.round(performance.now() - t0)}ms:`, err);
      }
    })
  );
  console.info(`[hydration] all stores done in ${Math.round(performance.now() - overallT0)}ms`);
}

function App() {
  const [authed, setAuthed] = useState<boolean>(false);
  const [authChecked, setAuthChecked] = useState<boolean>(false);
  const [ready, setReady] = useState(false);
  const [writeError, setWriteError] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  // セッション切れモーダル: 401 検出時に表示。ユーザーが「再ログイン」を押すまで待つ。
  const [sessionExpired, setSessionExpired] = useState(false);

  const handleLogout = useCallback(() => {
    signOut().finally(() => {
      setAuthed(false);
      setReady(false);
      setSessionExpired(false);
    });
  }, []);

  // 起動時: httpOnly Cookie が生きていれば AccessToken をサイレント取得
  useEffect(() => {
    silentRefresh().then((tokens) => {
      if (tokens) setAuthed(true);
      setAuthChecked(true);
    });
  }, []);

  // 401 が返ったとき: ログアウトを直接呼ばず、セッション切れモーダルを表示。
  // 並列で複数の 401 が来ても setSessionExpired(true) は冪等。
  // ユーザーが「再ログイン」を押すと初めて signOut → setAuthed(false) に進む。
  useEffect(() => {
    setOnUnauthorized(() => setSessionExpired(true));
  }, []);

  // クラウド書き込み失敗時にバナーを表示
  useEffect(() => {
    setOnWriteError(() => setWriteError(true));
  }, []);

  // クラウド読み込み失敗時にバナーを表示（key を覚えておく）
  // 読込失敗時、persist の rehydrate は失敗扱いになり in-memory state は維持される。
  // ユーザーが「データ消えた」と勘違いして再入力 → 空 state で上書き保存 → 永久消失
  // を防ぐためバナーで明示的に警告する。
  useEffect(() => {
    setOnReadError((key) => setReadError(key));
  }, []);

  // 認証済みになったらハイドレーション → サンプルデータ
  useEffect(() => {
    if (!authed) return;

    hydrateAllStores().then(async () => {
      // 機能フラグはアカウントによる出し分けを廃止。全ユーザーが同一の全機能セット
      // (featureFlags.ts の既定値) を使う。サーバーからの上書きは行わない。

      // 削除済みプロジェクトに紐付く孤立マスケースを削除
      // 安全策: projects が空のときは「読込失敗 or 真に空」の判別ができないため
      // 全マスケース削除されるのを避けるためスキップする。
      const projects = useProjectStore.getState().projects;
      if (projects.length > 0) {
        const projectIds = new Set(projects.map((p) => p.id));
        const orphanedCases = useMassCaseStore.getState().cases.filter(
          (c) => !projectIds.has(c.projectId)
        );
        for (const mc of orphanedCases) {
          useMassCaseStore.getState().deleteCase(mc.id);
        }
      }

      if (!isSampleDataLoaded()) {
        loadSampleData();
      }
      setReady(true);

      // ※過去はここで60秒ポーリングrehydrateを動かしていたが、読込失敗時にメモリ上の
      //   state を空で上書きする destructive な動作だったため撤去。
      //   マルチデバイス同期が必要になったら別途設計 (WebSocket / Conflict resolution)。
    });
  }, [authed]);

  if (!authChecked) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', flexDirection: 'column', gap: 12, color: '#6c757d',
      }}>
        <div className="spinner-border spinner-border-sm text-primary" role="status" />
        <span style={{ fontSize: '0.9rem' }}>認証を確認中…</span>
      </div>
    );
  }

  if (!authed) {
    return <LoginPage onLogin={() => setAuthed(true)} />;
  }

  if (!ready) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', flexDirection: 'column', gap: 12, color: '#6c757d',
      }}>
        <div className="spinner-border spinner-border-sm text-primary" role="status" />
        <span style={{ fontSize: '0.9rem' }}>データを読み込み中…</span>
      </div>
    );
  }

  return (
    <>
      {sessionExpired && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10001,
          background: 'rgba(0,0,0,0.55)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#fff', borderRadius: 8, padding: '20px 24px',
            maxWidth: 420, width: '90%',
            boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <i className="bi bi-exclamation-triangle-fill" style={{ color: '#d97706', fontSize: 22 }} />
              <h5 style={{ margin: 0, fontWeight: 700 }}>セッションの有効期限が切れました</h5>
            </div>
            <p style={{ fontSize: '0.88rem', color: '#475569', marginBottom: 12 }}>
              安全のため、再ログインが必要です。これまでに保存されたデータは消えていません。
            </p>
            <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: 16 }}>
              編集中の未保存の変更は失われる可能性があります。
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleLogout}
              >
                再ログイン
              </button>
            </div>
          </div>
        </div>
      )}
      {readError && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10000,
          background: '#b71c1c', color: 'white', padding: '10px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: '13px', fontWeight: 600, boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}>
          <span>
            ⚠️ クラウドからのデータ読込に失敗しました（{readError}）。
            <strong className="ms-2">画面上のデータが古い・空に見える場合は、編集せず</strong>
            ページをリロードしてください。編集してしまうと最新のクラウドデータを上書きする恐れがあります。
          </span>
          <button
            onClick={() => setReadError(null)}
            style={{
              background: 'none', border: '1px solid rgba(255,255,255,0.6)',
              color: 'white', borderRadius: 4, padding: '2px 12px',
              cursor: 'pointer', marginLeft: 20, fontWeight: 600, fontSize: '13px',
            }}
          >
            ✕
          </button>
        </div>
      )}
      {writeError && (
        <div style={{
          position: 'fixed', top: readError ? 44 : 0, left: 0, right: 0, zIndex: 9999,
          background: '#c62828', color: 'white', padding: '10px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: '13px', fontWeight: 600, boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}>
          <span>
            ⚠️ クラウドへの保存に失敗しました。ネットワーク接続を確認し、再度操作してください。
          </span>
          <button
            onClick={() => setWriteError(false)}
            style={{
              background: 'none', border: '1px solid rgba(255,255,255,0.6)',
              color: 'white', borderRadius: 4, padding: '2px 12px',
              cursor: 'pointer', marginLeft: 20, fontWeight: 600, fontSize: '13px',
            }}
          >
            ✕
          </button>
        </div>
      )}
      <AppLayout onLogout={handleLogout} />
    </>
  );
}

export default App;
