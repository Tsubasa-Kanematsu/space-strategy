import React from 'react';
import { useAppStore } from '../../stores/appStore';
import { useVehicleUnitStore } from '../../stores/vehicleUnitStore';
import { useMassCaseStore } from '../../stores/massCaseStore';
import { useAnalysisFlowStore } from '../../stores/analysisFlowStore';
import { PHASE_META } from '../../types/vehicleUnit';
import { BUILTIN_FLOW_TEMPLATES, PT_TEMPLATE_KEY, FT_TEMPLATE_KEY } from '../analysis/flow/flowTemplates';
import type { AnalysisPhase, AppView, VehicleUnit } from '../../types';

/** 機体諸元DB（条件設定）の各タブ view */
const DB_VIEWS: AppView[] = [
  'massModel', 'parameters', 'rocketShapeData', 'propulsionData', 'debrisShapeData', 'errorSourceData',
];

/**
 * フェーズ作業バー。
 *
 * 号機のフェーズ（PT/FT）に属する「条件設定（機体諸元DB）」または「解析フロー」を
 * 開いている間、画面上部に常時表示する文脈バー。
 *   - 「{N号機} — {PT/FT}解析」を常時表示（今どのフェーズの作業中かを示す）
 *   - ［条件設定｜解析フロー］タブで、号機詳細に戻らず両者を行き来できる
 *   - 号機詳細へ戻るリンク
 *
 * 号機に属さない（解析ハブ等から開いた）スタンドアロンの場合は何も表示しない。
 */
export const PhaseWorkBar: React.FC = () => {
  const { view, massCaseId, analysisFlowId, navigate } = useAppStore();
  const units = useVehicleUnitStore((s) => s.units);
  const updatePhase = useVehicleUnitStore((s) => s.updatePhase);
  const addCase = useMassCaseStore((s) => s.addCase);
  const addFlow = useAnalysisFlowStore((s) => s.addFlow);

  const onConditions = DB_VIEWS.includes(view);
  const onFlow = view === 'analysisFlowDetail';

  // 現在の画面に応じて所有号機フェーズを逆引き（DB画面は massCaseId、フロー画面は flowId で判定）
  let owner: VehicleUnit | null = null;
  let phase: AnalysisPhase | null = null;
  if (onConditions && massCaseId) {
    for (const u of units) {
      if (u.pt.massCaseId === massCaseId) { owner = u; phase = 'PT'; break; }
      if (u.ft.massCaseId === massCaseId) { owner = u; phase = 'FT'; break; }
    }
  } else if (onFlow && analysisFlowId) {
    for (const u of units) {
      if (u.pt.flowId === analysisFlowId) { owner = u; phase = 'PT'; break; }
      if (u.ft.flowId === analysisFlowId) { owner = u; phase = 'FT'; break; }
    }
  }
  if (!owner || !phase) return null;

  const ps = phase === 'PT' ? owner.pt : owner.ft;

  const openConditions = () => {
    let mc = ps.massCaseId;
    if (!mc) {
      const c = addCase({
        projectId: owner!.projectId,
        name: `${owner!.unitNo}号機 ${PHASE_META[phase!].label} 機体諸元`,
        memo: '', createdBy: '',
      });
      mc = c.id;
      updatePhase(owner!.id, phase!, { massCaseId: mc });
    }
    navigate('massModel', { projectId: owner!.projectId, massCaseId: mc });
  };

  const openFlow = () => {
    let fid = ps.flowId;
    if (!fid) {
      const tpl = BUILTIN_FLOW_TEMPLATES.find((t) => t.key === (phase === 'PT' ? PT_TEMPLATE_KEY : FT_TEMPLATE_KEY));
      const f = addFlow({
        projectId: owner!.projectId,
        name: `${owner!.unitNo}号機 ${PHASE_META[phase!].label} 解析フロー`,
        steps: tpl ? tpl.build() : [],
      });
      fid = f.id;
      updatePhase(owner!.id, phase!, { flowId: fid });
    }
    navigate('analysisFlowDetail', { analysisFlowId: fid, projectId: owner!.projectId });
  };

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '7px 16px', background: '#eef3ff',
        borderBottom: '1px solid #d0ddf7', flexWrap: 'wrap', minHeight: 42,
      }}
    >
      <button
        className="btn btn-link btn-sm p-0 text-muted"
        style={{ textDecoration: 'none', fontSize: '0.82rem' }}
        onClick={() => navigate('vehicleUnitDetail', { projectId: owner!.projectId, vehicleUnitId: owner!.id })}
        title="号機詳細へ戻る"
      >
        <i className="bi bi-arrow-left me-1" />号機詳細
      </button>

      <span className="fw-semibold" style={{ color: '#1558c0', fontSize: '0.92rem' }}>
        <i className={`bi bi-${PHASE_META[phase].icon} me-1`} />
        {owner.unitNo}号機 — {PHASE_META[phase].label}
      </span>

      <div className="btn-group btn-group-sm ms-1">
        <button className={`btn ${onConditions ? 'btn-primary' : 'btn-outline-primary'}`} onClick={openConditions}>
          <i className="bi bi-sliders me-1" />条件設定
        </button>
        <button className={`btn ${onFlow ? 'btn-primary' : 'btn-outline-primary'}`} onClick={openFlow}>
          <i className="bi bi-diagram-3 me-1" />解析フロー
        </button>
      </div>
    </div>
  );
};
