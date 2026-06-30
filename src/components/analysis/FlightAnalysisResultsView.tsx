import React, { useMemo, useRef } from 'react';
import type { AnalysisCase } from '../../types';
import { SimpleLineChart, type Series } from './charts/SimpleLineChart';
import { useAnalysisStore } from '../../stores/analysisStore';
import { resolveSeries, type CustomFlightChart } from './charts/flightVariables';

/**
 * 飛行解析 結果ビュー (Grafana 風 タイムシリーズダッシュボード)。
 *
 * データ供給:
 *  - analysisCase.condition.timeSeries が { t: number[], <var>: number[] } の形で
 *    存在すればそれを使用 (実シミュレーション結果の取り込みパス)
 *  - なければ condition の打上条件パラメータ から物理ベースの 概算サンプルデータを
 *    生成 (デモ用途。実プロジェクトでは取り込み機能で本物に差し替える想定)
 *
 * チャート構成 (Grafana ダッシュボード参考):
 *   - 高度 / 速度 / Mach
 *   - 位置 X-Y / 速度 (NED) / 加速度
 *   - 動圧 / 推力 / 質量
 *   - Euler 角 (Roll/Pitch/Yaw)
 *   - 機体角度 (AoA, AoS) / 経路角
 */

interface TimeSeriesBundle {
  t: number[];                  // time (s)
  altitude: number[];           // m
  velocity: number[];           // m/s (magnitude)
  velocityNED: { vN: number[]; vE: number[]; vD: number[] };
  positionLLA: { lat: number[]; lon: number[] };
  mach: number[];
  dynamicPressure: number[];    // Pa
  acceleration: number[];       // m/s^2 (magnitude)
  thrust: number[];             // N
  mass: number[];               // kg
  euler: { roll: number[]; pitch: number[]; yaw: number[] };  // deg
  angles: { aoa: number[]; aos: number[]; pathAngle: number[] };  // deg
}

interface FlightAnalysisResultsViewProps {
  analysisCase: AnalysisCase;
}

const COLORS = {
  primary: '#60a5fa',
  green:   '#34d399',
  yellow:  '#fbbf24',
  red:     '#f87171',
  purple:  '#a78bfa',
  cyan:    '#22d3ee',
  pink:    '#f472b6',
};

