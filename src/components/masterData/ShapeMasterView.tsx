import React from 'react';
import { useAppStore } from '../../stores/appStore';

/**
 * 機体形状マスタ。設計フェーズで確定した機体形状（全長・直径・段数等）を
 * 運用フェーズで参照するための読み取り中心ビュー。
 * プロトタイプのため代表機体のサンプルデータをコンポーネント内に保持する。
 */

interface ShapeRow {
  name: string;
  lengthM: number;
  maxDiameterM: number;
  stages: number;
  noseCone: string;
  refAreaM2: number;
}

const SHAPES: ShapeRow[] = [
  { name: 'LV-Alpha', lengthM: 24.5, maxDiameterM: 1.8, stages: 2, noseCone: 'フォン・カルマン', refAreaM2: 2.545 },
  { name: 'LV-Beta (3段型)', lengthM: 32.0, maxDiameterM: 2.2, stages: 3, noseCone: 'タンジェントオージャイブ', refAreaM2: 3.801 },
  { name: 'イプシロンS相当', lengthM: 27.2, maxDiameterM: 2.5, stages: 3, noseCone: 'フォン・カルマン', refAreaM2: 4.909 },
];

export const ShapeMasterView: React.FC = () => {
  const navigate = useAppStore((s) => s.navigate);

  return (
    <div>
      <button className="btn btn-link btn-sm px-0 mb-2 text-decoration-none" onClick={() => navigate('masterDataHub')}>
        <i className="bi bi-arrow-left me-1" />マスタデータ
      </button>

      <h1 className="page-title">
        <i className="bi bi-rocket-takeoff me-2 text-primary" />
        機体形状データ
      </h1>
      <p className="text-muted small mb-3">
        サイジング・空力設計で確定した代表機体の外形諸元。落下分散・空力解析の幾何入力として参照します。
      </p>

      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th>機体名</th>
                <th className="text-end">全長 (m)</th>
                <th className="text-end">最大直径 (m)</th>
                <th className="text-end">段数</th>
                <th>ノーズコーン形式</th>
                <th className="text-end">基準面積 (m²)</th>
              </tr>
            </thead>
            <tbody>
              {SHAPES.map((s) => (
                <tr key={s.name}>
                  <td className="fw-medium">{s.name}</td>
                  <td className="text-end font-monospace">{s.lengthM.toFixed(1)}</td>
                  <td className="text-end font-monospace">{s.maxDiameterM.toFixed(1)}</td>
                  <td className="text-end font-monospace">{s.stages}</td>
                  <td>{s.noseCone}</td>
                  <td className="text-end font-monospace">{s.refAreaM2.toFixed(3)}</td>
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
            設計フェーズで確定した形状データを運用フェーズで参照します。編集は設計版ツールで行います。
          </small>
        </div>
      </div>
    </div>
  );
};
