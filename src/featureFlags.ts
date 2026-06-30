import type { AnalysisServiceType } from './types';

/**
 * フィーチャーフラグ（運用版 / space-strategy）
 *
 * 運用フェーズ向けに、設計解析（サイジング・空力）を非表示にし、
 * 運用に必要な 11 解析のみを有効化している。
 * 空力・形状データ自体は「マスタデータ」として保持・参照する。
 */
export const FEATURE_FLAGS = {

  // ── ナビゲーション ──────────────────────────────────────────────────────────
  /** プロジェクト管理画面（号機一覧テーブル） */
  project: true,

  /** 申請書（打ち上げ許可申請）セクション */
  applications: true,

  // ── 解析 ────────────────────────────────────────────────────────────────────
  /** サイジング解析（運用版では非表示。データはマスタへ） */
  sizing: false,

  /** 解析サービス（運用向け 11 種を有効化、空力は非表示） */
  analysis: {
    aeroAnalysis: false,    // 空力解析（運用版では非表示、データはマスタへ）
    flightAnalysis: true,   // 飛行解析
    dispersedFlight: true,  // 分散飛行経路解析
    loadAnalysis: true,     // 荷重解析
    shipHazard: true,       // 海上船舶危険解析
    piEc: true,             // Pi/Ec解析
    debrisImpact: true,     // 投棄物落下域解析
    rfLink: true,           // RFリンク解析
    ablation: true,         // 溶融解析
    orbitLifetime: true,    // 軌道上寿命解析
    pathRotationRate: true, // 経路回転率解析
    gnssSatellite: true,    // 測位衛星通信解析
  } satisfies Record<AnalysisServiceType, boolean>,

  // ── データベース（号機に紐づくデータ） ────────────────────────────────────────
  db: {
    massModel: true,        // コンポーネント構成（質量/重心/慣性/材質）
    parameters: false,      // パラメータ（DBからは削除）
    rocketShapeData: false, // 空力形状（DBからは削除。形状はマスタで管理）
    propulsionData: false,  // 推進系（DBからは削除。推進系はマスタで管理）
    debrisShapeData: false, // 破片形状（DBからは削除）
    errorSourceData: true,  // 誤差源
  },

  // ── プロジェクト詳細タブ ──────────────────────────────────────────────────────
  projectTabs: {
    traceability: false,  // 解析トレーサビリティ タブ
    analysisFlow: false,  // 解析フロー タブ
  },

  // ── マスタデータ ─────────────────────────────────────────────────────────────
  masterData: {
    groundAntenna: true,      // 地上局アンテナデータ
    vehicleAntenna: true,     // 機体アンテナデータ
    debrisData: true,         // 代表破片データ
    rocketShapeData: true,    // 機体形状データ（解析UI削除分を保持）
    aeroCoeffData: true,      // 空力係数データ（解析UI削除分を保持）
    propulsionData: true,     // 推進系データ
    windData: true,           // 風データ
    failureRateData: true,    // 故障率データ
  },
};
