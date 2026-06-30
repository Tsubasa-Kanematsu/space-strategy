import React from 'react';
import { useAppStore } from '../../stores/appStore';
import { useVehicleUnitStore } from '../../stores/vehicleUnitStore';
import { useMassCaseStore } from '../../stores/massCaseStore';
import { useAnalysisFlowStore } from '../../stores/analysisFlowStore';
import { PHASE_META } from '../../types/vehicleUnit';
import { BUILTIN_FLOW_TEMPLATES, PT_TEMPLATE_KEY, FT_TEMPLATE_KEY } from '../analysis/flow/flowTemplates';
import type { AnalysisPhase, AppView, VehicleUnit, VehicleUnitStatus } from '../../types';

/** 機体諸元DB（条件設定）の各タブ view */
const DB_VIEWS: AppView[] = [
  'massModel', 'parameters', 'rocketShapeData', 'propulsionData', 'debrisShapeData', 'errorSourceData',
];

const STATUS_COLOR: Record<VehicleUnitStatus, string> = {
  計画: 'secondary', PT実施中: 'info', 申請済み: 'success',
  FT確認中: 'info', 打上可: 'success', 打上完了: 'dark',
};

/**
 * 号機ワークバー。
 *
 * 号機（とそのフェーズ）の中にいる間、画面上部に「同じ枠」を常時出し続ける。
 * これにより 号機詳細(概要) ↔ 条件設定 ↔ 解析フロー を行き来しても画面の枠が
 * 変わらず、中身だけ差し替わる体験になる（＝迷子になりにくい）。
 *
 *  - 1段目: 号機の同一性（{N}号機 — {ミッション名} ＋ ステータス）＋ 号機一覧へ
 *  - 2段目: [概要｜PT解析｜FT解析] セクションタブ
 *  - 3段目: フェーズ内のとき [条件設定｜解析フロー] サブタブ
 *
 * 号機に属さない画面では何も表示しない。
 */
export const PhaseWorkBar: React.FC = () => {
  const { view, vehicleUnitId, massCaseId, analysisFlowId, navigate } = useAppStore();
  const units = useVehicleUnitStore((s) => s.units);
  const updatePhase = useVehicleUnitStore((s) => s.updatePhase);
  const addCase = useMassCaseStore((s) => s.addCase);
  const addFlow = useAnalysisFlowStore((s) => s.addFlow);

  const onOverview = view === 'vehicleUnitDetail';
  const onConditions = DB_VIEWS.includes(view);
  const onFlow = view === 'analysisFlowDetail';

  // 現在の号機・フェーズを特定
  let unit: VehicleUnit | null = null;
  let phase: AnalysisPhase | null = null;
  if (onOverview && vehicleUnitId) {
    unit = units.find((u) => u.id === vehicleUnitId) ?? null;
  } else if (onConditions && massCaseId) {
    for (const u of units) {
      if (u.pt.massCaseId === massCaseId) { unit = u; phase = 'PT'; break; }
      if (u.ft.massCaseId === massCaseId) { unit = u; phase = 'FT'; break; }
    }
  } else if (onFlow && analysisFlowId) {
    for (const u of units) {
      if (u.pt.flowId === analysisFlowId) { unit = u; phase = 'PT'; break; }
      if (u.ft.flowId === analysisFlowId) { unit = u; phase = 'FT'; break; }
    }
  }
  if (!unit) return null;
  const u = unit;

  // ── フェーズ内の各ツールを開く（無ければ作成）──────────────────────
  const openConditions = (ph: AnalysisPhase) => {
    const ps = ph === 'PT' ? u.pt : u.ft;
    let mc = ps.massCaseId;
    if (!mc) {
      const c = addCase({ projectId: u.projectId, name: `${u.unitNo}号機 ${PHASE_META[ph].label} 機体諸元`, memo: '', createdBy: '' });
      mc = c.id;
      updatePhase(u.id, ph, { massCaseId: mc });
    }
    navigate('massModel', { projectId: u.projectId, massCaseId: mc });
  };
  const openFlow = (ph: AnalysisPhase) => {
    const ps = ph === 'PT' ? u.pt : u.ft;
    let fid = ps.flowId;
    if (!fid) {
      const tpl = BUILTIN_FLOW_TEMPLATES.find((t) => t.key === (ph === 'PT' ? PT_TEMPLATE_KEY : FT_TEMPLATE_KEY));
      const f = addFlow({ projectId: u.projectId, name: `${u.unitNo}号機 ${PHASE_META[ph].label} 解析フロー`, steps: tpl ? tpl.build() : [] });
      fid = f.id;
      updatePhase(u.id, ph, { flowId: fid });
    }
    navigate('analysisFlowDetail', { analysisFlowId: fid, projectId: u.projectId });
  };
  // フェーズの既定の入口（解析フロー）
  const openPhase = (ph: AnalysisPhase) => openFlow(ph);

  const sectionTab = (label: string, active: boolean, onClick: () => void) => (
    <button
      className="btn btn-sm"
      style={{
        border: 'none', borderRadius: 0, padding: '4px 14px',
        borderBottom: active ? '2px solid #1558c0' : '2px solid transparent',
        color: active ? '#1558c0' : '#5b6b7c', fontWeight: active ? 700 : 500,
        background: 'transparent',
      }}
      onClick={onClick}
    >
      {label}
    </button>
  );

  return (
    <div style={{ background: '#fff', borderBottom: '1px solid #e4e9ef' }}>
      {/* 1段目: 号機の同一性 */}
      <div className="d-flex align-items-center gap-3 flex-wrap" style={{ padding: '8px 16px 4px' }}>
        <button
          className="btn btn-link btn-sm p-0 text-muted"
          style={{ textDecoration: 'none', fontSize: '0.8rem' }}
          onClick={() => navigate('vehicleUnits', { projectId: u.projectId })}
          title="号機一覧へ"
        >
          <i className="bi bi-arrow-left me-1" />号機一覧
        </button>
        <span className="fw-bold" style={{ fontSize: '1rem' }}>
          <i className="bi bi-rocket-takeoff me-2 text-primary" />
          {u.unitNo}号機 — {u.missionName}
        </span>
        <span className={`badge bg-${STATUS_COLOR[u.status]}`}>{u.status}</span>
        <span className="text-muted ms-auto" style={{ fontSize: '0.78rem' }}>
          打上予定日: {u.launchDate || '未定'}
        </span>
      </div>

      {/* 2段目: セクションタブ */}
      <div className="d-flex align-items-center" style={{ padding: '0 12px', gap: 2 }}>
        {sectionTab('概要', onOverview, () => navigate('vehicleUnitDetail', { projectId: u.projectId, vehicleUnitId: u.id }))}
        {sectionTab('PT解析', phase === 'PT', () => openPhase('PT'))}
        {sectionTab('FT解析', phase === 'FT', () => openPhase('FT'))}
      </div>

      {/* 3段目: フェーズ内サブタブ（条件設定/解析フロー） */}
      {phase && (
        <div style={{ background: '#eef3ff', borderTop: '1px solid #d0ddf7', padding: '6px 16px' }}>
          <div className="btn-group btn-group-sm">
            <button className={`btn ${onConditions ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => openConditions(phase!)}>
              <i className="bi bi-sliders me-1" />条件設定
            </button>
            <button className={`btn ${onFlow ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => openFlow(phase!)}>
              <i className="bi bi-diagram-3 me-1" />解析フロー
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