export const FlightAnalysisResultsView: React.FC<FlightAnalysisResultsViewProps> = ({ analysisCase }) => {
  const ts = useTimeSeries(analysisCase);
  const updateCase = useAnalysisStore((s) => s.updateCase);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object') throw new Error('JSON 構造不正');
      updateCase(analysisCase.id, {
        condition: { ...(analysisCase.condition ?? {}), timeSeries: parsed },
      });
    } catch (e) {
      alert(`取り込み失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // Series 生成 (各チャート分)
  const altitudeSeries: Series[] = useMemo(() => [
    { name: 'Altitude', color: COLORS.green, points: ts.t.map((t, i) => ({ x: t, y: ts.altitude[i] })) },
  ], [ts]);

  const velocityMagSeries: Series[] = useMemo(() => [
    { name: '|v|', color: COLORS.primary, points: ts.t.map((t, i) => ({ x: t, y: ts.velocity[i] })) },
  ], [ts]);

  const velocityNedSeries: Series[] = useMemo(() => [
    { name: 'Vn (North)', color: COLORS.green,  points: ts.t.map((t, i) => ({ x: t, y: ts.velocityNED.vN[i] })) },
    { name: 'Ve (East)',  color: COLORS.yellow, points: ts.t.map((t, i) => ({ x: t, y: ts.velocityNED.vE[i] })) },
    { name: 'Vd (Down)',  color: COLORS.red,    points: ts.t.map((t, i) => ({ x: t, y: ts.velocityNED.vD[i] })) },
  ], [ts]);

  const machSeries: Series[] = useMemo(() => [
    { name: 'Mach', color: COLORS.cyan, points: ts.t.map((t, i) => ({ x: t, y: ts.mach[i] })) },
  ], [ts]);

  const qSeries: Series[] = useMemo(() => [
    { name: 'q∞', color: COLORS.purple, points: ts.t.map((t, i) => ({ x: t, y: ts.dynamicPressure[i] })) },
  ], [ts]);

  const accSeries: Series[] = useMemo(() => [
    { name: '|a|', color: COLORS.red, points: ts.t.map((t, i) => ({ x: t, y: ts.acceleration[i] })) },
  ], [ts]);

  const thrustSeries: Series[] = useMemo(() => [
    { name: 'Thrust', color: COLORS.yellow, points: ts.t.map((t, i) => ({ x: t, y: ts.thrust[i] })) },
  ], [ts]);

  const massSeries: Series[] = useMemo(() => [
    { name: 'm', color: COLORS.pink, points: ts.t.map((t, i) => ({ x: t, y: ts.mass[i] })) },
  ], [ts]);

  const eulerSeries: Series[] = useMemo(() => [
    { name: 'Roll',  color: COLORS.primary, points: ts.t.map((t, i) => ({ x: t, y: ts.euler.roll[i] })) },
    { name: 'Pitch', color: COLORS.green,   points: ts.t.map((t, i) => ({ x: t, y: ts.euler.pitch[i] })) },
    { name: 'Yaw',   color: COLORS.yellow,  points: ts.t.map((t, i) => ({ x: t, y: ts.euler.yaw[i] })) },
  ], [ts]);

  const angleSeries: Series[] = useMemo(() => [
    { name: 'AoA',        color: COLORS.cyan,   points: ts.t.map((t, i) => ({ x: t, y: ts.angles.aoa[i] })) },
    { name: 'AoS',        color: COLORS.purple, points: ts.t.map((t, i) => ({ x: t, y: ts.angles.aos[i] })) },
    { name: 'Path angle', color: COLORS.pink,   points: ts.t.map((t, i) => ({ x: t, y: ts.angles.pathAngle[i] })) },
  ], [ts]);

  const isSynthetic = !((analysisCase.condition as Record<string, unknown> | undefined)?.timeSeries);

  // 解析ツール表示用
  const condAny = (analysisCase.condition ?? {}) as Record<string, unknown>;
  const analysisTool = (condAny.analysisTool as string | undefined) ?? null;

  return (
    <div>
      {/* 結果取り込みバー (常時表示): ツール名 + インポート/書出 ボタン
          条件未設定でも、外部ツール (ALMA/P4SD/IST 等) の結果のみ取り込んで可視化できる */}
      <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
        {analysisTool && (
          <span className="badge bg-primary-subtle text-primary" style={{ fontSize: '0.78rem' }}>
            <i className="bi bi-cpu me-1" />解析ツール: {analysisTool}
          </span>
        )}
        <span className="text-muted" style={{ fontSize: '0.78rem' }}>
          {isSynthetic ? '結果未取込 (条件から合成軌道を表示中)' : '結果取込済'}
        </span>
        <div className="ms-auto d-flex gap-1">
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            onClick={() => fileInputRef.current?.click()}
            title="JSON ({ t, altitude, velocity, ... } 形式) を取り込み"
          >
            <i className="bi bi-upload me-1" />結果のみ取込
          </button>
          {!isSynthetic && (
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => {
                const ts = (analysisCase.condition as Record<string, unknown> | undefined)?.timeSeries;
                if (!ts) return;
                const blob = new Blob([JSON.stringify(ts, null, 2)], { type: 'application/json;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${analysisCase.name.replace(/[^\w.\-]+/g, '_')}.timeseries.json`;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
              title="現在の時系列結果を JSON で書出"
            >
              <i className="bi bi-download me-1" />結果書出
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          />
        </div>
      </div>

      {isSynthetic && (
        <div className="alert alert-info py-2 mb-3 d-flex align-items-center gap-2" style={{ fontSize: '0.82rem' }}>
          <i className="bi bi-info-circle" />
          <div>
            シミュレーション結果が未取込のため、 打上条件から物理ベースで生成したサンプル軌道を表示しています。
            実データを取り込むと差し替わります (条件未設定でも結果のみ取込 で可視化可能)。
          </div>
        </div>
      )}

      {/* Grafana 風 3列グリッド */}
      <div className="row g-2">
        <div className="col-md-4"><SimpleLineChart title="Altitude" unit="m" series={altitudeSeries} /></div>
        <div className="col-md-4"><SimpleLineChart title="Velocity (magnitude)" unit="m/s" series={velocityMagSeries} /></div>
        <div className="col-md-4"><SimpleLineChart title="Mach Number" series={machSeries} /></div>

        <div className="col-md-4"><SimpleLineChart title="Velocity NED" unit="m/s" series={velocityNedSeries} /></div>
        <div className="col-md-4"><SimpleLineChart title="Dynamic Pressure (q∞)" unit="Pa" series={qSeries} /></div>
        <div className="col-md-4"><SimpleLineChart title="Acceleration" unit="m/s²" series={accSeries} /></div>

        <div className="col-md-4"><SimpleLineChart title="Thrust" unit="N" series={thrustSeries} /></div>
        <div className="col-md-4"><SimpleLineChart title="Mass" unit="kg" series={massSeries} /></div>
        <div className="col-md-4"><SimpleLineChart title="Euler Angles" unit="deg" series={eulerSeries} /></div>

        <div className="col-md-12"><SimpleLineChart title="Aero Angles & Path Angle" unit="deg" series={angleSeries} height={220} /></div>

        <div className="col-md-6">
          <TrajectoryMap lat={ts.positionLLA.lat} lon={ts.positionLLA.lon} alt={ts.altitude} />
        </div>
        <div className="col-md-6">
          <AltitudeProfile altitude={ts.altitude} t={ts.t} />
        </div>

        {/* AI / 手動で追加された カスタムチャート */}
        <CustomChartsSection analysisCase={analysisCase} bundle={ts} />
      </div>
    </div>
  );
};

