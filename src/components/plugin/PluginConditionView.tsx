import React, { useMemo, useState } from 'react';
import { usePluginStore } from '../../stores/pluginStore';
import { useAppStore } from '../../stores/appStore';
import { useMassCaseStore } from '../../stores/massCaseStore';
import type { PluginParameterDef, PluginRunResult } from '../../types/plugin';

const APP_VERSION = '1.0.0';

/**
 * カスタム解析ケースの解析条件・実行・結果画面。
 * 他解析 (AnalysisConditionView) と同じ 2 カラム構成。
 */
export const PluginConditionView: React.FC = () => {
  const pluginCaseId = useAppStore((s) => s.pluginCaseId);
  const navigate = useAppStore((s) => s.navigate);
  const cases = usePluginStore((s) => s.cases);
  const plugins = usePluginStore((s) => s.plugins);
  const updateCase = usePluginStore((s) => s.updateCase);
  const appendCaseResult = usePluginStore((s) => s.appendCaseResult);
  const loadPluginModule = usePluginStore((s) => s.loadPluginModule);

  const rawComponents = useMassCaseStore((s) => s.components);
  const rawParameters = useMassCaseStore((s) => s.parameters);
  const rawCases = useMassCaseStore((s) => s.cases);

  const pluginCase = cases.find((c) => c.id === pluginCaseId) ?? null;
  const plugin = pluginCase ? plugins.find((p) => p.id === pluginCase.pluginId) ?? null : null;
  const refMassCase = useMemo(
    () => (pluginCase ? rawCases.find((c) => c.id === pluginCase.massCaseId) ?? null : null),
    [pluginCase, rawCases]
  );

  const components = useMemo(() => {
    if (!pluginCase) return [];
    return (useMassCaseStore.getState().getComponentsForCase(pluginCase.massCaseId) ?? [])
      .filter((c) => !c.isDeleted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pluginCase, rawComponents, rawCases]);
  const parameters = useMemo(() => {
    if (!pluginCase) return [];
    return (useMassCaseStore.getState().getParametersForCase(pluginCase.massCaseId) ?? [])
      .filter((p) => !p.isDeleted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pluginCase, rawParameters, rawCases]);

  const [running, setRunning] = useState(false);
  /** 進捗 0..1 (ダミー解析の進捗バー用) */
  const [progress, setProgress] = useState(0);

  /** ダミー解析の最低所要時間 (ms)。実行中であることが視覚的に伝わる様にする */
  const MIN_RUN_DURATION_MS = 7000;

  if (!pluginCase) {
    return (
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div className="card p-4 text-center text-muted m-3">
          <i className="bi bi-exclamation-triangle fs-1 opacity-25 d-block mb-2" />
          <div>ケースが見つかりません</div>
          <button className="btn btn-link" onClick={() => navigate('pluginCases')}>
            一覧に戻る
          </button>
        </div>
      </div>
    );
  }

  const setParam = (key: string, value: unknown) => {
    updateCase(pluginCase.id, {
      paramValues: { ...pluginCase.paramValues, [key]: value },
    });
  };

  const handleRun = async () => {
    if (!plugin) return;
    setRunning(true);
    setProgress(0);
    const t0 = performance.now();
    // 進捗バー更新タイマー (100ms 毎に MIN_RUN_DURATION_MS に対する進捗を更新)
    const progressTimer = setInterval(() => {
      const elapsed = performance.now() - t0;
      setProgress(Math.min(0.99, elapsed / MIN_RUN_DURATION_MS));
    }, 100);
    let result: PluginRunResult;
    try {
      const { run } = await loadPluginModule(plugin);
      const ctx = {
        massCaseId: pluginCase.massCaseId,
        components, parameters, appVersion: APP_VERSION,
      };
      // 実行と最低待ち時間を並行で進める (実解析が早くても最低 MIN_RUN_DURATION_MS は待つ)
      const dataPromise = Promise.resolve(run(pluginCase.paramValues, ctx));
      const minWait = new Promise<void>((resolve) => setTimeout(resolve, MIN_RUN_DURATION_MS));
      const [data] = await Promise.all([dataPromise, minWait]);
      result = {
        ok: true, data,
        elapsedMs: Math.round(performance.now() - t0),
        runAt: new Date().toISOString(),
      };
    } catch (err) {
      // エラー時も最低待ち時間を守る (ユーザーに「処理した感」を与えるため)
      const elapsed = performance.now() - t0;
      if (elapsed < MIN_RUN_DURATION_MS) {
        await new Promise((r) => setTimeout(r, MIN_RUN_DURATION_MS - elapsed));
      }
      result = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        elapsedMs: Math.round(performance.now() - t0),
        runAt: new Date().toISOString(),
      };
    } finally {
      clearInterval(progressTimer);
      setProgress(1);
      setRunning(false);
    }
    appendCaseResult(pluginCase.id, result);
  };

  const latestResult = pluginCase.results[0] ?? null;

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div className="d-flex align-items-center gap-2">
          <button className="btn btn-sm btn-link p-0 me-2" onClick={() => navigate('pluginCases')}>
            <i className="bi bi-arrow-left me-1" />一覧
          </button>
          <h1 className="page-title mb-0">
            <i className="bi bi-puzzle me-2 text-primary" />解析条件 — {pluginCase.name}
          </h1>
        </div>
        <small className="text-muted">入力内容は自動保存されます</small>
      </div>

      <div className="row g-3">
        {/* 左: パラメータフォーム + 実行 + 結果 */}
        <div className="col-lg-6">
          <div className="card p-3 mb-3">
            <h6 className="fw-semibold mb-3">
              <i className="bi bi-sliders me-2 text-primary" />
              {plugin ? `${plugin.manifest.name} パラメータ` : '解析条件 (プラグイン不在)'}
            </h6>

            {!plugin ? (
              <div className="alert alert-warning py-2 mb-3" style={{ fontSize: '0.85rem' }}>
                <i className="bi bi-exclamation-triangle me-1" />
                関連プラグインが見つかりません (削除された可能性)
              </div>
            ) : plugin.manifest.parameters.length === 0 ? (
              <p className="text-muted mb-3" style={{ fontSize: '0.82rem' }}>
                このプラグインはパラメータを持ちません
              </p>
            ) : (
              <div>
                {plugin.manifest.parameters.map((p) => (
                  <PluginParamField
                    key={p.name}
                    def={p}
                    value={pluginCase.paramValues[p.name]}
                    onChange={(v) => setParam(p.name, v)}
                  />
                ))}
              </div>
            )}

            <div className="border-top pt-3 mt-2">
              <div className="d-flex align-items-center gap-3 mb-2">
                <button className="btn btn-primary" onClick={handleRun} disabled={running || !plugin}>
                  {running ? (
                    <><span className="spinner-border spinner-border-sm me-1" />実行中…</>
                  ) : (
                    <><i className="bi bi-play-fill me-1" />実行</>
                  )}
                </button>
                <small className="text-muted">
                  {refMassCase ? `${components.length} 件のコンポーネントを参照` : 'MassCase 不明'}
                </small>
              </div>
              {/* 実行中の進捗バー (最低 7s) */}
              {running && (
                <div>
                  <div className="progress" style={{ height: 6 }}>
                    <div
                      className="progress-bar progress-bar-striped progress-bar-animated bg-primary"
                      style={{ width: `${Math.round(progress * 100)}%`, transition: 'width 0.15s linear' }}
                    />
                  </div>
                  <small className="text-muted d-block mt-1" style={{ fontSize: '0.75rem' }}>
                    解析実行中… {Math.round(progress * 100)}% (推定残り {Math.max(0, Math.ceil((1 - progress) * (MIN_RUN_DURATION_MS / 1000)))} 秒)
                  </small>
                </div>
              )}
            </div>
          </div>

          {/* 解析レポート (最新実行結果) */}
          {latestResult && !running && (
            <div className={`card mb-3 ${latestResult.ok ? 'border-success' : 'border-danger'}`}>
              <div className={`card-header py-2 d-flex justify-content-between align-items-center ${latestResult.ok ? 'bg-success-subtle' : 'bg-danger-subtle'}`}>
                <h6 className="fw-semibold mb-0">
                  <i
                    className={`bi bi-${latestResult.ok ? 'file-earmark-check text-success' : 'file-earmark-x text-danger'} me-2`}
                  />
                  解析レポート {latestResult.ok && <span className="badge bg-success ms-2" style={{ fontSize: '0.7rem' }}>完了</span>}
                </h6>
                <small className="text-muted">
                  {latestResult.runAt && new Date(latestResult.runAt).toLocaleString('ja-JP')} ({latestResult.elapsedMs} ms)
                </small>
              </div>
              <div className="card-body p-3">
                {latestResult.ok ? (
                  <ReportRenderer data={latestResult.data} />
                ) : (
                  <div className="alert alert-danger mb-0 py-2" style={{ fontSize: '0.85rem' }}>
                    <i className="bi bi-exclamation-triangle me-1" />{latestResult.error}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 右: 参照ロケットDB + ケース情報 + 実行履歴 */}
        <div className="col-lg-6">
          <div className="card p-3 mb-3">
            <h6 className="fw-semibold mb-1">
              <i className="bi bi-database me-2 text-primary" />参照ロケットDB
            </h6>
            {refMassCase ? (
              <div
                className="d-flex align-items-center gap-2 mb-2 px-2 py-1 rounded"
                style={{ background: '#eaf2ff', fontSize: '0.85rem' }}
              >
                <i className="bi bi-database-fill text-primary" />
                <span className="text-muted">参照中:</span>
                <strong className="font-monospace">{refMassCase.name}</strong>
              </div>
            ) : (
              <div className="text-warning mb-2" style={{ fontSize: '0.83rem' }}>
                <i className="bi bi-exclamation-triangle me-1" />MassCase が見つかりません
              </div>
            )}
            {refMassCase && (
              <button
                className="btn btn-sm btn-outline-secondary"
                onClick={() => navigate('massModel', { projectId: refMassCase.projectId, massCaseId: refMassCase.id })}
              >
                <i className="bi bi-box-arrow-up-right me-1" />ロケットDB を見る
              </button>
            )}
          </div>

          <div className="card p-3 mb-3">
            <h6 className="fw-semibold mb-2">ケース情報</h6>
            <table className="table table-sm mb-0">
              <tbody>
                <tr><th style={{ width: 110 }}>プラグイン</th><td>{plugin?.manifest.name ?? '(削除済)'}</td></tr>
                <tr><th>ファイル</th><td className="text-muted small">{plugin?.fileName ?? '—'}</td></tr>
                <tr><th>作成者</th><td>{pluginCase.createdBy || '—'}</td></tr>
                <tr><th>作成日</th><td>{new Date(pluginCase.createdAt).toLocaleString('ja-JP')}</td></tr>
                <tr><th>メモ</th><td>{pluginCase.memo || '—'}</td></tr>
                <tr><th>実行履歴</th><td>{pluginCase.results.length} 件</td></tr>
              </tbody>
            </table>
          </div>

          {/* 実行履歴 (2件目以降) */}
          {pluginCase.results.length > 1 && (
            <div className="card p-3">
              <h6 className="fw-semibold mb-2">過去の実行</h6>
              <div className="d-flex flex-column gap-2">
                {pluginCase.results.slice(1).map((r, i) => (
                  <div key={i} className="border rounded p-2" style={{ fontSize: '0.82rem' }}>
                    <div className="d-flex justify-content-between mb-1">
                      <span>
                        <i className={`bi bi-${r.ok ? 'check-circle text-success' : 'exclamation-triangle text-danger'} me-1`} />
                        {r.runAt && new Date(r.runAt).toLocaleString('ja-JP')}
                      </span>
                      <span className="text-muted">{r.elapsedMs} ms</span>
                    </div>
                    {!r.ok && <div className="text-danger small">{r.error}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * プラグイン実行結果をレポート風に表示する。
 *  - object のトップレベル key/value を「項目: 値」のテーブルで表示
 *  - 数値はそのまま、配列/object はネスト JSON で表示
 *  - 単純な値 (string/number) はそのまま
 *  - 複雑すぎる場合は JSON フォールバック
 */
const ReportRenderer: React.FC<{ data: unknown }> = ({ data }) => {
  if (data == null) {
    return <div className="text-muted">(結果なし)</div>;
  }
  if (typeof data !== 'object') {
    return (
      <div className="d-flex align-items-center gap-2">
        <i className="bi bi-circle-fill text-success" style={{ fontSize: '0.6rem' }} />
        <span className="font-monospace">{String(data)}</span>
      </div>
    );
  }
  if (Array.isArray(data)) {
    return (
      <pre className="mb-0 p-2 bg-light rounded" style={{ fontSize: '0.8rem', maxHeight: 480, overflow: 'auto' }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  }
  const entries = Object.entries(data as Record<string, unknown>);
  return (
    <table className="table table-sm mb-0">
      <tbody>
        {entries.map(([key, value]) => (
          <tr key={key}>
            <th style={{ width: 200, whiteSpace: 'nowrap' }} className="text-muted fw-medium">{key}</th>
            <td className="font-monospace" style={{ fontSize: '0.85rem' }}>
              {value == null ? <span className="text-muted">—</span>
                : typeof value === 'object' ? (
                  <pre className="mb-0 p-1 bg-light rounded" style={{ fontSize: '0.75rem', maxHeight: 200, overflow: 'auto' }}>
                    {JSON.stringify(value, null, 2)}
                  </pre>
                ) : (
                  <span>{String(value)}</span>
                )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const PluginParamField: React.FC<{
  def: PluginParameterDef;
  value: unknown;
  onChange: (v: unknown) => void;
}> = ({ def, value, onChange }) => {
  return (
    <div className="mb-3">
      <label className="form-label fw-medium">
        {def.label || def.name}
        {def.unit && <span className="text-muted ms-1 fw-normal">({def.unit})</span>}
      </label>
      {def.type === 'number' && (
        <input
          type="number" step="any" className="form-control"
          value={(value as number) ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      )}
      {def.type === 'string' && (
        <input
          type="text" className="form-control"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {def.type === 'boolean' && (
        <div className="form-check">
          <input
            type="checkbox" className="form-check-input"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            id={`plugin-cond-param-${def.name}`}
          />
          <label className="form-check-label" htmlFor={`plugin-cond-param-${def.name}`}>有効</label>
        </div>
      )}
      {def.type === 'select' && (
        <select
          className="form-select"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">(選択)</option>
          {def.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
      {def.description && <div className="form-text">{def.description}</div>}
    </div>
  );
};
