/**
 * URL ⇔ AppNavState の双方向変換。
 *
 * 設計方針:
 *  - 全ての画面遷移は useAppStore.navigate() を経由する既存 API を壊さない
 *  - navigate() 内で navToUrl() を呼んで history.pushState を実行
 *  - ブラウザの 戻る/進む(popstate) では urlToNav() で State を更新
 *  - URL を短く保つため scope を略記 (p=project, mc=massCase, sc=sizingCase, ac=analysisCase)
 *  - 未知の URL は projects にフォールバック (URL 破損で white screen にしない)
 */
import type { AppView, AppNavState } from '../types';

/** view ごとの URL 生成。view と必要パラメータから path を返す */
export function navToUrl(state: AppNavState): string {
  const { view, projectId, massCaseId, sizingCaseId, analysisCaseId, analysisService } = state;
  const p = projectId ? `/p/${encodeURIComponent(projectId)}` : '';
  const mc = massCaseId ? `/mc/${encodeURIComponent(massCaseId)}` : '';
  const sc = sizingCaseId ? `/sc/${encodeURIComponent(sizingCaseId)}` : '';
  const ac = analysisCaseId ? `/ac/${encodeURIComponent(analysisCaseId)}` : '';
  const svc = analysisService ? `?svc=${encodeURIComponent(analysisService)}` : '';
  const vu = state.vehicleUnitId ? `/vu/${encodeURIComponent(state.vehicleUnitId)}` : '';

  switch (view) {
    case 'projects':            return '/';
    case 'antennaData':         return '/antenna';
    case 'analysisHub':         return `${p}/analysis`;
    case 'masterDataHub':       return '/master-data';
    case 'shapeMaster':         return '/master-data/shape';
    case 'aeroCoeffMaster':     return '/master-data/aero';
    case 'debrisMaster':        return '/master-data/debris';
    case 'groundAntennaData':   return '/master-data/antenna-ground';
    case 'vehicleAntennaData':  return '/master-data/antenna-vehicle';
    case 'propulsionMaster':    return '/master-data/propulsion';
    case 'windMaster':          return '/master-data/wind';
    case 'failureRateMaster':   return '/master-data/failure-rate';
    case 'vehicleUnits':        return `${p}/units`;
    case 'vehicleUnitDetail':   return `${p}${vu}`;
    case 'applications':        return '/applications';
    case 'applicationDetail':   return `/applications/${encodeURIComponent(state.applicationId ?? '')}`;
    case 'pluginCases':         return '/plugins';
    case 'pluginCondition':     return `/plugins/${encodeURIComponent(state.pluginCaseId ?? '')}`;
    case 'traceability':        return `${p}/traceability`;
    case 'massCases':           return `${p}/mass-cases`;
    case 'massModel':           return `${p}${mc}`;
    case 'parameters':          return `${p}${mc}/parameters`;
    case 'rocketShapeData':     return `${p}${mc}/rocket-shape`;
    case 'propulsionData':      return `${p}${mc}/propulsion`;
    case 'debrisShapeData':     return `${p}${mc}/debris-shape`;
    case 'errorSourceData':     return `${p}${mc}/error-sources`;
    case 'sizingCases':         return `${p}/sizing-cases`;
    case 'sizingCondition':     return `${p}${sc}/condition`;
    case 'sizingResults':       return `${p}${sc}/results`;
    case 'analysisCases':       return `${p}/analysis-cases${svc}`;
    case 'analysisCondition':   return `${p}${ac}/condition${svc}`;
    case 'analysisResults':     return `${p}${ac}/results${svc}`;
    case 'analysisFlow':        return '/flows';
    case 'analysisFlowDetail':  return `/flows/${encodeURIComponent(state.analysisFlowId ?? '')}`;
    default:                    return '/';
  }
}

