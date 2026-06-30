import React, { useState } from 'react';
import { getAccessToken } from '../../utils/auth';

/**
 * 外部解析ツール連携パネル。
 * ALMA / MONACO / P4SD 等の外部解析ツールを入力API (/api/external/:tool) 経由で呼び、
 * 取り込んだ結果を標準化API (/api/standardize) で申請フォーマットへ変換するデモ。
 */

type ToolId = 'alma' | 'monaco' | 'p4sd';

interface ToolMeta {
  id: ToolId;
  label: string;
  icon: string;
}

const TOOLS: ToolMeta[] = [
  { id: 'alma', label: 'ALMA', icon: 'bezier2' },
  { id: 'monaco', label: 'MONACO', icon: 'dice-5' },
  { id: 'p4sd', label: 'P4SD', icon: 'diagram-2' },
];

interface TrajectoryPoint {
  t: number;
  lat: number;
  lon: number;
  alt: number;
}

interface ToolSummary {
  ec?: number;
  maxDownrange_km?: number;
  impactProbability?: number;
}

interface ExternalResult {
  tool: string;
  kind: string;
  status: string;
  receivedAt: string;
  summary: ToolSummary;
  trajectory?: TrajectoryPoint[];
}

interface Compliance {
  ec_threshold: number;
  ec_value: number;
  pass: boolean;
}

interface StandardizedResult {
  schema: string;
  standardizedAt: string;
  missionName: string;
  results: unknown[];
  compliance: Compliance;
}

const MISSION_NAME = 'Demo Mission α-1';

const fmtSci = (v: number | undefined): string =>
  v === undefined ? '—' : v.toExponential(2);

