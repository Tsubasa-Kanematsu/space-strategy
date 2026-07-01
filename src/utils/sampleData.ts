/**
 * デモ用サンプルデータ
 *
 * プロジェクト: LV-Alpha 打上実証プロジェクト（1プロジェクト）
 * ロケット: 2段式液体推進ロケット（LOX/RP-1）/ ペイロード ~52 kg / 高度 ~110 km
 *
 * 設計変遷ツリー（分岐あり）:
 *   概念設計・液体推進 基本案
 *   ├── 使い捨て型・LOX/RP-1           ← サイジング#1（使い捨て ΔV検討）
 *   │   ├── 使い捨て型・Isp改良エンジン ← サイジング#2（Isp改良型）
 *   │   │   └── 使い捨て型・最終設計確定 ← サイジング#3（全解析・有効バージョン）
 *   │   └── 使い捨て型・軽量タンク型    ← サイジング#B（CFRP軽量化・凍結）
 *   └── 再使用型・LOX/RP-1 (1段回収)   ← サイジング#A（再使用検討・凍結）
 *
 * 解析: 全11サービス（使い捨て型・最終設計確定 を基準DB・有効バージョン）
 */

import { useProjectStore } from '../stores/projectStore';
import { useMassCaseStore } from '../stores/massCaseStore';
import { useSizingStore } from '../stores/sizingStore';
import { useAnalysisStore } from '../stores/analysisStore';
import { useMasterDataStore } from '../stores/masterDataStore';
import { useVehicleUnitStore } from '../stores/vehicleUnitStore';
import { useApplicationStore } from '../stores/applicationStore';
import { buildApplicationData } from './applicationGen';
import type { AnalysisServiceType } from '../types';

// 運用向け 11 解析（空力・サイジングを除く）
const OPERATIONAL_SERVICES: AnalysisServiceType[] = [
  'flightAnalysis', 'dispersedFlight', 'loadAnalysis', 'shipHazard', 'piEc',
  'debrisImpact', 'rfLink', 'ablation', 'orbitLifetime', 'pathRotationRate', 'gnssSatellite',
];

