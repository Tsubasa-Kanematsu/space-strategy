import React, { useMemo, useState } from 'react';

/**
 * 軽量 SVG 線グラフ。複数系列対応 (Grafana 風)。
 * - 軸自動スケール (data の min/max を読む)
 * - ホバーで十字線 + ツールチップ
 * - 横軸は秒 (時間) 想定
 * - 依存ライブラリなし
 */

export interface SeriesPoint {
  x: number; // time (sec)
  y: number;
}

export interface Series {
  name: string;
  color: string;
  points: SeriesPoint[];
}

export interface SimpleLineChartProps {
  title: string;
  unit?: string;
  series: Series[];
  height?: number;
  /** Y軸 表示範囲を固定したい時 */
  yMin?: number;
  yMax?: number;
}

const PAD = { top: 18, right: 12, bottom: 28, left: 50 };

export const SimpleLineChart: React.FC<SimpleLineChartProps> = ({
  title,
  unit,
  series,
  height = 180,
  yMin: yMinProp,
  yMax: yMaxProp,
}) => {
  const [hover, setHover] = useState<{ x: number; y: number; t: number } | null>(null);
  const [boxWidth, setBoxWidth] = useState(300);

  // Y軸範囲
  const { xMin, xMax, yMin, yMax } = useMemo(() => {
    let xMn = Infinity, xMx = -Infinity, yMn = Infinity, yMx = -Infinity;
    for (const s of series) {
      for (const p of s.points) {
        if (p.x < xMn) xMn = p.x;
        if (p.x > xMx) xMx = p.x;
        if (p.y < yMn) yMn = p.y;
        if (p.y > yMx) yMx = p.y;
      }
    }
    if (!Number.isFinite(xMn)) { xMn = 0; xMx = 1; }
    if (!Number.isFinite(yMn)) { yMn = 0; yMx = 1; }
    if (yMx === yMn) yMx = yMn + 1;
    const yMinF = yMinProp ?? yMn;
    const yMaxF = yMaxProp ?? yMx;
    return { xMin: xMn, xMax: xMx, yMin: yMinF, yMax: yMaxF };
  }, [series, yMinProp, yMaxProp]);

  const plotW = Math.max(0, boxWidth - PAD.left - PAD.right);
  const plotH = Math.max(0, height - PAD.top - PAD.bottom);

  const scaleX = (x: number) => PAD.left + ((x - xMin) / (xMax - xMin || 1)) * plotW;
  const scaleY = (y: number) => PAD.top + plotH - ((y - yMin) / (yMax - yMin || 1)) * plotH;

  const containerRef = (el: HTMLDivElement | null) => {
    if (!el) return;
    const w = el.clientWidth;
    if (w > 0 && w !== boxWidth) setBoxWidth(w);
  };

  // 縦線+最近傍点ホバー
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const mx = e.clientX - rect.left;
    if (mx < PAD.left || mx > PAD.left + plotW) { setHover(null); return; }
    const t = xMin + ((mx - PAD.left) / plotW) * (xMax - xMin);
    setHover({ x: mx, y: e.clientY - rect.top, t });
  };

  // Y軸目盛り (5 ティック)
  const yTicks = useMemo(() => {
    const n = 4;
    const arr: number[] = [];
    for (let i = 0; i <= n; i++) arr.push(yMin + ((yMax - yMin) * i) / n);
    return arr;
  }, [yMin, yMax]);

  // X軸目盛り
  const xTicks = useMemo(() => {
    const n = 5;
    const arr: number[] = [];
    for (let i = 0; i <= n; i++) arr.push(xMin + ((xMax - xMin) * i) / n);
    return arr;
  }, [xMin, xMax]);

  const formatNum = (v: number) => {
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'k';
    if (Math.abs(v) >= 10) return v.toFixed(0);
    if (Math.abs(v) >= 0.1) return v.toFixed(2);
    return v.toFixed(3);
  };

  // ホバー時の値
  const hoverValues = useMemo(() => {
    if (!hover) return null;
    return series.map((s) => {
      // 最近傍点 (二分探索でも良いが O(n) で十分)
      let nearest = s.points[0];
      let bestDx = Infinity;
      for (const p of s.points) {
        const dx = Math.abs(p.x - hover.t);
        if (dx < bestDx) { bestDx = dx; nearest = p; }
      }
      return { name: s.name, color: s.color, value: nearest?.y ?? 0, x: nearest?.x ?? 0 };
    });
  }, [hover, series]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        background: '#0f1722',
        border: '1px solid #1f2a3a',
        borderRadius: 6,
        padding: '6px 6px 4px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          color: '#cbd5e1',
          fontSize: '0.74rem',
          padding: '0 4px',
          fontWeight: 600,
        }}
      >
        {title}{unit ? ` [${unit}]` : ''}
      </div>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${boxWidth} ${height}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
        style={{ display: 'block' }}
      >
        {/* グリッド (Y) */}
        {yTicks.map((y, i) => (
          <g key={`yt-${i}`}>
            <line
              x1={PAD.left}
              x2={PAD.left + plotW}
              y1={scaleY(y)}
              y2={scaleY(y)}
              stroke="#1f2a3a"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 6}
              y={scaleY(y) + 3}
              fill="#64748b"
              fontSize="9"
              textAnchor="end"
            >
              {formatNum(y)}
            </text>
          </g>
        ))}
        {/* グリッド (X) */}
        {xTicks.map((x, i) => (
          <g key={`xt-${i}`}>
            <line
              y1={PAD.top}
              y2={PAD.top + plotH}
              x1={scaleX(x)}
              x2={scaleX(x)}
              stroke="#1f2a3a"
              strokeWidth={1}
            />
            <text
              x={scaleX(x)}
              y={PAD.top + plotH + 12}
              fill="#64748b"
              fontSize="9"
              textAnchor="middle"
            >
              {formatNum(x)}s
            </text>
          </g>
        ))}
        {/* 系列 */}
        {series.map((s, i) => {
          if (s.points.length === 0) return null;
          const d = s.points
            .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${scaleX(p.x).toFixed(2)} ${scaleY(p.y).toFixed(2)}`)
            .join(' ');
          return (
            <path
              key={`s-${i}`}
              d={d}
              fill="none"
              stroke={s.color}
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}
        {/* ホバー縦線 */}
        {hover && (
          <line
            x1={hover.x}
            x2={hover.x}
            y1={PAD.top}
            y2={PAD.top + plotH}
            stroke="#94a3b8"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}
      </svg>
      {/* 凡例 */}
      {series.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '2px 8px 4px', fontSize: '0.66rem' }}>
          {series.map((s) => (
            <span key={s.name} style={{ color: '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, background: s.color, borderRadius: 2 }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      {/* ツールチップ */}
      {hover && hoverValues && (
        <div
          style={{
            position: 'absolute',
            top: 22,
            left: Math.min(hover.x + 10, boxWidth - 130),
            background: 'rgba(15,23,34,0.96)',
            border: '1px solid #2d3a4f',
            borderRadius: 4,
            padding: '4px 8px',
            fontSize: '0.66rem',
            color: '#e2e8f0',
            pointerEvents: 'none',
            minWidth: 100,
          }}
        >
          <div style={{ color: '#94a3b8', marginBottom: 2 }}>t = {hover.t.toFixed(1)} s</div>
          {hoverValues.map((v) => (
            <div key={v.name} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 2, background: v.color }} />
              <span>{v.name}: {formatNum(v.value)}{unit ? ` ${unit}` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