export const ExternalToolsPanel: React.FC = () => {
  const [selectedTool, setSelectedTool] = useState<ToolId>('alma');
  const [loadingTool, setLoadingTool] = useState<ToolId | null>(null);
  const [result, setResult] = useState<ExternalResult | null>(null);
  const [standardizing, setStandardizing] = useState(false);
  const [standardized, setStandardized] = useState<StandardizedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runTool = async (tool: ToolId) => {
    setSelectedTool(tool);
    setLoadingTool(tool);
    setError(null);
    setStandardized(null);
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/external/${tool}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({
          missionName: MISSION_NAME,
          params: { launchSite: '大樹町', azimuth_deg: 180 },
        }),
      });
      if (!res.ok) {
        throw new Error(`外部ツール実行に失敗しました (HTTP ${res.status})`);
      }
      const data = (await res.json()) as ExternalResult;
      setResult(data);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : '不明なエラーが発生しました');
    } finally {
      setLoadingTool(null);
    }
  };

  const standardize = async () => {
    if (!result) return;
    setStandardizing(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/standardize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({
          missionName: MISSION_NAME,
          vehicleUnit: 'LV-Alpha',
          cases: [{ type: result.tool, status: result.status, summary: result.summary }],
          ec: result.summary.ec,
        }),
      });
      if (!res.ok) {
        throw new Error(`標準化に失敗しました (HTTP ${res.status})`);
      }
      const data = (await res.json()) as StandardizedResult;
      setStandardized(data);
    } catch (e) {
      setStandardized(null);
      setError(e instanceof Error ? e.message : '不明なエラーが発生しました');
    } finally {
      setStandardizing(false);
    }
  };

  const trajCount = result?.trajectory?.length ?? 0;
  const trajHead = result?.trajectory?.slice(0, 3) ?? [];

  return (
    <div>
      <h1 className="page-title">
        <i className="bi bi-plug me-2 text-primary" />
        外部解析ツール連携
      </h1>
      <p className="text-muted small mb-3">
        ALMA / MONACO 等の外部解析ツールから入力APIで解析結果を取り込み、標準化APIで申請フォーマットへ変換するデモ。
      </p>

      <div className="card mb-3">
        <div className="card-header">
          <i className="bi bi-tools me-2" />解析ツールを選択して実行
        </div>
        <div className="card-body">
          <div className="action-toolbar mb-2">
            <div className="btn-group">
              {TOOLS.map((t) => (
                <button
                  key={t.id}
                  className={`btn ${selectedTool === t.id ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => setSelectedTool(t.id)}
                  disabled={loadingTool !== null}
                >
                  <i className={`bi bi-${t.icon} me-1`} />{t.label}
                </button>
              ))}
            </div>
            <button
              className="btn btn-success ms-2"
              onClick={() => runTool(selectedTool)}
              disabled={loadingTool !== null}
            >
              {loadingTool ? (
                <>
                  <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />
                  実行中…
                </>
              ) : (
                <>
                  <i className="bi bi-play-fill me-1" />
                  {TOOLS.find((t) => t.id === selectedTool)?.label} を実行
                </>
              )}
            </button>
          </div>
          <small className="text-muted">
            <i className="bi bi-info-circle me-1" />
            POST /api/external/{selectedTool} を Bearer 認証で呼び出します。
          </small>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger d-flex align-items-center" role="alert">
          <i className="bi bi-exclamation-triangle-fill me-2" />
          {error}
        </div>
      )}

      {result && (
        <div className="card mb-3">
          <div className="card-header d-flex justify-content-between align-items-center">
            <span>
              <i className="bi bi-clipboard-data me-2" />
              {result.tool} — {result.kind}
            </span>
            <span className={`badge ${result.status === 'completed' ? 'bg-success' : 'bg-secondary'}`}>
              {result.status}
            </span>
          </div>
          <div className="card-body">
            <div className="row g-3 mb-3">
              <div className="col-md-4">
                <div className="text-muted small">Expected Casualty (Ec)</div>
                <div className="fs-5 font-monospace">{fmtSci(result.summary.ec)}</div>
              </div>
              <div className="col-md-4">
                <div className="text-muted small">最大ダウンレンジ (km)</div>
                <div className="fs-5 font-monospace">{result.summary.maxDownrange_km ?? '—'}</div>
              </div>
              <div className="col-md-4">
                <div className="text-muted small">落下確率</div>
                <div className="fs-5 font-monospace">{fmtSci(result.summary.impactProbability)}</div>
              </div>
            </div>

            {trajCount > 0 && (
              <div>
                <div className="text-muted small mb-1">
                  <i className="bi bi-graph-up-arrow me-1" />
                  {trajCount} 点の軌道データを受信（先頭3点を表示）
                </div>
                <div className="table-responsive">
                  <table className="table table-hover table-sm mb-0">
                    <thead>
                      <tr>
                        <th className="text-end">t (s)</th>
                        <th className="text-end">緯度</th>
                        <th className="text-end">経度</th>
                        <th className="text-end">高度 (m)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trajHead.map((p) => (
                        <tr key={p.t}>
                          <td className="text-end font-monospace">{p.t}</td>
                          <td className="text-end font-monospace">{p.lat}</td>
                          <td className="text-end font-monospace">{p.lon}</td>
                          <td className="text-end font-monospace">{p.alt}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="mt-3">
              <button className="btn btn-primary" onClick={standardize} disabled={standardizing}>
                {standardizing ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />
                    変換中…
                  </>
                ) : (
                  <>
                    <i className="bi bi-arrow-left-right me-1" />
                    標準化APIに通す
                  </>
                )}
              </button>
              <small className="text-muted ms-2">POST /api/standardize</small>
            </div>
          </div>
        </div>
      )}

      {standardized && (
        <div className="card">
          <div className="card-header">
            <i className="bi bi-file-earmark-check me-2" />
            標準化結果 — {standardized.schema}
          </div>
          <div className="card-body">
            <div className="d-flex align-items-center gap-3 flex-wrap">
              <div>
                <div className="text-muted small">Ec 値</div>
                <div className="fs-5 font-monospace">{fmtSci(standardized.compliance.ec_value)}</div>
              </div>
              <div>
                <div className="text-muted small">しきい値</div>
                <div className="fs-5 font-monospace">{fmtSci(standardized.compliance.ec_threshold)}</div>
              </div>
              <div className="ms-auto">
                {standardized.compliance.pass ? (
                  <span className="badge bg-success fs-6">
                    <i className="bi bi-check-circle me-1" />適合
                  </span>
                ) : (
                  <span className="badge bg-danger fs-6">
                    <i className="bi bi-x-circle me-1" />不適合
                  </span>
                )}
              </div>
            </div>
            <small className="text-muted d-block mt-2">
              標準化日時: {standardized.standardizedAt} ／ 結果件数: {standardized.results.length}
            </small>
          </div>
        </div>
      )}
    </div>
  );
};
