import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';

/**
 * ループ接続用カスタムエッジ。
 * オレンジ色の破線アニメーション + 「ループ」ラベルを描画する。
 */
const LoopEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
}: EdgeProps) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: '#f59e0b',
          strokeWidth: 2,
          strokeDasharray: '6 3',
          animation: 'flow-dash 0.8s linear infinite',
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            fontSize: '0.60rem',
            background: '#fffbeb',
            border: '1px solid #fde68a',
            color: '#92400e',
            padding: '1px 6px',
            borderRadius: 4,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
          className="nodrag nopan"
        >
          ↩ ループ
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

export default LoopEdge;
