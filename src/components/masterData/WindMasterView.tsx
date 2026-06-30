import React from 'react';
import { useAppStore } from '../../stores/appStore';

/**
 * 風データマスタ。射場上空の高度別 風速・風向の代表プロファイル。
 * 飛行解析・分散飛行経路解析・荷重解析（風荷重）・落下分散の入力として参照する。
 * プロトタイプのため代表プロファイルのサンプルデータを保持する。
 */

interface WindRow {
  altKm: number;     // 高度
  speed: number;     // 風速 m/s
  dirDeg: number;    // 風向（吹いてくる方位, deg）
}

// 大樹町射場・年間代表（モック）。ジェット気流帯(10-14km)で最大化するそれっぽい鉛直分布。
const PROFILE: WindRow[] = [
  { altKm: 0,  speed: 6,  dirDeg: 270 },
  { altKm: 1,  speed: 11, dirDeg: 268 },
  { altKm: 2,  speed: 16, dirDeg: 265 },
  { altKm: 4,  speed: 24, dirDeg: 262 },
  { altKm: 6,  speed: 33, dirDeg: 260 },
  { altKm: 8,  speed: 42, dirDeg: 258 },
  { altKm: 10, speed: 55, dirDeg: 256 },
  { altKm: 12, speed: 62, dirDeg: 255 },
  { altKm: 14, speed: 48, dirDeg: 257 },
  { altKm: 16, speed: 31, dirDeg: 260 },
  { altKm: 20, speed: 18, dirDeg: 265 },
  { altKm: 30, speed: 22, dirDeg: 90 },
];

const dirLabel = (deg: number): string => {
  const dirs = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
  return dirs[Math.round(deg / 45) % 8];
};

export const WindMasterView: React.FC = () => {
  const navigate = useAppStore((s) => s.navigate);
  const maxSpeed = Math.max(...PROFILE.map((p) => p.speed));

  return (
    <div>
      <button className="btn btn-link btn-sm px-0 mb-2 text-decoration-none" onClick={() => navigate('masterDataHub')}>
        <i className="bi bi-arrow-left me-1" />マスタデータ
      </button>

      <h1 className="page-title">
        <i className="bi bi-wind me-2 text-primary" />
        風データ
      </h1>
      <p className="text-muted small mb-3">
        射場上空の高度別 風速・風向の代表プロファイル。飛行解析・分散飛行経路解析・風荷重・落下分散の入力として参照します。
      </p>

      <div className="card mb-3">
        <div className="card-header d-flex justify-content-between align-items-center">
          <span className="fw-semibold"><i className="bi bi-geo me-1" />大樹町射場・年間代表プロファイル</span>
          <span className="text-muted small">最大風速 {maxSpeed} m/s（ジェット気流帯）</span>
        </div>
        <div className="table-responsive">
          <table className="table table-hover mb-0 align-middle">
            <thead>
              <tr>
                <th className="text-end" style={{ width: 110 }}>高度 (km)</th>
                <th className="text-end" style={{ width: 110 }}>風速 (m/s)</th>
                <th style={{ width: 220 }}>強さ</th>
                <th className="text-end" style={{ width: 110 }}>風向 (deg)</th>
                <th>風向</th>
              </tr>
            </thead>
            <tbody>
              {PROFILE.map((p) => (
                <tr key={p.altKm}>
                  <td className="text-end font-monospace">{p.altKm}</td>
                  <td className="text-end font-monospace">{p.speed}</td>
                  <td>
                    <div className="progress" style={{ height: 6 }}>
                      <div
                        className={`progress-bar ${p.speed >= 50 ? 'bg-danger' : p.speed >= 30 ? 'bg-warning' : ''}`}
                        style={{ width: `${(p.speed / maxSpeed) * 100}%` }}
                      />
                    </div>
                  </td>
                  <td className="text-end font-monospace">{p.dirDeg}</td>
                  <td>{dirLabel(p.dirDeg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card border-info-subtle">
        <div className="card-body d-flex gap-2 py-2">
          <i className="bi bi-info-circle text-info mt-1" />
          <small className="text-muted">
            風向は「風が吹いてくる方位」。実運用では打上当日の高層気象観測（ラジオゾンデ等）の実測値に差し替えます。
          </small>
        </div>
      </div>
    </div>
  );
};
