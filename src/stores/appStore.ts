import { create } from 'zustand';
import type { AppView, AppNavState } from '../types';

interface AppStore extends AppNavState {
  sidebarCollapsed: boolean;
  navigate: (view: AppView, params?: Partial<Omit<AppNavState, 'view'>>) => void;
  toggleSidebar: () => void;
}

/**
 * プロジェクト非依存の view 一覧。
 * ハブ系 (analysisHub/masterDataHub) と横断ケース一覧 (analysisCases/sizingCases/
 * pluginCases) は「全プロジェクト横断」が原則なので、
 * 遷移時に projectId / 子IDをクリアして以前選んだプロジェクトの影響を遮断する。
 * params.projectId が明示的に渡された場合はそれを優先する。
 */
const PROJECT_FREE_VIEWS: ReadonlySet<AppView> = new Set([
  'projects',
  'analysisHub',
  'masterDataHub',
  'analysisFlow',
  'analysisCases',
  'sizingCases',
  'pluginCases',
  'antennaData',
  'masterDataHub',
  'shapeMaster',
  'aeroCoeffMaster',
  'debrisMaster',
  'groundAntennaData',
  'vehicleAntennaData',
  'propulsionMaster',
  'windMaster',
  'failureRateMaster',
  // 申請書は全プロジェクト横断のミッション一覧
  'applications',
]);

export const useAppStore = create<AppStore>((set) => ({
  view: 'projects',
  projectId: null,
  massCaseId: null,
  sizingCaseId: null,
  analysisCaseId: null,
  analysisService: null,
  pluginCaseId: null,
  analysisFlowId: null,
  vehicleUnitId: null,
  applicationId: null,
  sidebarCollapsed: false,

  navigate: (view, params = {}) =>
    set((state) => {
      // プロジェクト非依存 view では呼び出し元が明示しない限り project コンテキストを破棄
      const isProjectFree = PROJECT_FREE_VIEWS.has(view);
      const newProjectId =
        params.projectId !== undefined
          ? params.projectId
          : isProjectFree
          ? null
          : state.projectId;
      // If project changed, reset child IDs
      const projectChanged = newProjectId !== state.projectId;
      const newMassCaseId =
        params.massCaseId !== undefined
          ? params.massCaseId
          : projectChanged
          ? null
          : state.massCaseId;
      const newSizingCaseId =
        params.sizingCaseId !== undefined
          ? params.sizingCaseId
          : projectChanged
          ? null
          : state.sizingCaseId;
      const newAnalysisCaseId =
        params.analysisCaseId !== undefined
          ? params.analysisCaseId
          : projectChanged
          ? null
          : state.analysisCaseId;
      const newAnalysisService =
        params.analysisService !== undefined
          ? params.analysisService
          : state.analysisService;
      const newPluginCaseId =
        params.pluginCaseId !== undefined ? params.pluginCaseId : state.pluginCaseId;
      // 解析フロー・号機・申請書の文脈はプロジェクトが変わったら（ハブ移動含む）クリアし、
      // 別画面への持ち越し（隠れた文脈）を防ぐ。
      const newAnalysisFlowId =
        params.analysisFlowId !== undefined
          ? params.analysisFlowId
          : projectChanged
          ? null
          : state.analysisFlowId;
      const newVehicleUnitId =
        params.vehicleUnitId !== undefined
          ? params.vehicleUnitId
          : projectChanged
          ? null
          : state.vehicleUnitId;
      const newApplicationId =
        params.applicationId !== undefined
          ? params.applicationId
          : projectChanged
          ? null
          : state.applicationId;
      return {
        view,
        projectId: newProjectId,
        massCaseId: newMassCaseId,
        sizingCaseId: newSizingCaseId,
        analysisCaseId: newAnalysisCaseId,
        analysisService: newAnalysisService,
        pluginCaseId: newPluginCaseId,
        analysisFlowId: newAnalysisFlowId,
        vehicleUnitId: newVehicleUnitId,
        applicationId: newApplicationId,
      };
    }),

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));
