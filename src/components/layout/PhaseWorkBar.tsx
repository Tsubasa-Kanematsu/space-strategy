import React from 'react';
import { useAppStore } from '../../stores/appStore';
import { useVehicleUnitStore } from '../../stores/vehicleUnitStore';
import type { AppView, VehicleUnit, VehicleUnitStatus } from '../../types';

/** 機体諸元DB（条件設定）の各タブ view */
const DB_VIEWS: AppView[] = [
  'massModel', 'parameters', 'rocketShapeData', 'propulsionData', 'debrisShapeData',
];

const STATUS_COLOR: Record<VehicleUnitStatus, string> = {
  計画: 'secondary', PT実施中: 'info', 申請済み: 'success',
  FT確認中: 'info', 打上可: 'success', 打上完了: 'dark',
};

/**
 * 号機ワークバー。号機（とそのフェーズ）の中にいる間、画面上部に号機の同一性
 * （{N}号機 — {ミッション名} ＋ ステータス）を常時出す見出しバー。
 * パス移動は上部パンくず、フェーズ内タブは各ページが持つ。号機に属さない画面では非表示。
 */
export const PhaseWorkBar: React.FC = () => {
  const { view, vehicleUnitId, massCaseId, analysisFlowId } = useAppStore();
  const units = useVehicleUnitStore((s) => s.units);

  const onOverview = view === 'vehicleUnitDetail';
  const onConditions = DB_VIEWS.includes(view);
  const onFlow = view === 'analysisFlowDetail';

  let unit: VehicleUnit | null = null;
  if (onOverview && vehicleUnitId) {
    unit = units.find((u) => u.id === vehicleUnitId) ?? null;
  } else if (onConditions && massCaseId) {
    unit = units.find((u) => u.analyses.some((a) => a.massCaseId === massCaseId)) ?? null;
  } else if (onFlow && analysisFlowId) {
    unit = units.find((u) => u.analyses.some((a) => a.flowId === analysisFlowId)) ?? null;
  }
  if (!unit) return null;
  const u = unit;

  return (
    <div style={{ background: '#fff', borderBottom: '1px solid #e4e9ef' }}>
      <div className="d-flex align-items-center gap-3 flex-wrap" style={{ padding: '8px 16px' }}>
        <span className="fw-bold" style={{ fontSize: '1rem' }}>
          <i className="bi bi-rocket-takeoff me-2 text-primary" />
          {u.unitNo}号機 — {u.missionName}
        </span>
        <span className={`badge bg-${STATUS_COLOR[u.status]}`}>{u.status}</span>
        <span className="text-muted ms-auto" style={{ fontSize: '0.78rem' }}>
          打上予定日: {u.launchDate || '未定'}
        </span>
      </div>
    </div>
  );
};
