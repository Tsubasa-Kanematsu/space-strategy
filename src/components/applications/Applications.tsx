import React, { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useProjectStore } from '../../stores/projectStore';
import { useVehicleUnitStore } from '../../stores/vehicleUnitStore';
import { useApplicationStore } from '../../stores/applicationStore';
import { isPtComplete } from '../../types/vehicleUnit';
import { buildApplicationData } from '../../utils/applicationGen';
import type { ApplicationStatus } from '../../types';

const STATUS_COLOR: Record<ApplicationStatus, string> = {
  作成済み: 'primary',
  提出済み: 'info',
  受理: 'success',
  差戻し: 'danger',
};

type TabKey = 'analyzed' | 'submitted';

export const Applications: React.FC = () => {
  const navigate = useAppStore((s) => s.navigate);
  const getProject = useProjectStore((s) => s.getProject);
  const units = useVehicleUnitStore((s) => s.units);
  const applications = useApplicationStore((s) => s.applications);
  const getByUnit = useApplicationStore((s) => s.getByUnit);
  const upsertForUnit = useApplicationStore((s) => s.upsertForUnit);

  const [tab, setTab] = useState<TabKey>('analyzed');

  // PT解析（計画時）が完了した号機 → 内閣府申請の対象
  const analyzedUnits = units
    .filter((u) => isPtComplete(u))
    .sort((a, b) => (a.launchDate || '').localeCompare(b.launchDate || ''));

  // 提出済み / 受理 の申請書
  const submittedApps = applications
    .filter((a) => a.status === '提出済み' || a.status === '受理')
    .sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));

  const generateApplication = (unitId: string) => {
    const unit = units.find((u) => u.id === unitId);
    if (!unit) return;
    const projectName = getProject(unit.projectId)?.name ?? '';
    const created = upsertForUnit(buildApplicationData({ unit, projectName }));
    navigate('applicationDetail', { applicationId: created.id });
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h1 className="page-title mb-0">申請書</h1>
          <small className="text-muted">打ち上げ許可申請（内閣府）</small>
        </div>
      </div>

      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button
            className={`nav-link ${tab === 'analyzed' ? 'active' : ''}`}
            onClick={() => setTab('analyzed')}
          >
            <i className="bi bi-clipboard-check me-1" />解析済みミッション
            <span className="badge bg-secondary ms-2">{analyzedUnits.length}</span>
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${tab === 'submitted' ? 'active' : ''}`}
            onClick={() => setTab('submitted')}
          >
            <i className="bi bi-send-check me-1" />申請済みミッション
            <span className="badge bg-secondary ms-2">{submittedApps.length}</span>
          </button>
        </li>
      </ul>

      {tab === 'analyzed' && (
        <div className="card">
          <div className="table-responsive">
            <table className="table table-hover mb-0 align-middle">
              <thead>
                <tr>
                  <th>ミッション名</th>
                  <th style={{ width: 90 }}>号機</th>
                  <th>プロジェクト名</th>
                  <th style={{ width: 130 }}>打上予定日</th>
                  <th style={{ width: 220 }}>申請書</th>
                </tr>
              </thead>
              <tbody>
                {analyzedUnits.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-muted py-4">
                      <i className="bi bi-clipboard-x fs-4 d-block mb-2" />
                      申請に必要な解析が完了したミッションはありません。
                    </td>
                  </tr>
                ) : (
                  analyzedUnits.map((u) => {
                    const app = getByUnit(u.id);
                    return (
                      <tr key={u.id}>
                        <td>{u.missionName}</td>
                        <td className="fw-semibold">{u.unitNo}号機</td>
                        <td className="text-muted">{getProject(u.projectId)?.name ?? '—'}</td>
                        <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>
                          {u.launchDate || '未定'}
                        </td>
                        <td>
                          {app ? (
                            <div className="d-flex align-items-center gap-2">
                              <span className={`badge bg-${STATUS_COLOR[app.status]}`}>{app.status}</span>
                              <button
                                className="btn btn-sm btn-outline-primary"
                                onClick={() => navigate('applicationDetail', { applicationId: app.id })}
                              >
                                <i className="bi bi-file-earmark-text me-1" />申請書を開く
                              </button>
                            </div>
                          ) : (
                            <div className="d-flex align-items-center gap-2">
                              <span className="text-muted small">未生成</span>
                              <button
                                className="btn btn-sm btn-primary"
                                onClick={() => generateApplication(u.id)}
                              >
                                <i className="bi bi-magic me-1" />申請書を生成
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'submitted' && (
        <div className="card">
          <div className="table-responsive">
            <table className="table table-hover mb-0 align-middle">
              <thead>
                <tr>
                  <th>ミッション名</th>
                  <th style={{ width: 90 }}>号機</th>
                  <th>プロジェクト名</th>
                  <th style={{ width: 130 }}>申請日</th>
                  <th style={{ width: 110 }}>提出先</th>
                  <th style={{ width: 100 }}>ステータス</th>
                </tr>
              </thead>
              <tbody>
                {submittedApps.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center text-muted py-4">
                      <i className="bi bi-send fs-4 d-block mb-2" />
                      提出済みの申請書はありません。
                    </td>
                  </tr>
                ) : (
                  submittedApps.map((a) => (
                    <tr
                      key={a.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate('applicationDetail', { applicationId: a.id })}
                    >
                      <td>{a.missionName}</td>
                      <td className="fw-semibold">{a.unitNo}号機</td>
                      <td className="text-muted">{a.projectName || '—'}</td>
                      <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>
                        {a.submittedAt ? a.submittedAt.slice(0, 10) : '—'}
                      </td>
                      <td className="text-muted">{a.submittedTo}</td>
                      <td>
                        <span className={`badge bg-${STATUS_COLOR[a.status]}`}>{a.status}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