export function loadSampleData(): void {
  const projectStore  = useProjectStore.getState();
  const massStore     = useMassCaseStore.getState();
  const sizingStore   = useSizingStore.getState();
  const analysisStore = useAnalysisStore.getState();
  const masterStore   = useMasterDataStore.getState();
  const unitStore     = useVehicleUnitStore.getState();
  const appStore      = useApplicationStore.getState();

  // 解析結果一括登録ヘルパー
  const addResults = (caseId: string, rows: [string, string, string, string][]) => {
    rows.forEach(([label, value, unit, notes]) => {
      analysisStore.addResult({ analysisCaseId: caseId, label, value, unit, notes });
    });
  };

  // ════════════════════════════════════════
  // プロジェクト（1つのみ）
  // ════════════════════════════════════════
  const project = projectStore.addProject({
    name: 'LV-Alpha 打上実証プロジェクト',
    memo: '2段式液体推進ロケット（LOX/RP-1）。ペイロード ~52 kg を高度 ~110 km へ投入。\n使い捨て型と再使用型（1段回収）を比較検討後、使い捨て型・Isp改良エンジンを採用。',
    createdBy: '山田 太郎',
  });
  const pid = project.id;

  // ════════════════════════════════════════
  // 概念設計・液体推進 基本案 — 初期コンセプト
  // 推進方式: LOX/RP-1 2段式。再使用有無・エンジン仕様未確定。
  // ════════════════════════════════════════
  const mcA = massStore.addCase({
    projectId: pid,
    name: '概念設計・液体推進 基本案',
    memo: '概念設計初期値。LOX/RP-1 2段式。再使用有無・エンジン仕様未確定。質量余裕20%込み。',
    createdBy: '山田 太郎',
  });
  const aId = mcA.id;

  // ── 全機（ルート）
  const aAll = massStore.addComponent({
    massCaseId: aId, parentId: null,
    paramName: '全機', varName: 'm_total',
    level: 0, stage: 'all', inputType: 'aggregate',
    valueOrFormula: '', order: 0,
    allocatedMass: 5200, actualMass: null, actualMassEvidence: '', diff: null,
  });

  // ── ペイロード
  const aPL = massStore.addComponent({
    massCaseId: aId, parentId: aAll.id,
    paramName: 'ペイロード', varName: 'm_pl',
    level: 1, stage: 'payload', inputType: 'aggregate',
    valueOrFormula: '', order: 0,
    allocatedMass: 60, actualMass: null, actualMassEvidence: '', diff: null,
  });
  massStore.addComponent({
    massCaseId: aId, parentId: aPL.id,
    paramName: '衛星本体', varName: 'm_sat',
    level: 2, stage: 'payload', inputType: 'fixed',
    valueOrFormula: '45', order: 0,
    allocatedMass: 45, actualMass: null, actualMassEvidence: '', diff: null,
  });
  massStore.addComponent({
    massCaseId: aId, parentId: aPL.id,
    paramName: 'ペイロードアダプタ', varName: 'm_pla',
    level: 2, stage: 'payload', inputType: 'fixed',
    valueOrFormula: '15', order: 1,
    allocatedMass: 15, actualMass: null, actualMassEvidence: '', diff: null,
  });

  // ── 2段機体（LOX/RP-1 2段エンジン）
  const aS2 = massStore.addComponent({
    massCaseId: aId, parentId: aAll.id,
    paramName: '2段機体', varName: 'm_s2',
    level: 1, stage: 'stage2', inputType: 'aggregate',
    valueOrFormula: '', order: 1,
    allocatedMass: 980, actualMass: null, actualMassEvidence: '', diff: null,
  });
  const aS2Motor = massStore.addComponent({
    massCaseId: aId, parentId: aS2.id,
    paramName: '2段エンジンユニット', varName: 'm_s2_motor',
    level: 2, stage: 'stage2', inputType: 'aggregate',
    valueOrFormula: '', order: 0,
    allocatedMass: 780, actualMass: null, actualMassEvidence: '', diff: null,
  });
  massStore.addComponent({
    massCaseId: aId, parentId: aS2Motor.id,
    paramName: '2段推進剤（LOX+RP-1）', varName: 'm_s2_prop',
    level: 3, stage: 'stage2', inputType: 'fixed',
    valueOrFormula: '700', order: 0,
    allocatedMass: 700, actualMass: null, actualMassEvidence: '', diff: null,
  });
  massStore.addComponent({
    massCaseId: aId, parentId: aS2Motor.id,
    paramName: '2段エンジン（Vac-E相当）', varName: 'm_s2_case',
    level: 3, stage: 'stage2', inputType: 'fixed',
    valueOrFormula: '45', order: 1,
    allocatedMass: 45, actualMass: null, actualMassEvidence: '', diff: null,
  });
  massStore.addComponent({
    massCaseId: aId, parentId: aS2Motor.id,
    paramName: '2段ノズル延長部', varName: 'm_s2_nozzle',
    level: 3, stage: 'stage2', inputType: 'fixed',
    valueOrFormula: '35', order: 2,
    allocatedMass: 35, actualMass: null, actualMassEvidence: '', diff: null,
  });
  const aS2Str = massStore.addComponent({
    massCaseId: aId, parentId: aS2.id,
    paramName: '2段構体', varName: 'm_s2_str',
    level: 2, stage: 'stage2', inputType: 'aggregate',
    valueOrFormula: '', order: 1,
    allocatedMass: 200, actualMass: null, actualMassEvidence: '', diff: null,
  });
  massStore.addComponent({
    massCaseId: aId, parentId: aS2Str.id,
    paramName: '2段タンク（LOX/RP-1）', varName: 'm_s2_tube',
    level: 3, stage: 'stage2', inputType: 'fixed',
    valueOrFormula: '95', order: 0,
    allocatedMass: 95, actualMass: null, actualMassEvidence: '', diff: null,
  });
  massStore.addComponent({
    massCaseId: aId, parentId: aS2Str.id,
    paramName: '2段アビオニクス', varName: 'm_s2_avionics',
    level: 3, stage: 'stage2', inputType: 'fixed',
    valueOrFormula: '60', order: 1,
    allocatedMass: 60, actualMass: null, actualMassEvidence: '', diff: null,
    errorSources: [
      { id: 'es-s2-1', errorType: '加速度計バイアス', axis: 'X', value3sigma: 0.04, unit: 'm/s²', note: 'MEMS 6軸 IMU' },
      { id: 'es-s2-2', errorType: 'ジャイロドリフト', axis: '全軸', value3sigma: 0.6, unit: 'deg/s', note: 'RLG' },
    ],
  });
  massStore.addComponent({
    massCaseId: aId, parentId: aS2Str.id,
    paramName: 'フェアリング', varName: 'm_s2_fairing',
    level: 3, stage: 'stage2', inputType: 'fixed',
    valueOrFormula: '45', order: 2,
    allocatedMass: 45, actualMass: null, actualMassEvidence: '', diff: null,
  });

  // ── 1段機体（LOX/RP-1 1段エンジン×9）
  const aS1 = massStore.addComponent({
    massCaseId: aId, parentId: aAll.id,
    paramName: '1段機体', varName: 'm_s1',
    level: 1, stage: 'stage1', inputType: 'aggregate',
    valueOrFormula: '', order: 2,
    allocatedMass: 4160, actualMass: null, actualMassEvidence: '', diff: null,
  });
  const aS1Motor = massStore.addComponent({
    massCaseId: aId, parentId: aS1.id,
    paramName: '1段エンジンユニット', varName: 'm_s1_motor',
    level: 2, stage: 'stage1', inputType: 'aggregate',
    valueOrFormula: '', order: 0,
    allocatedMass: 3720, actualMass: null, actualMassEvidence: '', diff: null,
  });
  massStore.addComponent({
    massCaseId: aId, parentId: aS1Motor.id,
    paramName: '1段推進剤（LOX+RP-1）', varName: 'm_s1_prop',
    level: 3, stage: 'stage1', inputType: 'fixed',
    valueOrFormula: '3420', order: 0,
    allocatedMass: 3420, actualMass: null, actualMassEvidence: '', diff: null,
  });
  massStore.addComponent({
    massCaseId: aId, parentId: aS1Motor.id,
    paramName: '1段エンジン×9（Merlin-1D相当）', varName: 'm_s1_case',
    level: 3, stage: 'stage1', inputType: 'fixed',
    valueOrFormula: '205', order: 1,
    allocatedMass: 205, actualMass: null, actualMassEvidence: '', diff: null,
  });
  massStore.addComponent({
    massCaseId: aId, parentId: aS1Motor.id,
    paramName: '1段ターボポンプ/配管', varName: 'm_s1_nozzle',
    level: 3, stage: 'stage1', inputType: 'fixed',
    valueOrFormula: '95', order: 2,
    allocatedMass: 95, actualMass: null, actualMassEvidence: '', diff: null,
  });
  const aS1Str = massStore.addComponent({
    massCaseId: aId, parentId: aS1.id,
    paramName: '1段構体', varName: 'm_s1_str',
    level: 2, stage: 'stage1', inputType: 'aggregate',
    valueOrFormula: '', order: 1,
    allocatedMass: 440, actualMass: null, actualMassEvidence: '', diff: null,
  });
  massStore.addComponent({
    massCaseId: aId, parentId: aS1Str.id,
    paramName: '1段タンク（LOX/RP-1）', varName: 'm_s1_tube',
    level: 3, stage: 'stage1', inputType: 'fixed',
    valueOrFormula: '210', order: 0,
    allocatedMass: 210, actualMass: null, actualMassEvidence: '', diff: null,
  });
  massStore.addComponent({
    massCaseId: aId, parentId: aS1Str.id,
    paramName: 'グリッドフィン×4', varName: 'm_s1_fin',
    level: 3, stage: 'stage1', inputType: 'fixed',
    valueOrFormula: '80', order: 1,
    allocatedMass: 80, actualMass: null, actualMassEvidence: '', diff: null,
    debrisShapeType: 'flat_plate', debrisCharLength: 0.5, debrisArea: 0.18,
  });
  massStore.addComponent({
    massCaseId: aId, parentId: aS1Str.id,
    paramName: 'インタステージ', varName: 'm_interstage',
    level: 3, stage: 'stage1', inputType: 'fixed',
    valueOrFormula: '80', order: 2,
    allocatedMass: 80, actualMass: null, actualMassEvidence: '', diff: null,
  });
  massStore.addComponent({
    massCaseId: aId, parentId: aS1Str.id,
    paramName: '1段アビオニクス', varName: 'm_s1_avionics',
    level: 3, stage: 'stage1', inputType: 'fixed',
    valueOrFormula: '70', order: 3,
    allocatedMass: 70, actualMass: null, actualMassEvidence: '', diff: null,
    errorSources: [
      { id: 'es-s1-1', errorType: '加速度計スケールファクタ誤差', axis: 'X', value3sigma: 0.001, unit: '', note: '無次元' },
      { id: 'es-s1-2', errorType: 'ジャイロバイアス', axis: 'Y', value3sigma: 0.5, unit: 'deg/s', note: '' },
      { id: 'es-s1-3', errorType: 'IMU取付角度誤差', axis: '全軸', value3sigma: 0.1, unit: 'deg', note: '設計誤差' },
    ],
  });

  // ════════════════════════════════════════
  // サイジング #1 — 使い捨て型 ΔV スイープ
  // ベース: 概念設計 / Isp: 1段295s, 2段345s (LOX/RP-1) / PL: 50 kg
  // ════════════════════════════════════════
  const sc1 = sizingStore.addCase({
    projectId: pid, massCaseId: aId,
    name: 'サイジング #1（使い捨て型 ΔV検討）',
    memo: 'ΔV スイープ 8000〜9000 m/s。使い捨て型 LOX/RP-1。Isp: 1段295s / 2段345s。ペイロード50 kg。',
    createdBy: '鈴木 花子',
  });

  const aComps = massStore.getComponentsForCase(aId);
  const findA = (v: string) => aComps.find((c) => c.varName === v);

  const makeMasses1 = (mp1: number, mp2: number) => {
    const e: { componentId: string; mass: number }[] = [];
    const p1 = findA('m_s1_prop'); if (p1) e.push({ componentId: p1.id, mass: mp1 });
    const c1 = findA('m_s1_case'); if (c1) e.push({ componentId: c1.id, mass: Math.round(mp1 * 0.060) });
    const p2 = findA('m_s2_prop'); if (p2) e.push({ componentId: p2.id, mass: mp2 });
    const c2 = findA('m_s2_case'); if (c2) e.push({ componentId: c2.id, mass: Math.round(mp2 * 0.064) });
    return e;
  };

  const cond1 = {
    numStages: 2, payloadMass: 50, deltaV: 8500,
    deltaVParaSta: { enabled: true, min: 8000, max: 9000, step: 250 },
    ispPerStage: [295, 345],
    ispParaSta: [
      { enabled: false, min: 285, max: 305, step: 5 },
      { enabled: false, min: 335, max: 355, step: 5 },
    ],
    variableParams: [],
  };

  sizingStore.addResult(sc1.id, { ...cond1, deltaV: 8000 }, {
    totalMass: 3820, grossPayloadRatio: 50 / 3820,
    propellantMassPerStage: [2680, 582],
    propellantRatioPerStage: [0.824, 0.768],
    structuralEfficiencyPerStage: [0.042, 0.052],
    componentMasses: makeMasses1(2680, 582),
  });
  sizingStore.addResult(sc1.id, { ...cond1, deltaV: 8500 }, {  // ← 使い捨て型 採用
    totalMass: 4180, grossPayloadRatio: 50 / 4180,
    propellantMassPerStage: [2960, 645],
    propellantRatioPerStage: [0.830, 0.777],
    structuralEfficiencyPerStage: [0.040, 0.050],
    componentMasses: makeMasses1(2960, 645),
  });
  sizingStore.addResult(sc1.id, { ...cond1, deltaV: 8750 }, {
    totalMass: 4440, grossPayloadRatio: 50 / 4440,
    propellantMassPerStage: [3145, 684],
    propellantRatioPerStage: [0.834, 0.782],
    structuralEfficiencyPerStage: [0.038, 0.048],
    componentMasses: makeMasses1(3145, 684),
  });
  sizingStore.addResult(sc1.id, { ...cond1, deltaV: 9000 }, {
    totalMass: 4720, grossPayloadRatio: 50 / 4720,
    propellantMassPerStage: [3345, 726],
    propellantRatioPerStage: [0.837, 0.785],
    structuralEfficiencyPerStage: [0.037, 0.046],
    componentMasses: makeMasses1(3345, 726),
  });

  // 使い捨て型 = サイジング #1 No.2 (ΔV=8500) 反映
  const sc1R2 = sizingStore.getResultsForCase(sc1.id).find((r) => r.no === 2)!;
  const mcB = massStore.copyCaseAndApply(aId, sc1R2.componentMasses, sc1R2.id, '使い捨て型・LOX/RP-1');
  if (mcB) {
    massStore.updateCase(mcB.id, {
      memo: 'サイジング#1 No.2 (ΔV=8500 m/s) 反映。使い捨て型 LOX/RP-1 基本設計。詳細設計フェーズ移行。',
    });
    const bComps = massStore.getComponentsForCase(mcB.id);
    const findB = (v: string) => bComps.find((c) => c.varName === v);

    const bSat = findB('m_sat');
    if (bSat) massStore.updateComponent(bSat.id, {
      actualMass: 41.2, actualMassEvidence: '衛星メーカ提出質量報告書 (2024-06-10)',
      materialName: 'CFRP積層準等方', materialDensity: 1540,
    });
    const bPla = findB('m_pla');
    if (bPla) massStore.updateComponent(bPla.id, {
      actualMass: 10.8, actualMassEvidence: '設計計算値（構造解析承認済）',
      materialName: 'Al6061-T6', materialDensity: 2700, materialYoungModulus: 68.9,
    });
    const bEng2 = findB('m_s2_case');
    if (bEng2) massStore.updateComponent(bEng2.id, {
      materialName: 'SUS316L', materialDensity: 7980,
    });
    const bEng1 = findB('m_s1_case');
    if (bEng1) massStore.updateComponent(bEng1.id, {
      materialName: 'SUS316L', materialDensity: 7980,
    });
    const bTank2 = findB('m_s2_tube');
    if (bTank2) massStore.updateComponent(bTank2.id, {
      materialName: 'Al2219-T87', materialDensity: 2840, materialYoungModulus: 73.8,
    });
    const bTank1 = findB('m_s1_tube');
    if (bTank1) massStore.updateComponent(bTank1.id, {
      materialName: 'Al2219-T87', materialDensity: 2840, materialYoungModulus: 73.8,
    });
  }

  // ════════════════════════════════════════
  // サイジング #A — 再使用型（1段回収）検討（凍結）
  // ベース: 概念設計 / 1段着陸回収。着陸脚・推進剤余裕込みで全機質量増大。
  // ════════════════════════════════════════
  const scReuse = sizingStore.addCase({
    projectId: pid, massCaseId: aId,
    name: 'サイジング #A（再使用型 1段回収検討）',
    memo: '1段垂直着陸回収案。着陸脚・グリッドフィン追加 (+250 kg)、着陸用推進剤余裕 (+5%)。ペイロード能力低下とコスト削減効果を比較。技術成熟度・開発期間から使い捨て型を優先。本案凍結。',
    createdBy: '田中 次郎',
  });

  const makeMassesReuse = (mp1: number, mp2: number) => {
    const e: { componentId: string; mass: number }[] = [];
    const p1 = findA('m_s1_prop'); if (p1) e.push({ componentId: p1.id, mass: mp1 });
    // 再使用型: エンジン質量 = 推進剤の8%（着陸脚・グリッドフィン・推進剤余裕込み）
    const c1 = findA('m_s1_case'); if (c1) e.push({ componentId: c1.id, mass: Math.round(mp1 * 0.080) });
    const p2 = findA('m_s2_prop'); if (p2) e.push({ componentId: p2.id, mass: mp2 });
    const c2 = findA('m_s2_case'); if (c2) e.push({ componentId: c2.id, mass: Math.round(mp2 * 0.064) });
    return e;
  };

  const condReuse = {
    numStages: 2, payloadMass: 50, deltaV: 8500,
    deltaVParaSta: { enabled: true, min: 8000, max: 9000, step: 250 },
    ispPerStage: [295, 345],
    ispParaSta: [
      { enabled: false, min: 285, max: 305, step: 5 },
      { enabled: false, min: 335, max: 355, step: 5 },
    ],
    variableParams: [],
  };

  sizingStore.addResult(scReuse.id, { ...condReuse, deltaV: 8000 }, {
    totalMass: 4120, grossPayloadRatio: 50 / 4120,
    propellantMassPerStage: [2780, 582],
    propellantRatioPerStage: [0.807, 0.768],
    structuralEfficiencyPerStage: [0.055, 0.052],
    componentMasses: makeMassesReuse(2780, 582),
  });
  sizingStore.addResult(scReuse.id, { ...condReuse, deltaV: 8500 }, {
    totalMass: 4530, grossPayloadRatio: 50 / 4530,
    propellantMassPerStage: [3060, 645],
    propellantRatioPerStage: [0.814, 0.777],
    structuralEfficiencyPerStage: [0.053, 0.050],
    componentMasses: makeMassesReuse(3060, 645),
  });
  sizingStore.addResult(scReuse.id, { ...condReuse, deltaV: 9000 }, {
    totalMass: 5110, grossPayloadRatio: 50 / 5110,
    propellantMassPerStage: [3465, 726],
    propellantRatioPerStage: [0.820, 0.785],
    structuralEfficiencyPerStage: [0.050, 0.046],
    componentMasses: makeMassesReuse(3465, 726),
  });

  // 再使用型 = サイジング #A No.2 (ΔV=8500) 反映
  const scReuseR2 = sizingStore.getResultsForCase(scReuse.id).find((r) => r.no === 2)!;
  const mcReuse = massStore.copyCaseAndApply(aId, scReuseR2.componentMasses, scReuseR2.id, '再使用型・LOX/RP-1（1段回収）');
  if (mcReuse) {
    massStore.updateCase(mcReuse.id, {
      memo: 'サイジング#A No.2 反映。1段垂直着陸回収案。全機4530 kg（使い捨て比+350 kg）。技術成熟度・開発期間リスクから使い捨て型を最終選定。本案凍結。',
    });
    const rComps = massStore.getComponentsForCase(mcReuse.id);
    const findR = (v: string) => rComps.find((c) => c.varName === v);
    const rFin = findR('m_s1_fin');
    if (rFin) massStore.updateComponent(rFin.id, {
      paramName: 'グリッドフィン×4（着陸制御用）',
      materialName: 'Al7075-T6', materialDensity: 2810, materialYoungModulus: 71.7,
      debrisShapeType: 'flat_plate', debrisCharLength: 0.6, debrisArea: 0.25,
    });
    const rTank1 = findR('m_s1_tube');
    if (rTank1) massStore.updateComponent(rTank1.id, {
      materialName: 'Al2219-T87', materialDensity: 2840, materialYoungModulus: 73.8,
    });
  }

  // ════════════════════════════════════════
  // サイジング #2 — 使い捨て型 Isp改良エンジン検討
  // ベース: 使い捨て型 / Isp: 1段310s, 2段360s (改良型エンジン) / PL: 50 kg
  // ════════════════════════════════════════
  const bId = mcB?.id ?? aId;
  const sc2 = sizingStore.addCase({
    projectId: pid, massCaseId: bId,
    name: 'サイジング #2（Isp改良エンジン検討）',
    memo: 'LOX/RP-1 改良型エンジン採用案。Isp: 1段295→310s, 2段345→360s。推進剤質量削減・全機軽量化を確認。',
    createdBy: '鈴木 花子',
  });

  const bComps = massStore.getComponentsForCase(bId);
  const findB2 = (v: string) => bComps.find((c) => c.varName === v);

  const makeMasses2 = (mp1: number, mp2: number) => {
    const e: { componentId: string; mass: number }[] = [];
    const p1 = findB2('m_s1_prop'); if (p1) e.push({ componentId: p1.id, mass: mp1 });
    const c1 = findB2('m_s1_case'); if (c1) e.push({ componentId: c1.id, mass: Math.round(mp1 * 0.060) });
    const p2 = findB2('m_s2_prop'); if (p2) e.push({ componentId: p2.id, mass: mp2 });
    const c2 = findB2('m_s2_case'); if (c2) e.push({ componentId: c2.id, mass: Math.round(mp2 * 0.064) });
    return e;
  };

  const cond2 = {
    numStages: 2, payloadMass: 50, deltaV: 8500,
    deltaVParaSta: { enabled: true, min: 8000, max: 9000, step: 250 },
    ispPerStage: [310, 360],
    ispParaSta: [
      { enabled: false, min: 300, max: 320, step: 5 },
      { enabled: false, min: 350, max: 370, step: 5 },
    ],
    variableParams: [],
  };

  sizingStore.addResult(sc2.id, { ...cond2, deltaV: 8000 }, {
    totalMass: 3560, grossPayloadRatio: 50 / 3560,
    propellantMassPerStage: [2480, 540],
    propellantRatioPerStage: [0.820, 0.762],
    structuralEfficiencyPerStage: [0.044, 0.054],
    componentMasses: makeMasses2(2480, 540),
  });
  sizingStore.addResult(sc2.id, { ...cond2, deltaV: 8500 }, {  // ← Isp改良エンジン 採用
    totalMass: 3880, grossPayloadRatio: 50 / 3880,
    propellantMassPerStage: [2720, 595],
    propellantRatioPerStage: [0.824, 0.770],
    structuralEfficiencyPerStage: [0.042, 0.052],
    componentMasses: makeMasses2(2720, 595),
  });
  sizingStore.addResult(sc2.id, { ...cond2, deltaV: 9000 }, {
    totalMass: 4320, grossPayloadRatio: 50 / 4320,
    propellantMassPerStage: [3045, 662],
    propellantRatioPerStage: [0.828, 0.778],
    structuralEfficiencyPerStage: [0.040, 0.049],
    componentMasses: makeMasses2(3045, 662),
  });

  // ════════════════════════════════════════
  // サイジング #B — CFRP軽量タンク検討（凍結）
  // ベース: 使い捨て型 / 同Isp + 複合材タンク軽量化
  // ════════════════════════════════════════
  const scLight = sizingStore.addCase({
    projectId: pid, massCaseId: bId,
    name: 'サイジング #B（CFRP軽量タンク検討）',
    memo: 'CFRP複合材タンク採用による機体軽量化案。タンク質量25%削減。製造コスト・LOX適合性課題で採用見送り。本案凍結。',
    createdBy: '田中 次郎',
  });

  const makeMassesLight = (mp1: number, mp2: number) => {
    const e: { componentId: string; mass: number }[] = [];
    const p1 = findB2('m_s1_prop'); if (p1) e.push({ componentId: p1.id, mass: mp1 });
    const c1 = findB2('m_s1_case'); if (c1) e.push({ componentId: c1.id, mass: Math.round(mp1 * 0.050) });
    const p2 = findB2('m_s2_prop'); if (p2) e.push({ componentId: p2.id, mass: mp2 });
    const c2 = findB2('m_s2_case'); if (c2) e.push({ componentId: c2.id, mass: Math.round(mp2 * 0.054) });
    return e;
  };

  sizingStore.addResult(scLight.id, { ...cond2, ispPerStage: [295, 345], deltaV: 8500 }, {
    totalMass: 3950, grossPayloadRatio: 50 / 3950,
    propellantMassPerStage: [2840, 618],
    propellantRatioPerStage: [0.838, 0.786],
    structuralEfficiencyPerStage: [0.033, 0.040],
    componentMasses: makeMassesLight(2840, 618),
  });

  // 軽量タンク型 = サイジング #B No.1 反映（凍結ブランチ）
  const scLightR1 = sizingStore.getResultsForCase(scLight.id)[0];
  const mcLight = massStore.copyCaseAndApply(bId, scLightR1.componentMasses, scLightR1.id, '使い捨て型・軽量タンク型');
  if (mcLight) {
    massStore.updateCase(mcLight.id, {
      memo: 'サイジング#B No.1 反映。CFRP複合材タンク採用案。全機3950 kg（アルミタンク比-230 kg）。LOX適合性・製造コストから金属タンク案を採用。本案凍結。',
    });
    const lightComps = massStore.getComponentsForCase(mcLight.id);
    const findLight = (v: string) => lightComps.find((c) => c.varName === v);
    const lTank1 = findLight('m_s1_tube');
    if (lTank1) massStore.updateComponent(lTank1.id, {
      materialName: 'CFRP/Al ライナー複合材', materialDensity: 1680,
    });
    const lTank2 = findLight('m_s2_tube');
    if (lTank2) massStore.updateComponent(lTank2.id, {
      materialName: 'CFRP/Al ライナー複合材', materialDensity: 1680,
    });
  }

  // ════════════════════════════════════════
  // Isp改良エンジン = サイジング #2 No.2 (ΔV=8500) 反映
  // ════════════════════════════════════════
  const sc2R2 = sizingStore.getResultsForCase(sc2.id).find((r) => r.no === 2)!;
  const mcC = massStore.copyCaseAndApply(bId, sc2R2.componentMasses, sc2R2.id, '使い捨て型・Isp改良エンジン');
  if (mcC) {
    massStore.updateCase(mcC.id, {
      memo: 'サイジング#2 No.2 反映。Isp改良エンジン確定（1段310s/2段360s）。構体・アビオニクスの詳細設計データ取得。',
    });
    const cComps = massStore.getComponentsForCase(mcC.id);
    const findC = (v: string) => cComps.find((c) => c.varName === v);

    const cSat = findC('m_sat');
    if (cSat) massStore.updateComponent(cSat.id, {
      actualMass: 41.2, actualMassEvidence: '衛星メーカ提出質量報告書 (2024-06-10)',
      materialName: 'CFRP積層準等方', materialDensity: 1540,
      cgX: 16.80, cgY: 0.0, cgZ: 0.0,
      ixx: 0.82, iyy: 2.14, izz: 2.14,
    });
    const cPla = findC('m_pla');
    if (cPla) massStore.updateComponent(cPla.id, {
      actualMass: 10.8, actualMassEvidence: '設計計算値（構造解析承認済）',
      materialName: 'Al6061-T6', materialDensity: 2700, materialYoungModulus: 68.9,
      cgX: 15.90, cgY: 0.0, cgZ: 0.0,
    });
    const cTank2 = findC('m_s2_tube');
    if (cTank2) massStore.updateComponent(cTank2.id, {
      actualMass: 88.0, actualMassEvidence: '構造試験品重量実測 (2024-09-15)',
      materialName: 'Al2219-T87', materialDensity: 2840, materialYoungModulus: 73.8,
      cgX: 12.80, cgY: 0.0, cgZ: 0.0,
    });
    const cFairing = findC('m_s2_fairing');
    if (cFairing) massStore.updateComponent(cFairing.id, {
      actualMass: 43.5, actualMassEvidence: '設計計算値（構造解析承認済）',
      materialName: 'CFRP積層準等方', materialDensity: 1540,
      debrisShapeType: 'flat_plate', debrisCharLength: 1.0, debrisArea: 0.5,
      cgX: 14.50, cgY: 0.0, cgZ: 0.0,
    });
    const cTank1 = findC('m_s1_tube');
    if (cTank1) massStore.updateComponent(cTank1.id, {
      actualMass: 198.0, actualMassEvidence: '構造試験品重量実測 (2024-09-20)',
      materialName: 'Al2219-T87', materialDensity: 2840, materialYoungModulus: 73.8,
      cgX: 4.24, cgY: 0.0, cgZ: 0.0,
    });
    const cFin = findC('m_s1_fin');
    if (cFin) massStore.updateComponent(cFin.id, {
      actualMass: 76.0, actualMassEvidence: '設計計算値（FEA確認済）',
      materialName: 'Al7075-T6', materialDensity: 2810,
      debrisShapeType: 'flat_plate', debrisCharLength: 0.5, debrisArea: 0.18,
      cgX: 1.52, cgY: 0.0, cgZ: 0.0,
    });
    const cIS = findC('m_interstage');
    if (cIS) massStore.updateComponent(cIS.id, {
      actualMass: 76.5, actualMassEvidence: '設計計算値（構造解析確認済）',
      materialName: 'CFRP積層準等方', materialDensity: 1540,
      cgX: 9.82, cgY: 0.0, cgZ: 0.0,
    });
  }

  // ════════════════════════════════════════
  // サイジング #3 — 最終設計確定
  // ベース: Isp改良エンジン / Isp: 1段310s, 2段360s / PL: 52 kg（ペイロード実測確定）
  // ════════════════════════════════════════
  const cId = mcC?.id ?? bId;
  const sc3 = sizingStore.addCase({
    projectId: pid, massCaseId: cId,
    name: 'サイジング #3（最終設計確定）',
    memo: 'ペイロード実測確定 (52 kg) に基づく最終サイジング。推進剤量・全機質量を確定。',
    createdBy: '山田 太郎',
  });

  const cComps = massStore.getComponentsForCase(cId);
  const findC3 = (v: string) => cComps.find((c) => c.varName === v);

  const makeMasses3 = (mp1: number, mp2: number) => {
    const e: { componentId: string; mass: number }[] = [];
    const p1 = findC3('m_s1_prop'); if (p1) e.push({ componentId: p1.id, mass: mp1 });
    const c1 = findC3('m_s1_case'); if (c1) e.push({ componentId: c1.id, mass: Math.round(mp1 * 0.060) });
    const p2 = findC3('m_s2_prop'); if (p2) e.push({ componentId: p2.id, mass: mp2 });
    const c2 = findC3('m_s2_case'); if (c2) e.push({ componentId: c2.id, mass: Math.round(mp2 * 0.064) });
    return e;
  };

  const cond3 = {
    numStages: 2, payloadMass: 52, deltaV: 8500,
    deltaVParaSta: { enabled: true, min: 8400, max: 8600, step: 100 },
    ispPerStage: [310, 360],
    ispParaSta: [
      { enabled: false, min: 305, max: 315, step: 5 },
      { enabled: false, min: 355, max: 365, step: 5 },
    ],
    variableParams: [],
  };

  sizingStore.addResult(sc3.id, { ...cond3, deltaV: 8400 }, {
    totalMass: 3920, grossPayloadRatio: 52 / 3920,
    propellantMassPerStage: [2735, 598],
    propellantRatioPerStage: [0.824, 0.770],
    structuralEfficiencyPerStage: [0.042, 0.053],
    componentMasses: makeMasses3(2735, 598),
  });
  sizingStore.addResult(sc3.id, { ...cond3, deltaV: 8500 }, {  // ← 最終確定 採用
    totalMass: 4020, grossPayloadRatio: 52 / 4020,
    propellantMassPerStage: [2810, 615],
    propellantRatioPerStage: [0.825, 0.772],
    structuralEfficiencyPerStage: [0.041, 0.052],
    componentMasses: makeMasses3(2810, 615),
  });
  sizingStore.addResult(sc3.id, { ...cond3, deltaV: 8600 }, {
    totalMass: 4130, grossPayloadRatio: 52 / 4130,
    propellantMassPerStage: [2890, 630],
    propellantRatioPerStage: [0.826, 0.774],
    structuralEfficiencyPerStage: [0.041, 0.051],
    componentMasses: makeMasses3(2890, 630),
  });

  // 最終設計確定 = サイジング #3 No.2 (ΔV=8500, PL=52 kg) 反映
  const sc3R2 = sizingStore.getResultsForCase(sc3.id).find((r) => r.no === 2)!;
  const mcD = massStore.copyCaseAndApply(cId, sc3R2.componentMasses, sc3R2.id, '使い捨て型・最終設計確定');
  if (mcD) {
    massStore.updateCase(mcD.id, {
      memo: 'サイジング#3 No.2 反映。最終設計確定版（Isp改良型・使い捨て）。全コンポーネント実測値取得済み。解析の基準DB。有効バージョン。',
    });
    const findD = (v: string) => useMassCaseStore.getState().components.find((c) => c.massCaseId === mcD.id && c.varName === v);

    // ── ヘルパー: 入力→確認 ワークフロー（正規フロー）
    const inputAndConfirm = (varName: string, value: number, evidence: string, recordedBy: string, confirmedBy: string) => {
      const comp = findD(varName);
      if (!comp) return;
      massStore.addActualMassEntry(comp.id, { value, evidence, recordedBy, status: 'input' });
      const latest = useMassCaseStore.getState().components.find((c) => c.id === comp.id)?.actualMassHistory?.slice(-1)[0];
      if (latest) massStore.confirmActualMassEntry(comp.id, latest.id, confirmedBy);
    };

    // ── ヘルパー: 入力のみ（未確認）
    const inputOnly = (varName: string, value: number, evidence: string, recordedBy: string) => {
      const comp = findD(varName);
      if (!comp) return;
      massStore.addActualMassEntry(comp.id, { value, evidence, recordedBy, status: 'input' });
    };

    // ── 衛星本体: 中間値を入力→確認→最終値を入力→確認（2サイクル）
    const dSat = findD('m_sat');
    if (dSat) {
      massStore.updateComponent(dSat.id, {
        allocatedMass: 43,
        materialName: 'CFRP積層準等方', materialDensity: 1540,
        cgX: 16.85, cgY: 0.01, cgZ: -0.01,
        ixx: 0.82, iyy: 2.14, izz: 2.14, ixy: 0, ixz: 0, iyz: 0,
      });
      // 1回目: 中間報告値（搭載機器一部未搭載）→ 確認
      massStore.addActualMassEntry(dSat.id, {
        value: 42.8, evidence: '衛星メーカ中間報告書 — 搭載機器一部未搭載',
        recordedBy: '衛星担当 佐藤', status: 'input',
      });
      const sat1 = useMassCaseStore.getState().components.find((c) => c.id === dSat.id)?.actualMassHistory?.slice(-1)[0];
      if (sat1) massStore.confirmActualMassEntry(dSat.id, sat1.id, '山田 太郎');
      // 2回目: 確定値（全搭載機器込み）→ 確認
      massStore.addActualMassEntry(dSat.id, {
        value: 41.2, evidence: '衛星メーカ確定質量報告書 — 全搭載機器込み最終実測',
        recordedBy: '衛星担当 佐藤', status: 'input',
      });
      const sat2 = useMassCaseStore.getState().components.find((c) => c.id === dSat.id)?.actualMassHistory?.slice(-1)[0];
      if (sat2) massStore.confirmActualMassEntry(dSat.id, sat2.id, '山田 太郎');
    }

    // ── ペイロードアダプタ: 入力→確認
    const dPla = findD('m_pla');
    if (dPla) {
      massStore.updateComponent(dPla.id, {
        allocatedMass: 12,
        materialName: 'Al6061-T6', materialDensity: 2700, materialYoungModulus: 68.9,
        cgX: 15.92, cgY: 0.0, cgZ: 0.0,
        ixx: 0.18, iyy: 0.42, izz: 0.42,
      });
      inputAndConfirm('m_pla', 10.8, '重量実測 — 構造解析承認済', '構造担当 鈴木', '山田 太郎');
    }

    // ── 2段エンジン: 入力→確認
    inputAndConfirm('m_s2_case', 39.0, '製造品重量実測', '推進系担当 田中', '山田 太郎');
    const dEng2 = findD('m_s2_case');
    if (dEng2) massStore.updateComponent(dEng2.id, { materialName: 'SUS316L', materialDensity: 7980, cgX: 11.80, cgY: 0.0, cgZ: 0.0 });

    // ── 2段ノズル: 入力→確認
    inputAndConfirm('m_s2_nozzle', 32.5, '重量実測', '推進系担当 田中', '山田 太郎');
    const dNoz2 = findD('m_s2_nozzle');
    if (dNoz2) massStore.updateComponent(dNoz2.id, {
      materialName: 'Inconel 625', materialDensity: 8440,
      debrisShapeType: 'cylinder', debrisCharLength: 0.35, debrisDiameter: 0.30, debrisArea: 0.071,
      cgX: 11.20, cgY: 0.0, cgZ: 0.0,
    });

    // ── 2段タンク: 暫定値入力→確認→再実測値入力（未確認）
    const dTank2comp = findD('m_s2_tube');
    if (dTank2comp) {
      massStore.updateComponent(dTank2comp.id, {
        materialName: 'Al2219-T87', materialDensity: 2840, materialYoungModulus: 73.8,
        cgX: 12.82, cgY: 0.0, cgZ: 0.0,
        ixx: 2.1, iyy: 14.2, izz: 14.2,
      });
      // 1回目: 構造試験品（暫定）→ 確認
      massStore.addActualMassEntry(dTank2comp.id, {
        value: 90.2, evidence: '構造試験品重量実測（暫定値 — 製造品と形状差あり）',
        recordedBy: '構造担当 鈴木', status: 'input',
      });
      const t2e1 = useMassCaseStore.getState().components.find((c) => c.id === dTank2comp.id)?.actualMassHistory?.slice(-1)[0];
      if (t2e1) massStore.confirmActualMassEntry(dTank2comp.id, t2e1.id, '山田 太郎');
      // 2回目: 製造品実測（確定値）→ 未確認
      massStore.addActualMassEntry(dTank2comp.id, {
        value: 88.0, evidence: '製造品重量実測（確定値）',
        recordedBy: '構造担当 鈴木', status: 'input',
      });
    }

    // ── 2段アビオニクス: 入力のみ（EMC試験後確認予定）
    inputOnly('m_s2_avionics', 57.5, '重量実測 — EMC試験完了後にシステム担当確認予定', 'AVI担当 中村');
    const dAv2 = findD('m_s2_avionics');
    if (dAv2) massStore.updateComponent(dAv2.id, { cgX: 12.30, cgY: 0.02, cgZ: 0.0 });

    // ── フェアリング: 入力→確認
    inputAndConfirm('m_s2_fairing', 43.5, '製造品重量実測', '構造担当 鈴木', '山田 太郎');
    const dFairing = findD('m_s2_fairing');
    if (dFairing) massStore.updateComponent(dFairing.id, {
      materialName: 'CFRP積層準等方', materialDensity: 1540,
      debrisShapeType: 'flat_plate', debrisCharLength: 1.0, debrisArea: 0.5,
      cgX: 14.52, cgY: 0.0, cgZ: 0.0,
    });

    // ── 2段推進剤: 入力→確認
    inputAndConfirm('m_s2_prop', 615, '推進剤充填量計測', '推進系担当 田中', '山田 太郎');
    const dProp2 = findD('m_s2_prop');
    if (dProp2) massStore.updateComponent(dProp2.id, { cgX: 12.40, cgY: 0.0, cgZ: 0.0 });

    // ── 1段エンジン: 入力→確認
    inputAndConfirm('m_s1_case', 168.0, '製造品重量実測', '推進系担当 田中', '山田 太郎');
    const dEng1 = findD('m_s1_case');
    if (dEng1) massStore.updateComponent(dEng1.id, { materialName: 'SUS316L', materialDensity: 7980, cgX: 1.80, cgY: 0.0, cgZ: 0.0 });

    // ── 1段ターボポンプ/配管: 入力→確認
    inputAndConfirm('m_s1_nozzle', 88.0, '重量実測', '推進系担当 田中', '山田 太郎');
    const dTurbo = findD('m_s1_nozzle');
    if (dTurbo) massStore.updateComponent(dTurbo.id, {
      materialName: 'SUS316L', materialDensity: 7980,
      debrisShapeType: 'cylinder', debrisCharLength: 0.5, debrisDiameter: 0.4, debrisArea: 0.126,
      cgX: 1.40, cgY: 0.0, cgZ: 0.0,
    });

    // ── 1段タンク: 入力→確認
    inputAndConfirm('m_s1_tube', 198.0, '製造品重量実測', '構造担当 鈴木', '山田 太郎');
    const dTank1 = findD('m_s1_tube');
    if (dTank1) massStore.updateComponent(dTank1.id, {
      materialName: 'Al2219-T87', materialDensity: 2840, materialYoungModulus: 73.8,
      cgX: 4.24, cgY: 0.0, cgZ: 0.0,
      ixx: 42.0, iyy: 230.0, izz: 230.0,
    });

    // ── グリッドフィン: 入力→確認
    inputAndConfirm('m_s1_fin', 76.0, '製造品重量実測', '構造担当 鈴木', '山田 太郎');
    const dFin = findD('m_s1_fin');
    if (dFin) massStore.updateComponent(dFin.id, {
      materialName: 'Al7075-T6', materialDensity: 2810,
      debrisShapeType: 'flat_plate', debrisCharLength: 0.5, debrisArea: 0.18,
      cgX: 1.52, cgY: 0.0, cgZ: 0.0,
    });

    // ── インタステージ: 入力のみ（塗装後再計測済み、確認待ち）
    inputOnly('m_interstage', 76.5, '製造品重量実測（塗装後再計測）', '構造担当 鈴木');
    const dIS = findD('m_interstage');
    if (dIS) massStore.updateComponent(dIS.id, {
      materialName: 'CFRP積層準等方', materialDensity: 1540,
      cgX: 9.82, cgY: 0.0, cgZ: 0.0,
    });

    // ── 1段アビオニクス: 入力→確認
    inputAndConfirm('m_s1_avionics', 67.0, '重量実測', 'AVI担当 中村', '山田 太郎');
    const dAv1 = findD('m_s1_avionics');
    if (dAv1) massStore.updateComponent(dAv1.id, { cgX: 3.85, cgY: 0.02, cgZ: 0.0 });

    // ── 1段推進剤: 入力→確認
    inputAndConfirm('m_s1_prop', 2810, '推進剤充填量計測', '推進系担当 田中', '山田 太郎');
    const dProp1 = findD('m_s1_prop');
    if (dProp1) massStore.updateComponent(dProp1.id, { cgX: 4.10, cgY: 0.0, cgZ: 0.0 });
  }

  // ════════════════════════════════════════
  // 有効バージョン設定: 最終設計確定
  // ════════════════════════════════════════
  const dId = mcD?.id ?? cId;
  projectStore.setActiveDb(pid, dId);

  // ════════════════════════════════════════
  // 解析ケース — 全11サービス / 基準DB: 使い捨て型・最終設計確定
  // ════════════════════════════════════════

  // 1. 飛行解析 ─────────────────────────
  const acTRJ = analysisStore.addCase({
    projectId: pid, massCaseId: dId,
    serviceType: 'flightAnalysis', name: '飛行解析 TRJ-001',
    memo: '基準弾道計算。US標準大気1976。打上方位90°（東向き）。',
    createdBy: '田中 次郎', upstreamCaseId: '',
    condition: {
      atmosphericModel: 'US Standard Atmosphere 1976',
      launchAzimuth: 90,
      launchLatitude: 31.25,
      launchLongitude: 131.07,
      simDuration: 600,
    },
  });
  addResults(acTRJ.id, [
    ['最大高度',          '113.8', 'km',   '2段燃焼終了時'],
    ['最大速度',          '3050',  'm/s',  '2段燃焼終了時'],
    ['最大加速度',        '11.2',  'G',    '1段後期'],
    ['最大動圧 (q_max)', '52800', 'Pa',   'T+38s'],
    ['1段燃焼終了高度',   '44.8',  'km',   'T+92s'],
    ['ペイロード分離速度', '2980',  'm/s',  'T+210s'],
  ]);

  // 2. 分散飛行経路解析 ──────────────────
  const acDISP = analysisStore.addCase({
    projectId: pid, massCaseId: dId,
    serviceType: 'dispersedFlight', name: '分散飛行経路 DISP-001',
    memo: 'モンテカルロ 2000 ショット。3σ誤差込み落下域評価。',
    createdBy: '鈴木 花子', upstreamCaseId: acTRJ.id,
    condition: {
      monteCarloCounts: 2000,
      sigmaLevel: 3,
      refFlightCaseId: acTRJ.id,
    },
  });
  addResults(acDISP.id, [
    ['1段落下域 長軸半径',      '24.2', 'km', '3σ楕円（東西方向）'],
    ['1段落下域 短軸半径',      '15.6', 'km', '3σ楕円（南北方向）'],
    ['2段落下域 長軸半径',      '8.1',  'km', '3σ楕円'],
    ['2段落下域 短軸半径',      '4.5',  'km', '3σ楕円'],
    ['フェアリング落下域半径',   '19.2', 'km', '3σ円形近似'],
    ['インタステージ落下域半径', '12.8', 'km', '3σ円形近似'],
  ]);

  // 3. 荷重解析 ──────────────────────────
  const acLD = analysisStore.addCase({
    projectId: pid, massCaseId: dId,
    serviceType: 'loadAnalysis', name: '荷重解析 LD-001',
    memo: '最大動圧時・最大加速度時の組合せ荷重評価。安全率1.5。',
    createdBy: '田中 次郎', upstreamCaseId: acTRJ.id,
    condition: {
      maxDynamicPressure: 52800,
      maxAcceleration: 11.2,
      safetyFactor: 1.5,
      loadCaseDescription: '最大動圧 ＋ 最大加速度（設計荷重）',
    },
  });
  addResults(acLD.id, [
    ['機体根元 曲げモーメント', '1.52', 'MN·m', '最大動圧ケース'],
    ['機体根元 軸力',           '0.78', 'MN',   '最大加速度ケース'],
    ['機体根元 せん断力',       '0.28', 'MN',   '最大動圧ケース'],
    ['インタステージ 軸力',     '0.42', 'MN',   '1段燃焼末期'],
    ['安全余裕（MS）最小値',    '0.22', '',     '2段タンク'],
  ]);

  // 4. 海上船舶危険解析 ──────────────────
  const acSH = analysisStore.addCase({
    projectId: pid, massCaseId: dId,
    serviceType: 'shipHazard', name: '海上船舶危険 SH-001',
    memo: '1段・2段・フェアリング落下域内の船舶リスク評価。',
    createdBy: '山田 太郎', upstreamCaseId: acDISP.id,
    condition: {
      dropZoneDefinition: '3σ落下域（楕円近似）',
      shipDensity: 0.0005,
      riskAcceptance: 1e-6,
    },
  });
  addResults(acSH.id, [
    ['個人リスク（1段落下域）',          '3.1e-8', '1/launch', '許容値1e-6を満足'],
    ['個人リスク（2段落下域）',          '1.0e-8', '1/launch', '許容値1e-6を満足'],
    ['個人リスク（フェアリング落下域）',  '1.4e-8', '1/launch', '許容値1e-6を満足'],
    ['社会的リスク（全落下域合計）',      '< 1e-4', '1/launch', '許容値満足'],
  ]);

  // 5. Pi/Ec 解析 ─────────────────────────
  const acPEC = analysisStore.addCase({
    projectId: pid, massCaseId: dId,
    serviceType: 'piEc', name: 'Pi/Ec解析 PEC-001',
    memo: 'ミッション成功確率・飛行安全成功確率の評価。FTA/FMEA 基づく。',
    createdBy: '山田 太郎', upstreamCaseId: '',
    condition: {
      missionSuccessCriteria: 'ペイロード目標軌道投入',
      reliabilityTarget: 0.95,
      evaluationMethod: 'FTA + FMEA',
      flightTerminationIncluded: true,
    },
  });
  addResults(acPEC.id, [
    ['ミッション成功確率',  '0.971',  '', '要求0.95を満足'],
    ['飛行安全成功確率',    '0.9988', '', 'FTS信頼性含む'],
    ['1段エンジン系信頼性', '0.9990', '', 'FMEA基づく（9発×冗長性）'],
    ['2段エンジン信頼性',   '0.9985', '', 'FMEA基づく'],
    ['誘導制御系信頼性',    '0.9978', '', 'FTA基づく'],
  ]);

  // 6. 投棄物落下域解析 ──────────────────
  const acDB = analysisStore.addCase({
    projectId: pid, massCaseId: dId,
    serviceType: 'debrisImpact', name: '投棄物落下域 DB-001',
    memo: 'フェアリング・インタステージの落下域評価。',
    createdBy: '鈴木 花子', upstreamCaseId: acDISP.id,
    condition: {
      separationAltitude: 90,
      separationVelocity: 2400,
      windModel: 'RS-HIWAY 月別代表風',
    },
  });
  addResults(acDB.id, [
    ['フェアリング落下域面積',   '540', 'km²', '3σ範囲'],
    ['インタステージ落下域面積', '405', 'km²', '3σ範囲'],
    ['最遠落下点距離',           '196', 'km',  'フェアリング 3σ'],
  ]);

  // 7. RF リンク解析 ──────────────────────
  const acRF = analysisStore.addCase({
    projectId: pid, massCaseId: dId,
    serviceType: 'rfLink', name: 'RFリンク解析 RF-001',
    memo: '打上〜ペイロード分離までのテレメトリ・コマンドリンク評価。',
    createdBy: '田中 次郎', upstreamCaseId: acTRJ.id,
    condition: {
      txPowerDbw: 2,
      frequencyMHz: 2245,
      groundAntennaId: '',
      rocketAntennaId: '',
      pathLossModel: '自由空間損失',
      requiredMarginDb: 6,
    },
  });
  addResults(acRF.id, [
    ['最小リンクマージン（テレメトリ）', '8.8',  'dB', '仰角5° 最遠時。要求6 dBを満足'],
    ['最小リンクマージン（コマンド）',   '10.9', 'dB', '仰角5° 最遠時'],
    ['最悪リンク時刻',                   'T+192s','',  '最遠距離 / 最低仰角'],
    ['最遠スラントレンジ',               '252',  'km', 'T+192s'],
  ]);

  // 8. 軌道上寿命解析 ────────────────────
  const acOL = analysisStore.addCase({
    projectId: pid, massCaseId: dId,
    serviceType: 'orbitLifetime', name: '軌道上寿命 OL-001',
    memo: 'ペイロード軌道上残存期間。スペースデブリ25年ルール適合確認。',
    createdBy: '山田 太郎', upstreamCaseId: acTRJ.id,
    condition: {
      initialAltitude: 114,
      inclination: 31.2,
      solarActivityLevel: 'moderate (F10.7 = 150)',
      dragCoefficient: 2.2,
      crossSectionalArea: 0.09,
    },
  });
  addResults(acOL.id, [
    ['軌道上残存期間', '19.2', '年',  '25年ルール適合（< 25年）'],
    ['大気再突入開始高度', '106', 'km', '高度減衰により再突入フェーズ移行'],
  ]);

  // 9. 溶融解析 ──────────────────────────
  const acABL = analysisStore.addCase({
    projectId: pid, massCaseId: dId,
    serviceType: 'ablation', name: '溶融解析 ABL-001',
    memo: '2段機体の大気再突入時溶融率評価。地上到達破片ゼロ設計確認。',
    createdBy: '山田 太郎', upstreamCaseId: acOL.id,
    condition: {
      reentryVelocity: 7800,
      reentryAngle: -2.5,
      maxHeatingRate: 92,
      heatShieldMaterial: 'なし（溶融設計）',
    },
  });
  addResults(acABL.id, [
    ['溶融率',      '99.5', '%',    '質量ベース。地上到達破片なし（Al合金タンク溶融）'],
    ['最大加熱率',  '92',   'kW/m²','再突入後 T+32s'],
    ['最高機体温度','1680', '°C',   'タービンポンプ部'],
  ]);

  // 10. 経路回転率解析 ───────────────────
  const acPRR = analysisStore.addCase({
    projectId: pid, massCaseId: dId,
    serviceType: 'pathRotationRate', name: '経路回転率 PRR-001',
    memo: '上昇中の機体軸回転率と経路角変化率。最大動圧域での安定性確認。',
    createdBy: '田中 次郎', upstreamCaseId: acTRJ.id,
    condition: {
      evaluationPhase: '最大動圧域 (T+28s〜T+58s)',
      rollRateTarget: 0,
    },
  });
  addResults(acPRR.id, [
    ['最大経路回転率',   '2.1',  'deg/s', 'T+38s 最大動圧付近'],
    ['最大ロール角速度', '0.08', 'deg/s', 'TVC制御誘起'],
  ]);

  // 11. GNSS 衛星可視解析 ────────────────
  const acGNSS = analysisStore.addCase({
    projectId: pid, massCaseId: dId,
    serviceType: 'gnssSatellite', name: 'GNSS可視解析 GNSS-001',
    memo: 'GPS＋みちびきによる測位可能性評価。全飛行フェーズを対象。',
    createdBy: '田中 次郎', upstreamCaseId: acTRJ.id,
    condition: {
      constellationType: 'GPS + みちびき (L1 C/A)',
      maskAngle: 5,
      evaluationPhase: '全飛行フェーズ (T+0s〜T+215s)',
      minSatellites: 4,
    },
  });
  addResults(acGNSS.id, [
    ['最小可視衛星数', '5',   '機', '全フェーズ最悪値'],
    ['最悪PDOP',       '2.4', '',   'T+180s 付近'],
    ['測位継続率',     '100', '%',  '4機以上確保（全フェーズ）'],
  ]);

  // 未使用変数の警告抑止
  void acLD; void acSH; void acPEC; void acDB; void acRF;
  void acOL; void acABL; void acPRR; void acGNSS;

  // ════════════════════════════════════════
  // マスタデータ — アンテナ
  // ════════════════════════════════════════
  masterStore.addAntenna({
    name: '内之浦 テレメトリ地上局',
    type: 'ground', frequencyBand: 'S-band', frequencyMHz: 2245,
    gainDbi: 32.5, eirpDbw: null, gtDbK: 12.8, polarization: 'RHCP',
    memo: '鹿児島・内之浦。径10 m パラボラ。打上追尾用。',
  });
  masterStore.addAntenna({
    name: '種子島 コマンド地上局',
    type: 'ground', frequencyBand: 'S-band', frequencyMHz: 2025,
    gainDbi: 28.2, eirpDbw: 47, gtDbK: null, polarization: 'RHCP',
    memo: '種子島宇宙センター TC/TM 地上局',
  });
  masterStore.addAntenna({
    name: 'LV-Alpha 機上テレメトリアンテナ',
    type: 'rocket', frequencyBand: 'S-band', frequencyMHz: 2245,
    gainDbi: 0, eirpDbw: 2, gtDbK: null, polarization: 'RHCP',
    memo: '1段胴部 4本 ダイバーシティ構成。全周指向性。',
  });
  masterStore.addAntenna({
    name: 'LV-Alpha GPS受信アンテナ',
    type: 'rocket', frequencyBand: 'L-band', frequencyMHz: 1575,
    gainDbi: 3.5, eirpDbw: null, gtDbK: -18, polarization: 'RHCP',
    memo: '2段前方搭載。GPS L1 C/A コード受信。みちびき対応。',
  });

  // ════════════════════════════════════════
  // マスタデータ — 推進系
  // ════════════════════════════════════════
  masterStore.addPropulsion({
    name: 'RP-9 (1段メイン)', stage: '1段', propellant: 'LOX/RP-1', cycle: 'ガス発生器',
    thrustVacKN: 1120, thrustSlKN: 980, ispVacS: 311, burnTimeS: 155, throttle: '60–100%',
    memo: '1段メインエンジン。',
  });
  masterStore.addPropulsion({
    name: 'RP-3V (2段)', stage: '2段', propellant: 'LOX/RP-1', cycle: 'ガス発生器',
    thrustVacKN: 180, thrustSlKN: null, ispVacS: 342, burnTimeS: 210, throttle: '固定',
    memo: '2段エンジン。真空仕様。',
  });
  masterStore.addPropulsion({
    name: 'RCS-Thruster', stage: '姿勢制御', propellant: 'N2H4 (単推進)', cycle: '触媒分解',
    thrustVacKN: 0.22, thrustSlKN: null, ispVacS: 224, burnTimeS: 0, throttle: 'パルス',
    memo: '姿勢制御スラスタ。',
  });

  // ── 機体形状
  masterStore.addShape({ name: 'LV-Alpha', lengthM: 24.5, maxDiameterM: 1.8, stages: 2, noseCone: 'フォン・カルマン', refAreaM2: 2.545, memo: '' });
  masterStore.addShape({ name: 'LV-Beta (3段型)', lengthM: 32.0, maxDiameterM: 2.2, stages: 3, noseCone: 'タンジェントオージャイブ', refAreaM2: 3.801, memo: '' });
  masterStore.addShape({ name: 'イプシロンS相当', lengthM: 27.2, maxDiameterM: 2.5, stages: 3, noseCone: 'フォン・カルマン', refAreaM2: 4.909, memo: '' });

  // ── 空力係数
  masterStore.addAeroCoeff({ name: 'LV-Alpha 空力係数', cdSubsonic: 0.32, cdTransonicPeak: 0.58, cdSupersonic: 0.30, clAlpha: 2.6, memo: '亜音速～超音速の代表値。' });
  masterStore.addAeroCoeff({ name: 'LV-Beta (3段型) 空力係数', cdSubsonic: 0.35, cdTransonicPeak: 0.61, cdSupersonic: 0.33, clAlpha: 2.9, memo: '' });

  // ── 風
  masterStore.addWind({ name: '大樹町・年間代表', site: '大樹町射場', maxSpeedMs: 62, maxSpeedAltKm: 12, dirDeg: 255, memo: 'ジェット気流帯で最大。' });
  masterStore.addWind({ name: '大樹町・冬季', site: '大樹町射場', maxSpeedMs: 78, maxSpeedAltKm: 11, dirDeg: 260, memo: '冬季の強風条件。' });

  // ── 故障率
  masterStore.addFailureRate({ name: '推進系（1段）', failureRate: 8.0e-3, mode: '燃焼異常・配管破断', phase: '1段燃焼', memo: '' });
  masterStore.addFailureRate({ name: '推進系（2段）', failureRate: 5.0e-3, mode: '着火失敗・推力低下', phase: '2段燃焼', memo: '' });
  masterStore.addFailureRate({ name: '誘導制御 (GNC)', failureRate: 3.0e-3, mode: '姿勢制御喪失・経路逸脱', phase: '全フェーズ', memo: '' });
  masterStore.addFailureRate({ name: '飛行終了系 (FTS)', failureRate: 1.0e-4, mode: '指令破壊不能', phase: '全フェーズ', memo: '' });

  // ── 代表破片
  masterStore.addDebris({ name: 'エンジン', massKg: 180, areaM2: 0.6, cd: 0.9, material: '金属', memo: '' });
  masterStore.addDebris({ name: 'タンクドーム', massKg: 45, areaM2: 1.2, cd: 1.1, material: 'アルミ合金', memo: '' });
  masterStore.addDebris({ name: 'アビオ筐体', massKg: 12, areaM2: 0.25, cd: 0.8, material: '複合材', memo: '' });
  masterStore.addDebris({ name: 'フェアリング片', massKg: 8, areaM2: 0.9, cd: 1.3, material: 'CFRP', memo: '' });

  // ════════════════════════════════════════
  // 号機（運用フェーズ） — LV-Alpha の各フライト
  // ════════════════════════════════════════
  // 1号機: PT解析 完了 → 申請書を自動生成 → 内閣府へ提出済み。FT解析は実施中
  const unit1 = unitStore.addUnit({
    projectId: pid,
    unitNo: '1',
    missionName: '革新的衛星技術実証 LV-Alpha 初号機',
    launchDate: '2026-09-15',
    status: '申請済み',
    requiredAnalyses: [...OPERATIONAL_SERVICES],
    pt: { massCaseId: dId, status: '完了' },
    ft: { status: '実施中' },
    memo: '初号機。使い捨て型・最終設計確定 DB を基準。PT解析完了・申請提出済み。FT解析（飛行時）を実施中。',
  });
  const app1 = appStore.upsertForUnit(
    buildApplicationData({ unit: unit1, projectName: project.name })
  );
  appStore.submit(app1.id);

  // 2号機: PT解析 実施中
  unitStore.addUnit({
    projectId: pid,
    unitNo: '2',
    missionName: '小型地球観測衛星 相乗りミッション',
    launchDate: '2026-12-10',
    status: 'PT実施中',
    requiredAnalyses: [...OPERATIONAL_SERVICES],
    pt: { massCaseId: dId, status: '実施中' },
    ft: { status: '未着手' },
    memo: '相乗り2機。軌道投入条件を再設定し PT解析を実施中。',
  });

  // 3号機: 計画段階（PT解析 未着手）
  unitStore.addUnit({
    projectId: pid,
    unitNo: '3',
    missionName: '技術実証 第3次フライト',
    launchDate: '2027-03-20',
    status: '計画',
    requiredAnalyses: [...OPERATIONAL_SERVICES],
    pt: { status: '未着手' },
    ft: { status: '未着手' },
    memo: 'ミッション定義中。PT解析 未着手。',
  });
}

/** サンプルデータが既にロードされているか確認 */
export function isSampleDataLoaded(): boolean {
  return useProjectStore.getState().projects.some(
    (p) => p.name === 'LV-Alpha 打上実証プロジェクト'
  );
}
