/**
 * 飛行解析タイムシリーズに含まれる「描画可能な変数」のレジストリ。
 *
 * - path: ドット記法で TimeSeriesBundle のフィールドを示す ("velocityNED.vN" 等)
 * - label / unit: 表示用
 * - defaultColor: AI/手動でチャートを足す時の既定色
 *
 * AI ツール (list_flight_variables) で AI に提示する「使える変数の辞書」と、
 * カスタムチャート描画時の path→数列 解決の両方で使う。
 */

export interface FlightVariableDef {
  /** ドット記法の path (TimeSeriesBundle 配下) */
  path: string;
  /** UI 表示用ラベル */
  label: string;
  /** 単位 */
  unit?: string;
  /** AIに渡す既定色 */
  defaultColor: string;
  /** AI 用の自然言語ヒント (説明) */
  hint?: string;
}

export const FLIGHT_VARIABLES: FlightVariableDef[] = [
  { path: 'altitude',            label: 'Altitude',          unit: 'm',     defaultColor: '#34d399', hint: '高度' },
  { path: 'velocity',            label: 'Velocity |v|',      unit: 'm/s',   defaultColor: '#60a5fa', hint: '速度大きさ' },
  { path: 'velocityNED.vN',      label: 'Vn (North)',        unit: 'm/s',   defaultColor: '#34d399', hint: '北方向 速度' },
  { path: 'velocityNED.vE',      label: 'Ve (East)',         unit: 'm/s',   defaultColor: '#fbbf24', hint: '東方向 速度' },
  { path: 'velocityNED.vD',      label: 'Vd (Down)',         unit: 'm/s',   defaultColor: '#f87171', hint: '下方向 速度' },
  { path: 'positionLLA.lat',     label: 'Latitude',          unit: 'deg',   defaultColor: '#22d3ee', hint: '緯度' },
  { path: 'positionLLA.lon',     label: 'Longitude',         unit: 'deg',   defaultColor: '#22d3ee', hint: '経度' },
  { path: 'mach',                label: 'Mach',                              defaultColor: '#22d3ee', hint: 'マッハ数' },
  { path: 'dynamicPressure',     label: 'q∞',                unit: 'Pa',    defaultColor: '#a78bfa', hint: '動圧' },
  { path: 'acceleration',        label: 'Acceleration',      unit: 'm/s²',  defaultColor: '#f87171', hint: '加速度大きさ' },
  { path: 'thrust',              label: 'Thrust',            unit: 'N',     defaultColor: '#fbbf24', hint: '推力' },
  { path: 'mass',                label: 'Mass',              unit: 'kg',    defaultColor: '#f472b6', hint: '機体質量' },
  { path: 'euler.roll',          label: 'Roll',              unit: 'deg',   defaultColor: '#60a5fa', hint: 'ロール角' },
  { path: 'euler.pitch',         label: 'Pitch',             unit: 'deg',   defaultColor: '#34d399', hint: 'ピッチ角' },
  { path: 'euler.yaw',           label: 'Yaw',               unit: 'deg',   defaultColor: '#fbbf24', hint: 'ヨー角' },
  { path: 'angles.aoa',          label: 'AoA',               unit: 'deg',   defaultColor: '#22d3ee', hint: '迎角' },
  { path: 'angles.aos',          label: 'AoS',               unit: 'deg',   defaultColor: '#a78bfa', hint: '横滑り角' },
  { path: 'angles.pathAngle',    label: 'Path Angle',        unit: 'deg',   defaultColor: '#f472b6', hint: '経路角' },
];

/** path の正規化 (例: "VelocityNED.vN" → "velocityNED.vN") */
export function findFlightVariable(path: string): FlightVariableDef | undefined {
  if (!path) return undefined;
  const target = path.trim();
  return FLIGHT_VARIABLES.find((v) => v.path === target)
      ?? FLIGHT_VARIABLES.find((v) => v.path.toLowerCase() === target.toLowerCase());
}

/** ドット記法で number[] を取り出す。見つからなければ null */
export function resolveSeries(bundle: unknown, path: string): number[] | null {
  const parts = path.split('.');
  let cur: unknown = bundle;
  for (const p of parts) {
    if (cur === null || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[p];
  }
  if (!Array.isArray(cur)) return null;
  // number[] 型にのみマッチ
  if (cur.some((x) => typeof x !== 'number')) return null;
  return cur as number[];
}

/** カスタムチャートの永続化定義 (analysisCase.condition.customCharts に格納) */
export interface CustomFlightChart {
  id: string;
  title: string;
  unit?: string;
  series: Array<{
    name: string;
    color: string;
    /** FLIGHT_VARIABLES の path */
    path: string;
  }>;
}
