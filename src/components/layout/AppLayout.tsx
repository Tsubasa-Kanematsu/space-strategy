import React from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ContentTabNav } from './ContentTabNav';
import { PhaseWorkBar } from './PhaseWorkBar';
import { useAppStore } from '../../stores/appStore';
import { useCollab } from '../../ws/useCollab';
import { useUrlSync } from '../../lib/useUrlSync';
import { ProjectList } from '../project/ProjectList';
import { Traceability } from '../project/Traceability';
import { VehicleUnitList } from '../project/VehicleUnitList';
import { VehicleUnitDetail } from '../project/VehicleUnitDetail';
import { Applications } from '../applications/Applications';
import { ApplicationDetail } from '../applications/ApplicationDetail';
import { ShapeMasterView } from '../masterData/ShapeMasterView';
import { AeroCoeffView } from '../masterData/AeroCoeffView';
import { DebrisMasterView } from '../masterData/DebrisMasterView';
import { PropulsionMasterView } from '../masterData/PropulsionMasterView';
import { WindMasterView } from '../masterData/WindMasterView';
import { FailureRateMasterView } from '../masterData/FailureRateMasterView';
// MassCaseList は廃止 (traceability ビューに統合)
// import { MassCaseList } from '../massCase/MassCaseList';
import { MassModel } from '../massCase/MassModel';
import { ParameterList } from '../massCase/ParameterList';
import { RocketShapeView } from '../rocketDb/RocketShapeView';
import { PropulsionDataView } from '../rocketDb/PropulsionDataView';
import { DebrisShapeView } from '../rocketDb/DebrisShapeView';
import { ErrorSourceView } from '../rocketDb/ErrorSourceView';
import { SizingCaseList } from '../sizing/SizingCaseList';
import { SizingConditionView } from '../sizing/SizingConditionView';
import { SizingResultsView } from '../sizing/SizingResultsView';
import { AnalysisCaseList } from '../analysis/AnalysisCaseList';
import { AnalysisConditionView } from '../analysis/AnalysisConditionView';
import { AnalysisResultsView } from '../analysis/AnalysisResultsView';
import { AnalysisFlowEditor } from '../analysis/AnalysisFlowEditor';
import { AnalysisFlowList } from '../analysis/AnalysisFlowList';
import { AntennaDataView } from '../masterData/AntennaDataView';
import { PluginCaseList } from '../plugin/PluginCaseList';
import { PluginConditionView } from '../plugin/PluginConditionView';
import { AnalysisHub } from '../analysis/AnalysisHub';
import { MasterDataHub } from '../masterData/MasterDataHub';
import { AIAssistant } from '../ai/AIAssistant';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-icon">
            <i className="bi bi-exclamation-triangle-fill" />
          </div>
          <h4>表示エラーが発生しました</h4>
          <p className="text-muted">{this.state.error.message}</p>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => this.setState({ error: null })}
          >
            再試行
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const ViewComponent: React.FC = () => {
  const view = useAppStore((s) => s.view);

  switch (view) {
    case 'projects':          return <ProjectList />;
    case 'vehicleUnits':      return <VehicleUnitList />;
    case 'vehicleUnitDetail': return <VehicleUnitDetail />;
    case 'applications':      return <Applications />;
    case 'applicationDetail': return <ApplicationDetail />;
    case 'shapeMaster':       return <ShapeMasterView />;
    case 'aeroCoeffMaster':   return <AeroCoeffView />;
    case 'debrisMaster':      return <DebrisMasterView />;
    case 'traceability':      return <Traceability />;
    // massCases (ロケットDB 一覧) は traceability の DB Flow ツリーと役割が被るため廃止。
    // 旧 URL / 既存遷移コールは traceability にフォールバックさせる
    case 'massCases':         return <Traceability />;
    case 'massModel':         return <MassModel />;
    case 'parameters':        return <ParameterList />;
    case 'rocketShapeData':   return <RocketShapeView />;
    case 'propulsionData':    return <PropulsionDataView />;
    case 'debrisShapeData':   return <DebrisShapeView />;
    case 'errorSourceData':   return <ErrorSourceView />;
    case 'sizingCases':       return <SizingCaseList />;
    case 'sizingCondition':   return <SizingConditionView />;
    case 'sizingResults':     return <SizingResultsView />;
    case 'analysisCases':     return <AnalysisCaseList />;
    case 'analysisCondition': return <AnalysisConditionView />;
    case 'analysisResults':   return <AnalysisResultsView />;
    case 'analysisFlow':      return <AnalysisFlowList />;
    case 'analysisFlowDetail': return <AnalysisFlowEditor />;
    case 'antennaData':       return <AntennaDataView />;
    case 'groundAntennaData': return <AntennaDataView lockType="ground" />;
    case 'vehicleAntennaData':return <AntennaDataView lockType="rocket" />;
    case 'propulsionMaster':  return <PropulsionMasterView />;
    case 'windMaster':        return <WindMasterView />;
    case 'failureRateMaster': return <FailureRateMasterView />;
    case 'pluginCases':       return <PluginCaseList />;
    case 'pluginCondition':   return <PluginConditionView />;
    case 'analysisHub':       return <AnalysisHub />;
    case 'masterDataHub':     return <MasterDataHub />;
    default:                  return <ProjectList />;
  }
};

interface AppLayoutProps {
  onLogout: () => void;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ onLogout }) => {
  // マスケースが開いている間、共同編集のWS接続を維持（全ビュー共通）
  useCollab();
  // URL ⇔ store の双方向同期 (ブラウザ戻る/進む・共有 URL・リロード復元用)
  useUrlSync();
  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-area">
        <Topbar onLogout={onLogout} />
        {/* フェーズ作業バー: 号機フェーズの条件設定/解析フローを開いている間だけ表示。
            DB/フローのどちらでも同じ位置に出るよう、ここで一度だけ描画する。 */}
        <PhaseWorkBar />
        <ContentTabNav />
        <div className="content-area">
          <ErrorBoundary>
            <ViewComponent />
          </ErrorBoundary>
        </div>
      </div>
      {/* AI アシスタント: 閉じている時は右下FAB、開いている時は .app-layout の
          flex 兄弟としてドック表示 (メイン領域を左に押す。重ね合わせではない)。 */}
      <AIAssistant />
    </div>
  );
};
