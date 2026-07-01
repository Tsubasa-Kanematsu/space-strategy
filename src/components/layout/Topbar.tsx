import React from 'react';
import { useAppStore } from '../../stores/appStore';
import { useProjectStore } from '../../stores/projectStore';
import { useMassCaseStore } from '../../stores/massCaseStore';
import { useSizingStore } from '../../stores/sizingStore';
import { useAnalysisStore } from '../../stores/analysisStore';
import { usePluginStore } from '../../stores/pluginStore';
import { useAnalysisFlowStore } from '../../stores/analysisFlowStore';
import { useVehicleUnitStore } from '../../stores/vehicleUnitStore';
import { useApplicationStore } from '../../stores/applicationStore';
import { SERVICE_META } from '../analysis/analysisServiceMeta';
import { goBack, canGoBack } from '../../lib/nav';
import type { AppView, AppNavState, AnalysisServiceType, VehicleUnit, AnalysisEntry, Application } from '../../types';

/**
 * 各ページの 階層的パンくずリスト。
 * パターン: 解析タブ → 各解析の一覧 → ケース条件/結果 のような階層を再現する。
 *
 * ルール:
 *   - 最後の要素は現在ページ (クリック不可)
 *   - それ以外は親階層へのリンク
 *   - projects (ルート) では何も表示しない
 */

interface Crumb {
  label: string;
  onClick?: () => void;
}

type NavFn = (view: AppView, params?: Partial<Omit<AppNavState, 'view'>>) => void;

interface TopbarProps {
  onLogout: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({ onLogout }) => {
  const {
    view, projectId, massCaseId, sizingCaseId, analysisCaseId, analysisService,
    pluginCaseId, analysisFlowId, vehicleUnitId, applicationId, navigate, toggleSidebar,
  } = useAppStore();
  const projects        = useProjectStore((s) => s.projects);
  const massCases       = useMassCaseStore((s) => s.cases);
  const sizingCases     = useSizingStore((s) => s.cases);
  const analysisCases   = useAnalysisStore((s) => s.cases);
  const pluginCases     = usePluginStore((s) => s.cases);
  const flows           = useAnalysisFlowStore((s) => s.flows);
  const units           = useVehicleUnitStore((s) => s.units);
  const applications    = useApplicationStore((s) => s.applications);

  const project    = projects.find((p) => p.id === projectId) ?? null;
  const massCase   = massCaseId      ? (massCases.find((c) => c.id === massCaseId) ?? null)         : null;
  const sizingCase = sizingCaseId    ? (sizingCases.find((c) => c.id === sizingCaseId) ?? null)     : null;
  const analysisCase = analysisCaseId ? (analysisCases.find((c) => c.id === analysisCaseId) ?? null) : null;
  const pluginCase  = pluginCaseId   ? (pluginCases.find((c) => c.id === pluginCaseId) ?? null)     : null;
  const flow        = analysisFlowId ? (flows.find((f) => f.id === analysisFlowId) ?? null)         : null;

  const crumbs = buildCrumbs({
    view, projectId, massCaseId, sizingCaseId, analysisService, navigate,
    project, massCase, sizingCase, analysisCase, pluginCase, flow,
    units, applications, vehicleUnitId, applicationId,
  });

  return (
    <div className="topbar">
      <button
        className="btn btn-sm btn-outline-secondary"
        onClick={toggleSidebar}
        title="サイドバー切替"
      >
        <i className="bi bi-layout-sidebar" />
      </button>
      <button
        className="btn btn-sm btn-outline-secondary"
        onClick={goBack}
        disabled={!canGoBack()}
        title="前の画面に戻る"
      >
        <i className="bi bi-arrow-left" />
      </button>

      <div className="topbar-context">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <i className="bi bi-chevron-right topbar-context-sep" />}
            {c.onClick ? (
              <button className="topbar-context-project" onClick={c.onClick}>
                {c.label}
              </button>
            ) : (
              <span className="topbar-context-case">{c.label}</span>
            )}
          </React.Fragment>
        ))}
      </div>

      <div className="ms-auto d-flex gap-1">
        <button
          className="btn btn-sm btn-outline-secondary"
          onClick={() => window.open('/training.html', '_blank', 'noopener')}
          title="講習資料"
        >
          <i className="bi bi-mortarboard" />
        </button>
        <button
          className="btn btn-sm btn-outline-secondary"
          onClick={() => window.open('/manual.html', '_blank', 'noopener')}
          title="ヘルプ / マニュアル"
        >
          <i className="bi bi-question-circle" />
        </button>
      </div>

      <button
        className="btn btn-sm btn-outline-secondary"
        onClick={onLogout}
        title="サインアウト"
      >
        <i className="bi bi-box-arrow-right" />
      </button>
    </div>
  );
};

// ─── パンくず構築ロジック ────────────────────────────────────────────

