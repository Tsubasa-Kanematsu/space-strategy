import React from 'react';
import { useAppStore } from '../../stores/appStore';
import { useFlags } from '../../stores/featureFlagsStore';
import { SERVICE_META, ALL_SERVICES } from './analysisServiceMeta';
import { ExternalToolsPanel } from './ExternalToolsPanel';
import type { AnalysisServiceType, AppView } from '../../types';

/**
 * 解析ハブ: 各解析サービス + サイジング + カスタム解析 + 解析フロー を
 * カード並びで一覧表示。クリックで各画面へ遷移する。
 *
 * サイドバーの「解析」 1 アイテムからここに来る形に統一して、
 * 個別サービスをサイドバーに並べる以前のレイアウトを置き換える。
 */

type HubCard = {
  label: string;
  description: string;
  icon: string;
  /** カードクリックで navigate するパラメータ */
  view: AppView;
  /** 解析サービス種別 (analysisCases 遷移時に渡す) */
  service?: AnalysisServiceType;
  /** カードの強調色 (左ボーダー) */
  accent?: string;
  /** Feature flag で非表示にするか判定する関数 (true = 表示) */
  enabled: () => boolean;
};

export const AnalysisHub: React.FC = () => {
  // プロジェクトはハブでは扱わない (各解析の設定モーダル/画面で選ぶ)
  const { navigate } = useAppStore();
  const FEATURE_FLAGS = useFlags();

  // 「解析フロー」はトップに別枠でフルワイド表示する特別カード (個別解析を組み合わせる上位概念)
  const flowCard: HubCard = {
    label: '解析フロー',
    description: '複数の解析を組み合わせてパイプラインとして定義・実行する。各解析の前後関係や並列性を管理',
    icon: 'diagram-3',
    view: 'analysisFlow' as AppView,
    accent: '#0891b2',
    enabled: () => true,
  };

  // 個別解析カード (グリッド表示)
  const cards: HubCard[] = [
    // サイジング (専用)
    {
      label: 'サイジング',
      description: 'ロケット段サイジング (ΔV / 構造効率 / Isp) を解いて質量配分を決める',
      icon: 'calculator',
      view: 'sizingCases' as AppView,
      accent: '#7c3aed',
      enabled: () => !!FEATURE_FLAGS.sizing,
    },
    // 各解析サービス
    ...ALL_SERVICES.map((s): HubCard => {
      const meta = SERVICE_META[s];
      return {
        label: meta.label,
        description: `${meta.label} ケースを管理`,
        icon: meta.icon,
        view: 'analysisCases' as AppView,
        service: s,
        accent: '#2563eb',
        enabled: () => !!FEATURE_FLAGS.analysis[s],
      };
    }),
    // カスタム解析 (プラグイン)
    {
      label: 'カスタム解析',
      description: 'JS/Py プラグインで機体固有の解析を追加・実行',
      icon: 'puzzle',
      view: 'pluginCases' as AppView,
      accent: '#db2777',
      enabled: () => true,
    },
  ].filter((c) => c.enabled());

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="page-title">
          <i className="bi bi-cpu me-2 text-primary" />解析
        </h1>
        <small className="text-muted">カードを選んで各解析を開く</small>
      </div>

      {/* トップ別枠: 解析フロー (個別解析を組み合わせるパイプライン) */}
      <button
        className="card p-0 text-start w-100 mb-4"
        style={{
          borderLeft: `4px solid ${flowCard.accent}`,
          background: `linear-gradient(135deg, ${flowCard.accent}10 0%, ${flowCard.accent}05 100%)`,
          cursor: 'pointer',
        }}
        onClick={() => navigate(flowCard.view)}
        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = ''; }}
      >
        <div className="card-body p-3">
          <div className="d-flex align-items-center gap-3">
            <div
              className="d-flex align-items-center justify-content-center"
              style={{
                width: 56, height: 56, borderRadius: 10,
                background: flowCard.accent, color: '#fff', flexShrink: 0,
              }}
            >
              <i className={`bi bi-${flowCard.icon}`} style={{ fontSize: 28 }} />
            </div>
            <div className="flex-grow-1" style={{ minWidth: 0 }}>
              <div className="d-flex align-items-center gap-2 mb-1">
                <span className="fw-semibold" style={{ fontSize: '1.05rem' }}>{flowCard.label}</span>
                <span className="badge bg-info-subtle text-info" style={{ fontSize: '0.65rem' }}>パイプライン</span>
              </div>
              <div className="text-muted" style={{ fontSize: '0.82rem', lineHeight: 1.4 }}>
                {flowCard.description}
              </div>
            </div>
            <i className="bi bi-arrow-right text-muted" style={{ fontSize: 18 }} />
          </div>
        </div>
      </button>

      {/* 個別解析セクション ラベル */}
      <div className="d-flex align-items-center gap-2 mb-2 mt-2">
        <i className="bi bi-grid-3x3-gap text-muted" />
        <span className="text-muted fw-semibold" style={{ fontSize: '0.85rem' }}>個別解析</span>
        <div className="flex-grow-1" style={{ borderTop: '1px solid #dee2e6' }} />
      </div>

      <div className="row g-3">
        {cards.map((c) => (
          <div key={`${c.view}-${c.service ?? 'main'}`} className="col-md-6 col-lg-4">
            <button
              className="card h-100 p-0 text-start w-100"
              style={{
                borderLeft: `4px solid ${c.accent ?? '#0d6efd'}`,
                cursor: 'pointer',
                background: '#fff',
                transition: 'box-shadow 0.15s, transform 0.1s',
              }}
              onClick={() => navigate(c.view, c.service ? { analysisService: c.service } : {})}
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
              <i className="bi bi-cpu fs-1 d-block mb-2 opacity-25" />
              <div>表示できる解析がありません。featureFlags の設定を確認してください。</div>
            </div>
          </div>
        )}
      </div>

      {/* 外部解析ツール連携セクション (ALMA/MONACO 等 → 入力API → 標準化API) */}
      <div className="d-flex align-items-center gap-2 mb-2 mt-4">
        <i className="bi bi-plug text-muted" />
        <span className="text-muted fw-semibold" style={{ fontSize: '0.85rem' }}>外部ツール連携</span>
        <div className="flex-grow-1" style={{ borderTop: '1px solid #dee2e6' }} />
      </div>
      <ExternalToolsPanel />
    </div>
  );
};
