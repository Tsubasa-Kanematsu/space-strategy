import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DeleteConfirmModal } from '../common/DeleteConfirmModal';
import { useAppStore } from '../../stores/appStore';
import { useProjectStore } from '../../stores/projectStore';
import { useMassCaseStore } from '../../stores/massCaseStore';
import { useSizingStore } from '../../stores/sizingStore';
import { useAnalysisStore } from '../../stores/analysisStore';
import { useRocketShapeStore } from '../../stores/rocketShapeStore';
import { usePropulsionStore } from '../../stores/propulsionStore';
import type { AnalysisServiceType, MassCase, SizingCase, SizingResult } from '../../types';
import { SERVICE_META } from '../analysis/analysisServiceMeta';
import { AnalysisFlowEditor } from '../analysis/AnalysisFlowEditor';
import { useFlags } from '../../stores/featureFlagsStore';
import { ChangeLogModal } from '../massCase/ChangeLogModal';
import { DbDiffModal } from '../massCase/DbDiffModal';

// ---- Layout constants (解析タブ用 SVG) ----
const NW = 182;
const NH = 56;
const HG = 80;
const VG = 20;
const PAD = 40;
const HDR = 30;

const SERVICE_COL: Record<AnalysisServiceType, number> = {
  aeroAnalysis:     1,
  flightAnalysis:   1,
  loadAnalysis:     1,
  dispersedFlight:  2,
  orbitLifetime:    2,
  pathRotationRate: 2,
  gnssSatellite:    2,
  shipHazard:       3,
  piEc:             3,
  debrisImpact:     3,
  rfLink:           3,
  ablation:         3,
};

const SERVICE_ORDER: Record<AnalysisServiceType, number> = {
  aeroAnalysis:     2,
  flightAnalysis:   0,
  loadAnalysis:     1,
  dispersedFlight:  0,
  orbitLifetime:    1,
  pathRotationRate: 2,
  gnssSatellite:    3,
  shipHazard:       0,
  piEc:             1,
  debrisImpact:     2,
  rfLink:           3,
  ablation:         4,
};

const COL_THEME = [
  { bg: '#e8f0fe', stroke: '#1a73e8', text: '#1558c0' },
  { bg: '#fff8e1', stroke: '#f9a825', text: '#e65100' },
  { bg: '#f3e5f5', stroke: '#9c27b0', text: '#6a1478' },
  { bg: '#fce4ec', stroke: '#e91e63', text: '#880e4f' },
];
const SIZING_THEME = { bg: '#e6f4ea', stroke: '#34a853', text: '#1b5e20' };

const COL_LABELS = ['ロケットDB', 'サイジング / 基本解析', '二次解析', '三次解析'];
const ARROW_IDS = ['arr0', 'arr1', 'arr2', 'arr3', 'arrG'];
const ARROW_COLORS = [
  COL_THEME[0].stroke, COL_THEME[1].stroke,
  COL_THEME[2].stroke, COL_THEME[3].stroke,
  SIZING_THEME.stroke,
];

interface DiagNode {
  id: string; name: string; sublabel: string;
  type: 'mass' | 'sizing' | 'analysis';
  serviceType?: AnalysisServiceType;
  dataId: string; massCaseId?: string;
  sizingResultApplied?: string; parentMassCaseId?: string;
  col: number; x: number; y: number;
  theme: { bg: string; stroke: string; text: string };
  arrowId: string;
}
interface DiagEdge {
  fromId: string; toId: string; arrowId: string; stroke: string;
  isVersionEdge?: boolean;
}

// ─── DB ツリー型 ─────────────────────────────────────────────────────────────
interface DBFlowNode extends MassCase {
  children: DBFlowNode[];
}

function buildDbFlowTree(cases: MassCase[], parentId: string | null = null): DBFlowNode[] {
  return cases
    .filter((c) => (c.parentMassCaseId ?? null) === parentId)
    .map((c) => ({ ...c, children: buildDbFlowTree(cases, c.id) }));
}

// ─── SVGツリー 定数 ──────────────────────────────────────────────────────────
const TN_W = 220;
const TN_H = 100;
const TH_GAP = 48;
const TV_GAP = 100;
const T_PAD = 40;
const T_ROOT_GAP = 80;
const T_CP = Math.round(TV_GAP / 3); // ベジェ制御点オフセット

interface SVGLayout {
  id: string;
  node: DBFlowNode;
  x: number;
  y: number;
  sizingCase?: SizingCase;
  sizingResult?: SizingResult;
}

function calcSubtreeW(node: DBFlowNode): number {
  if (node.children.length === 0) return TN_W;
  const childW = node.children.reduce(
    (s, c, i) => s + calcSubtreeW(c) + (i > 0 ? TH_GAP : 0),
    0,
  );
  return Math.max(TN_W, childW);
}

function collectLayouts(
  node: DBFlowNode,
  xOff: number,
  depth: number,
  out: SVGLayout[],
): void {
  const sw = calcSubtreeW(node);
  out.push({
    id: node.id,
    node,
    x: xOff + (sw - TN_W) / 2,
    y: T_PAD + depth * (TN_H + TV_GAP),
  });
  let cx = xOff;
  for (const child of node.children) {
    const csw = calcSubtreeW(child);
    collectLayouts(child, cx, depth + 1, out);
    cx += csw + TH_GAP;
  }
}