interface BuildCrumbsArgs {
  view: AppView;
  projectId: string | null;
  massCaseId: string | null;
  sizingCaseId: string | null;
  analysisService: AnalysisServiceType | null;
  navigate: NavFn;
  project: { id: string; name: string } | null;
  massCase: { id: string; name: string } | null;
  sizingCase: { id: string; name: string; massCaseId: string } | null;
  analysisCase: { id: string; name: string; serviceType: AnalysisServiceType; projectId: string } | null;
  pluginCase: { id: string; name: string } | null;
  flow: { id: string; name: string; projectId: string } | null;
  units: VehicleUnit[];
  applications: Application[];
  vehicleUnitId: string | null;
  applicationId: string | null;
}

/** flowId を所有する号機・解析を逆引きする */
function findFlowOwner(units: VehicleUnit[], flowId: string): { unit: VehicleUnit; entry: AnalysisEntry } | null {
  for (const u of units) {
    const entry = u.analyses.find((a) => a.flowId === flowId);
    if (entry) return { unit: u, entry };
  }
  return null;
}

/** massCaseId(機体諸元DB) を所有する号機・解析を逆引きする */
function findDbOwner(units: VehicleUnit[], massCaseId: string): { unit: VehicleUnit; entry: AnalysisEntry } | null {
  for (const u of units) {
    const entry = u.analyses.find((a) => a.massCaseId === massCaseId);
    if (entry) return { unit: u, entry };
  }
  return null;
}

