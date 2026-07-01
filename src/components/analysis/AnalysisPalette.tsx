import React from 'react';
import { SERVICE_META, ALL_SERVICES } from './analysisServiceMeta';
import type { AnalysisServiceType } from '../../types';

// 運用版で使う解析（空力解析は除く）。フローへドラッグ&ドロップで追加できる。
const PALETTE_SERVICES: AnalysisServiceType[] = ALL_SERVICES.filter((s) => s !== 'aeroAnalysis');

/**
 * 解析パレット。各解析チップをフロー上にドラッグ&ドロップして解析ステップを追加する。
 */
export const AnalysisPalette: React.FC = () => {
  return (
    <div className="border rounded-3 p-2 mb-2" style={{ background: '#f8fafc' }}>
      <div className="small text-muted mb-1">
        <i className="bi bi-grip-vertical me-1" />解析をフロー上にドラッグ&ドロップして追加
      </div>
      <div className="d-flex flex-wrap gap-1">
        {PALETTE_SERVICES.map((svc) => (
          <div
            key={svc}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/analysis-service', svc);
              e.dataTransfer.effectAllowed = 'move';
            }}
            className="d-inline-flex align-items-center border rounded-2 px-2 py-1 small bg-white"
            style={{ cursor: 'grab', userSelect: 'none' }}
            title={`${SERVICE_META[svc].label} をドラッグして追加`}
          >
            <i className={`bi bi-${SERVICE_META[svc].icon} me-1 text-success`} />
            {SERVICE_META[svc].label}
          </div>
        ))}
        {/* カスタム解析（サービス種別なし。名前・メモで管理） */}
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('application/analysis-service', 'custom');
            e.dataTransfer.effectAllowed = 'move';
          }}
          className="d-inline-flex align-items-center border rounded-2 px-2 py-1 small bg-white"
          style={{ cursor: 'grab', userSelect: 'none', borderStyle: 'dashed' }}
          title="カスタム解析をドラッグして追加"
        >
          <i className="bi bi-puzzle me-1 text-secondary" />カスタム解析
        </div>
      </div>
    </div>
  );
};
