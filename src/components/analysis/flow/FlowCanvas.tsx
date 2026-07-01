import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type EdgeChange,
  type OnNodeDrag,
  type IsValidConnection,
  type ReactFlowInstance,
  MarkerType,
} from '@xyflow/react';

import { useAnalysisFlowStore } from '../../../stores/analysisFlowStore';
import { useAnalysisStore } from '../../../stores/analysisStore';
import type { AnalysisFlow, AnalysisServiceType } from '../../../types';
import { SERVICE_META } from '../analysisServiceMeta';
import FlowStepNode from './FlowStepNode';
import LoopEdge from './LoopEdge';
import { stepsToNodes, stepsToEdges, wouldCreateCycle } from './flowUtils';
import type { FlowStepNodeType } from './flowUtils';
import { StepDetailPanel } from './StepDetailPanel';

// ─── 重要: NODE_TYPES / EDGE_TYPES はモジュールレベルで定義 ─────────────────
// コンポーネント内に置くと毎レンダーで新しいオブジェクト参照が生成され、
// ReactFlow が全ノードをアンマウント→リマウントする深刻なバグが起きる。
const NODE_TYPES = { flowStep: FlowStepNode } as const;
const EDGE_TYPES = { loopEdge: LoopEdge } as const;

// ─── FlowCanvas ───────────────────────────────────────────────────────────────

interface FlowCanvasProps {
  flow: AnalysisFlow;
  projectId: string;
  /** 外部 (FlowCard) からの選択制御。未指定なら内部 state を使う */
  selectedStepId?: string | null;
  onSelectedStepIdChange?: (id: string | null) => void;
  /** ノードクリック時に呼ばれる（条件設定でモーダルを開くために使用）。指定時は選択トグルの代わりに実行。 */
  onNodeOpen?: (stepId: string) => void;
  /** 左上の実行バー（全フロー実行等）を隠す（条件設定では実行は別タブで行う）。 */
  hideRunBar?: boolean;
}