function buildCrumbs(a: BuildCrumbsArgs): Crumb[] {
  const { view, navigate } = a;

  // ─── 解析タブ系 (プロジェクト非依存ハブから降りる) ───
  // [解析] > [〇〇解析一覧] > [〇〇解析条件/結果]
  if (view === 'analysisHub') {
    return [{ label: '解析' }];
  }
  if (view === 'analysisCases') {
    const svcLabel = a.analysisService ? SERVICE_META[a.analysisService].label : '解析ケース';
    return [
      { label: '解析', onClick: () => navigate('analysisHub') },
      { label: `${svcLabel} 一覧` },
    ];
  }
  if (view === 'analysisCondition' || view === 'analysisResults') {
    const svc = a.analysisCase?.serviceType ?? a.analysisService;
    const svcLabel = svc ? SERVICE_META[svc].label : '解析';
    const caseName = a.analysisCase?.name ?? '(ケース)';
    const tab = view === 'analysisCondition' ? '条件' : '結果';
    return [
      { label: '解析', onClick: () => navigate('analysisHub') },
      { label: `${svcLabel} 一覧`, onClick: () => navigate('analysisCases', { analysisService: svc ?? undefined as never }) },
      { label: caseName, onClick: view === 'analysisResults'
        ? () => navigate('analysisCondition', { analysisCaseId: a.analysisCase?.id, analysisService: svc ?? undefined as never })
        : undefined },
      ...(view === 'analysisResults' ? [{ label: tab }] : []),
    ].filter((c) => c.label) as Crumb[];
  }

  if (view === 'sizingCases') {
    return [
      { label: '解析', onClick: () => navigate('analysisHub') },
      { label: 'サイジング 一覧' },
    ];
  }
  if (view === 'sizingCondition' || view === 'sizingResults') {
    const caseName = a.sizingCase?.name ?? '(ケース)';
    return [
      { label: '解析', onClick: () => navigate('analysisHub') },
      { label: 'サイジング 一覧', onClick: () => navigate('sizingCases') },
      { label: caseName, onClick: view === 'sizingResults' && a.sizingCase
        ? () => navigate('sizingCondition', { sizingCaseId: a.sizingCase!.id })
        : undefined },
      ...(view === 'sizingResults' ? [{ label: '結果' }] : []),
    ];
  }

  if (view === 'pluginCases') {
    return [
      { label: '解析', onClick: () => navigate('analysisHub') },
      { label: 'カスタム解析 一覧' },
    ];
  }
  if (view === 'pluginCondition') {
    return [
      { label: '解析', onClick: () => navigate('analysisHub') },
      { label: 'カスタム解析 一覧', onClick: () => navigate('pluginCases') },
      { label: a.pluginCase?.name ?? '(ケース)' },
    ];
  }

  if (view === 'analysisFlow') {
    return [
      { label: '解析', onClick: () => navigate('analysisHub') },
      { label: '解析フロー 一覧' },
    ];
  }
  if (view === 'analysisFlowDetail') {
    // このフローを所有する号機フェーズ（PT/FT）を逆引きし、所有していれば
    // 号機詳細を起点にしたパンくずにする（解析フロー一覧ではなく号機へ戻れるように）
    const owner = a.flow ? findFlowOwner(a.units, a.flow.id) : null;
    if (owner && a.project) {
      return [
        { label: 'プロジェクト', onClick: () => navigate('projects') },
        { label: a.project.name, onClick: () => navigate('vehicleUnits', { projectId: a.projectId ?? undefined as never }) },
        { label: `${owner.unit.unitNo}号機`, onClick: () => navigate('vehicleUnitDetail', { projectId: owner.unit.projectId, vehicleUnitId: owner.unit.id }) },
        { label: `${owner.entry.name} パイプライン` },
      ];
    }
    return [
      { label: '解析', onClick: () => navigate('analysisHub') },
      { label: '解析フロー 一覧', onClick: () => navigate('analysisFlow') },
      { label: a.flow?.name ?? '(フロー)' },
    ];
  }

  // ─── 号機（プロジェクト詳細）系 ───
  if (view === 'vehicleUnits' && a.project) {
    return [
      { label: 'プロジェクト', onClick: () => navigate('projects') },
      { label: a.project.name },
    ];
  }
  if (view === 'vehicleUnitDetail' && a.project) {
    const u = a.units.find((x) => x.id === a.vehicleUnitId) ?? null;
    return [
      { label: 'プロジェクト', onClick: () => navigate('projects') },
      { label: a.project.name, onClick: () => navigate('vehicleUnits', { projectId: a.projectId ?? undefined as never }) },
      { label: u ? `${u.unitNo}号機` : '号機' },
    ];
  }

  // ─── 申請書系 ───
  if (view === 'applications') return [{ label: '申請書' }];
  if (view === 'applicationDetail') {
    const app = a.applications.find((x) => x.id === a.applicationId) ?? null;
    return [
      { label: '申請書', onClick: () => navigate('applications') },
      { label: app ? `${app.unitNo}号機 申請書` : '申請書' },
    ];
  }

  // ─── マスタデータ系 ───
  if (view === 'masterDataHub') return [{ label: 'マスタデータ' }];
  {
    const MASTER_LABEL: Partial<Record<AppView, string>> = {
      massCases: '質量諸元データ',
      antennaData: 'アンテナデータ',
      groundAntennaData: '地上局アンテナデータ',
      vehicleAntennaData: '機体アンテナデータ',
      debrisMaster: '代表破片データ',
      shapeMaster: '機体形状データ',
      aeroCoeffMaster: '空力係数データ',
      propulsionMaster: '推進系データ',
      windMaster: '風データ',
      failureRateMaster: '故障率データ',
    };
    if (MASTER_LABEL[view]) {
      return [
        { label: 'マスタデータ', onClick: () => navigate('masterDataHub') },
        { label: MASTER_LABEL[view]! },
      ];
    }
  }

  // ─── プロジェクト依存系 (rocketDB) ───
  // [プロジェクト一覧] > [プロジェクト名] > [DB系/トレーサ]
  if (view === 'projects') return [];
  if (!a.project) return [];

  const base: Crumb[] = [
    { label: 'プロジェクト', onClick: () => navigate('projects') },
    { label: a.project.name, onClick: () => navigate('vehicleUnits', { projectId: a.projectId ?? undefined as never }) },
  ];

  // traceability と massCases (廃止予定) は同じビュー扱い
  if (view === 'traceability') return [...base, { label: 'トレーサビリティ' }];

  // DB 個別タブ (massModel/parameters/rocketShape/propulsion/debrisShape/errorSource)
  // 旧: プロジェクト > 〇〇 > ロケットDB 一覧 > DB名 > <タブ>
  // 新: プロジェクト > 〇〇 > DB名 > <タブ>   (DB一覧階層を撤去)
  const DB_TAB_LABEL: Partial<Record<AppView, string>> = {
    massModel:        '質量・重心・慣性',
    parameters:       'パラメータ',
    rocketShapeData:  '空力形状',
    propulsionData:   '推進系',
    debrisShapeData:  '破片形状',
    errorSourceData:  '誤差源',
  };
  if (DB_TAB_LABEL[view]) {
    const dbName = a.massCase?.name ?? '(DB)';
    // この機体諸元DBを所有する号機フェーズがあれば、号機起点のパンくずにする
    const owner = a.massCaseId ? findDbOwner(a.units, a.massCaseId) : null;
    const head: Crumb[] = owner
      ? [
          { label: 'プロジェクト', onClick: () => navigate('projects') },
          { label: a.project.name, onClick: () => navigate('vehicleUnits', { projectId: a.projectId ?? undefined as never }) },
          { label: `${owner.unit.unitNo}号機`, onClick: () => navigate('vehicleUnitDetail', { projectId: owner.unit.projectId, vehicleUnitId: owner.unit.id }) },
        ]
      : base;
    const dbLabel = owner ? `${owner.entry.name} 条件設定` : dbName;
    return [
      ...head,
      { label: dbLabel, onClick: view !== 'massModel'
        ? () => navigate('massModel', { massCaseId: a.massCaseId ?? undefined as never })
        : undefined },
      ...(view !== 'massModel' ? [{ label: DB_TAB_LABEL[view]! }] : []),
    ];
  }

  return [];
}