/** URL pathname + search を AppNavState に逆変換。未知 URL は projects フォールバック */
export function urlToNav(pathname: string, search: string): AppNavState {
  const url = new URLSearchParams(search);
  const svc = (url.get('svc') || null) as AppNavState['analysisService'];

  // pathname を分割。/p/<id>/mc/<id>/cg のようなパターンを解析
  const parts = pathname.split('/').filter(Boolean);
  const base: AppNavState = {
    view: 'projects',
    projectId: null,
    massCaseId: null,
    sizingCaseId: null,
    analysisCaseId: null,
    analysisService: svc,
    pluginCaseId: null,
    analysisFlowId: null,
    vehicleUnitId: null,
    applicationId: null,
  };

  if (parts.length === 0) return base;
  if (parts[0] === 'antenna') return { ...base, view: 'antennaData' };
  if (parts[0] === 'master-data') {
    switch (parts[1]) {
      case 'shape':            return { ...base, view: 'shapeMaster' };
      case 'aero':             return { ...base, view: 'aeroCoeffMaster' };
      case 'debris':           return { ...base, view: 'debrisMaster' };
      case 'antenna-ground':   return { ...base, view: 'groundAntennaData' };
      case 'antenna-vehicle':  return { ...base, view: 'vehicleAntennaData' };
      case 'propulsion':       return { ...base, view: 'propulsionMaster' };
      case 'wind':             return { ...base, view: 'windMaster' };
      case 'failure-rate':     return { ...base, view: 'failureRateMaster' };
      default:                 return { ...base, view: 'masterDataHub' };
    }
  }
  if (parts[0] === 'applications') {
    if (parts[1]) {
      return { ...base, view: 'applicationDetail', applicationId: decodeURIComponent(parts[1]) };
    }
    return { ...base, view: 'applications' };
  }
  if (parts[0] === 'plugins') {
    if (parts[1]) {
      return { ...base, view: 'pluginCondition', pluginCaseId: decodeURIComponent(parts[1]) };
    }
    return { ...base, view: 'pluginCases' };
  }
  if (parts[0] === 'flows') {
    if (parts[1]) {
      return { ...base, view: 'analysisFlowDetail', analysisFlowId: decodeURIComponent(parts[1]) };
    }
    return { ...base, view: 'analysisFlow' };
  }

  // project スコープ必須: /p/<projectId>/...
  if (parts[0] !== 'p' || !parts[1]) return base;
  base.projectId = decodeURIComponent(parts[1]);

  const rest = parts.slice(2);
  if (rest.length === 0) {
    // プロジェクトの既定タブは号機一覧
    return { ...base, view: 'vehicleUnits' };
  }

  // /p/<id>/traceability | mass-cases | sizing-cases | analysis-cases | analysis | units
  switch (rest[0]) {
    case 'traceability':    return { ...base, view: 'traceability' };
    case 'mass-cases':      return { ...base, view: 'massCases' };
    case 'sizing-cases':    return { ...base, view: 'sizingCases' };
    case 'analysis-cases':  return { ...base, view: 'analysisCases' };
    case 'analysis':        return { ...base, view: 'analysisHub' };
    case 'units':           return { ...base, view: 'vehicleUnits' };
  }

  // /p/<id>/vu/<unitId>
  if (rest[0] === 'vu' && rest[1]) {
    return { ...base, view: 'vehicleUnitDetail', vehicleUnitId: decodeURIComponent(rest[1]) };
  }

  // /p/<id>/mc/<caseId>[/<tab>]
  if (rest[0] === 'mc' && rest[1]) {
    base.massCaseId = decodeURIComponent(rest[1]);
    const tab = rest[2];
    switch (tab) {
      case undefined:            return { ...base, view: 'massModel' };
      case 'parameters':         return { ...base, view: 'parameters' };
      case 'rocket-shape':       return { ...base, view: 'rocketShapeData' };
      case 'propulsion':         return { ...base, view: 'propulsionData' };
      case 'debris-shape':       return { ...base, view: 'debrisShapeData' };
      case 'error-sources':      return { ...base, view: 'errorSourceData' };
      default:                   return { ...base, view: 'massModel' };
    }
  }

  // /p/<id>/sc/<caseId>/<tab>
  if (rest[0] === 'sc' && rest[1]) {
    base.sizingCaseId = decodeURIComponent(rest[1]);
    const tab = rest[2];
    return { ...base, view: tab === 'results' ? 'sizingResults' : 'sizingCondition' };
  }

  // /p/<id>/ac/<caseId>/<tab>
  if (rest[0] === 'ac' && rest[1]) {
    base.analysisCaseId = decodeURIComponent(rest[1]);
    const tab = rest[2];
    switch (tab) {
      case 'results': return { ...base, view: 'analysisResults' };
      default:        return { ...base, view: 'analysisCondition' };
    }
  }

  return base;
}

/** state 間の同一性チェック (URL push の重複防止用) */
export function navStatesEqual(a: AppNavState, b: AppNavState): boolean {
  return (
    a.view === b.view &&
    a.projectId === b.projectId &&
    a.massCaseId === b.massCaseId &&
    a.sizingCaseId === b.sizingCaseId &&
    a.analysisCaseId === b.analysisCaseId &&
    a.analysisService === b.analysisService &&
    a.pluginCaseId === b.pluginCaseId &&
    a.analysisFlowId === b.analysisFlowId &&
    a.vehicleUnitId === b.vehicleUnitId &&
    a.applicationId === b.applicationId
  );
}

/** view 種別エクスポート(import の循環防止用) */
export type { AppView };
