import React from 'react';
import { useAppStore } from '../../stores/appStore';

/**
 * 代表破片マスタ。機体破壊時に生成される代表破片（エンジン・タンク・アビオ等）の
 * 質量・断面積・抗力係数を保持する。落下分散・Expected Casualty 解析の入力データ。
 */

interface DebrisRow {
  name: string;
  massKg: number;
  refAreaM2: number;
  cd: number;
  material: string;
}

const DEBRIS: DebrisRow[] = [
  { name: 'エンジン (ターボポンプ込)', massKg: 480, refAreaM2: 0.65, cd: 0.9, material: 'Inconel / SUS' },
  { name: 'タンクドーム', massKg: 95, refAreaM2: 2.40, cd: 1.2, material: 'Al-Li 合金' },
  { name: 'アビオニクス筐体', massKg: 18, refAreaM2: 0.18, cd: 1.05, material: 'Al / FRP' },
  { name: 'ペイロードフェアリング片', massKg: 32, refAreaM2: 1.80, cd: 1.3, material: 'CFRP' },
  { name: '段間構造フレーム', massKg: 140, refAreaM2: 1.20, cd: 1.1, material: 'Al 合金' },
  { name: '小型構造片 (ボルト・継手)', massKg: 2.5, refAreaM2: 0.02, cd: 0.8, material: 'Ti / SUS' },
];

export const DebrisMasterView: React.FC = () => {
  const navigate = useAppStore((s) => s.navigate);

  return (
    <div>
      <button className="btn btn-link btn-sm px-0 mb-2 text-decoration-none" onClick={() => navigate('masterDataHub')}>
        <i className="bi bi-arrow-left me-1" />マスタデータ
      </button>

      <h1 className="page-title">
        <i className="bi bi-asterisk me-2 text-primary" />
        代表破片データ
      </h1>
      <p className="text-muted small mb-3">
        機体破壊時に生成される代表破片の質量・断面積・抗力係数。落下分散および Expected Casualty 解析の入力として参照します。
      </p>

      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th>破片名</th>
                <th className="text-end">質量 (kg)</th>
                <th className="text-end">代表断面積 (m²)</th>
                <th className="text-end">抗力係数 Cd</th>
                <th>材質</th>
              </tr>
            </thead>
            <tbody>
              {DEBRIS.map((d) => (
                <tr key={d.name}>
                  <td className="fw-medium">{d.name}</td>
                  <td className="text-end font-monospace">{d.massKg.toLocaleString()}</td>
                  <td className="text-end font-monospace">{d.refAreaM2.toFixed(2)}</td>
                  <td className="text-end font-monospace">{d.cd.toFixed(2)}</td>
                  <td className="text-muted">{d.material}</td>
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
            設計フェーズで確定した破片データを運用フェーズで参照します。編集は設計版ツールで行います。
          </small>
        </div>
      </div>
    </div>
  );
};
