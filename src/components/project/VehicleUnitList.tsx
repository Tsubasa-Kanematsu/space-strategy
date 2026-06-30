import React, { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useProjectStore } from '../../stores/projectStore';
import { useVehicleUnitStore } from '../../stores/vehicleUnitStore';
import { useApplicationStore } from '../../stores/applicationStore';
import { DeleteConfirmModal } from '../common/DeleteConfirmModal';
import { ALL_SERVICES, SERVICE_META } from '../analysis/analysisServiceMeta';
import { useFlags } from '../../stores/featureFlagsStore';
import { VEHICLE_UNIT_STATUSES } from '../../types/vehicleUnit';
import type { AnalysisServiceType, PhaseStatus, VehicleUnit, VehicleUnitStatus } from '../../types';

const STATUS_COLOR: Record<VehicleUnitStatus, string> = {
  計画: 'secondary',
  PT実施中: 'info',
  申請済み: 'success',
  FT確認中: 'info',
  打上可: 'success',
  打上完了: 'dark',
};

const PHASE_BADGE: Record<PhaseStatus, string> = {
  未着手: 'bg-light text-muted',
  実施中: 'bg-info-subtle text-info',
  完了: 'bg-success',
};

interface FormState {
  unitNo: string;
  missionName: string;
  launchDate: string;
  status: VehicleUnitStatus;
  memo: string;
  requiredAnalyses: AnalysisServiceType[];
}

const emptyForm = (operationalServices: AnalysisServiceType[]): FormState => ({
  unitNo: '',
  missionName: '',
  launchDate: '',
  status: '計画',
  memo: '',
  requiredAnalyses: [...operationalServices],
});