export const FlowCanvas: React.FC<FlowCanvasProps> = ({ flow, projectId, selectedStepId: externalSelectedId, onSelectedStepIdChange, onNodeOpen, hideRunBar }) => {
  const updateStep = useAnalysisFlowStore((s) => s.updateStep);
  const deleteStep = useAnalysisFlowStore((s) => s.deleteStep);
  const addStep = useAnalysisFlowStore((s) => s.addStep);
  const updateStepPosition = useAnalysisFlowStore((s) => s.updateStepPosition);
  const addForwardEdge = useAnalysisFlowStore((s) => s.addForwardEdge);
  const removeForwardEdge = useAnalysisFlowStore((s) => s.removeForwardEdge);
  const runFullFlow = useAnalysisFlowStore((s) => s.runFullFlow);
  const runSingleStep = useAnalysisFlowStore((s) => s.runSingleStep);
  const resetAllSteps = useAnalysisFlowStore((s) => s.resetAllSteps);

  // ノード上のアイコン用に analysisCase.id → serviceType の Map を作る
  const analysisCases = useAnalysisStore((s) => s.cases);
  const serviceByCaseId = useMemo(() => {
    const m = new Map<string, AnalysisServiceType>();
    for (const c of analysisCases) m.set(c.id, c.serviceType);
    return m;
  }, [analysisCases]);

  // 右クリックコンテキストメニュー (ノード上 = stepId 指定 / キャンバス上 = stepId null)
  const [contextMenu, setContextMenu] = useState<
    { x: number; y: number; stepId: string | null } | null
  >(null);

  // ステップをorder順でソート（memoize して参照安定化）
  const sortedSteps = useMemo(
    () => [...flow.steps].sort((a, b) => a.order - b.order),
    [flow.steps]
  );

  // ReactFlow 用ローカルステート（useNodesState / useEdgesState）
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowStepNodeType>(
    stepsToNodes(sortedSteps, { serviceByCaseId })
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    stepsToEdges(sortedSteps)
  );

  // 選択中のステップ ID。外部制御(props)があればそちらを正、なければ内部 state
  const [internalSelectedStepId, setInternalSelectedStepId] = useState<string | null>(null);
  const selectedStepId = externalSelectedId !== undefined ? externalSelectedId : internalSelectedStepId;
  const setSelectedStepId = (next: string | null | ((prev: string | null) => string | null)) => {
    const newVal = typeof next === 'function' ? (next as (p: string | null) => string | null)(selectedStepId) : next;
    if (onSelectedStepIdChange) onSelectedStepIdChange(newVal);
    else setInternalSelectedStepId(newVal);
  };

  // ── Zustand → ReactFlow 同期 ─────────────────────────────────────────────
  // sortedSteps が変わった（ステップ追加・編集・削除・ループ変更）ときに
  // ReactFlow のノード/エッジを更新する。
  // isSyncingRef により setNodes→onNodesChange→再レンダー のループを防ぐ。
  const isSyncingRef = useRef(false);
  useEffect(() => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setNodes(stepsToNodes(sortedSteps, { serviceByCaseId }));
    setEdges(stepsToEdges(sortedSteps));
    setTimeout(() => { isSyncingRef.current = false; }, 0);
  }, [sortedSteps, serviceByCaseId, setNodes, setEdges]);

  // 選択中のステップが削除された場合はパネルを閉じる
  useEffect(() => {
    if (selectedStepId && !sortedSteps.find((s) => s.id === selectedStepId)) {
      setSelectedStepId(null);
    }
  }, [sortedSteps, selectedStepId]);

  // ── ノードドラッグ終了 → 座標を Zustand に永続化 ─────────────────────────
  const handleNodeDragStop = useCallback<OnNodeDrag<FlowStepNodeType>>(
    (_event, node) => {
      updateStepPosition(flow.id, node.id, node.position);
    },
    [flow.id, updateStepPosition]
  );

  // ── 接続バリデーション: フォワード(上下) / ループ(右左) ──────────────────
  // 上下ハンドル: 任意の前向き接続 (サイクルにならない範囲で並列分岐・合流を許可)
  // 右左ハンドル: ループ。判定ステップ (kind='decision') からのみ繋げられる
  const isValidConnection = useCallback<IsValidConnection>(
    (connection) => {
      const src = sortedSteps.find((s) => s.id === connection.source);
      const tgt = sortedSteps.find((s) => s.id === connection.target);
      if (!src || !tgt || src.id === tgt.id) return false;
      const isLoop =
        connection.sourceHandle === 'right' || connection.targetHandle === 'left';
      if (isLoop) {
        // ループ元は判定ステップ限定
        return src.kind === 'decision';
      }
      // フォワード: DAG を保つためサイクル禁止
      return !wouldCreateCycle(src.id, tgt.id, sortedSteps);
    },
    [sortedSteps]
  );

  // ── 接続確定 → ハンドル種別で forward / loop を振り分けて保存 ──────────────
  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const isLoop =
        connection.sourceHandle === 'right' || connection.targetHandle === 'left';
      if (isLoop) {
        const src = sortedSteps.find((s) => s.id === connection.source);
        if (src?.kind !== 'decision') return; // 通常ステップからのループ作成は禁止
        updateStep(flow.id, connection.source, {
          loopBackToStepId: connection.target,
        });
        setEdges((eds) =>
          addEdge(
            {
              ...connection,
              type: 'loopEdge',
              animated: true,
              deletable: true,
              markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b' },
            },
            eds
          )
        );
      } else {
        addForwardEdge(flow.id, connection.source, connection.target);
        // Zustand → ReactFlow 同期は useEffect 経由で行われるので setEdges 不要
      }
    },
    [flow.id, updateStep, addForwardEdge, setEdges, sortedSteps]
  );

  // ── エッジ変更（削除含む） → ループ/フォワード両方を Zustand に反映 ────────
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(changes);
      for (const change of changes) {
        if (change.type === 'remove') {
          const edge = edges.find((e) => e.id === change.id);
          if (!edge) continue;
          if (edge.type === 'loopEdge' && edge.source) {
            updateStep(flow.id, edge.source, {
              loopBackToStepId: undefined,
              loopCondition: undefined,
            });
          } else if (edge.source && edge.target) {
            // フォワードエッジの削除
            removeForwardEdge(flow.id, edge.source, edge.target);
          }
        }
      }
    },
    [onEdgesChange, edges, flow.id, updateStep, removeForwardEdge]
  );

  // ── ノードクリック → 右パネルでステップ選択/解除 ─────────────────────────
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: FlowStepNodeType) => {
      if (onNodeOpen) { onNodeOpen(node.id); return; }
      setSelectedStepId((prev) => (prev === node.id ? null : node.id));
    },
    [onNodeOpen, setSelectedStepId]
  );

  // ── パレットからのドラッグ&ドロップで解析ステップを追加 ─────────────────
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance<FlowStepNodeType> | null>(null);
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const svc = e.dataTransfer.getData('application/analysis-service') as AnalysisServiceType;
    if (!svc || !rfInstance) return;
    const position = rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    addStep(flow.id, {
      order: flow.steps.length,
      label: SERVICE_META[svc]?.label ?? svc,
      kind: 'normal',
      status: 'pending',
      notes: '',
      dataBindings: [],
      position,
    }, null);
  }, [rfInstance, flow.id, flow.steps.length, addStep]);

  // ── 右クリック: ノード上で「後段に追加 / 並列に追加 / 削除」 ─────────────
  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: FlowStepNodeType) => {
      event.preventDefault();
      setContextMenu({ x: event.clientX, y: event.clientY, stepId: node.id });
    },
    []
  );

  // ── 右クリック: キャンバス上で「新規ステップ追加」 ─────────────────────
  const handlePaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      const e = event as React.MouseEvent;
      setContextMenu({ x: e.clientX, y: e.clientY, stepId: null });
    },
    []
  );

  // ── 右クリックメニュー アクション ────────────────────────────────────
  const closeContextMenu = () => setContextMenu(null);

  const handleAddAfter = (parentStepId: string | null, kind: 'normal' | 'decision' = 'normal') => {
    const newId = addStep(
      flow.id,
      {
        order: flow.steps.length,
        label: kind === 'decision' ? `判定 ${flow.steps.length + 1}` : `Step ${flow.steps.length + 1}`,
        kind,
        status: 'pending',
        notes: '',
        dataBindings: [],
      },
      parentStepId
    );
    closeContextMenu();
    setSelectedStepId(newId);
  };

  const handleAddParallel = (siblingStepId: string, kind: 'normal' | 'decision' = 'normal') => {
    // sibling の前駆を親として、そこから分岐する新ステップを追加 (= 並列)
    const predecessors = flow.steps.filter((st) => (st.nextStepIds ?? []).includes(siblingStepId));
    const parentId = predecessors[0]?.id ?? null;
    const newId = addStep(
      flow.id,
      {
        order: flow.steps.length,
        label: kind === 'decision' ? `判定 ${flow.steps.length + 1}` : `Step ${flow.steps.length + 1} (並列)`,
        kind,
        status: 'pending',
        notes: '',
        dataBindings: [],
      },
      parentId
    );
    closeContextMenu();
    setSelectedStepId(newId);
  };

  const handleDeleteStep = (stepId: string) => {
    deleteStep(flow.id, stepId);
    closeContextMenu();
    if (selectedStepId === stepId) setSelectedStepId(null);
  };

  const selectedStep = sortedSteps.find((s) => s.id === selectedStepId) ?? null;

  return (
    <div
      style={{
        display: 'flex',
        height: 520,
        border: '1px solid #e9ecef',
        borderRadius: 8,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* 左上 浮動実行バー（条件設定では隠す） */}
      {!hideRunBar && (
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 10,
          display: 'flex',
          gap: 6,
          background: 'rgba(255,255,255,0.92)',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          padding: '6px 8px',
          backdropFilter: 'blur(4px)',
        }}
      >
        <button
          className="btn btn-sm btn-primary"
          style={{ fontSize: '0.76rem' }}
          onClick={() => runFullFlow(flow.id)}
          disabled={sortedSteps.length === 0}
          title="ルートステップから順次実行 (各ステップ 7s)"
        >
          <i className="bi bi-play-fill me-1" />全フロー解析開始
        </button>
        <button
          className="btn btn-sm btn-outline-primary"
          style={{ fontSize: '0.76rem' }}
          onClick={() => selectedStepId && runSingleStep(flow.id, selectedStepId)}
          disabled={!selectedStepId}
          title={selectedStepId ? '選択ステップだけ実行' : 'ステップを選択してください'}
        >
          <i className="bi bi-play me-1" />選択ステップのみ実行
        </button>
        <button
          className="btn btn-sm btn-outline-secondary"
          style={{ fontSize: '0.76rem' }}
          onClick={() => {
            if (window.confirm('全ステップのステータスを「未実行」 に戻します。よろしいですか?')) {
              resetAllSteps(flow.id);
            }
          }}
          disabled={sortedSteps.length === 0}
          title="全ステータスを未実行に戻す"
        >
          <i className="bi bi-arrow-counterclockwise me-1" />リセット
        </button>
      </div>
      )}
      {/* ReactFlow キャンバス */}
      <div style={{ flex: 1, minWidth: 0 }} onDrop={onDrop} onDragOver={onDragOver}>
        <ReactFlow
          onInit={setRfInstance}
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={handleConnect}
          onNodeDragStop={handleNodeDragStop}
          onNodeClick={handleNodeClick}
          onNodeContextMenu={handleNodeContextMenu}
          onPaneContextMenu={handlePaneContextMenu}
          onPaneClick={() => { setSelectedStepId(null); closeContextMenu(); }}
          isValidConnection={isValidConnection}
          fitView
          fitViewOptions={{ padding: 0.3, maxZoom: 1.2 }}
          deleteKeyCode="Delete"
          multiSelectionKeyCode="Shift"
          defaultEdgeOptions={{
            markerEnd: { type: MarkerType.ArrowClosed },
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="#e2e8f0"
          />
          <Controls showInteractive={false} />
          <MiniMap
            nodeStrokeColor="#94a3b8"
            nodeColor={(node) => {
              const n = node as FlowStepNodeType;
              return n.data.status === 'done'
                ? '#bbf7d0'
                : n.data.status === 'in_progress'
                ? '#fde68a'
                : '#f1f5f9';
            }}
            style={{ background: '#f8fafc', border: '1px solid #e9ecef' }}
          />
        </ReactFlow>
      </div>

      {/* 右サイドパネル（ステップ選択時のみ表示） */}
      {selectedStep && (
        <StepDetailPanel
          key={selectedStep.id}
          flow={flow}
          step={selectedStep}
          projectId={projectId}
          allSteps={sortedSteps}
          onClose={() => setSelectedStepId(null)}
        />
      )}

      {/* 右クリック コンテキストメニュー */}
      {contextMenu && (
        <>
          {/* 外側クリックで閉じるオーバーレイ (右クリックでもメニュー閉) */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 1500 }}
            onClick={closeContextMenu}
            onContextMenu={(e) => { e.preventDefault(); closeContextMenu(); }}
          />
          <div
            style={{
              position: 'fixed',
              left: contextMenu.x,
              top: contextMenu.y,
              zIndex: 1501,
              background: '#fff',
              border: '1px solid #dee2e6',
              borderRadius: 6,
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              minWidth: 180,
              fontSize: '0.83rem',
              overflow: 'hidden',
            }}
          >
            {contextMenu.stepId ? (
              <>
                <ContextMenuItem
                  icon="bi-plus-lg"
                  label="後段にステップを追加"
                  onClick={() => handleAddAfter(contextMenu.stepId)}
                />
                <ContextMenuItem
                  icon="bi-diagram-3"
                  label="並列にステップを追加"
                  onClick={() => handleAddParallel(contextMenu.stepId!)}
                />
                <ContextMenuItem
                  icon="bi-question-diamond"
                  label="後段に判定ステップを追加"
                  onClick={() => handleAddAfter(contextMenu.stepId, 'decision')}
                />
                <ContextMenuDivider />
                <ContextMenuItem
                  icon="bi-trash"
                  label="このステップを削除"
                  destructive
                  onClick={() => handleDeleteStep(contextMenu.stepId!)}
                />
              </>
            ) : (
              <>
                <ContextMenuItem
                  icon="bi-plus-lg"
                  label="新規ステップを追加"
                  onClick={() => handleAddAfter(null)}
                />
                <ContextMenuItem
                  icon="bi-question-diamond"
                  label="新規 判定ステップを追加"
                  onClick={() => handleAddAfter(null, 'decision')}
                />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ─── ContextMenu 子コンポーネント ─────────────────────────────────────

const ContextMenuItem: React.FC<{
  icon: string;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}> = ({ icon, label, onClick, destructive }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      width: '100%',
      padding: '8px 14px',
      border: 'none',
      background: 'transparent',
      color: destructive ? '#dc2626' : '#1f2937',
      textAlign: 'left',
      cursor: 'pointer',
      fontSize: 'inherit',
    }}
    onMouseEnter={(e) => { e.currentTarget.style.background = destructive ? '#fef2f2' : '#f3f4f6'; }}
    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
  >
    <i className={`bi ${icon}`} style={{ width: 16, textAlign: 'center' }} />
    {label}
  </button>
);

const ContextMenuDivider: React.FC = () => (
  <div style={{ height: 1, background: '#e5e7eb', margin: '2px 0' }} />
);
