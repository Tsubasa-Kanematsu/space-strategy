import React from 'react';
import { useAppStore } from '../../stores/appStore';
import { useFlags } from '../../stores/featureFlagsStore';
import type { AppView } from '../../types';

/**
 * マスタデータハブ: 各マスタデータ画面をカードで一覧表示。
 * サイドバー「マスタデータ」 1 アイテムからここに来る形に統一。
 */

type HubCard = {
  label: string;
  description: string;
  icon: string;
  view: AppView;
  accent?: string;
  enabled: () => boolean;
};

export const MasterDataHub: React.FC = () => {
  const { navigate } = useAppStore();
  const FEATURE_FLAGS = useFlags();

  const md = FEATURE_FLAGS.masterData as Record<string, boolean | undefined>;
  const cards: HubCard[] = [
    {
      label: '質量諸元データ',
      description: 'コンポーネント構成・質量・重心・慣性テンソルのケースを管理',
      icon: 'box-seam',
      view: 'massCases' as AppView,
      accent: '#2563eb',
      enabled: () => true,
    },
    {
      label: '誤差源データ',
      description: 'コンポーネント別の誤差源 (3σ値)。飛行安全・分散解析の入力',
      icon: 'exclamation-diamond',
      view: 'errorSourceData' as AppView,
      accent: '#d97706',
      enabled: () => true,
    },
    {
      label: '地上局アンテナデータ',
      description: '地上局アンテナのスペック (利得・G/T・周波数等) を管理',
      icon: 'broadcast-pin',
      view: 'groundAntennaData' as AppView,
      accent: '#0891b2',
      enabled: () => !!md.groundAntenna,
    },
    {
      label: '機体アンテナデータ',
      description: '機体搭載アンテナのスペック (利得・EIRP・周波数等) を管理',
      icon: 'broadcast',
      view: 'vehicleAntennaData' as AppView,
      accent: '#2563eb',
      enabled: () => !!md.vehicleAntenna,
    },
    {
      label: '代表破片データ',
      description: '落下分散・Ec解析の入力となる代表破片 (質量・断面積・抗力係数)',
      icon: 'hexagon',
      view: 'debrisMaster' as AppView,
      accent: '#b45309',
      enabled: () => !!md.debrisData,
    },
    {
      label: '機体形状データ',
      description: '全長・直径・段数・ノーズ形状など、運用で参照する機体形状',
      icon: 'rulers',
      view: 'shapeMaster' as AppView,
      accent: '#7c3aed',
      enabled: () => !!md.rocketShapeData,
    },
    {
      label: '空力係数データ',
      description: 'マッハ数ごとの抗力係数 Cd・揚力傾斜 (設計版で確定した値を参照)',
      icon: 'wind',
      view: 'aeroCoeffMaster' as AppView,
      accent: '#0d9488',
      enabled: () => !!md.aeroCoeffData,
    },
    {
      label: '推進系データ',
      description: '各段エンジンの推力・比推力・燃焼時間など推進系の代表諸元',
      icon: 'fire',
      view: 'propulsionMaster' as AppView,
      accent: '#dc2626',
      enabled: () => !!md.propulsionData,
    },
    {
      label: '風データ',
      description: '射場上空の高度別 風速・風向プロファイル (飛行・分散・荷重の入力)',
      icon: 'tornado',
      view: 'windMaster' as AppView,
      accent: '#0284c7',
      enabled: () => !!md.windData,
    },
    {
      label: '故障率データ',
      description: 'サブシステム別の故障率・故障モード (Pi/Ec・飛行安全解析の入力)',
      icon: 'exclamation-triangle',
      view: 'failureRateMaster' as AppView,
      accent: '#d97706',
      enabled: () => !!md.failureRateData,
    },
  ].filter((c) => c.enabled());

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="page-title">
          <i className="bi bi-archive me-2 text-primary" />
          マスタデータ
        </h1>
        <small className="text-muted">プロジェクト横断で参照するマスタ情報を管理</small>
      </div>

      <div className="row g-3">
        {cards.map((c) => (
          <div key={c.view} className="col-md-6 col-lg-4">
            <button
              className="card h-100 p-0 text-start w-100"
              style={{
                borderLeft: `4px solid ${c.accent ?? '#0d6efd'}`,
                cursor: 'pointer',
                background: '#fff',
                transition: 'box-shadow 0.15s, transform 0.1s',
              }}
              onClick={() => navigate(c.view)}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '';
                e.currentTarget.style.transform = '';
              }}
            >
              <div className="card-body p-3">
                <div className="d-flex align-items-start gap-3">
                  <div
                    className="d-flex align-items-center justify-content-center"
                    style={{
                      width: 44, height: 44, borderRadius: 8,
                      background: `${c.accent ?? '#0d6efd'}18`,
                      color: c.accent ?? '#0d6efd',
                      flexShrink: 0,
                    }}
                  >
                    <i className={`bi bi-${c.icon}`} style={{ fontSize: 22 }} />
                  </div>
                  <div className="flex-grow-1" style={{ minWidth: 0 }}>
                    <div className="fw-semibold mb-1" style={{ fontSize: '0.95rem' }}>{c.label}</div>
                    <div className="text-muted" style={{ fontSize: '0.78rem', lineHeight: 1.4 }}>
                      {c.description}
                    </div>
                  </div>
                  <i className="bi bi-arrow-right text-muted" style={{ fontSize: 14 }} />
                </div>
              </div>
            </button>
          </div>
        ))}
        {cards.length === 0 && (
          <div className="col-12">
            <div className="card p-4 text-center text-muted">
              <i className="bi bi-archive fs-1 d-block mb-2 opacity-25" />
              <div>表示できるマスタデータがありません。featureFlags の設定を確認してください。</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
