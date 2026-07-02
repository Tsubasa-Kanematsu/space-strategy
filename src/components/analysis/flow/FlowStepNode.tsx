import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { FlowStepNodeType } from './flowUtils';

// ─── スタイル定数 ─────────────────────────────────────────────────────────────

const STATUS_DOT_COLOR: Record<string, string> = {
  pending:     '#94a3b8',
  in_progress: '#d97706',
  done:        '#16a34a',
};

const STATUS_BG: Record<string, string> = {
  pending:     '#ffffff',
  in_progress: '#fefce8',
  done:        '#f0fdf4',
};

// ─── カスタムノード ───────────────────────────────────────────────────────────

/**
 * 画像と同じ「左にアイコン四角 + 右にタイトル/副題」 のレイアウト。
 * 判定ステップは角丸大 + 黄色破線枠で区別する。
 */
const FlowStepNode = memo(({ data, selected }: NodeProps<FlowStepNodeType>) => {
  const isDecision = data.kind === 'decision';
  // 「未設定」表示にするか。テンプレの候補ラベルが解析名なら名前を出す（flowUtils で解決済）。
  const isUnset = !isDecision && data.isUnset;

  return (
    <div
      style={{
        width: 220,
        padding: '10px 12px',
        background: isDecision ? '#fffbeb' : STATUS_BG[data.status],
        border: selected
          ? '2px solid #2563eb'
          : isDecision
          ? '2px dashed #d97706'
          : '1.5px solid #e2e8f0',
        borderRadius: isDecision ? 18 : 12,
        boxShadow: selected
          ? '0 0 0 3px rgba(37,99,235,0.15)'
          : '0 1px 4px rgba(0,0,0,0.06)',
        cursor: 'pointer',
        userSelect: 'none',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      {/* 接続ハンドル (上下=フォワード, 左右=ループ。ループハンドルは判定ステップのみ可視) */}
      {/* 上ハンドルは横フローでは使わない（非表示） */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        style={{ opacity: 0, pointerEvents: 'none', width: 1, height: 1, border: 'none' }}
        isConnectable={false}
      />
      {/* 前段からの入力（横フロー: 左） */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        style={{ background: '#94a3b8', width: 9, height: 9, border: '2px solid #fff' }}
        isConnectable={true}
      />

      {/* 左: アイコン四角 */}
      <div
        style={{
          width: 36, height: 36,
          flexShrink: 0,
          borderRadius: 8,
          background: '#f1f5f9',
          color: '#475569',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
        }}
      >
        <i className={`bi bi-${data.iconName}`} />
      </div>

      {/* 右: タイトル + 副題
          未リンク時 (linkedType==='none' かつ 判定でない) は "未設定" を主表示にする。
          テンプレートで先置きされたラベル (例: "荷重解析") は薄字 / 斜体の「候補」 として副題に出す。 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 700,
            color: isUnset ? '#94a3b8' : '#0f172a',
            fontSize: '0.86rem',
            lineHeight: 1.25,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {isUnset ? '未設定' : (data.label || '未設定')}
        </div>
        <div
          style={{
            color: '#94a3b8',
            fontSize: '0.70rem',
            lineHeight: 1.2,
            marginTop: 1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontStyle: isUnset && data.label ? 'italic' : 'normal',
          }}
        >
          {isUnset && data.label ? `候補: ${data.label}` : data.subtitle}
        </div>
      </div>

      {/* 右上: 判定アイコン (常時) */}
      {isDecision && (
        <span
          style={{ position: 'absolute', top: 4, right: 8, color: '#d97706', fontSize: '0.62rem', fontWeight: 700 }}
          title="判定ステップ"
        >
          <i className="bi bi-question-diamond-fill" />
        </span>
      )}

      {/* 左上: ループ入口番号 (Fortran CONTINUE 風 "①→" "②→") */}
      {data.loopInLabels && data.loopInLabels.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: -10,
            left: 10,
            display: 'flex',
            gap: 3,
          }}
          title={`このステップに ${data.loopInLabels.map((n) => `ループ${n}`).join(' / ')} から戻ってくる`}
        >
          {data.loopInLabels.map((n) => (
            <LoopLabelBadge key={`in-${n}`} n={n} direction="in" />
          ))}
        </div>
      )}

      {/* 右下: ループ出口番号 ("→①") */}
      {data.loopOutLabel !== undefined && (
        <div
          style={{ position: 'absolute', bottom: -10, right: 10 }}
          title={`条件未達時 ループ${data.loopOutLabel} へジャンプ`}
        >
          <LoopLabelBadge n={data.loopOutLabel} direction="out" />
        </div>
      )}

      {/* 左下: ステータスドット (画像に合わせて小さく) */}
      <span
        style={{
          position: 'absolute',
          left: 12,
          bottom: -3,
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: STATUS_DOT_COLOR[data.status],
          border: '2px solid #ffffff',
          boxShadow: '0 0 0 1px ' + STATUS_DOT_COLOR[data.status],
        }}
      />

      {/* 下ハンドルは横フローでは使わない（非表示） */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        style={{ opacity: 0, pointerEvents: 'none', width: 1, height: 1, border: 'none' }}
        isConnectable={false}
      />
      {/* 後段への出力（横フロー: 右） */}
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={{ background: '#94a3b8', width: 9, height: 9, border: '2px solid #fff' }}
        isConnectable={true}
      />
    </div>
  );
});

FlowStepNode.displayName = 'FlowStepNode';

// ─── ループラベル用バッジ ─────────────────────────────────────
// Fortran の "10 CONTINUE" のような感覚で、
// ループ元には "→ ①" 、ループ先には "① →" を出す。
const LoopLabelBadge = ({ n, direction }: { n: number; direction: 'in' | 'out' }) => {
  const arrow = direction === 'in' ? '→' : '→';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        background: '#fff7ed',
        border: '1.5px solid #f59e0b',
        color: '#b45309',
        fontWeight: 700,
        fontSize: '0.66rem',
        padding: '1px 6px',
        borderRadius: 999,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        whiteSpace: 'nowrap',
      }}
    >
      {direction === 'in' ? (
        <>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 14, height: 14, borderRadius: '50%',
            background: '#f59e0b', color: '#fff',
          }}>{n}</span>
          <span>{arrow}</span>
        </>
      ) : (
        <>
          <span>{arrow}</span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 14, height: 14, borderRadius: '50%',
            background: '#f59e0b', color: '#fff',
          }}>{n}</span>
        </>
      )}
    </span>
  );
};

export default FlowStepNode;
