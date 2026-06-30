import React from 'react';
import { useAppStore } from '../../stores/appStore';

/**
 * 故障率マスタ。サブシステム別の代表故障率と主な故障モード。
 * Pi/Ec解析・飛行安全解析（破壊確率・期待死傷者数）の入力として参照する。
 * プロトタイプのため代表値のサンプルデータを保持する。
 */

interface FailureRow {
  subsystem: string;
  failureRate: number;   // フライトあたり故障確率
  mode: string;          // 代表故障モード
  phase: string;         // 主な発生フェーズ
}

const FAILURES: FailureRow[] = [
  { subsystem: '推進系（1段）',     failureRate: 8.0e-3, mode: '燃焼異常・配管破断', phase: '1段燃焼' },
  { subsystem: '推進系（2段）',     failureRate: 5.0e-3, mode: '着火失敗・推力低下', phase: '2段燃焼' },
  { subsystem: '構造系',           failureRate: 1.2e-3, mode: '段間分離不良・破壊', phase: '最大動圧〜分離' },
  { subsystem: '誘導制御 (GNC)',   failureRate: 3.0e-3, mode: '姿勢制御喪失・経路逸脱', phase: '全フェーズ' },
  { subsystem: 'アビオニクス',     failureRate: 2.0e-3, mode: '電源喪失・通信途絶', phase: '全フェーズ' },
  { subsystem: '飛行終了系 (FTS)', failureRate: 1.0e-4, mode: '指令破壊不能', phase: '全フェーズ' },
  { subsystem: '分離機構',         failureRate: 9.0e-4, mode: 'フェアリング/段分離失敗', phase: '分離イベント' },
];

const totalRate = FAILURES.reduce((s, f) => s + f.failureRate, 0);

export const FailureRateMasterView: React.FC = () => {
  const navigate = useAppStore((s) => s.navigate);

  return (
    <div>
      <button className="btn btn-link btn-sm px-0 mb-2 text-decoration-none" onClick={() => navigate('masterDataHub')}>
        <i className="bi bi-arrow-left me-1" />マスタデータ
      </button>

      <h1 className="page-title">
        <i className="bi bi-exclamation-triangle me-2 text-primary" />
        故障率データ
      </h1>
      <p className="text-muted small mb-3">
        サブシステム別の代表故障率と主な故障モード。Pi/Ec解析・飛行安全解析（破壊確率・期待死傷者数）の入力として参照します。
      </p>

      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover mb-0 align-middle">
            <thead>
              <tr>
                <th>サブシステム</th>
                <th className="text-end">故障率 (/flight)</th>
                <th>代表故障モード</th>
                <th>主な発生フェーズ</th>
              </tr>
            </thead>
            <tbody>
              {FAILURES.map((f) => (
                <tr key={f.subsystem}>
                  <td className="fw-medium">{f.subsystem}</td>
                  <td className="text-end font-monospace">{f.failureRate.toExponential(1)}</td>
                  <td>{f.mode}</td>
                  <td className="text-muted">{f.phase}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="table-light">
                <td className="fw-semibold">合計（単純和の目安）</td>
                <td className="text-end font-monospace fw-semibold">{totalRate.toExponential(1)}</td>
                <td colSpan={2} className="text-muted small">機体全体の代表的な失敗確率オーダー（独立故障の単純和。実際は FTA で評価）</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="card border-info-subtle mt-3">
        <div className="card-body d-flex gap-2 py-2">
          <i className="bi bi-info-circle text-info mt-1" />
          <small className="text-muted">
            代表値はオーダー把握用。実運用では機体・コンポーネントの実績／FMEA・FTA に基づく値に差し替えます。
          </small>
        </div>
      </div>
    </div>
  );
};
