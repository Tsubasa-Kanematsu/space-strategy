import React from 'react';
import { useAppStore } from '../../stores/appStore';
import { useApplicationStore } from '../../stores/applicationStore';
import { useVehicleUnitStore } from '../../stores/vehicleUnitStore';
import { downloadFile } from '../../utils/importExport';
import type { ApplicationStatus } from '../../types';

const STATUS_COLOR: Record<ApplicationStatus, string> = {
  作成済み: 'primary',
  提出済み: 'info',
  受理: 'success',
  差戻し: 'danger',
};

const fmtDateTime = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' });
};

export const ApplicationDetail: React.FC = () => {
  const applicationId = useAppStore((s) => s.applicationId);
  const navigate = useAppStore((s) => s.navigate);
  const getApplication = useApplicationStore((s) => s.getApplication);
  const submit = useApplicationStore((s) => s.submit);

  const app = applicationId ? getApplication(applicationId) : undefined;

  if (!app) {
    return (
      <div className="text-center text-muted py-5">
        <i className="bi bi-exclamation-circle fs-3 d-block mb-2" />
        申請書が見つかりません
        <div className="mt-3">
          <button className="btn btn-outline-secondary btn-sm" onClick={() => navigate('applications')}>
            申請書一覧へ
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = () => {
    submit(app.id);
    // 対応する号機のステータスも進める
    useVehicleUnitStore.getState().updateUnit(app.vehicleUnitId, { status: '申請済み' });
  };

  const handleDownload = () => {
    downloadFile(JSON.stringify(app, null, 2), `application-${app.unitNo}.json`, 'application/json');
  };

  const ecText = app.ecValue != null ? app.ecValue.toExponential(2) : '—';

  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-1">
        <button
          className="btn btn-link btn-sm p-0 text-muted"
          style={{ textDecoration: 'none' }}
          onClick={() => navigate('applications')}
        >
          <i className="bi bi-arrow-left me-1" />申請書一覧
        </button>
      </div>

      <div className="d-flex justify-content-between align-items-start mb-3">
        <div>
          <h1 className="page-title mb-0">
            打ち上げ許可申請書 — {app.missionName}（{app.unitNo}号機）
          </h1>
          <small className="text-muted">
            ステータス: <span className={`badge bg-${STATUS_COLOR[app.status]}`}>{app.status}</span>
          </small>
        </div>
        <div className="action-toolbar">
          {app.status === '作成済み' && (
            <button className="btn btn-primary btn-sm" onClick={handleSubmit}>
              <i className="bi bi-send me-1" />内閣府へ提出
            </button>
          )}
          <button className="btn btn-outline-secondary btn-sm" onClick={() => window.print()}>
            <i className="bi bi-printer me-1" />印刷
          </button>
          <button className="btn btn-outline-secondary btn-sm" onClick={handleDownload}>
            <i className="bi bi-download me-1" />ダウンロード
          </button>
        </div>
      </div>

      {/* 申請者情報 */}
      <div className="card mb-3">
        <div className="card-header fw-semibold">
          <i className="bi bi-building me-1" />申請者情報
        </div>
        <div className="card-body">
          <dl className="row mb-0">
            <dt className="col-sm-3 text-muted fw-normal">申請者</dt>
            <dd className="col-sm-9">スペース・ルネサンス株式会社</dd>
            <dt className="col-sm-3 text-muted fw-normal">プロジェクト名</dt>
            <dd className="col-sm-9">{app.projectName || '—'}</dd>
            <dt className="col-sm-3 text-muted fw-normal">提出先</dt>
            <dd className="col-sm-9">{app.submittedTo}</dd>
            <dt className="col-sm-3 text-muted fw-normal">生成日</dt>
            <dd className="col-sm-9">{fmtDateTime(app.generatedAt)}</dd>
            <dt className="col-sm-3 text-muted fw-normal">提出日</dt>
            <dd className="col-sm-9 mb-0">{fmtDateTime(app.submittedAt)}</dd>
          </dl>
        </div>
      </div>

      {/* ミッション諸元 */}
      <div className="card mb-3">
        <div className="card-header fw-semibold">
          <i className="bi bi-rocket-takeoff me-1" />ミッション諸元
        </div>
        <div className="card-body">
          <dl className="row mb-0">
            <dt className="col-sm-3 text-muted fw-normal">ミッション名</dt>
            <dd className="col-sm-9">{app.missionName}</dd>
            <dt className="col-sm-3 text-muted fw-normal">号機</dt>
            <dd className="col-sm-9">{app.unitNo}号機</dd>
            <dt className="col-sm-3 text-muted fw-normal">打上予定日</dt>
            <dd className="col-sm-9 mb-0">{app.launchDate || '未定'}</dd>
          </dl>
        </div>
      </div>

      {/* 安全評価サマリ */}
      <div className="card mb-3">
        <div className="card-header fw-semibold">
          <i className="bi bi-shield-check me-1" />安全評価サマリ
        </div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-sm-6">
              <div className="text-muted small">Expected Casualty (Ec)</div>
              <div className="fs-4 fw-semibold">{ecText}</div>
            </div>
            <div className="col-sm-6">
              <div className="text-muted small">基準判定（Ec &lt; 1×10⁻⁴）</div>
              <div className="fs-4">
                {app.ecPass ? (
                  <span className="badge bg-success"><i className="bi bi-check-lg me-1" />適合</span>
                ) : (
                  <span className="badge bg-danger"><i className="bi bi-exclamation-triangle me-1" />要確認</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 解析結果 */}
      <div className="card mb-3">
        <div className="card-header fw-semibold">
          <i className="bi bi-clipboard-data me-1" />解析結果
        </div>
        <div className="card-body">
          {app.results.length === 0 ? (
            <p className="text-muted small mb-0">解析結果がありません。</p>
          ) : (
            app.results.map((res) => (
              <div key={res.type} className="mb-4">
                <div className="d-flex align-items-center gap-2 mb-2">
                  <span className="fw-semibold">{res.label}</span>
                  <span className="badge bg-success">{res.status}</span>
                </div>
                <div className="table-responsive">
                  <table className="table table-sm align-middle mb-0">
                    <tbody>
                      {res.metrics.map((m) => (
                        <tr key={m.key}>
                          <td className="text-muted" style={{ width: '50%' }}>{m.key}</td>
                          <td className="fw-medium">
                            {m.value}
                            {m.unit ? <span className="text-muted ms-1">{m.unit}</span> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