interface SVGEdgeData {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

function collectEdgeData(
  node: DBFlowNode,
  layoutMap: Map<string, SVGLayout>,
  out: SVGEdgeData[],
): void {
  for (const child of node.children) {
    const from = layoutMap.get(node.id);
    const to   = layoutMap.get(child.id);
    if (from && to) {
      out.push({
        fromX: from.x + TN_W / 2,
        fromY: from.y + TN_H,
        toX:   to.x   + TN_W / 2,
        toY:   to.y,
      });
    }
    collectEdgeData(child, layoutMap, out);
  }
}

// ─── Component ───────────────────────────────────────────────────────────────
export const Traceability: React.FC = () => {
  const { projectId, navigate } = useAppStore();
  const FEATURE_FLAGS = useFlags();
  const project     = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  const setActiveDb = useProjectStore((s) => s.setActiveDb);
  const allMassCases     = useMassCaseStore((s) => s.cases);
  const addCase          = useMassCaseStore((s) => s.addCase);
  const copyCase         = useMassCaseStore((s) => s.copyCase);
  const forkCase         = useMassCaseStore((s) => s.forkCase);
  const updateCase       = useMassCaseStore((s) => s.updateCase);
  const deleteCase       = useMassCaseStore((s) => s.deleteCase);
  const addChangeRecord  = useMassCaseStore((s) => s.addChangeRecord);
  const copyGeometry     = useRocketShapeStore((s) => s.copyGeometry);
  const copyStages       = usePropulsionStore((s) => s.copyStages);
  const allSizingCases   = useSizingStore((s) => s.cases);
  const allSizingResults = useSizingStore((s) => s.results);
  const allAnalysisCases = useAnalysisStore((s) => s.cases);

  const [activeTab, setActiveTab] = useState<'dbFlow' | 'analysis' | 'flow'>('dbFlow');
  const [dbViewMode, setDbViewMode] = useState<'tree' | 'list'>('tree');
  // 解析トレーサ ホバー強調: ホバー中のノードIDを保持し、関連エッジ/ノードだけを濃く描画
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  // 解析トレーサ DBフィルタ: 選択した massCase に紐づくケースだけに絞り込む
  const [filterMassId, setFilterMassId] = useState<string | ''>('');

  // ── DBリスト操作モーダル ────────────────────────────────────────────────────
  const [editTarget, setEditTarget]   = useState<MassCase | null>(null);
  const [editForm, setEditForm]       = useState({ name: '', memo: '', createdBy: '' });
  const [forkTarget, setForkTarget]   = useState<MassCase | null>(null);
  const [forkName, setForkName]       = useState('');
  const [forkSummary, setForkSummary] = useState('');
  const [forkRationale, setForkRationale] = useState('');
  const [forkDocUrls, setForkDocUrls] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<MassCase | null>(null);

  // ── 変更ログモーダル ────────────────────────────────────────────────────────
  const [logTarget, setLogTarget] = useState<MassCase | null>(null);

  // ── DB比較モード ────────────────────────────────────────────────────────────
  const [compareMode, setCompareMode] = useState(false);
  const [compareA, setCompareA] = useState<MassCase | null>(null);
  const [compareB, setCompareB] = useState<MassCase | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  // ── 右クリックコンテキストメニュー ─────────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; mc: MassCase } | null>(null);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    return () => { window.removeEventListener('click', close); window.removeEventListener('contextmenu', close); };
  }, [ctxMenu]);

  const openEdit = (mc: MassCase) => {
    setEditForm({ name: mc.name, memo: mc.memo, createdBy: mc.createdBy });
    setEditTarget(mc);
  };
  const handleEditSave = () => {
    if (!editTarget || !editForm.name.trim()) return;
    updateCase(editTarget.id, { name: editForm.name, memo: editForm.memo, createdBy: editForm.createdBy });
    setEditTarget(null);
  };
  const handleCopy = (mc: MassCase) => {
    copyCase(mc.id);
  };
  const openFork = (mc: MassCase) => {
    setForkName(`${mc.name} 派生`);
    setForkSummary('');
    setForkRationale('');
    setForkDocUrls('');
    setForkTarget(mc);
  };
  const handleFork = () => {
    if (!forkTarget || !forkName.trim()) return;
    const forked = forkCase(forkTarget.id, forkName.trim());
    if (forked) {
      copyGeometry(forkTarget.id, forked.id);
      copyStages(forkTarget.id, forked.id);
      // 変更ログを自動記録
      if (forkSummary.trim() || forkRationale.trim() || forkDocUrls.trim()) {
        addChangeRecord(forked.id, {
          changedBy: '',
          summary: forkSummary.trim() || `${forkTarget.name} から派生`,
          rationale: forkRationale.trim(),
          documentUrls: forkDocUrls.split('\n').map((u) => u.trim()).filter(Boolean),
        });
      }
    }
    setForkTarget(null);
    setForkName('');
    setForkSummary('');
    setForkRationale('');
    setForkDocUrls('');
  };

  // ── 比較モード クリックハンドラー ───────────────────────────────────────────
  const handleCompareClick = (mc: MassCase) => {
    if (!compareA) {
      setCompareA(mc);
    } else if (!compareB && mc.id !== compareA.id) {
      setCompareB(mc);
      setShowDiff(true);
    } else if (mc.id === compareA.id) {
      setCompareA(null);
    }
  };

  const resetCompare = () => {
    setCompareMode(false);
    setCompareA(null);
    setCompareB(null);
    setShowDiff(false);
  };
  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteCase(deleteTarget.id);
    setDeleteTarget(null);
  };

  // ── ツリーのパン・ズーム ────────────────────────────────────────────────────
  const treeContainerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({ active: false, moved: false, startX: 0, startY: 0, startTx: 0, startTy: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [treeTransform, setTreeTransform] = useState({ scale: 1, tx: 0, ty: 0 });

  const handleTreeMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    dragState.current = { active: true, moved: false, startX: e.clientX, startY: e.clientY, startTx: treeTransform.tx, startTy: treeTransform.ty };
    setIsDragging(true);
  };
  const handleTreeMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragState.current.active) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragState.current.moved = true;
    setTreeTransform((prev) => ({ ...prev, tx: dragState.current.startTx + dx, ty: dragState.current.startTy + dy }));
  };
  const handleTreeMouseUp = () => {
    dragState.current.active = false;
    setIsDragging(false);
  };
  // ドラッグ移動後はノードのクリックをキャンセル
  const handleTreeClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragState.current.moved) {
      e.stopPropagation();
      dragState.current.moved = false;
    }
  };
  // ホイールズーム（passive: false で preventDefault 可能にする）
  useEffect(() => {
    if (activeTab !== 'dbFlow') return;
    const el = treeContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setTreeTransform((prev) => {
        const newScale = Math.min(Math.max(prev.scale * factor, 0.15), 4);
        const ratio = newScale / prev.scale;
        return { scale: newScale, tx: cursorX - (cursorX - prev.tx) * ratio, ty: cursorY - (cursorY - prev.ty) * ratio };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [activeTab]);

  const massCases = useMemo(
    () => allMassCases.filter((c) => c.projectId === (projectId ?? '')),
    [allMassCases, projectId],
  );
  const sizingCases = useMemo(
    () => allSizingCases.filter((c) => c.projectId === (projectId ?? '')),
    [allSizingCases, projectId],
  );
  const analysisCases = useMemo(
    () => allAnalysisCases.filter((c) => c.projectId === (projectId ?? '')),
    [allAnalysisCases, projectId],
  );

  // ── DB Flow ツリー ─────────────────────────────────────────────────────────
  const dbFlowTree = useMemo(() => buildDbFlowTree(massCases), [massCases]);

  // ── SVGツリー レイアウト計算 ───────────────────────────────────────────────
  const svgTreeData = useMemo(() => {
    if (massCases.length === 0) return null;
    const layouts: SVGLayout[] = [];
    let xOff = T_PAD;
    for (let i = 0; i < dbFlowTree.length; i++) {
      collectLayouts(dbFlowTree[i], xOff, 0, layouts);
      xOff += calcSubtreeW(dbFlowTree[i]) + (i < dbFlowTree.length - 1 ? T_ROOT_GAP : 0);
    }
    // 各ノードにサイジング情報を付加
    for (const layout of layouts) {
      if (layout.node.sizingResultApplied) {
        const result = allSizingResults.find((r) => r.id === layout.node.sizingResultApplied);
        if (result) {
          layout.sizingResult = result;
          layout.sizingCase = sizingCases.find((sc) => sc.id === result.sizingCaseId);
        }
      }
    }
    const layoutMap = new Map(layouts.map((l) => [l.id, l]));
    const edges: SVGEdgeData[] = [];
    dbFlowTree.forEach((root) => collectEdgeData(root, layoutMap, edges));
    const svgW = Math.max(...layouts.map((l) => l.x + TN_W), 1) + T_PAD;
    const svgH = Math.max(...layouts.map((l) => l.y + TN_H), 1) + T_PAD;
    return { layouts, edges, svgW, svgH };
  }, [dbFlowTree, sizingCases, allSizingResults]);

  // ── fit-to-view（svgTreeData の後に定義） ──────────────────────────────────
  // 最大倍率を制限する。DBが1個のときに svgW/svgH が小さくて 4x, 5x までズーム
  // されるのを防ぐ。1.2 倍までならノードがちょうど良いサイズで見える。
  const FIT_MAX_SCALE = 1.2;
  const calcFitTransform = (el: HTMLDivElement, data: typeof svgTreeData) => {
    if (!data) return { scale: 1, tx: 0, ty: 0 };
    const cardPad = 16; // p-3 = 1rem
    const viewW = el.clientWidth  - cardPad * 2;
    const viewH = el.clientHeight - cardPad * 2;
    const scale = Math.min(viewW / data.svgW, viewH / data.svgH, FIT_MAX_SCALE);
    return {
      scale,
      tx: cardPad + (viewW - data.svgW * scale) / 2,
      ty: cardPad + (viewH - data.svgH * scale) / 2,
    };
  };

  // タブを開いた時 / データが変わった時に fit-to-view を適用
  useEffect(() => {
    if (activeTab !== 'dbFlow' || !svgTreeData) return;
    const el = treeContainerRef.current;
    if (!el) return;
    setTreeTransform(calcFitTransform(el, svgTreeData));
  }, [activeTab, svgTreeData]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetTreeTransform = () => {
    const el = treeContainerRef.current;
    if (!el) return;
    setTreeTransform(calcFitTransform(el, svgTreeData));
  };

  // ── 解析タブ用 SVG データ ──────────────────────────────────────────────────
  const { nodes: diagNodes, edges: diagEdges, svgW: diagSvgW, svgH: diagSvgH } = useMemo(() => {
    // ─── DB フィルタ: 選択された massCase に紐づくケース集合を計算 (filterMassId が空なら全件)
    //    massSet      : 選択した DB のみ (祖先・兄弟は出さない)
    //    sizingSet    : massCaseId が selected の sizing
    //    analysisSet  : massCaseId が selected の analysis、または upstreamCaseId が
    //                   analysisSet に既に含まれる analysis (推移閉包)
    const reachable = (() => {
      if (!filterMassId) return null;
      const massSet     = new Set<string>([filterMassId]);
      const sizingSet   = new Set<string>();
      const analysisSet = new Set<string>();
      sizingCases.forEach((sc) => { if (sc.massCaseId === filterMassId) sizingSet.add(sc.id); });
      analysisCases.forEach((ac) => { if (ac.massCaseId === filterMassId) analysisSet.add(ac.id); });
      let changed = true;
      while (changed) {
        changed = false;
        analysisCases.forEach((ac) => {
          if (analysisSet.has(ac.id)) return;
          if (ac.upstreamCaseId && analysisSet.has(ac.upstreamCaseId)) {
            analysisSet.add(ac.id);
            changed = true;
          }
        });
      }
      return { massSet, sizingSet, analysisSet };
    })();

    const colItems: DiagNode[][] = [[], [], [], []];

    massCases.forEach((mc) => {
      if (reachable && !reachable.massSet.has(mc.id)) return;
      colItems[0].push({
        id: `mc_${mc.id}`, name: mc.name, sublabel: 'ロケットDB',
        type: 'mass', dataId: mc.id,
        sizingResultApplied: mc.sizingResultApplied,
        parentMassCaseId: mc.parentMassCaseId,
        col: 0, x: 0, y: 0, theme: COL_THEME[0], arrowId: ARROW_IDS[0],
      });
    });

    sizingCases.forEach((sc) => {
      if (reachable && !reachable.sizingSet.has(sc.id)) return;
      colItems[1].push({
        id: `sz_${sc.id}`, name: sc.name, sublabel: 'サイジング',
        type: 'sizing', dataId: sc.id, massCaseId: sc.massCaseId,
        col: 1, x: 0, y: 0, theme: SIZING_THEME, arrowId: ARROW_IDS[4],
      });
    });

    const sorted = [...analysisCases].sort((a, b) => {
      const cd = (SERVICE_COL[a.serviceType] ?? 1) - (SERVICE_COL[b.serviceType] ?? 1);
      if (cd !== 0) return cd;
      const od = (SERVICE_ORDER[a.serviceType] ?? 99) - (SERVICE_ORDER[b.serviceType] ?? 99);
      if (od !== 0) return od;
      return a.createdAt.localeCompare(b.createdAt);
    });

    sorted.forEach((ac) => {
      if (reachable && !reachable.analysisSet.has(ac.id)) return;
      const col = SERVICE_COL[ac.serviceType] ?? 1;
      colItems[col].push({
        id: `ac_${ac.id}`, name: ac.name,
        sublabel: SERVICE_META[ac.serviceType].label,
        type: 'analysis', serviceType: ac.serviceType,
        dataId: ac.id, massCaseId: ac.massCaseId,
        col, x: 0, y: 0, theme: COL_THEME[col], arrowId: ARROW_IDS[col],
      });
    });

    const nodes: DiagNode[] = [];
    colItems.forEach((items, colIdx) => {
      items.forEach((node, rowIdx) => {
        nodes.push({
          ...node,
          x: PAD + colIdx * (NW + HG),
          y: PAD + HDR + rowIdx * (NH + VG),
        });
      });
    });

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const edges: DiagEdge[] = [];

    massCases.forEach((mc) => {
      if (!mc.parentMassCaseId) return;
      const from = nodeMap.get(`mc_${mc.parentMassCaseId}`);
      const to   = nodeMap.get(`mc_${mc.id}`);
      if (from && to)
        edges.push({ fromId: from.id, toId: to.id, arrowId: ARROW_IDS[0], stroke: COL_THEME[0].stroke, isVersionEdge: true });
    });

    massCases.forEach((mc) => {
      if (!mc.sizingResultApplied) return;
      const result = allSizingResults.find((r) => r.id === mc.sizingResultApplied);
      if (!result) return;
      const from = nodeMap.get(`sz_${result.sizingCaseId}`);
      const to   = nodeMap.get(`mc_${mc.id}`);
      if (from && to)
        edges.push({ fromId: from.id, toId: to.id, arrowId: ARROW_IDS[4], stroke: SIZING_THEME.stroke });
    });

    sizingCases.forEach((sc) => {
      const from = nodeMap.get(`mc_${sc.massCaseId}`);
      const to   = nodeMap.get(`sz_${sc.id}`);
      if (from && to)
        edges.push({ fromId: from.id, toId: to.id, arrowId: ARROW_IDS[4], stroke: SIZING_THEME.stroke });
    });

    analysisCases.filter((ac) => SERVICE_COL[ac.serviceType] === 1).forEach((ac) => {
      const from = nodeMap.get(`mc_${ac.massCaseId}`);
      const to   = nodeMap.get(`ac_${ac.id}`);
      if (from && to)
        edges.push({ fromId: from.id, toId: to.id, arrowId: ARROW_IDS[1], stroke: COL_THEME[1].stroke });
    });

    analysisCases.filter((ac) => (SERVICE_COL[ac.serviceType] ?? 1) >= 2).forEach((ac) => {
      if (!ac.upstreamCaseId) return;
      const from = nodeMap.get(`ac_${ac.upstreamCaseId}`);
      const to   = nodeMap.get(`ac_${ac.id}`);
      if (from && to) {
        const col = SERVICE_COL[ac.serviceType] ?? 2;
        edges.push({ fromId: from.id, toId: to.id, arrowId: ARROW_IDS[col], stroke: COL_THEME[col].stroke });
      }
    });

    const maxRows = Math.max(...colItems.map((c) => c.length), 1);
    return {
      nodes,
      edges,
      svgW: PAD * 2 + 4 * NW + 3 * HG,
      svgH: PAD * 2 + HDR + maxRows * (NH + VG),
    };
  }, [massCases, sizingCases, analysisCases, allSizingResults, filterMassId]);

  if (!projectId || !project) {
    return <div className="text-muted p-4">プロジェクトが選択されていません。</div>;
  }

  const handleDiagNodeClick = (node: DiagNode) => {
    if (node.type === 'mass') {
      navigate('massModel', { projectId, massCaseId: node.dataId });
    } else if (node.type === 'sizing') {
      navigate('sizingResults', { projectId, sizingCaseId: node.dataId });
    } else if (node.type === 'analysis' && node.serviceType) {
      navigate('analysisCondition', { projectId, analysisCaseId: node.dataId, analysisService: node.serviceType });
    }
  };

  const diagNodeMap = new Map(diagNodes.map((n) => [n.id, n]));

  // ─── Render ───────────────────────────────────────────────────────────────
  // content-area は flex column + overflow:hidden なので、
  // ページ root も flex column + flex:1 + minHeight:0 を持って高さを引き継ぐ。
  // 子 (タブ内容) に overflow:auto を持たせて内部スクロールにする。
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* タブナビゲーション */}
      <ul className="nav nav-tabs mb-4" style={{ flexShrink: 0 }}>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'dbFlow' ? 'active' : ''}`}
            onClick={() => setActiveTab('dbFlow')}
          >
            <i className="bi bi-diagram-2 me-2" />設計変遷ツリー
          </button>
        </li>
        {FEATURE_FLAGS.projectTabs.traceability && (
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'analysis' ? 'active' : ''}`}
              onClick={() => setActiveTab('analysis')}
            >
              <i className="bi bi-diagram-3 me-2" />解析トレーサビリティ
            </button>
          </li>
        )}
        {/* 解析フロータブは廃止: サイドバー「解析」 → 解析ハブ → 解析フロー で管理 */}
      </ul>

      {/* ══════════════════════════════════════════════════════════════
          設計変遷ツリー タブ（SVGツリー図）
          ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'dbFlow' && (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 218px)', minHeight: 200 }}>
          {massCases.length === 0 ? (
            <div className="text-center text-muted py-5">
              <i className="bi bi-database fs-2 d-block mb-2 opacity-25" />
              <div>ロケットDBがありません</div>
              <button
                className="btn btn-primary btn-sm mt-2"
                onClick={() => {
                  const name = window.prompt('DB名を入力してください', 'DB v1.0');
                  if (!name?.trim() || !projectId) return;
                  const mc = addCase({ name, memo: '', createdBy: '', projectId });
                  navigate('massModel', { projectId, massCaseId: mc.id });
                }}
              >
                <i className="bi bi-plus-lg me-1" />最初のDBを作成
              </button>
            </div>
          ) : (
            <>
              {/* 凡例 + 表示切替 */}
              <div className="d-flex flex-wrap align-items-center gap-3 mb-2">
                {dbViewMode === 'tree' && !compareMode && (
                  <div className="d-flex align-items-center gap-1">
                    <div style={{ width: 11, height: 11, background: '#f59e0b', borderRadius: 2 }} />
                    <small className="text-muted">有効バージョン</small>
                  </div>
                )}
                {compareMode && (
                  <div className="d-flex align-items-center gap-2">
                    <span className="badge" style={{ background: '#1a73e8', fontSize: '0.72rem' }}>比較モード</span>
                    {!compareA && <small className="text-muted">1つ目のDBを選択してください</small>}
                    {compareA && !compareB && (
                      <small className="text-muted">
                        <span style={{ color: '#1558c0', fontWeight: 600 }}>A: {compareA.name}</span> → 2つ目を選択
                      </small>
                    )}
                  </div>
                )}
                <div className="ms-auto d-flex align-items-center gap-2">
                  {dbViewMode === 'tree' && !compareMode && (
                    <>
                      <small className="text-muted">右クリックで操作メニュー</small>
                      <button
                        className="btn btn-sm btn-outline-secondary"
                        style={{ fontSize: '0.75rem', padding: '1px 8px' }}
                        onClick={resetTreeTransform}
                        title="表示をリセット"
                      >
                        <i className="bi bi-fullscreen me-1" />リセット
                      </button>
                    </>
                  )}
                  <button
                    className={`btn btn-sm ${compareMode ? 'btn-primary' : 'btn-outline-secondary'}`}
                    style={{ fontSize: '0.75rem', padding: '1px 8px' }}
                    onClick={compareMode ? resetCompare : () => setCompareMode(true)}
                    title="2つのDBを比較"
                  >
                    <i className="bi bi-subtract me-1" />{compareMode ? '比較終了' : 'DB比較'}
                  </button>
                  <div className="btn-group btn-group-sm">
                    <button
                      className={`btn ${dbViewMode === 'tree' ? 'btn-primary' : 'btn-outline-secondary'}`}
                      onClick={() => setDbViewMode('tree')}
                      title="ツリー表示"
                    >
                      <i className="bi bi-diagram-2" />
                    </button>
                    <button
                      className={`btn ${dbViewMode === 'list' ? 'btn-primary' : 'btn-outline-secondary'}`}
                      onClick={() => setDbViewMode('list')}
                      title="リスト表示"
                    >
                      <i className="bi bi-list-ul" />
                    </button>
                  </div>
                </div>
              </div>

              {/* リスト表示 */}
              {dbViewMode === 'list' && (
                <div className="card" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                  <table className="table table-hover mb-0" style={{ fontSize: '0.85rem' }}>
                    <thead className="table-light">
                      <tr>
                        <th>DB名</th>
                        <th>メモ</th>
                        <th>作成者</th>
                        <th>更新日</th>
                        <th className="col-actions">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {massCases.map((mc) => {
                        const isCompareA = compareA?.id === mc.id;
                        const isCompareB = compareB?.id === mc.id;
                        const rowBg = isCompareA ? '#e8f0fe' : isCompareB ? '#fff8e1' : undefined;
                        return (
                          <tr key={mc.id} style={{ verticalAlign: 'middle', background: rowBg }}>
                            <td>
                              <button
                                className="btn btn-link btn-sm p-0 fw-medium"
                                style={{ textDecoration: 'none', color: '#1558c0' }}
                                onClick={() => compareMode ? handleCompareClick(mc) : navigate('massModel', { projectId, massCaseId: mc.id })}
                              >
                                {compareMode && (
                                  <span style={{ marginRight: 4, fontSize: '0.7rem', fontWeight: 700, color: isCompareA ? '#1558c0' : isCompareB ? '#e65100' : '#adb5bd' }}>
                                    {isCompareA ? '[A]' : isCompareB ? '[B]' : '[ ]'}
                                  </span>
                                )}
                                <i className="bi bi-database me-1" style={{ color: '#1a73e8' }} />
                                {mc.name}
                              </button>
                              {project.activeDbId === mc.id && (
                                <span className="badge ms-2" style={{ background: '#f59e0b', fontSize: '0.62rem' }}>★ 有効</span>
                              )}
                              {mc.changeLog && mc.changeLog.length > 0 && (
                                <span className="badge ms-1" style={{ background: '#e8f0fe', color: '#1558c0', fontSize: '0.62rem', cursor: 'pointer' }} onClick={() => setLogTarget(mc)} title="変更ログあり">
                                  <i className="bi bi-journal-text" /> {mc.changeLog.length}
                                </span>
                              )}
                            </td>
                            <td className="text-muted">{mc.memo || '—'}</td>
                            <td style={{ whiteSpace: 'nowrap' }}>{mc.createdBy || '—'}</td>
                            <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>
                              {new Date(mc.updatedAt).toLocaleDateString('ja-JP')}
                            </td>
                            <td className="col-actions">
                              {!compareMode && (
                                <>
                                  <button
                                    className={`btn btn-sm me-1 ${project.activeDbId === mc.id ? 'btn-warning' : 'btn-outline-warning'}`}
                                    title="有効バージョンに設定"
                                    onClick={() => setActiveDb(projectId!, mc.id)}
                                  >
                                    <i className="bi bi-star" />
                                  </button>
                                  <button className="btn btn-sm btn-outline-secondary me-1" title="変更ログ" onClick={() => setLogTarget(mc)}>
                                    <i className="bi bi-journal-text" />
                                  </button>
                                  <button className="btn btn-sm btn-outline-secondary me-1" title="編集" onClick={() => openEdit(mc)}>
                                    <i className="bi bi-pencil" />
                                  </button>
                                  <button className="btn btn-sm btn-outline-secondary me-1" title="独立コピー" onClick={() => handleCopy(mc)}>
                                    <i className="bi bi-copy" />
                                  </button>
                                  <button className="btn btn-sm btn-outline-primary me-1" title="派生を作る" onClick={() => openFork(mc)}>
                                    <i className="bi bi-git" />
                                  </button>
                                  <button className="btn btn-sm btn-outline-danger" title="削除" onClick={() => setDeleteTarget(mc)}>
                                    <i className="bi bi-trash" />
                                  </button>
                                </>
                              )}
                              {compareMode && (
                                <button
                                  className={`btn btn-sm ${isCompareA ? 'btn-primary' : isCompareB ? 'btn-warning' : 'btn-outline-secondary'}`}
                                  onClick={() => handleCompareClick(mc)}
                                >
                                  {isCompareA ? 'A選択中' : isCompareB ? 'B選択中' : '選択'}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ツリー表示 */}
              <div
                ref={treeContainerRef}
                className="card p-3"
                style={{
                  flex: dbViewMode === 'tree' ? 1 : 0,
                  minHeight: 0,
                  overflow: 'hidden',
                  display: dbViewMode === 'tree' ? undefined : 'none',
                  cursor: isDragging ? 'grabbing' : 'grab',
                  userSelect: 'none',
                }}
                onMouseDown={handleTreeMouseDown}
                onMouseMove={handleTreeMouseMove}
                onMouseUp={handleTreeMouseUp}
                onMouseLeave={handleTreeMouseUp}
                onClick={handleTreeClick}
              >
                {svgTreeData && (
                  <svg
                    width="100%"
                    height="100%"
                    style={{ display: 'block' }}
                  >
                    <defs>
                      <marker id="tree-arr" markerWidth="8" markerHeight="7" refX="7" refY="3.5" orient="auto">
                        <polygon points="0 0, 8 3.5, 0 7" fill="#9ab8f0" />
                      </marker>
                    </defs>

                    <g transform={`translate(${treeTransform.tx},${treeTransform.ty}) scale(${treeTransform.scale})`}>
                    {/* エッジ（ノードより先に描画して背面に） */}
                    {svgTreeData.edges.map((e, idx) => (
                      <path
                        key={idx}
                        d={`M ${e.fromX} ${e.fromY} C ${e.fromX} ${e.fromY + T_CP}, ${e.toX} ${e.toY - T_CP}, ${e.toX} ${e.toY}`}
                        fill="none"
                        stroke="#9ab8f0"
                        strokeWidth={1.5}
                        markerEnd="url(#tree-arr)"
                      />
                    ))}

                    {/* ノード（エッジより前面） */}
                    {svgTreeData.layouts.map(({ id, node: n, x, y, sizingCase: sc, sizingResult: sr }) => {
                      const isActive    = project.activeDbId === n.id;
                      const hasSizing   = !!(sc && sr);
                      const isCompA     = compareA?.id === n.id;
                      const isCompB     = compareB?.id === n.id;
                      const nodeStroke  = isCompA ? '#1a73e8' : isCompB ? '#f59e0b' : isActive ? '#f59e0b' : '#ced4da';
                      const nodeStrokeW = (isCompA || isCompB || isActive) ? 2.5 : 1.5;
                      const nodeFill    = isCompA ? '#e8f0fe' : isCompB ? '#fff8e1' : isActive ? '#fffbeb' : '#fff';
                      const truncName   = n.name.length > 24 ? n.name.slice(0, 23) + '…' : n.name;
                      const hasLog      = n.changeLog && n.changeLog.length > 0;

                      return (
                        <g
                          key={id}
                          className="tree-node"
                          style={{ cursor: 'pointer' }}
                          onClick={() => compareMode ? handleCompareClick(n) : navigate('massModel', { projectId, massCaseId: id })}
                          onContextMenu={(e) => {
                            if (compareMode) return;
                            e.preventDefault();
                            e.stopPropagation();
                            setCtxMenu({ x: e.clientX, y: e.clientY, mc: n });
                          }}
                        >
                          {/* ノードRect */}
                          <rect
                            x={x} y={y} width={TN_W} height={TN_H} rx={8}
                            fill={nodeFill} stroke={nodeStroke} strokeWidth={nodeStrokeW}
                          />

                          {/* サブラベル */}
                          <text x={x + TN_W / 2} y={y + 16} textAnchor="middle"
                            fontSize={9} fill="#9aa0a6" fontFamily="system-ui, sans-serif">
                            ロケットDB
                          </text>

                          {/* DB名 */}
                          <text x={x + TN_W / 2} y={y + 34} textAnchor="middle"
                            fontSize={13} fontWeight="700" fill="#1558c0"
                            fontFamily="system-ui, sans-serif">
                            {truncName}
                          </text>

                          {/* 有効バージョンバッジ */}
                          {isActive && !compareMode && (
                            <text x={x + TN_W / 2} y={y + 50} textAnchor="middle"
                              fontSize={10} fill="#f59e0b" fontFamily="system-ui, sans-serif">
                              ★ 有効バージョン
                            </text>
                          )}
                          {/* 比較モード選択ラベル */}
                          {compareMode && (isCompA || isCompB) && (
                            <text x={x + TN_W / 2} y={y + 50} textAnchor="middle"
                              fontSize={10} fontWeight="700" fill={isCompA ? '#1558c0' : '#e65100'} fontFamily="system-ui, sans-serif">
                              {isCompA ? '▶ A' : '▶ B'}
                            </text>
                          )}
                          {/* 変更ログアイコン */}
                          {hasLog && (
                            <g onClick={(e) => { e.stopPropagation(); setLogTarget(n); }}>
                              <circle cx={x + TN_W - 10} cy={y + 10} r={7} fill="#e8f0fe" stroke="#9ab8f0" strokeWidth={1} />
                              <text x={x + TN_W - 10} y={y + 14} textAnchor="middle" fontSize={8} fill="#1558c0" fontFamily="system-ui, sans-serif">
                                📋
                              </text>
                            </g>
                          )}

                          {/* サイジング情報（下部セクション） */}
                          {hasSizing && sc && sr && FEATURE_FLAGS.sizing ? (
                            <g>
                              <line
                                x1={x + 16} y1={y + 59} x2={x + TN_W - 16} y2={y + 59}
                                stroke="#d0e4ff" strokeWidth={1}
                              />
                              <text x={x + 14} y={y + 73} textAnchor="start"
                                fontSize={10} fontWeight="600" fill={SIZING_THEME.text}
                                fontFamily="system-ui, sans-serif">
                                {sc.name.length > 19 ? sc.name.slice(0, 18) + '…' : sc.name}
                              </text>
                              <text x={x + 14} y={y + 87} textAnchor="start"
                                fontSize={9} fill="#5f6368" fontFamily="system-ui, sans-serif">
                                {`ΔV ${sr.condition.deltaV.toLocaleString()} m/s · ${sr.totalMass.toLocaleString()} kg`}
                              </text>
                            </g>
                          ) : (
                            /* サイジングなし → 作成日のみ */
                            <text x={x + TN_W / 2} y={y + 72} textAnchor="middle"
                              fontSize={9} fill="#9aa0a6" fontFamily="system-ui, sans-serif">
                              {n.createdAt.slice(0, 10)}
                            </text>
                          )}
                        </g>
                      );
                    })}
                    </g>
                  </svg>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          解析フロー タブ
          ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'flow' && FEATURE_FLAGS.projectTabs.analysisFlow && (
        <AnalysisFlowEditor />
      )}

      {/* ══════════════════════════════════════════════════════════════
          解析トレーサビリティ タブ
          ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'analysis' && FEATURE_FLAGS.projectTabs.traceability && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {/* DB フィルタ + 凡例 */}
          <div className="d-flex align-items-center gap-2 mb-2 flex-wrap" style={{ flexShrink: 0 }}>
            <label className="form-label mb-0" style={{ fontSize: '0.82rem', fontWeight: 600 }}>
              <i className="bi bi-funnel me-1 text-primary" />
              ロケットDB:
            </label>
            <select
              className="form-select form-select-sm"
              style={{ maxWidth: 280 }}
              value={filterMassId}
              onChange={(e) => setFilterMassId(e.target.value)}
            >
              <option value="">全件表示</option>
              {massCases.map((mc) => (
                <option key={mc.id} value={mc.id}>{mc.name}</option>
              ))}
            </select>
            {filterMassId && (
              <small className="text-muted">
                <i className="bi bi-info-circle me-1" />
                選択したDBに紐づくサイジング・解析ケースのみ表示中
              </small>
            )}
          </div>
          <div className="d-flex flex-wrap align-items-center gap-3 mb-3" style={{ flexShrink: 0 }}>
            {[
              { label: 'ロケットDB',   color: COL_THEME[0].stroke },
              { label: 'サイジング',   color: SIZING_THEME.stroke },
              { label: '基本解析',     color: COL_THEME[1].stroke },
              { label: '二次解析',     color: COL_THEME[2].stroke },
              { label: '三次解析',     color: COL_THEME[3].stroke },
            ].map((item) => (
              <div key={item.label} className="d-flex align-items-center gap-1">
                <div style={{ width: 11, height: 11, background: item.color, borderRadius: 2 }} />
                <small className="text-muted">{item.label}</small>
              </div>
            ))}
            <small className="text-muted ms-auto">ノードをクリックで詳細画面へ / ホイールでスクロール</small>
          </div>

          {/* Bootstrap .card は display:flex column で SVG が縮められ overflow が
              発動しないため、display:block を強制して通常のスクロールコンテナにする */}
          <div
            className="card"
            style={{
              flex: 1,
              minHeight: 0,
              display: 'block',
              overflow: 'auto',
              padding: 12,
            }}
          >
            {diagNodes.length === 0 ? (
              <div className="text-center text-muted py-5">
                <i className="bi bi-diagram-3 fs-2 d-block mb-2 opacity-25" />
                ケースがありません
              </div>
            ) : (
              <svg width={diagSvgW} height={Math.max(diagSvgH, 200)} style={{ display: 'block' }}>
                <defs>
                  {ARROW_IDS.map((id, i) => (
                    <marker key={id} id={id} markerWidth="7" markerHeight="6" refX="6" refY="3" orient="auto">
                      <polygon points="0 0, 7 3, 0 6" fill={ARROW_COLORS[i]} />
                    </marker>
                  ))}
                </defs>

                {/* 列ヘッダー */}
                {COL_LABELS.map((label, i) => (
                  <g key={`hdr_${i}`}>
                    <rect
                      x={PAD + i * (NW + HG)} y={PAD} width={NW} height={HDR - 4} rx={5}
                      fill={i === 1 ? '#fffde7' : COL_THEME[i].bg}
                      stroke={COL_THEME[i].stroke} strokeWidth={1}
                    />
                    <text
                      x={PAD + i * (NW + HG) + NW / 2} y={PAD + (HDR - 4) / 2 + 4.5}
                      textAnchor="middle" fontSize={9.5} fontWeight="700"
                      fill={COL_THEME[i].text} fontFamily="Work Sans, sans-serif"
                    >
                      {label}
                    </text>
                  </g>
                ))}

                {(() => {
                  // ── エッジの fan-out / fan-in 位置を分散して「同一ソースから垂れ下がる」を解消 ──
                  // 同じ source から複数 outgoing がある場合、source 側の出口 y を等間隔で配る。
                  // target 側も同様。version edge (縦) は対象外。
                  const slotKey = (e: DiagEdge) => `${e.fromId}->${e.toId}`;
                  const srcSlot = new Map<string, { i: number; n: number }>();
                  const tgtSlot = new Map<string, { i: number; n: number }>();
                  const srcGroup = new Map<string, DiagEdge[]>();
                  const tgtGroup = new Map<string, DiagEdge[]>();
                  diagEdges.forEach((e) => {
                    if (e.isVersionEdge) return;
                    (srcGroup.get(e.fromId) ?? srcGroup.set(e.fromId, []).get(e.fromId)!).push(e);
                    (tgtGroup.get(e.toId)   ?? tgtGroup.set(e.toId, []).get(e.toId)!).push(e);
                  });
                  srcGroup.forEach((arr) => arr.forEach((e, i) => srcSlot.set(slotKey(e), { i, n: arr.length })));
                  tgtGroup.forEach((arr) => arr.forEach((e, i) => tgtSlot.set(slotKey(e), { i, n: arr.length })));

                  // ── ホバー時の関連エッジ/ノード集合 ──
                  const relatedNodes = new Set<string>();
                  if (hoveredNodeId) {
                    relatedNodes.add(hoveredNodeId);
                    diagEdges.forEach((e) => {
                      if (e.fromId === hoveredNodeId) relatedNodes.add(e.toId);
                      if (e.toId === hoveredNodeId)   relatedNodes.add(e.fromId);
                    });
                  }
                  const isEdgeActive = (e: DiagEdge) =>
                    !hoveredNodeId || e.fromId === hoveredNodeId || e.toId === hoveredNodeId;
                  const isNodeActive = (id: string) => !hoveredNodeId || relatedNodes.has(id);
                  return (
                    <>
                      {/* エッジ */}
                      {diagEdges.map((e, idx) => {
                        const from = diagNodeMap.get(e.fromId);
                        const to   = diagNodeMap.get(e.toId);
                        if (!from || !to) return null;
                        const active = isEdgeActive(e);
                        const baseOp = hoveredNodeId ? (active ? 0.95 : 0.06) : 0.55;
                        const baseWidth = hoveredNodeId && active ? 2.5 : 1.5;

                        if (e.isVersionEdge) {
                          const cx = from.x + NW / 2;
                          const y1 = from.y + NH;
                          const y2 = to.y;
                          return (
                            <path key={idx}
                              d={`M ${cx} ${y1} C ${cx} ${y1 + 8}, ${cx} ${y2 - 8}, ${cx} ${y2}`}
                              fill="none" stroke={e.stroke}
                              strokeWidth={hoveredNodeId && active ? 3 : 2}
                              opacity={hoveredNodeId ? (active ? 1 : 0.08) : 0.9}
                              markerEnd={`url(#${e.arrowId})`}
                            />
                          );
                        }

                        const goingBack = from.col > to.col;
                        // source / target Y を slot で均等分散 (両端の余白 1/(n+1))
                        const s = srcSlot.get(slotKey(e));
                        const t = tgtSlot.get(slotKey(e));
                        const srcFrac = s ? (s.i + 1) / (s.n + 1) : 0.5;
                        const tgtFrac = t ? (t.i + 1) / (t.n + 1) : 0.5;
                        const x1 = goingBack ? from.x       : from.x + NW;
                        const y1 = from.y + NH * srcFrac;
                        const x2 = goingBack ? to.x + NW    : to.x;
                        const y2 = to.y + NH * tgtFrac;
                        // 水平距離の 40% でカーブを起こす → 同レーンに集約された綺麗な S 字
                        const dx = Math.abs(x2 - x1);
                        const cp = Math.max(20, dx * 0.4);
                        const c1x = goingBack ? x1 - cp : x1 + cp;
                        const c2x = goingBack ? x2 + cp : x2 - cp;
                        return (
                          <path key={idx}
                            d={`M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`}
                            fill="none" stroke={e.stroke} strokeWidth={baseWidth}
                            strokeDasharray={hoveredNodeId && active ? '0' : '5 3'}
                            opacity={baseOp}
                            markerEnd={`url(#${e.arrowId})`}
                          />
                        );
                      })}

                      {/* ノード */}
                      {diagNodes.map((node) => {
                        // サブラベルが name と完全一致 or 含まれる場合は冗長なので非表示
                        const lname = node.name.toLowerCase();
                        const lsub  = node.sublabel.toLowerCase();
                        const subRedundant = !lsub || lname === lsub || lname.includes(lsub) || lsub.includes(lname);
                        const truncName = node.name.length > 22 ? node.name.slice(0, 21) + '…' : node.name;
                        const truncSub  = subRedundant
                          ? ''
                          : (node.sublabel.length > 24 ? node.sublabel.slice(0, 23) + '…' : node.sublabel);
                        const isActive = isNodeActive(node.id);
                        const isHovered = node.id === hoveredNodeId;
                        return (
                          <g key={node.id}
                             style={{ cursor: 'pointer' }}
                             onClick={() => handleDiagNodeClick(node)}
                             onMouseEnter={() => setHoveredNodeId(node.id)}
                             onMouseLeave={() => setHoveredNodeId((cur) => (cur === node.id ? null : cur))}
                             opacity={isActive ? 1 : 0.18}>
                            <rect
                              x={node.x} y={node.y} width={NW} height={NH} rx={7}
                              fill={node.theme.bg}
                              stroke={isHovered ? '#0f172a' : node.theme.stroke}
                              strokeWidth={isHovered ? 2.5 : 1.5}
                              style={{ filter: isHovered ? 'drop-shadow(0 2px 6px rgba(0,0,0,0.18))' : undefined }}
                            />
                            {truncSub && (
                              <text x={node.x + NW / 2} y={node.y + NH / 2 - 8}
                                textAnchor="middle" fontSize={9} fill="#6c757d"
                                fontFamily="Work Sans, sans-serif">
                                {truncSub}
                              </text>
                            )}
                            <text x={node.x + NW / 2} y={node.y + NH / 2 + (truncSub ? 9 : 4)}
                              textAnchor="middle" fontSize={12} fontWeight="600"
                              fill={node.theme.text} fontFamily="Work Sans, sans-serif">
                              {truncName}
                            </text>
                            {node.type === 'mass' && node.sizingResultApplied && (
                              <g>
                                <circle cx={node.x + NW - 8} cy={node.y + 8} r={7} fill="#34a853" />
                                <text x={node.x + NW - 8} y={node.y + 12}
                                  textAnchor="middle" fontSize={9} fill="#fff" fontWeight="700">✓</text>
                              </g>
                            )}
                          </g>
                        );
                      })}
                    </>
                  );
                })()}
              </svg>
            )}
          </div>
        </div>
      )}
      {/* ── 右クリックコンテキストメニュー ─────────────────────────────── */}
      {ctxMenu && (
        <div
          style={{
            position: 'fixed',
            top: Math.min(ctxMenu.y, window.innerHeight - 260),
            left: Math.min(ctxMenu.x, window.innerWidth - 180),
            zIndex: 9999, background: '#fff',
            border: '1px solid #dee2e6', borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: 160,
            padding: '4px 0',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {[
            { icon: 'bi-folder2-open',   label: '開く',              action: () => { navigate('massModel', { projectId, massCaseId: ctxMenu.mc.id }); setCtxMenu(null); } },
            { icon: 'bi-star',           label: '有効バージョンに設定', action: () => { setActiveDb(projectId!, ctxMenu.mc.id); setCtxMenu(null); } },
            { icon: 'bi-journal-text',   label: '変更ログを表示',    action: () => { setLogTarget(ctxMenu.mc); setCtxMenu(null); } },
            { icon: 'bi-pencil',         label: '編集',              action: () => { openEdit(ctxMenu.mc); setCtxMenu(null); } },
            { icon: 'bi-copy',           label: '独立コピー',        action: () => { handleCopy(ctxMenu.mc); setCtxMenu(null); } },
            { icon: 'bi-git',            label: '派生を作る',        action: () => { openFork(ctxMenu.mc); setCtxMenu(null); } },
          ].map(({ icon, label, action }) => (
            <button key={label}
              className="btn btn-link btn-sm d-flex align-items-center gap-2 w-100 text-start px-3 py-1 text-dark"
              style={{ textDecoration: 'none', borderRadius: 0 }}
              onClick={action}
            >
              <i className={`bi ${icon}`} style={{ width: 16 }} />{label}
            </button>
          ))}
          <hr className="my-1" />
          <button
            className="btn btn-link btn-sm d-flex align-items-center gap-2 w-100 text-start px-3 py-1 text-danger"
            style={{ textDecoration: 'none', borderRadius: 0 }}
            onClick={() => { setDeleteTarget(ctxMenu.mc); setCtxMenu(null); }}
          >
            <i className="bi bi-trash" style={{ width: 16 }} />削除
          </button>
        </div>
      )}

      {/* ── 編集モーダル ──────────────────────────────────────────────── */}
      {editTarget && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="modal-dialog modal-sm">
            <div className="modal-content">
              <div className="modal-header py-2">
                <h6 className="modal-title"><i className="bi bi-pencil me-2" />DB編集</h6>
                <button className="btn-close btn-sm" onClick={() => setEditTarget(null)} />
              </div>
              <div className="modal-body">
                {[
                  { label: 'DB名', key: 'name', required: true },
                  { label: '作成者', key: 'createdBy', required: false },
                  { label: 'メモ', key: 'memo', required: false },
                ].map(({ label, key, required }) => (
                  <div className="mb-2" key={key}>
                    <label className="form-label fw-medium" style={{ fontSize: '0.85rem' }}>
                      {label}{required && <span className="text-danger ms-1">*</span>}
                    </label>
                    {key === 'memo' ? (
                      <textarea className="form-control form-control-sm" rows={2}
                        value={editForm[key as keyof typeof editForm]}
                        onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })} />
                    ) : (
                      <input className="form-control form-control-sm"
                        value={editForm[key as keyof typeof editForm]}
                        onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })} />
                    )}
                  </div>
                ))}
              </div>
              <div className="modal-footer py-2">
                <button className="btn btn-secondary btn-sm" onClick={() => setEditTarget(null)}>キャンセル</button>
                <button className="btn btn-primary btn-sm" onClick={handleEditSave} disabled={!editForm.name.trim()}>保存</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 派生モーダル ──────────────────────────────────────────────── */}
      {forkTarget && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header py-2">
                <h6 className="modal-title"><i className="bi bi-git me-2 text-primary" />派生DBを作成</h6>
                <button className="btn-close btn-sm" onClick={() => setForkTarget(null)} />
              </div>
              <div className="modal-body">
                <p className="text-muted mb-3" style={{ fontSize: '0.82rem' }}>
                  <strong>{forkTarget.name}</strong> を派生元として新しいDBを作成します。
                </p>
                <div className="mb-2">
                  <label className="form-label fw-medium" style={{ fontSize: '0.85rem' }}>
                    新DBの名前 <span className="text-danger">*</span>
                  </label>
                  <input className="form-control form-control-sm" value={forkName}
                    onChange={(e) => setForkName(e.target.value)}
                    autoFocus placeholder="例: 再使用型・LOX/RP-1 改良案" />
                </div>
                <hr className="my-2" />
                <p className="text-muted mb-2" style={{ fontSize: '0.78rem' }}>
                  <i className="bi bi-journal-text me-1" />以下は変更ログへ自動記録されます（省略可）
                </p>
                <div className="mb-2">
                  <label className="form-label fw-medium" style={{ fontSize: '0.82rem' }}>変更概要</label>
                  <input className="form-control form-control-sm" value={forkSummary}
                    onChange={(e) => setForkSummary(e.target.value)}
                    placeholder="例: 再使用回収脚の追加による重量増加を検討" />
                </div>
                <div className="mb-2">
                  <label className="form-label fw-medium" style={{ fontSize: '0.82rem' }}>変更理由・背景</label>
                  <textarea className="form-control form-control-sm" rows={2} value={forkRationale}
                    onChange={(e) => setForkRationale(e.target.value)}
                    placeholder="例: フェーズB審査での指摘を受け、再使用ケースの質量感度分析が必要になった" />
                </div>
                <div className="mb-0">
                  <label className="form-label fw-medium" style={{ fontSize: '0.82rem' }}>参照ドキュメントURL（1行1件）</label>
                  <textarea className="form-control form-control-sm" rows={2} value={forkDocUrls}
                    onChange={(e) => setForkDocUrls(e.target.value)}
                    placeholder={'https://confluence.example.com/review-B\nhttps://docs.example.com/reusable-study'} />
                </div>
              </div>
              <div className="modal-footer py-2">
                <button className="btn btn-secondary btn-sm" onClick={() => setForkTarget(null)}>キャンセル</button>
                <button className="btn btn-primary btn-sm" onClick={handleFork} disabled={!forkName.trim()}>作成して開く</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 変更ログモーダル ──────────────────────────────────────────── */}
      {logTarget && (
        <ChangeLogModal
          mc={logTarget}
          onClose={() => setLogTarget(null)}
        />
      )}

      {/* ── DB比較モーダル ────────────────────────────────────────────── */}
      {showDiff && compareA && compareB && (
        <DbDiffModal
          caseA={compareA}
          caseB={compareB}
          onClose={() => {
            setShowDiff(false);
            setCompareA(null);
            setCompareB(null);
            setCompareMode(false);
          }}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          itemName={deleteTarget.name}
          description="関連するコンポーネント・パラメータもすべて削除されます。"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};
