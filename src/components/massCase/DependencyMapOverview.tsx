import React, { useState } from 'react';
import type { MassComponent, Parameter } from '../../types';
import type { CrossRefVarDoc } from '../../utils/crossRefScope';

interface Props {
  components: MassComponent[];
  parameters: Parameter[];
  propVars: CrossRefVarDoc[];
  shapeVars: CrossRefVarDoc[];
}

// ── レイアウト定数 ──────────────────────────
const NODE_W        = 152;
const NODE_H        = 42;
const H_STEP        = 178;  // レベルごとの横幅（NODE_W + 26）
const V_GAP         = 10;   // 兄弟ノード縦隙間
const PAD_X         = 20;
const PAD_Y         = 36;
const PARAM_W       = 155;
const PARAM_H       = 36;
const PARAM_V_GAP   = 8;
const TREE_PARAM_X  = 80;   // ツリー右端からパラメータ列までの隙間

// ── ノード色（inputType別） ──────────────────
const NODE_C: Record<string, { fill: string; stroke: string; text: string }> = {
  aggregate:  { fill: '#f8fafc', stroke: '#94a3b8', text: '#475569' },
  fixed:      { fill: '#f0fdf4', stroke: '#4ade80', text: '#166534' },
  design_var: { fill: '#fefce8', stroke: '#facc15', text: '#713f12' },
  formula:    { fill: '#eff6ff', stroke: '#60a5fa', text: '#1e40af' },

};
const NODE_LABEL: Record<string, string> = {
  aggregate: '集計', fixed: '固定', design_var: '設変', formula: '式',
};

// ── パラメータ色（ソース種別） ───────────────
type SourceType = 'param' | 'crossref' | 'compvar';
const PARAM_C: Record<SourceType, { fill: string; stroke: string; text: string }> = {
  param:    { fill: '#dbeafe', stroke: '#3b82f6', text: '#1d4ed8' },
  crossref: { fill: '#fef3c7', stroke: '#f59e0b', text: '#92400e' },
  compvar:  { fill: '#f3f4f6', stroke: '#9ca3af', text: '#374151' },
};
const SOURCE_LABEL: Record<SourceType, string> = {
  param: 'パラメータ', crossref: '外部参照', compvar: 'コンポーネント変数',
};

// ── 矢印カラーパレット（formulaノードごとに割当） ──
const ARROW_COLORS = [
  '#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#06b6d4','#84cc16','#ec4899','#f97316','#6366f1',
  '#0ea5e9','#14b8a6',
];