// ─── カスタムチャート セクション ─────────────────────────────

const CustomChartsSection: React.FC<{
  analysisCase: AnalysisCase;
  bundle: TimeSeriesBundle;
}> = ({ analysisCase, bundle }) => {
  const updateCase = useAnalysisStore((s) => s.updateCase);
  const cond = (analysisCase.condition ?? {}) as Record<string, unknown>;
  const customCharts = (cond.customCharts ?? []) as CustomFlightChart[];

  const handleDelete = (id: string) => {
    if (!window.confirm('このカスタムチャートを削除しますか?')) return;
    const next = customCharts.filter((c) => c.id !== id);
    updateCase(analysisCase.id, { condition: { ...cond, customCharts: next } });
  };

  if (customCharts.length === 0) {
    return (
      <div className="col-md-12">
        <div
          className="d-flex align-items-center gap-2 px-3 py-2"
          style={{
            background: '#f1f5f9',
            border: '1px dashed #cbd5e1',
            borderRadius: 6,
            fontSize: '0.82rem',
            color: '#64748b',
          }}
        >
          <i className="bi bi-lightbulb" />
          <div>
            AI に「動圧と速度を1つのチャートに重ねて」「Roll と Yaw を比較するチャート追加して」 等と頼むと
            ここにカスタムチャートが追加されます (条件は analysisCase.condition.customCharts に保存)
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="col-md-12 mt-3">
        <div className="d-flex align-items-center gap-2 px-1" style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 600 }}>
          <i className="bi bi-stars text-warning" />
          カスタムチャート ({customCharts.length})
        </div>
      </div>
      {customCharts.map((chart) => {
        const series: Series[] = chart.series
          .map((s) => {
            const arr = resolveSeries(bundle, s.path);
            if (!arr) return null;
            return {
              name: s.name,
              color: s.color,
              points: bundle.t.map((t, i) => ({ x: t, y: arr[i] })),
            };
          })
          .filter((s): s is Series => s !== null);
        const allEmpty = series.length === 0;
        return (
          <div key={chart.id} className="col-md-6" style={{ position: 'relative' }}>
            {allEmpty ? (
              <div
                style={{
                  background: '#0f1722',
                  border: '1px solid #1f2a3a',
                  borderRadius: 6,
                  padding: 12,
                  color: '#f87171',
                  fontSize: '0.78rem',
                }}
              >
                {chart.title}: 系列 path が解決できません ({chart.series.map((s) => s.path).join(', ')})
              </div>
            ) : (
              <SimpleLineChart title={chart.title} unit={chart.unit} series={series} />
            )}
            <button
              type="button"
              onClick={() => handleDelete(chart.id)}
              title="このチャートを削除"
              style={{
                position: 'absolute',
                top: 4,
                right: 12,
                background: 'rgba(15,23,34,0.6)',
                color: '#f87171',
                border: '1px solid #2d3a4f',
                borderRadius: 4,
                padding: '0 6px',
                fontSize: '0.66rem',
                cursor: 'pointer',
              }}
            >
              <i className="bi bi-x" />
            </button>
          </div>
        );
      })}
    </>
  );
};