export const VehicleUnitList: React.FC = () => {
  const projectId = useAppStore((s) => s.projectId);
  const navigate = useAppStore((s) => s.navigate);
  const getProject = useProjectStore((s) => s.getProject);
  const units = useVehicleUnitStore((s) => s.units);
  const addUnit = useVehicleUnitStore((s) => s.addUnit);
  const updateUnit = useVehicleUnitStore((s) => s.updateUnit);
  const deleteUnit = useVehicleUnitStore((s) => s.deleteUnit);
  const getByUnit = useApplicationStore((s) => s.getByUnit);
  const FEATURE_FLAGS = useFlags();

  const operationalServices = ALL_SERVICES.filter(
    (s) => (FEATURE_FLAGS.analysis as Record<string, boolean>)[s]
  );

  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<VehicleUnit | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm(operationalServices));
  const [confirmDelete, setConfirmDelete] = useState<VehicleUnit | null>(null);

  if (!projectId) {
    return (
      <div className="text-center text-muted py-5">
        <i className="bi bi-exclamation-circle fs-3 d-block mb-2" />
        プロジェクトを選択してください
      </div>
    );
  }

  const project = getProject(projectId);
  const projectUnits = units
    .filter((u) => u.projectId === projectId)
    .sort((a, b) => a.unitNo.localeCompare(b.unitNo, 'ja', { numeric: true }));

  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm(operationalServices));
    setShowModal(true);
  };

  const openEdit = (u: VehicleUnit) => {
    setEditTarget(u);
    setForm({
      unitNo: u.unitNo,
      missionName: u.missionName,
      launchDate: u.launchDate,
      status: u.status,
      memo: u.memo ?? '',
      requiredAnalyses: u.requiredAnalyses,
    });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.unitNo.trim() || !form.missionName.trim()) return;
    if (editTarget) {
      updateUnit(editTarget.id, {
        unitNo: form.unitNo.trim(),
        missionName: form.missionName.trim(),
        launchDate: form.launchDate,
        status: form.status,
        memo: form.memo,
        requiredAnalyses: form.requiredAnalyses,
      });
    } else {
      addUnit({
        projectId,
        unitNo: form.unitNo.trim(),
        missionName: form.missionName.trim(),
        launchDate: form.launchDate,
        status: form.status,
        memo: form.memo,
        requiredAnalyses: form.requiredAnalyses,
        pt: { status: '未着手' },
        ft: { status: '未着手' },
      });
    }
    setShowModal(false);
  };

  const handleDelete = () => {
    if (!confirmDelete) return;
    deleteUnit(confirmDelete.id);
    setConfirmDelete(null);
  };

  const toggleRequired = (svc: AnalysisServiceType) => {
    setForm((f) => ({
      ...f,
      requiredAnalyses: f.requiredAnalyses.includes(svc)
        ? f.requiredAnalyses.filter((s) => s !== svc)
        : [...f.requiredAnalyses, svc],
    }));
  };

  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-1">
        <button
          className="btn btn-link btn-sm p-0 text-muted"
          style={{ textDecoration: 'none' }}
          onClick={() => navigate('projects')}
        >
          <i className="bi bi-arrow-left me-1" />プロジェクト一覧
        </button>
      </div>
      <div className="d-flex justify-content-between align-items-center mb-2">
        <div>
          <h1 className="page-title mb-0">{project?.name ?? 'プロジェクト'}</h1>
          <small className="text-muted">号機一覧 — 各号機で PT解析（計画時）／FT解析（飛行時）の2フェーズ。各フェーズは機体諸元＋パイプラインを持つ</small>
        </div>
        <div className="action-toolbar">
          <button className="btn btn-primary btn-sm" onClick={openCreate}>
            <i className="bi bi-plus-lg me-1" />号機を追加
          </button>
        </div>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover mb-0 align-middle">
            <thead>
              <tr>
                <th style={{ width: 80 }}>号機</th>
                <th>ミッション名</th>
                <th style={{ width: 120 }}>打上予定日</th>
                <th style={{ width: 110 }}>ステータス</th>
                <th style={{ width: 110 }}><i className="bi bi-clipboard-data me-1" />PT解析</th>
                <th style={{ width: 110 }}><i className="bi bi-shield-check me-1" />FT解析</th>
                <th style={{ width: 110 }}>申請書</th>
                <th className="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {projectUnits.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-muted py-4">
                    <i className="bi bi-rocket fs-4 d-block mb-2" />
                    号機がありません。「号機を追加」から作成してください。
                  </td>
                </tr>
              ) : (
                projectUnits.map((u) => {
                  const app = getByUnit(u.id);
                  return (
                    <tr key={u.id}>
                      <td>
                        <button
                          className="btn btn-link btn-sm p-0 fw-semibold"
                          style={{ textDecoration: 'none' }}
                          onClick={() => navigate('vehicleUnitDetail', { projectId, vehicleUnitId: u.id })}
                        >
                          {u.unitNo}号機
                        </button>
                      </td>
                      <td>{u.missionName}</td>
                      <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>{u.launchDate || '—'}</td>
                      <td><span className={`badge bg-${STATUS_COLOR[u.status]}`}>{u.status}</span></td>
                      <td><span className={`badge ${PHASE_BADGE[u.pt.status]}`}>{u.pt.status}</span></td>
                      <td><span className={`badge ${PHASE_BADGE[u.ft.status]}`}>{u.ft.status}</span></td>
                      <td>
                        {app ? (
                          <span className={`badge bg-${app.status === '提出済み' || app.status === '受理' ? 'success' : 'primary'}`}>
                            {app.status}
                          </span>
                        ) : u.pt.status === '完了' ? (
                          <span className="badge bg-warning">生成可</span>
                        ) : (
                          <span className="text-muted small">—</span>
                        )}
                      </td>
                      <td className="col-actions">
                        <button
                          className="btn btn-sm btn-outline-primary me-1"
                          onClick={() => navigate('vehicleUnitDetail', { projectId, vehicleUnitId: u.id })}
                          title="号機詳細"
                        >
                          <i className="bi bi-box-arrow-in-right" />
                        </button>
                        <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => openEdit(u)} title="編集">
                          <i className="bi bi-pencil" />
                        </button>
                        <button className="btn btn-sm btn-outline-danger" onClick={() => setConfirmDelete(u)} title="削除">
                          <i className="bi bi-trash" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{editTarget ? '号機を編集' : '号機を追加'}</h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body">
                <div className="row g-3">
                  <div className="col-3">
                    <label className="form-label fw-medium">号機番号 <span className="text-danger">*</span></label>
                    <input className="form-control" value={form.unitNo} onChange={(e) => setForm({ ...form, unitNo: e.target.value })} placeholder="例: 1" autoFocus />
                  </div>
                  <div className="col-9">
                    <label className="form-label fw-medium">ミッション名 <span className="text-danger">*</span></label>
                    <input className="form-control" value={form.missionName} onChange={(e) => setForm({ ...form, missionName: e.target.value })} placeholder="例: 革新的衛星技術実証2号機" />
                  </div>
                  <div className="col-4">
                    <label className="form-label fw-medium">打上予定日</label>
                    <input type="date" className="form-control" value={form.launchDate} onChange={(e) => setForm({ ...form, launchDate: e.target.value })} />
                  </div>
                  <div className="col-4">
                    <label className="form-label fw-medium">ステータス</label>
                    <select className="form-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as VehicleUnitStatus })}>
                      {VEHICLE_UNIT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="col-12">
                    <label className="form-label fw-medium">メモ</label>
                    <textarea className="form-control" rows={2} value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
                  </div>
                  <div className="col-12">
                    <label className="form-label fw-medium">
                      実施する解析（申請書に記載） <small className="text-muted">（{form.requiredAnalyses.length}件選択中・パイプライン構成の目安）</small>
                    </label>
                    <div className="d-flex flex-wrap gap-2">
                      {operationalServices.map((svc) => {
                        const on = form.requiredAnalyses.includes(svc);
                        return (
                          <button
                            key={svc}
                            type="button"
                            className={`btn btn-sm ${on ? 'btn-primary' : 'btn-outline-secondary'}`}
                            onClick={() => toggleRequired(svc)}
                          >
                            <i className={`bi bi-${SERVICE_META[svc].icon} me-1`} />
                            {SERVICE_META[svc].shortLabel}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>キャンセル</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={!form.unitNo.trim() || !form.missionName.trim()}>
                  {editTarget ? '保存' : '追加'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <DeleteConfirmModal
          itemName={`${confirmDelete.unitNo}号機（${confirmDelete.missionName}）`}
          description="この号機を削除します。紐づく申請書は別途確認してください。"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
};
