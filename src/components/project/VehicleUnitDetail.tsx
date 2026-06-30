import React from 'react';
import { useAppStore } from '../../stores/appStore';
import { useProjectStore } from '../../stores/projectStore';
import { useVehicleUnitStore } from '../../stores/vehicleUnitStore';
import { useApplicationStore } from '../../stores/applicationStore';
import { SERVICE_META } from '../analysis/analysisServiceMeta';
import { analysisProgress, isAnalysisComplete } from '../../types/vehicleUnit';
import { buildApplicationData } from '../../utils/applicationGen';

export const VehicleUnitDetail: React.FC = () => {
  const projectId = useAppStore((s) => s.projectId);
  const vehicleUnitId = useAppStore((s) => s.vehicleUnitId);
  const navigate = useAppStore((s) => s.navigate);
  const getProject = useProjectStore((s) => s.getProject);
  const getUnit = useVehicleUnitStore((s) => s.getUnit);
  const markAnalysisDone = useVehicleUnitStore((s) => s.markAnalysisDone);
  const updateUnit = useVehicleUnitStore((s) => s.updateUnit);
  const getByUnit = useApplicationStore((s) => s.getByUnit);
  const upsertForUnit = useApplicationStore((s) => s.upsertForUnit);

  const unit = vehicleUnitId ? getUnit(vehicleUnitId) : undefined;

  if (!unit || !projectId) {
    return (
      <div className="text-center text-muted py-5">
        <i className="bi bi-exclamation-circle fs-3 d-block mb-2" />
        号機が見つかりません
        <div className="mt-3">
          <button className="btn btn-outline-secondary btn-sm" onClick={() => navigate('projects')}>
            プロジェクト一覧へ
          </button>
        </div>
      </div>
    );
  }

  const project = getProject(projectId);
  const prog = analysisProgress(unit);
  const pct = Math.round(prog * 100);
  const complete = isAnalysisComplete(unit);
  const app = getByUnit(unit.id);

  const runAnalysis = (svc: typeof unit.requiredAnalyses[number]) => {
    markAnalysisDone(unit.id, svc);
    // 進捗に応じてステータスを進める
    const willComplete = isAnalysisComplete({
      requiredAnalyses: unit.requiredAnalyses,
      completedAnalyses: [...unit.completedAnalyses, svc],
    });
    updateUnit(unit.id, { status: willComplete ? '解析完了' : '解析中' });
  };

  const generateApplication = () => {
    const data = buildApplicationData({ unit, projectName: project?.name ?? '' });
    const created = upsertForUnit(data);
    updateUnit(unit.id, { status: '申請準備' });
    navigate('applicationDetail', { applicationId: created.id });
  };

  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-1">
        <button
          className="btn btn-link btn-sm p-0 text-muted"
          style={{ textDecoration: 'none' }}
          onClick={() => navigate('vehicleUnits', { projectId })}
        >
          <i className="bi bi-arrow-left me-1" />{project?.name ?? 'プロジェクト'} / 号機一覧
        </button>
      </div>
      <div className="d-flex justify-content-between align-items-start mb-3">
        <div>
          <h1 className="page-title mb-0">{unit.unitNo}号機 — {unit.missionName}</h1>
          <small className="text-muted">
            打上予定日: {unit.launchDate || '未定'} ・ ステータス: <span className="fw-semibold">{unit.status}</span>
          </small>
        </div>
        <div className="action-toolbar">
          {app ? (
            <button className="btn btn-success btn-sm" onClick={() => navigate('applicationDetail', { applicationId: app.id })}>
              <i className="bi bi-file-earmark-text me-1" />申請書を開く
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" disabled={!complete} onClick={generateApplication} title={complete ? '' : '全ての必要解析が完了すると生成できます'}>
              <i className="bi bi-magic me-1" />申請書を自動生成
            </button>
          )}
        </div>
      </div>

      <div className="row g-3">
        {/* 機体諸元 */}
        <div className="col-md-4">
          <div className="card h-100">
            <div className="card-header fw-semibold">
              <i className="bi bi-box-seam me-1" />機体諸元
            </div>
            <div className="card-body">
              <p className="text-muted small mb-3">
                質量・重心・形状などの機体諸元データ。マスタデータ（機体形状・空力係数）も参照されます。
              </p>
              <button
                className="btn btn-outline-primary btn-sm w-100 mb-2"
                onClick={() => navigate('analysisHub', { projectId })}
              >
                <i className="bi bi-diagram-2 me-1" />解析・データを開く
              </button>
              <button
                className="btn btn-outline-secondary btn-sm w-100"
                onClick={() => navigate('masterDataHub')}
              >
                <i className="bi bi-archive me-1" />マスタデータ
              </button>
            </div>
          </div>
        </div>

        {/* 解析進捗 */}
        <div className="col-md-8">
          <div className="card h-100">
            <div className="card-header d-flex justify-content-between align-items-center">
              <span className="fw-semibold"><i className="bi bi-cpu me-1" />解析進捗</span>
              <span className="text-muted small">
                {unit.completedAnalyses.filter((a) => unit.requiredAnalyses.includes(a)).length}/{unit.requiredAnalyses.length} 完了
              </span>
            </div>
            <div className="card-body">
              <div className="progress mb-3" style={{ height: 8 }}>
                <div className={`progress-bar ${complete ? 'bg-success' : ''}`} style={{ width: `${pct}%` }} />
              </div>
              {unit.requiredAnalyses.length === 0 ? (
                <p className="text-muted small mb-0">必要解析が設定されていません。号機編集で設定してください。</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-sm align-middle mb-0">
                    <tbody>
                      {unit.requiredAnalyses.map((svc) => {
                        const done = unit.completedAnalyses.includes(svc);
                        const meta = SERVICE_META[svc];
                        return (
                          <tr key={svc}>
                            <td style={{ width: 28 }}>
                              <i className={`bi bi-${meta.icon}`} />
                            </td>
                            <td>{meta.label}</td>
                            <td style={{ width: 90 }}>
                              {done ? (
                                <span className="badge bg-success"><i className="bi bi-check-lg" /> 完了</span>
                              ) : (
                                <span className="badge bg-light text-muted">未実施</span>
                              )}
                            </td>
                            <td style={{ width: 110 }} className="text-end">
                              {done ? (
                                <button
                                  className="btn btn-sm btn-link p-0 text-muted"
                                  onClick={() => navigate('analysisHub', { projectId })}
                                >
                                  結果を見る
                                </button>
                              ) : (
                                <button
                                  className="btn btn-sm btn-outline-primary"
                                  onClick={() => runAnalysis(svc)}
                                >
                                  <i className="bi bi-play-fill" />実行
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {complete && !app && (
                <div className="alert alert-success d-flex align-items-center gap-2 mt-3 mb-0 py-2">
                  <i className="bi bi-check-circle-fill" />
                  <span className="small">全ての必要解析が完了しました。申請書を自動生成できます。</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {unit.memo && (
          <div className="col-12">
            <div className="card">
              <div className="card-header fw-semibold"><i className="bi bi-journal-text me-1" />メモ</div>
              <div className="card-body">
                <p className="mb-0 small text-muted" style={{ whiteSpace: 'pre-wrap' }}>{unit.memo}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
