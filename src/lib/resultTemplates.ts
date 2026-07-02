import type { AnalysisServiceType } from '../types';

/**
 * 解析実行（シミュレーション）完了時に自動登録する代表結果のテンプレート。
 * [label, baseValue, unit, notes]。数値はベース値に ±数% の揺らぎを与えて
 * 「実行のたびに少し変わる」デモらしさを出す。
 */
type Row = [label: string, value: string, unit: string, notes: string];

const vary = (base: number, pct = 0.05, digits = 3): string => {
  const v = base * (1 + (Math.random() * 2 - 1) * pct);
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) < 0.01) return v.toExponential(2);
  return v.toPrecision(digits);
};

export function resultRowsForService(service: AnalysisServiceType): Row[] {
  switch (service) {
    case 'flightAnalysis':
      return [
        ['最高高度', vary(112.4), 'km', '弾道頂点'],
        ['最大速度', vary(1685), 'm/s', 'MECO直後'],
        ['最大動圧 (Max-Q)', vary(42.3), 'kPa', 'T+62s 付近'],
        ['最大加速度', vary(5.2), 'g', '1段燃焼末期'],
        ['飛行時間', vary(486), 's', 'リフトオフ〜着水'],
        ['着水点距離', vary(318), 'km', '射点からダウンレンジ'],
      ];
    case 'dispersedFlight':
      return [
        ['3σ包絡域 幅（横）', vary(24.6), 'km', 'IIP横方向分散'],
        ['3σ包絡域 長（縦）', vary(58.2), 'km', 'IIP縦方向分散'],
        ['高高度側包絡', vary(121.8), 'km', '+3σ 頂点高度'],
        ['低高度側包絡', vary(103.5), 'km', '-3σ 頂点高度'],
        ['モンテカルロ試行数', '3000', 'case', '収束確認済'],
      ];
    case 'loadAnalysis':
      return [
        ['最大軸力', vary(186), 'kN', 'Max-Q 時'],
        ['最大曲げモーメント', vary(42.1), 'kN·m', '突風応答含む'],
        ['安全余裕 (MS)', vary(0.42, 0.15), '-', '最小部位: 段間部'],
      ];
    case 'shipHazard':
      return [
        ['海上警戒区域 面積', vary(1240), 'km²', '被弾確率 1e-5 等値線'],
        ['船舶被弾確率（最大）', vary(3.2e-6, 0.2), '/flight', 'AIS密度データ使用'],
        ['警戒時間帯', 'T-30min〜T+15min', '', '公示用'],
      ];
    case 'piEc':
      return [
        ['全世界Ec', vary(4.6e-5, 0.15), '/flight', '基準 1×10⁻⁴ 以下'],
        ['最大Pi（単一破片）', vary(8.8e-7, 0.2), '-', '陸域最接近点'],
        ['評価人口メッシュ', '30秒格子', '', 'LandScan 相当'],
      ];
    case 'debrisImpact':
      return [
        ['投棄物落下予想区域', vary(96), 'km × ' + vary(22) + ' km', 'フェアリング・1段'],
        ['落下予想時間帯', 'T+180s〜T+420s', '', '公表値'],
        ['高度18km通過点包絡', vary(74), 'km', '上空警戒区域'],
      ];
    case 'gnssSatellite':
      return [
        ['GNSS可視衛星数（最小）', vary(9, 0.1, 2), '機', '打上げウィンドウ内'],
        ['PDOP（最大）', vary(2.1, 0.1), '-', '基準 6 以下'],
        ['ILL侵犯', 'なし', '', 'COLA 全対象クリア'],
        ['回避ウィンドウ', '0 回', '', '対象期間内'],
      ];
    case 'launchSiteBuilding':
      return [
        ['射場内 建屋別Ec（最大）', vary(2.4e-6, 0.2), '/flight', '組立棟'],
        ['退避対象建屋', '2 棟', '', '管制棟・見学棟は退避不要'],
      ];
    case 'rfLink':
      return [
        ['リンク成立率（全飛行）', vary(99.4, 0.005), '%', 'テレメトリ回線'],
        ['最小受信レベル余裕', vary(6.8), 'dB', 'T+210s 付近'],
        ['不成立時間帯', 'なし', '', 'コマンド回線'],
      ];
    case 'orbitLifetime':
      return [
        ['軌道上寿命', vary(8.4), '年', '25年ルール適合'],
        ['再突入予測', vary(8.4) + ' 年後', '', 'NRLMSISE-00 平均太陽活動'],
      ];
    case 'ablation':
      return [
        ['溶融判定', '全損（完全溶融）', '', '再突入時'],
        ['残存物Ec', vary(1.1e-7, 0.3), '/flight', '残存なしケース'],
      ];
    case 'pathRotationRate':
      return [
        ['経路回転率（最大）', vary(4.2), 'deg/s', '制御故障想定'],
        ['増速量ΔV（最大）', vary(86), 'm/s', '故障後 5s'],
      ];
    case 'debrisDragFall':
      return [
        ['DIA（破片落下予測域）', vary(38) + ' × ' + vary(12), 'km', '抗力落下包絡'],
        ['EDIA', vary(52) + ' × ' + vary(18), 'km', '拡張包絡'],
      ];
    case 'gateIncursion':
      return [
        ['ゲート侵犯', 'なし', '', '全ゲートクリア'],
        ['管制時間', 'T-10min〜T+8min', '', 'ゲート通過時刻に基づく'],
      ];
    case 'aeroAnalysis':
    default:
      return [
        ['評価完了', '良', '', '自動実行（シミュレーション）'],
      ];
  }
}
