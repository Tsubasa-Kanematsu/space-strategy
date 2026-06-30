import React from 'react';
import { useAppStore } from '../../stores/appStore';

/**
 * 推進系マスタ。エンジン／推進系の代表諸元を運用フェーズで参照するための
 * 読み取り中心ビュー。飛行解析・荷重解析・溶融解析等の入力となる。
 * プロトタイプのため代表エンジンのサンプルデータをコンポーネント内に保持する。
 */

interface EngineRow {
  name: string;
  stage: string;
  propellant: string;
  cycle: string;
  thrustKN_sl: number | null;   // 海面推力
  thrustKN_vac: number;         // 真空推力
  ispS_vac: number;             // 真空比推力
  burnTimeS: number;
  throttle: string;
}

const ENGINES: EngineRow[] = [
  { name: 'RP-9 (1段メイン)', stage: '1段', propellant: 'LOX/RP-1', cycle: 'ガス発生器', thrustKN_sl: 980, thrustKN_vac: 1120, ispS_vac: 311, burnTimeS: 155, throttle: '60–100%' },
  { name: 'RP-3V (2段)',     stage: '2段', propellant: 'LOX/RP-1', cycle: 'ガス発生器', thrustKN_sl: null, thrustKN_vac: 180, ispS_vac: 342, burnTimeS: 210, throttle: '固定' },
  { name: 'SRM-Booster',     stage: 'ブースター', propellant: 'HTPB 固体', cycle: '固体', thrustKN_sl: 1500, thrustKN_vac: 1620, ispS_vac: 268, burnTimeS: 72, throttle: '不可' },
  { name: 'RCS-Thruster',    stage: '姿勢制御', propellant: 'N2H4 (単推進)', cycle: '触媒分解', thrustKN_sl: null, thrustKN_vac: 0.22, ispS_vac: 224, burnTimeS: 0, throttle: 'パルス' },
];

const numCell = (v: number | null, digits = 0) =>
  v !== null ? v.toFixed(digits) : '—';

export const PropulsionMasterView: React.FC = () => {
  const navigate = useAppStore((s) => s.navigate);

  return (
    <div>
      <button className="btn btn-link btn-sm px-0 mb-2 text-decoration-none" onClick={() => navigate('masterDataHub')}>
        <i className="bi bi-arrow-left me-1" />マスタデータ
      </button>

      <h1 className="page-title">
        <i className="bi bi-fire me-2 text-primary" />
        推進系データ
      </h1>
      <p className="text-muted small mb-3">
        各段エンジン・推進系の代表諸元（推力・比推力・燃焼時間等）。飛行解析・荷重解析・溶融解析の入力として参照します。
      </p>

      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th>エンジン名</th>
                <th>段</th>
                <th>推進剤</th>
                <th>サイクル</th>
                <th className="text-end">海面推力 (kN)</th>
                <th className="text-end">真空推力 (kN)</th>
                <th className="text-end">Isp真空 (s)</th>
                <th className="text-end">燃焼時間 (s)</th>
                <th>スロットル</th>
              </tr>
            </thead>
            <tbody>
              {ENGINES.map((e) => (
                <tr key={e.name}>
                  <td className="fw-medium">{e.name}</td>
                  <td>{e.stage}</td>
                  <td>{e.propellant}</td>
                  <td>{e.cycle}</td>
                  <td className="text-end font-monospace">{numCell(e.thrustKN_sl)}</td>
                  <td className="text-end font-monospace">{numCell(e.thrustKN_vac)}</td>
                  <td className="text-end font-monospace">{e.ispS_vac}</td>
                  <td className="text-end font-monospace">{e.burnTimeS}</td>
                  <td>{e.throttle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card border-info-subtle mt-3">
        <div className="card-body d-flex gap-2 py-2">
          <i className="bi bi-info-circle text-info mt-1" />
          <small className="text-muted">
            設計フェーズで確定した推進系諸元を運用フェーズで参照します。号機ごとの差異はプロジェクト側のデータで管理します。
          </small>
        </div>
      </div>
    </div>
  );
};
