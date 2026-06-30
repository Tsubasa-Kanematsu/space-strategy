import React, { useState } from 'react';
import { useAppStore } from '../../stores/appStore';

/**
 * 空力係数マスタ。機体ごとの マッハ数 vs 抗力係数 Cd / 揚力傾斜 CLα を保持する
 * 読み取り中心ビュー。遷音速で Cd がピークになる代表カーブをサンプル保持する。
 */

interface AeroRow {
  mach: number;
  cd: number;
  clAlpha: number; // 1/rad
}

interface VehicleAero {
  name: string;
  rows: AeroRow[];
}

const VEHICLES: VehicleAero[] = [
  {
    name: 'LV-Alpha',
    rows: [
      { mach: 0.0, cd: 0.32, clAlpha: 2.1 },
      { mach: 0.3, cd: 0.31, clAlpha: 2.2 },
      { mach: 0.6, cd: 0.34, clAlpha: 2.4 },
      { mach: 0.8, cd: 0.42, clAlpha: 2.8 },
      { mach: 0.9, cd: 0.54, clAlpha: 3.1 },
      { mach: 1.0, cd: 0.58, clAlpha: 3.0 },
      { mach: 1.2, cd: 0.52, clAlpha: 2.7 },
      { mach: 1.5, cd: 0.45, clAlpha: 2.5 },
      { mach: 2.0, cd: 0.38, clAlpha: 2.3 },
      { mach: 3.0, cd: 0.30, clAlpha: 2.0 },
      { mach: 5.0, cd: 0.24, clAlpha: 1.7 },
    ],
  },
  {
    name: 'イプシロンS相当',
    rows: [
      { mach: 0.0, cd: 0.30, clAlpha: 2.3 },
      { mach: 0.3, cd: 0.29, clAlpha: 2.4 },
      { mach: 0.6, cd: 0.33, clAlpha: 2.6 },
      { mach: 0.8, cd: 0.44, clAlpha: 3.0 },
      { mach: 0.9, cd: 0.56, clAlpha: 3.3 },
      { mach: 1.0, cd: 0.61, clAlpha: 3.2 },
      { mach: 1.2, cd: 0.54, clAlpha: 2.9 },
      { mach: 1.5, cd: 0.46, clAlpha: 2.6 },
      { mach: 2.0, cd: 0.39, clAlpha: 2.4 },
      { mach: 3.0, cd: 0.31, clAlpha: 2.1 },
      { mach: 5.0, cd: 0.25, clAlpha: 1.8 },
    ],
  },
];

export const AeroCoeffView: React.FC = () => {
  const navigate = useAppStore((s) => s.navigate);
  const [vehicleIdx, setVehicleIdx] = useState(0);
  const vehicle = VEHICLES[vehicleIdx];
  const maxCd = Math.max(...vehicle.rows.map((r) => r.cd));

  return (
    <div>
      <button className="btn btn-link btn-sm px-0 mb-2 text-decoration-none" onClick={() => navigate('masterDataHub')}>
        <i className="bi bi-arrow-left me-1" />マスタデータ
      </button>

      <h1 className="page-title">
        <i className="bi bi-graph-up me-2 text-primary" />
        空力係数データ
      </h1>
      <p className="text-muted small mb-3">
        機体ごとのマッハ数依存の抗力係数 Cd・揚力傾斜 CLα テーブル。軌道・分散解析の空力入力として参照します。
      </p>

      <div className="filter-bar mb-3 rounded">
        <label className="form-label fw-medium mb-0 me-2">機体</label>
        <select
          className="form-select form-select-sm"
          style={{ maxWidth: 240 }}
          value={vehicleIdx}
          onChange={(e) => setVehicleIdx(Number(e.target.value))}
        >
          {VEHICLES.map((v, i) => (
            <option key={v.name} value={i}>{v.name}</option>
          ))}
        </select>
        <small className="text-muted ms-auto">{vehicle.rows.length} 点</small>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th className="text-end">マッハ数 M</th>
                <th className="text-end">抗力係数 Cd</th>
                <th className="text-end">揚力傾斜 CLα (1/rad)</th>
                <th>領域</th>
              </tr>
            </thead>
            <tbody>
              {vehicle.rows.map((r) => (
                <tr key={r.mach}>
                  <td className="text-end font-monospace">{r.mach.toFixed(1)}</td>
                  <td className="text-end font-monospace">
                    {r.cd.toFixed(2)}
                    {r.cd === maxCd && <i className="bi bi-caret-up-fill text-danger ms-1" title="ピーク" />}
                  </td>
                  <td className="text-end font-monospace">{r.clAlpha.toFixed(1)}</td>
                  <td>
                    {r.mach < 0.8 ? (
                      <span className="badge bg-info-subtle text-info">亜音速</span>
                    ) : r.mach <= 1.2 ? (
                      <span className="badge bg-warning-subtle text-warning">遷音速</span>
                    ) : (
                      <span className="badge bg-secondary-subtle text-secondary">超音速</span>
                    )}
                  </td>
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
            設計フェーズで確定した空力データを運用フェーズで参照します。編集は設計版ツールで行います。
          </small>
        </div>
      </div>
    </div>
  );
};