function findRefs(formula: string, varNames: string[]): string[] {
  return varNames.filter((v) => v && new RegExp(`\\b${v}\\b`).test(formula));
}
function trunc(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function fmtVal(v: number | null | undefined) {
  if (v == null) return '';
  return Math.abs(v) >= 1000
    ? v.toLocaleString('ja-JP', { maximumFractionDigits: 0 })
    : v.toLocaleString('ja-JP', { maximumFractionDigits: 3 });
}

interface NodePos { x: number; y: number; cx: number; cy: number; }
interface ParamNode {
  varName: string;
  sourceType: SourceType;
  label: string;
  value?: number | null;
  compName?: string;
  formula?: string;
  pos: { x: number; y: number; cy: number };
}
interface DepEdge {
  key: string;
  compId: string;
  varName: string;
  color: string;
  d: string;  // bezier path
}

// ════════════════════════════════════════════
export const DependencyMapOverview: React.FC<Props> = ({
  components, parameters, propVars, shapeVars,
}) => {
  const [highlightVar, setHighlightVar] = useState<string | null>(null);

  if (components.length === 0) {
    return (
      <div className="text-center text-muted py-5" style={{ fontSize: '0.88rem' }}>
        <i className="bi bi-diagram-3 fs-3 d-block mb-2 opacity-25" />コンポーネントがありません
      </div>
    );
  }

  // ── ソース変数マップ ────────────────────────
  const sourceMap = new Map<string, { type: SourceType; label: string; value?: number | null; compName?: string; formula?: string }>();
  parameters.forEach((p) => {
    if (p.varName) sourceMap.set(p.varName, {
      type: 'param',
      label: p.name || p.varName,
      value: p.inputType === 'formula' ? null : p.value,
      formula: p.inputType === 'formula' ? p.formula : undefined,
    });
  });
  [...propVars, ...shapeVars].forEach((v) => {
    if (v.varName) sourceMap.set(v.varName, { type: 'crossref', label: v.varName, value: v.value as number });
  });
  components
    .filter((c) => c.varName && c.inputType !== 'formula')
    .forEach((c) => {
      if (c.varName) sourceMap.set(c.varName, { type: 'compvar', label: c.paramName, compName: c.paramName });
    });
  const allVarNames = [...sourceMap.keys()];

  // ── 各 formula の依存変数 ──────────
  const compDepsMap = new Map<string, string[]>();
  components.forEach((c) => {
    if (c.inputType === 'formula') {
      const refs = findRefs(c.valueOrFormula, allVarNames);
      if (refs.length > 0) compDepsMap.set(c.id, refs);
    }
  });

  // ── 横向きツリーレイアウト ──────────────────
  // parentId は親の logicalId を指す場合があるため、comp.id に正規化する
  const idByLogicalOrId = new Map<string, string>();
  components.forEach((c) => idByLogicalOrId.set(c.logicalId || c.id, c.id));

  const childrenOf = new Map<string | null, MassComponent[]>();
  components.forEach((c) => {
    const parentKey = c.parentId ? (idByLogicalOrId.get(c.parentId) ?? c.parentId) : null;
    if (!childrenOf.has(parentKey)) childrenOf.set(parentKey, []);
    childrenOf.get(parentKey)!.push(c);
  });
  childrenOf.forEach((arr) => arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));

  // 実際のツリー深さを計算（comp.level ではなく tree から導出）
  const depthMap = new Map<string, number>();
  function calcDepth(id: string, depth: number): void {
    depthMap.set(id, depth);
    (childrenOf.get(id) ?? []).forEach((child) => calcDepth(child.id, depth + 1));
  }
  (childrenOf.get(null) ?? []).forEach((root) => calcDepth(root.id, 0));

  // サブツリー高さ（縦方向）
  function subtreeH(id: string): number {
    const children = childrenOf.get(id) ?? [];
    if (children.length === 0) return NODE_H;
    const total = children.reduce(
      (sum, c, i) => sum + subtreeH(c.id) + (i < children.length - 1 ? V_GAP : 0), 0,
    );
    return Math.max(NODE_H, total);
  }

  // ノード配置（横: 実深さ*H_STEP, 縦: サブツリー中心）
  const nodePos = new Map<string, NodePos>();
  function placeNode(id: string, topY: number): void {
    const sh = subtreeH(id);
    const cy = topY + sh / 2;
    const depth = depthMap.get(id) ?? 0;
    const x = PAD_X + depth * H_STEP;
    nodePos.set(id, { x, y: cy - NODE_H / 2, cx: x + NODE_W / 2, cy });
    let childTop = topY;
    (childrenOf.get(id) ?? []).forEach((child) => {
      placeNode(child.id, childTop);
      childTop += subtreeH(child.id) + V_GAP;
    });
  }
  let rootTop = PAD_Y;
  (childrenOf.get(null) ?? []).forEach((root) => {
    placeNode(root.id, rootTop);
    rootTop += subtreeH(root.id) + V_GAP * 3;
  });

  // ── ツリー右端 x ──────────────────────────
  const allPos = [...nodePos.values()];
  const treeRightX = allPos.length > 0 ? Math.max(...allPos.map((p) => p.x + NODE_W)) : 300;
  const paramColX = treeRightX + TREE_PARAM_X;

  // ── 使用されている変数だけ抽出し、平均cy順でソート（交差最小化） ──
  const usedVars = new Set<string>();
  compDepsMap.forEach((vars) => vars.forEach((v) => usedVars.add(v)));

  const sortedVars = [...usedVars]
    .filter((v) => sourceMap.has(v))
    .sort((a, b) => {
      const avgY = (varName: string) => {
        const ys = [...compDepsMap.entries()]
          .filter(([, deps]) => deps.includes(varName))
          .map(([id]) => nodePos.get(id)?.cy ?? 0);
        return ys.length > 0 ? ys.reduce((s, y) => s + y, 0) / ys.length : 0;
      };
      return avgY(a) - avgY(b);
    });

  // ── パラメータノード配置 ──────────────────
  const totalParamH =
    sortedVars.length * PARAM_H + Math.max(0, sortedVars.length - 1) * PARAM_V_GAP;
  const treeCenter = (PAD_Y + rootTop) / 2;
  const paramTopY = Math.max(PAD_Y, treeCenter - totalParamH / 2);

  const paramNodes: ParamNode[] = sortedVars.map((varName, i) => {
    const info = sourceMap.get(varName)!;
    const y = paramTopY + i * (PARAM_H + PARAM_V_GAP);
    return {
      varName,
      sourceType: info.type,
      label: info.label,
      value: info.value,
      compName: info.compName,
      formula: info.formula,
      pos: { x: paramColX, y, cy: y + PARAM_H / 2 },
    };
  });
  const paramCyMap = new Map(paramNodes.map((p) => [p.varName, p.pos.cy]));

  // ── formula ノードに色割当 ──────────────────
  const formulaIds = [...compDepsMap.keys()];
  const formulaColor = new Map(formulaIds.map((id, i) => [id, ARROW_COLORS[i % ARROW_COLORS.length]]));

  // ── 依存エッジ生成 ─────────────────────────
  const depEdges: DepEdge[] = [];
  compDepsMap.forEach((vars, compId) => {
    const from = nodePos.get(compId);
    if (!from) return;
    const color = formulaColor.get(compId) ?? '#94a3b8';
    vars.forEach((varName, vi) => {
      const toCy = paramCyMap.get(varName);
      if (toCy == null) return;
      const x1 = from.x + NODE_W;
      const y1 = from.cy;
      const x2 = paramColX;
      const y2 = toCy;
      // ベジェ曲線（水平方向に強いカーブ）
      const cpX = x1 + (x2 - x1) * 0.55;
      depEdges.push({
        key: `${compId}-${varName}-${vi}`,
        compId,
        varName,
        color,
        d: `M${x1},${y1} C${cpX},${y1} ${cpX},${y2} ${x2},${y2}`,
      });
    });
  });

  // ── ツリーエッジ生成 ─────────────────────
  const treeEdges = components
    .filter((c) => c.parentId)
    .map((c) => {
      const parentId = idByLogicalOrId.get(c.parentId!) ?? c.parentId!;
      const par = nodePos.get(parentId);
      const child = nodePos.get(c.id);
      if (!par || !child) return null;
      const midX = par.x + NODE_W + (child.x - par.x - NODE_W) / 2;
      return {
        key: c.id,
        d: `M${par.x + NODE_W},${par.cy} L${midX},${par.cy} L${midX},${child.cy} L${child.x},${child.cy}`,
      };
    })
    .filter(Boolean) as { key: string; d: string }[];

  // ── SVG サイズ ────────────────────────────
  const svgW = paramColX + PARAM_W + PAD_X;
  const svgH = Math.max(
    rootTop + PAD_Y,
    paramTopY + totalParamH + PAD_Y,
    100,
  );

  // ── ハイライト計算 ─────────────────────────
  const highlightedCompIds = highlightVar
    ? new Set([...compDepsMap.entries()].filter(([, deps]) => deps.includes(highlightVar)).map(([id]) => id))
    : null;

  return (
    <div>
      {/* ── ハイライトバー ── */}
      {highlightVar && (
        <div className="d-flex align-items-center gap-2 px-3 py-1 border-bottom"
          style={{ fontSize: '0.76rem', background: '#f0f9ff' }}>
          <i className="bi bi-funnel text-info" />
          <code className="text-info fw-semibold">{highlightVar}</code>
          <span className="text-muted">を参照しているコンポーネントをハイライト中</span>
          <button className="btn btn-sm btn-link text-danger p-0 ms-auto"
            style={{ fontSize: '0.72rem' }} onClick={() => setHighlightVar(null)}>
            ✕ 解除
          </button>
        </div>
      )}

      {/* ── 凡例 ── */}
      <div className="d-flex gap-3 flex-wrap px-3 py-2 border-bottom" style={{ fontSize: '0.71rem' }}>
        <span className="fw-medium text-muted">コンポーネント:</span>
        {Object.entries(NODE_LABEL).map(([type, label]) => (
          <span key={type} className="d-inline-flex align-items-center gap-1">
            <span style={{ width: 10, height: 10, borderRadius: 2, display: 'inline-block', background: NODE_C[type].fill, border: `1.5px solid ${NODE_C[type].stroke}` }} />
            {label}
          </span>
        ))}
        <span className="fw-medium text-muted ms-3">参照変数:</span>
        {(Object.keys(SOURCE_LABEL) as SourceType[]).map((t) => (
          <span key={t} className="d-inline-flex align-items-center gap-1">
            <span style={{ width: 10, height: 10, borderRadius: 2, display: 'inline-block', background: PARAM_C[t].fill, border: `1.5px solid ${PARAM_C[t].stroke}` }} />
            {SOURCE_LABEL[t]}
          </span>
        ))}
        <span className="text-muted ms-auto" style={{ fontSize: '0.68rem' }}>
          右列の変数クリックでハイライト
        </span>
      </div>

      {/* ── SVG本体 ── */}
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 600 }}>
        <svg width={svgW} height={svgH} style={{ display: 'block', minWidth: 420 }}>
          <defs>
            {/* 矢印マーカー（各色） */}
            {ARROW_COLORS.map((color) => (
              <marker key={color} id={`arr-${color.slice(1)}`}
                viewBox="0 0 8 8" refX="7" refY="4"
                markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M0,0 L8,4 L0,8 z" fill={color} />
              </marker>
            ))}
            {/* ツリーエッジ用マーカー */}
            <marker id="arr-tree" viewBox="0 0 8 8" refX="7" refY="4"
              markerWidth="4" markerHeight="4" orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 z" fill="#94a3b8" />
            </marker>
          </defs>

          {/* ── ツリーエッジ ── */}
          {treeEdges.map(({ key, d }) => (
            <path key={key} d={d} fill="none" stroke="#cbd5e1" strokeWidth={1.5}
              markerEnd="url(#arr-tree)" />
          ))}

          {/* ── 依存エッジ ── */}
          {depEdges.map(({ key, compId, varName, color, d }) => {
            const isVarHL  = highlightVar === varName;
            const isCompHL = highlightedCompIds?.has(compId) ?? false;
            const active   = highlightVar == null || isVarHL;
            const opacity  = highlightVar == null ? 0.40 : (active ? 1 : 0.05);
            const width    = isVarHL || (highlightVar == null) ? 1.5 : (isCompHL ? 2 : 1.5);
            return (
              <path key={key} d={d} fill="none"
                stroke={color} strokeWidth={width} strokeOpacity={opacity}
                markerEnd={`url(#arr-${color.slice(1)})`}
              />
            );
          })}

          {/* ── ツリーノード ── */}
          {components.map((comp) => {
            const pos = nodePos.get(comp.id);
            if (!pos) return null;
            const col = NODE_C[comp.inputType] ?? NODE_C.aggregate;
            const isFormula = comp.inputType === 'formula';
            const hasDeps   = compDepsMap.has(comp.id);
            const compColor = hasDeps ? formulaColor.get(comp.id) : undefined;
            const dimmed    = highlightedCompIds != null && !highlightedCompIds.has(comp.id) && hasDeps;

            return (
              <g key={comp.id} opacity={dimmed ? 0.22 : 1}>
                <rect x={pos.x} y={pos.y} width={NODE_W} height={NODE_H} rx={5}
                  fill={col.fill}
                  stroke={compColor && !dimmed ? compColor : col.stroke}
                  strokeWidth={compColor && !dimmed ? 2 : 1.5} />
                {/* ノード名 */}
                <text x={pos.x + 8} y={pos.y + (isFormula ? 15 : 26)}
                  fontSize={11} fontWeight={500} fill={col.text}>
                  {trunc(comp.paramName, 16)}
                </text>
                {/* formula プレビュー */}
                {isFormula && (
                  <text x={pos.x + 8} y={pos.y + 31}
                    fontSize={9} fill={col.text} opacity={0.72} fontFamily="monospace">
                    {trunc(comp.valueOrFormula, 22)}
                  </text>
                )}
                {/* varName (非formula) */}
                {!isFormula && comp.varName && (
                  <text x={pos.x + 8} y={pos.y + 31}
                    fontSize={9} fill={col.text} opacity={0.5} fontFamily="monospace">
                    {comp.varName}
                  </text>
                )}
                {/* 型バッジ（右上） */}
                <text x={pos.x + NODE_W - 5} y={pos.y + 12}
                  fontSize={8} fill={col.stroke} textAnchor="end" fontWeight={700} opacity={0.85}>
                  {NODE_LABEL[comp.inputType]}
                </text>
              </g>
            );
          })}

          {/* ── パラメータ列ヘッダー ── */}
          {paramNodes.length > 0 && (
            <text x={paramColX + PARAM_W / 2} y={paramTopY - 14}
              textAnchor="middle" fontSize={10} fill="#6b7280" fontWeight={700}>
              参照変数
            </text>
          )}

          {/* ── パラメータノード ── */}
          {paramNodes.map((p) => {
            const col = PARAM_C[p.sourceType];
            const isHL  = highlightVar === p.varName;
            const dimmed = highlightVar != null && !isHL;
            // 計算式があれば式を表示、なければ値/コンポーネント名
            const subStr = p.formula
              ? `= ${trunc(p.formula, 20)}`
              : p.value != null ? fmtVal(p.value) : (p.compName ?? '');
            return (
              <g key={p.varName}
                style={{ cursor: 'pointer' }}
                opacity={dimmed ? 0.18 : 1}
                onClick={() => setHighlightVar(isHL ? null : p.varName)}>
                <rect x={p.pos.x} y={p.pos.y} width={PARAM_W} height={PARAM_H} rx={5}
                  fill={col.fill}
                  stroke={isHL ? '#0ea5e9' : col.stroke}
                  strokeWidth={isHL ? 2.5 : 1.5} />
                {/* varName */}
                <text x={p.pos.x + 8} y={p.pos.y + 15}
                  fontSize={11} fill={col.text} fontFamily="monospace" fontWeight={600}>
                  {p.varName}
                </text>
                {/* 計算式 or 値 or コンポーネント名 */}
                {subStr && (
                  <text x={p.pos.x + 8} y={p.pos.y + 28}
                    fontSize={9} fill={p.formula ? '#1d4ed8' : col.text} opacity={0.75}
                    fontFamily={p.formula ? 'monospace' : undefined}>
                    {subStr}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