// ─── データ供給 (取り込み済 or 概算合成) ────────────────────

function useTimeSeries(analysisCase: AnalysisCase): TimeSeriesBundle {
  return useMemo(() => {
    const cond = (analysisCase.condition ?? {}) as Record<string, unknown>;
    const ext = cond.timeSeries as Partial<TimeSeriesBundle> | undefined;
    if (ext && Array.isArray(ext.t) && ext.t.length > 0) {
      return fillMissing(ext);
    }
    // 打上条件から簡易生成 (azimuth / lat / lon / alt / Vx,Vy,Vz / Roll,Pitch,Yaw)
    const azimuth = readNum(cond, '打上方位角', 90);
    const lat0    = readNum(cond, '打上緯度', 31.2);
    const lon0    = readNum(cond, '打上経度', 131.1);
    const alt0    = readNum(cond, '打上高度', 20);
    const pitch0  = readNum(cond, 'Pitch', 85);
    return synthesizeFlight({ azimuth, lat0, lon0, alt0, pitch0 });
  }, [analysisCase]);
}

function readNum(o: Record<string, unknown>, key: string, fallback: number): number {
  const v = o[key];
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function fillMissing(p: Partial<TimeSeriesBundle>): TimeSeriesBundle {
  const t = p.t ?? [];
  const arr = (a?: number[]) => (Array.isArray(a) ? a : new Array(t.length).fill(0));
  return {
    t,
    altitude: arr(p.altitude),
    velocity: arr(p.velocity),
    velocityNED: {
      vN: arr(p.velocityNED?.vN),
      vE: arr(p.velocityNED?.vE),
      vD: arr(p.velocityNED?.vD),
    },
    positionLLA: {
      lat: arr(p.positionLLA?.lat),
      lon: arr(p.positionLLA?.lon),
    },
    mach: arr(p.mach),
    dynamicPressure: arr(p.dynamicPressure),
    acceleration: arr(p.acceleration),
    thrust: arr(p.thrust),
    mass: arr(p.mass),
    euler: {
      roll:  arr(p.euler?.roll),
      pitch: arr(p.euler?.pitch),
      yaw:   arr(p.euler?.yaw),
    },
    angles: {
      aoa:        arr(p.angles?.aoa),
      aos:        arr(p.angles?.aos),
      pathAngle:  arr(p.angles?.pathAngle),
    },
  };
}

/**
 * 物理ベースの簡易合成軌道。
 * 0〜400s の 0.5s 間隔で各種パラメータを生成する。
 * 実シミュレーションではないがダッシュボードの形を確認できる程度の波形は出る。
 */
function synthesizeFlight(p: { azimuth: number; lat0: number; lon0: number; alt0: number; pitch0: number }): TimeSeriesBundle {
  const dt = 0.5;
  const tMax = 400;
  const N = Math.floor(tMax / dt) + 1;
  const t  = new Array(N);
  const altitude = new Array(N);
  const velocity = new Array(N);
  const vN = new Array(N), vE = new Array(N), vD = new Array(N);
  const lat = new Array(N), lon = new Array(N);
  const mach = new Array(N);
  const q = new Array(N);
  const acc = new Array(N);
  const thrust = new Array(N);
  const mass = new Array(N);
  const roll = new Array(N), pitch = new Array(N), yaw = new Array(N);
  const aoa = new Array(N), aos = new Array(N), pathAngle = new Array(N);

  const mass0 = 5000;     // kg
  const mDot = 12;        // kg/s
  const burnoutT = 180;   // s
  const azRad = p.azimuth * Math.PI / 180;

  for (let i = 0; i < N; i++) {
    const ti = i * dt;
    t[i] = ti;

    // 高度: 0 〜 200km まで上昇して放物線的に降下
    const altPeak = 220_000; // 220 km
    const phase = ti / 220 * Math.PI;
    altitude[i] = p.alt0 + altPeak * Math.sin(phase) * (ti <= 220 ? 1 : 0.6);
    if (altitude[i] < 0) altitude[i] = 0;

    // 速度: 燃焼中加速し burnout 以降減速、再突入で増加
    const burning = ti < burnoutT;
    const accel = burning ? 30 + 20 * (ti / burnoutT) : -2 - Math.max(0, (ti - 250) / 4);
    velocity[i] = i === 0 ? 0 : Math.max(0, velocity[i - 1] + accel * dt);

    // NED 分解 (azimuth + pitch から簡易)
    const pitchRad = (p.pitch0 - Math.min(75, ti * 0.4)) * Math.PI / 180;
    vN[i] = velocity[i] * Math.cos(pitchRad) * Math.cos(azRad);
    vE[i] = velocity[i] * Math.cos(pitchRad) * Math.sin(azRad);
    vD[i] = -velocity[i] * Math.sin(pitchRad);

    // 位置 (簡易: 緯度経度は線形積分)
    lat[i] = i === 0 ? p.lat0 : lat[i - 1] + vN[i] * dt / 111000;
    lon[i] = i === 0 ? p.lon0 : lon[i - 1] + vE[i] * dt / (111000 * Math.cos(p.lat0 * Math.PI / 180));

    // 大気: 高度で密度減少、Mach は音速で
    const rho = 1.225 * Math.exp(-altitude[i] / 8500);
    const a = 340 - 0.4 * Math.min(80, altitude[i] / 1000);
    mach[i] = velocity[i] / Math.max(150, a);
    q[i] = 0.5 * rho * velocity[i] * velocity[i];

    // 推力
    thrust[i] = burning ? 180_000 - 20_000 * (ti / burnoutT) : 0;

    // 質量
    mass[i] = burning ? mass0 - mDot * ti : mass0 - mDot * burnoutT;

    // 加速度大きさ
    acc[i] = i === 0 ? accel : Math.abs(velocity[i] - velocity[i - 1]) / dt + (burning ? 5 : 1);

    // オイラー角 (緩やかな変動)
    roll[i]  = 2 * Math.sin(ti / 35);
    pitch[i] = p.pitch0 - Math.min(75, ti * 0.4);
    yaw[i]   = p.azimuth + 3 * Math.sin(ti / 25);

    aoa[i]       = 4 * Math.sin(ti / 20) * Math.exp(-Math.abs(ti - 100) / 80);
    aos[i]       = 2 * Math.cos(ti / 30) * Math.exp(-Math.abs(ti - 60) / 60);
    pathAngle[i] = (pitchRad * 180 / Math.PI);
  }

  return {
    t, altitude, velocity,
    velocityNED: { vN, vE, vD },
    positionLLA: { lat, lon },
    mach, dynamicPressure: q, acceleration: acc, thrust, mass,
    euler: { roll, pitch, yaw },
    angles: { aoa, aos, pathAngle },
  };
}

// ─── 軌跡 (緯度経度) と 高度プロファイル ─────────────────

const TrajectoryMap: React.FC<{ lat: number[]; lon: number[]; alt: number[] }> = ({ lat, lon }) => {
  const points = lat.map((la, i) => ({ x: lon[i], y: la }));
  const xMn = Math.min(...lon), xMx = Math.max(...lon);
  const yMn = Math.min(...lat), yMx = Math.max(...lat);
  const PAD = 20;
  const W = 380, H = 220;
  const sx = (x: number) => PAD + ((x - xMn) / (xMx - xMn || 1)) * (W - PAD * 2);
  const sy = (y: number) => H - PAD - ((y - yMn) / (yMx - yMn || 1)) * (H - PAD * 2);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(2)} ${sy(p.y).toFixed(2)}`).join(' ');
  return (
    <div style={{ background: '#0f1722', border: '1px solid #1f2a3a', borderRadius: 6, padding: 6 }}>
      <div style={{ color: '#cbd5e1', fontSize: '0.74rem', padding: '0 4px', fontWeight: 600 }}>Ground Track (Lon × Lat)</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
        <path d={d} stroke={COLORS.cyan} strokeWidth={1.5} fill="none" />
        <circle cx={sx(points[0].x)} cy={sy(points[0].y)} r={3} fill={COLORS.green} />
        <circle cx={sx(points[points.length - 1].x)} cy={sy(points[points.length - 1].y)} r={3} fill={COLORS.red} />
        <text x={sx(points[0].x) + 6} y={sy(points[0].y) + 4} fontSize="9" fill={COLORS.green}>Launch</text>
        <text x={sx(points[points.length - 1].x) - 32} y={sy(points[points.length - 1].y) - 6} fontSize="9" fill={COLORS.red}>Impact</text>
      </svg>
    </div>
  );
};

const AltitudeProfile: React.FC<{ altitude: number[]; t: number[] }> = ({ altitude, t }) => {
  // 距離 × 高度
  const points = altitude.map((a, i) => ({ x: t[i] / 60, y: a / 1000 })); // 分 × km
  const xMn = 0, xMx = Math.max(...points.map((p) => p.x));
  const yMx = Math.max(...points.map((p) => p.y));
  const PAD = 30;
  const W = 380, H = 220;
  const sx = (x: number) => PAD + ((x - xMn) / (xMx - xMn || 1)) * (W - PAD * 2);
  const sy = (y: number) => H - PAD - (y / (yMx || 1)) * (H - PAD * 2);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(2)} ${sy(p.y).toFixed(2)}`).join(' ');
  return (
    <div style={{ background: '#0f1722', border: '1px solid #1f2a3a', borderRadius: 6, padding: 6 }}>
      <div style={{ color: '#cbd5e1', fontSize: '0.74rem', padding: '0 4px', fontWeight: 600 }}>Altitude Profile (min × km)</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
        <path d={`${d} L ${sx(xMx)} ${sy(0)} L ${sx(0)} ${sy(0)} Z`} fill={COLORS.primary} fillOpacity={0.15} />
        <path d={d} stroke={COLORS.primary} strokeWidth={1.5} fill="none" />
        <text x={PAD} y={12} fill="#cbd5e1" fontSize="9">peak {yMx.toFixed(0)} km</text>
      </svg>
    </div>
  );
};
