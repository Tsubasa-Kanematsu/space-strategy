import React, { useCallback } from 'react';
import { ConditionJsonIO } from '../common/ConditionJsonIO';
import { useAnalysisStore } from '../../stores/analysisStore';
import { useMasterDataStore } from '../../stores/masterDataStore';
import { useAppStore } from '../../stores/appStore';
import type { AnalysisServiceType } from '../../types';
import { SERVICE_META } from './analysisServiceMeta';
import { SERVICE_UPSTREAM } from './dbSetMeta';

// ---- Helper: numeric input ----
const Num: React.FC<{
  label: string;
  unit?: string;
  value: number | '';
  onChange: (v: number | '') => void;
  placeholder?: string;
  helpText?: string;
}> = ({ label, unit, value, onChange, placeholder, helpText }) => (
  <div className="mb-3">
    <label className="form-label fw-medium">{label}{unit && <span className="text-muted ms-1 fw-normal">({unit})</span>}</label>
    <input
      type="number"
      className="form-control"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
    />
    {helpText && <div className="form-text">{helpText}</div>}
  </div>
);

const Txt: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}> = ({ label, value, onChange, placeholder, rows }) => (
  <div className="mb-3">
    <label className="form-label fw-medium">{label}</label>
    {rows ? (
      <textarea className="form-control" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    ) : (
      <input className="form-control" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    )}
  </div>
);

const Sel: React.FC<{
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}> = ({ label, value, options, onChange }) => (
  <div className="mb-3">
    <label className="form-label fw-medium">{label}</label>
    <select className="form-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

// ---- Per-service condition forms ----

// フライトイベント (SoE) の 1 行
interface FlightEvent {
  id?: string;
  time?: number | '';
  name?: string;
  type?: string;   // ignition | separation | engine_cutoff | other
  stage?: number | '';
  memo?: string;
}

const FlightEventTable: React.FC<{ events: FlightEvent[]; onChange: (next: FlightEvent[]) => void }> = ({ events, onChange }) => {
  const add = () => onChange([...(events ?? []), { time: '', name: '', type: 'separation', stage: '', memo: '' }]);
  const update = (i: number, patch: Partial<FlightEvent>) => {
    const next = [...events];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const remove = (i: number) => onChange(events.filter((_, j) => j !== i));
  return (
    <div>
      <table className="table table-sm align-middle" style={{ fontSize: '0.85rem' }}>
        <thead>
          <tr>
            <th style={{ width: '14%' }}>時刻 (s)</th>
            <th style={{ width: '20%' }}>イベント名</th>
            <th style={{ width: '22%' }}>種別</th>
            <th style={{ width: '12%' }}>ステージ</th>
            <th>メモ</th>
            <th style={{ width: 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {(events ?? []).map((e, i) => (
            <tr key={i}>
              <td><input className="form-control form-control-sm" type="number" step="any" value={e.time ?? ''} onChange={(ev) => update(i, { time: ev.target.value === '' ? '' : Number(ev.target.value) })} /></td>
              <td><input className="form-control form-control-sm" value={e.name ?? ''} onChange={(ev) => update(i, { name: ev.target.value })} placeholder="例: stage_1_separation" /></td>
              <td>
                <select className="form-select form-select-sm" value={e.type ?? 'separation'} onChange={(ev) => update(i, { type: ev.target.value })}>
                  <option value="ignition">ignition (点火)</option>
                  <option value="engine_cutoff">engine_cutoff (停止)</option>
                  <option value="separation">separation (分離)</option>
                  <option value="other">その他</option>
                </select>
              </td>
              <td><input className="form-control form-control-sm" type="number" value={e.stage ?? ''} onChange={(ev) => update(i, { stage: ev.target.value === '' ? '' : Number(ev.target.value) })} /></td>
              <td><input className="form-control form-control-sm" value={e.memo ?? ''} onChange={(ev) => update(i, { memo: ev.target.value })} /></td>
              <td><button type="button" className="btn btn-sm btn-outline-danger" onClick={() => remove(i)} title="削除"><i className="bi bi-x" /></button></td>
            </tr>
          ))}
          {(events ?? []).length === 0 && (
            <tr><td colSpan={6} className="text-muted text-center py-2" style={{ fontSize: '0.82rem' }}>イベント未登録</td></tr>
          )}
        </tbody>
      </table>
      <button type="button" className="btn btn-sm btn-outline-primary" onClick={add}>
        <i className="bi bi-plus me-1" />イベント追加
      </button>
    </div>
  );
};

/** 飛行解析で使う外部解析ツールの選択肢 (Phase A 時点で対応想定の3種) */
const FLIGHT_ANALYSIS_TOOLS = [
  { value: 'ALMA', label: 'ALMA', desc: 'JAXA 系 6自由度 軌道シミュレータ' },
  { value: 'P4SD', label: 'P4SD', desc: '社内/協業ベースのフライト解析ツール' },
  { value: 'IST',  label: 'IST',  desc: 'Interstellar Technologies 提供 解析ツール' },
] as const;

const FlightAnalysisForm: React.FC<{ cond: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }> = ({ cond, onChange }) => {
  const c = cond as {
    // 解析ツール選択 (ALMA / P4SD / IST)
    analysisTool?: 'ALMA' | 'P4SD' | 'IST';
    // 大気・打上
    atmosphericModel?: string;
    launchAzimuthDeg?: number | ''; launchLatDeg?: number | ''; launchLonDeg?: number | ''; launchAltM?: number | '';
    initialVelocityX?: number | ''; initialVelocityY?: number | ''; initialVelocityZ?: number | '';
    initialAngVelX?: number | ''; initialAngVelY?: number | ''; initialAngVelZ?: number | '';
    initialRollDeg?: number | ''; initialPitchDeg?: number | ''; initialYawDeg?: number | '';
    // シミュレーション
    simDurationS?: number | ''; simStopAltM?: number | ''; outputSampleIntervalS?: number | '';
    // 制御則
    programRateControl?: boolean;
    throttlingDelayActive?: boolean; throttlingTimeDelay?: number | ''; throttlingTimeConstant?: number | '';
    // TVC main PID
    pidTvcKpPitch?: number | ''; pidTvcKiPitch?: number | ''; pidTvcKdPitch?: number | '';
    pidTvcKpYaw?: number | ''; pidTvcKiYaw?: number | ''; pidTvcKdYaw?: number | '';
    // RCS gain
    gainRcsKRoll?: number | ''; gainRcsKRollDot?: number | '';
    gainRcsKPitch?: number | ''; gainRcsKPitchDot?: number | '';
    gainRcsKYaw?: number | ''; gainRcsKYawDot?: number | '';
    // Event timeline
    events?: FlightEvent[];
    memo?: string;
  };
  const u = (patch: Partial<typeof c>) => onChange({ ...cond, ...patch });
  const SectionCard: React.FC<{ title: string; icon: string; children: React.ReactNode }> = ({ title, icon, children }) => (
    <div className="card mb-3">
      <div className="card-header py-2 fw-semibold" style={{ fontSize: '0.88rem', background: '#f8f9fa' }}>
        <i className={`bi bi-${icon} me-2 text-primary`} />{title}
      </div>
      <div className="card-body">{children}</div>
    </div>
  );
  return (
    <>
      {/* 解析ツール選択: ALMA / P4SD / IST。条件のフォーマットや事前バリデーションを
          ツール側に合わせるための前提情報。実シミュレーションは外部で実行し、
          結果は「結果のみインポート」 から取り込む想定。 */}
      <SectionCard title="解析ツール" icon="cpu">
        <div className="d-flex flex-wrap gap-2">
          {FLIGHT_ANALYSIS_TOOLS.map((tool) => {
            const selected = (c.analysisTool ?? '') === tool.value;
            return (
              <button
                key={tool.value}
                type="button"
                className={`btn btn-sm ${selected ? 'btn-primary' : 'btn-outline-primary'} text-start`}
                style={{ minWidth: 140, padding: '8px 12px' }}
                onClick={() => u({ analysisTool: tool.value })}
              >
                <div className="fw-semibold">
                  <i className={`bi bi-${selected ? 'check-circle-fill' : 'circle'} me-1`} />
                  {tool.label}
                </div>
                <div className="text-muted" style={{ fontSize: '0.72rem', whiteSpace: 'normal' }}>
                  {tool.desc}
                </div>
              </button>
            );
          })}
        </div>
        <div className="form-text mt-2" style={{ fontSize: '0.74rem' }}>
          <i className="bi bi-info-circle me-1" />
          選択した解析ツールに合わせて、後段の入力フィールドが調整されます (Phase 1 では UI 上の前提情報として保持)
        </div>
      </SectionCard>

      <SectionCard title="打上条件 (Launch Conditions)" icon="rocket">
        <Num label="打上方位角" unit="deg" value={c.launchAzimuthDeg ?? ''} onChange={(v) => u({ launchAzimuthDeg: v })} placeholder="例: 90" />
        <div className="row">
          <div className="col"><Num label="打上緯度" unit="deg" value={c.launchLatDeg ?? ''} onChange={(v) => u({ launchLatDeg: v })} placeholder="例: 31.2" /></div>
          <div className="col"><Num label="打上経度" unit="deg" value={c.launchLonDeg ?? ''} onChange={(v) => u({ launchLonDeg: v })} placeholder="例: 131.1" /></div>
          <div className="col"><Num label="打上高度" unit="m" value={c.launchAltM ?? ''} onChange={(v) => u({ launchAltM: v })} placeholder="例: 20" /></div>
        </div>
        <div className="text-muted mb-1" style={{ fontSize: '0.78rem' }}>初期速度 (Body 軸, ECEF 座標系)</div>
        <div className="row">
          <div className="col"><Num label="Vx" unit="m/s" value={c.initialVelocityX ?? ''} onChange={(v) => u({ initialVelocityX: v })} /></div>
          <div className="col"><Num label="Vy" unit="m/s" value={c.initialVelocityY ?? ''} onChange={(v) => u({ initialVelocityY: v })} /></div>
          <div className="col"><Num label="Vz" unit="m/s" value={c.initialVelocityZ ?? ''} onChange={(v) => u({ initialVelocityZ: v })} /></div>
        </div>
        <div className="text-muted mb-1" style={{ fontSize: '0.78rem' }}>初期角速度 (Body 軸, ECEF 座標系)</div>
        <div className="row">
          <div className="col"><Num label="ωx" unit="deg/s" value={c.initialAngVelX ?? ''} onChange={(v) => u({ initialAngVelX: v })} /></div>
          <div className="col"><Num label="ωy" unit="deg/s" value={c.initialAngVelY ?? ''} onChange={(v) => u({ initialAngVelY: v })} /></div>
          <div className="col"><Num label="ωz" unit="deg/s" value={c.initialAngVelZ ?? ''} onChange={(v) => u({ initialAngVelZ: v })} /></div>
        </div>
        <div className="text-muted mb-1" style={{ fontSize: '0.78rem' }}>初期オイラー角 (NED 座標系)</div>
        <div className="row">
          <div className="col"><Num label="Roll" unit="deg" value={c.initialRollDeg ?? ''} onChange={(v) => u({ initialRollDeg: v })} placeholder="例: 0" /></div>
          <div className="col"><Num label="Pitch" unit="deg" value={c.initialPitchDeg ?? ''} onChange={(v) => u({ initialPitchDeg: v })} placeholder="例: 90" /></div>
          <div className="col"><Num label="Yaw" unit="deg" value={c.initialYawDeg ?? ''} onChange={(v) => u({ initialYawDeg: v })} placeholder="例: 166" /></div>
        </div>
      </SectionCard>

      <SectionCard title="シミュレーション設定" icon="gear">
        <Sel label="大気モデル" value={c.atmosphericModel ?? 'standard'} options={[
          { value: 'standard', label: '標準大気 (ISA)' },
          { value: 'nrlmsise00', label: 'NRLMSISE-00' },
          { value: 'jra55', label: 'JRA-55 実測値' },
        ]} onChange={(v) => u({ atmosphericModel: v })} />
        <div className="row">
          <div className="col"><Num label="シミュレーション時間" unit="s" value={c.simDurationS ?? ''} onChange={(v) => u({ simDurationS: v })} placeholder="例: 700" /></div>
          <div className="col"><Num label="停止高度" unit="m" value={c.simStopAltM ?? ''} onChange={(v) => u({ simStopAltM: v })} placeholder="例: 0" helpText="IIP計算時の高度" /></div>
          <div className="col"><Num label="出力サンプリング間隔" unit="s" value={c.outputSampleIntervalS ?? ''} onChange={(v) => u({ outputSampleIntervalS: v })} placeholder="例: 0.1" helpText="-1=システム既定" /></div>
        </div>
      </SectionCard>

      <SectionCard title="制御則 (Control Mode)" icon="dpad">
        <div className="mb-3">
          <label className="form-label fw-medium">姿勢目標タイプ</label>
          <div className="d-flex gap-3">
            <div className="form-check">
              <input className="form-check-input" type="radio" id="ctrl-mode-angle" name="ctrlMode"
                checked={!c.programRateControl} onChange={() => u({ programRateControl: false })} />
              <label className="form-check-label" htmlFor="ctrl-mode-angle">機軸角ターゲット (Attitude)</label>
            </div>
            <div className="form-check">
              <input className="form-check-input" type="radio" id="ctrl-mode-rate" name="ctrlMode"
                checked={!!c.programRateControl} onChange={() => u({ programRateControl: true })} />
              <label className="form-check-label" htmlFor="ctrl-mode-rate">角速度ターゲット (Rate)</label>
            </div>
          </div>
          <div className="form-text">プログラム姿勢を「機軸角」と「角速度」のどちらで指定するか。</div>
        </div>
        <div className="form-check mb-2">
          <input className="form-check-input" type="checkbox" id="throttling-active"
            checked={!!c.throttlingDelayActive} onChange={(e) => u({ throttlingDelayActive: e.target.checked })} />
          <label className="form-check-label" htmlFor="throttling-active">スロットリング遅れモデル 有効</label>
        </div>
        {c.throttlingDelayActive && (
          <div className="row">
            <div className="col"><Num label="時間遅れ" unit="s" value={c.throttlingTimeDelay ?? ''} onChange={(v) => u({ throttlingTimeDelay: v })} placeholder="例: 0.5" /></div>
            <div className="col"><Num label="時定数" unit="s" value={c.throttlingTimeConstant ?? ''} onChange={(v) => u({ throttlingTimeConstant: v })} placeholder="例: 0.1" /></div>
          </div>
        )}
      </SectionCard>

      <SectionCard title="TVC メインエンジン PID ゲイン (ベース値)" icon="sliders">
        <div className="text-muted mb-1" style={{ fontSize: '0.78rem' }}>Pitch</div>
        <div className="row">
          <div className="col"><Num label="Kp" value={c.pidTvcKpPitch ?? ''} onChange={(v) => u({ pidTvcKpPitch: v })} placeholder="例: 8" /></div>
          <div className="col"><Num label="Ki" value={c.pidTvcKiPitch ?? ''} onChange={(v) => u({ pidTvcKiPitch: v })} placeholder="例: 0" /></div>
          <div className="col"><Num label="Kd" value={c.pidTvcKdPitch ?? ''} onChange={(v) => u({ pidTvcKdPitch: v })} placeholder="例: 1" /></div>
        </div>
        <div className="text-muted mb-1" style={{ fontSize: '0.78rem' }}>Yaw</div>
        <div className="row">
          <div className="col"><Num label="Kp" value={c.pidTvcKpYaw ?? ''} onChange={(v) => u({ pidTvcKpYaw: v })} placeholder="例: 10" /></div>
          <div className="col"><Num label="Ki" value={c.pidTvcKiYaw ?? ''} onChange={(v) => u({ pidTvcKiYaw: v })} placeholder="例: 0" /></div>
          <div className="col"><Num label="Kd" value={c.pidTvcKdYaw ?? ''} onChange={(v) => u({ pidTvcKdYaw: v })} placeholder="例: 1" /></div>
        </div>
        <div className="form-text">各フライトイベント時のゲイン変更が必要な場合は、後の「フライトイベント」セクションでオーバーライドできます (将来実装)。</div>
      </SectionCard>

      <SectionCard title="RCS 制御ゲイン (ベース値)" icon="sliders">
        <div className="text-muted mb-1" style={{ fontSize: '0.78rem' }}>Roll</div>
        <div className="row">
          <div className="col"><Num label="K" value={c.gainRcsKRoll ?? ''} onChange={(v) => u({ gainRcsKRoll: v })} placeholder="例: 10" /></div>
          <div className="col"><Num label="K_dot" value={c.gainRcsKRollDot ?? ''} onChange={(v) => u({ gainRcsKRollDot: v })} placeholder="例: 10" /></div>
        </div>
        <div className="text-muted mb-1" style={{ fontSize: '0.78rem' }}>Pitch</div>
        <div className="row">
          <div className="col"><Num label="K" value={c.gainRcsKPitch ?? ''} onChange={(v) => u({ gainRcsKPitch: v })} /></div>
          <div className="col"><Num label="K_dot" value={c.gainRcsKPitchDot ?? ''} onChange={(v) => u({ gainRcsKPitchDot: v })} /></div>
        </div>
        <div className="text-muted mb-1" style={{ fontSize: '0.78rem' }}>Yaw</div>
        <div className="row">
          <div className="col"><Num label="K" value={c.gainRcsKYaw ?? ''} onChange={(v) => u({ gainRcsKYaw: v })} /></div>
          <div className="col"><Num label="K_dot" value={c.gainRcsKYawDot ?? ''} onChange={(v) => u({ gainRcsKYawDot: v })} /></div>
        </div>
      </SectionCard>

      <SectionCard title="フライトイベント / SoE" icon="calendar-event">
        <FlightEventTable events={c.events ?? []} onChange={(next) => u({ events: next })} />
        <div className="form-text">点火 / 分離 / フェアリング分離 等のタイムライン。時系列順でなくても OK。</div>
      </SectionCard>

      <Txt label="メモ" value={c.memo ?? ''} onChange={(v) => u({ memo: v })} rows={2} />
    </>
  );
};

const DispersedFlightForm: React.FC<{ cond: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }> = ({ cond, onChange }) => {
  const c = cond as { mcTrials?: number | ''; sigmaLevel?: number | ''; windSigmaPercent?: number | ''; thrustSigmaPercent?: number | ''; memo?: string };
  const u = (patch: Partial<typeof c>) => onChange({ ...cond, ...patch });
  return (
    <>
      <Num label="モンテカルロ試行回数" value={c.mcTrials ?? ''} onChange={(v) => u({ mcTrials: v })} placeholder="例: 1000" />
      <Sel label="σレベル" value={String(c.sigmaLevel ?? 3)} options={[
        { value: '1', label: '1σ (68.3%)' },
        { value: '2', label: '2σ (95.4%)' },
        { value: '3', label: '3σ (99.7%)' },
      ]} onChange={(v) => u({ sigmaLevel: Number(v) })} />
      <Num label="風速誤差 (1σ)" unit="%" value={c.windSigmaPercent ?? ''} onChange={(v) => u({ windSigmaPercent: v })} placeholder="例: 10" />
      <Num label="推力誤差 (1σ)" unit="%" value={c.thrustSigmaPercent ?? ''} onChange={(v) => u({ thrustSigmaPercent: v })} placeholder="例: 3" />
      <Txt label="メモ" value={c.memo ?? ''} onChange={(v) => u({ memo: v })} rows={2} />
    </>
  );
};

const LoadAnalysisForm: React.FC<{ cond: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }> = ({ cond, onChange }) => {
  const c = cond as { maxQPa?: number | ''; maxGee?: number | ''; safetyFactor?: number | ''; loadCaseDescription?: string; memo?: string };
  const u = (patch: Partial<typeof c>) => onChange({ ...cond, ...patch });
  return (
    <>
      <Num label="最大動圧 (Max-Q)" unit="pa" value={c.maxQPa ?? ''} onChange={(v) => u({ maxQPa: v })} placeholder="例: 40000" />
      <Num label="最大加速度" unit="g" value={c.maxGee ?? ''} onChange={(v) => u({ maxGee: v })} placeholder="例: 5.0" />
      <Num label="安全率" value={c.safetyFactor ?? ''} onChange={(v) => u({ safetyFactor: v })} placeholder="例: 1.5" />
      <Txt label="荷重ケース説明" value={c.loadCaseDescription ?? ''} onChange={(v) => u({ loadCaseDescription: v })} rows={3} placeholder="例: 最大動圧時の軸力・横力・曲げモーメント" />
      <Txt label="メモ" value={c.memo ?? ''} onChange={(v) => u({ memo: v })} rows={2} />
    </>
  );
};

const ShipHazardForm: React.FC<{ cond: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }> = ({ cond, onChange }) => {
  const c = cond as { dropZoneDefinition?: string; shipDensityPerKm2?: number | ''; riskThresholdPerFlight?: number | ''; evaluationAreaKm2?: number | ''; memo?: string };
  const u = (patch: Partial<typeof c>) => onChange({ ...cond, ...patch });
  return (
    <>
      <Txt label="落下域定義" value={c.dropZoneDefinition ?? ''} onChange={(v) => u({ dropZoneDefinition: v })} rows={2} placeholder="例: 東経 135°〜138°、北緯 30°〜32° の海域" />
      <Num label="船舶密度" unit="隻/km²" value={c.shipDensityPerKm2 ?? ''} onChange={(v) => u({ shipDensityPerKm2: v })} placeholder="例: 0.001" helpText="対象海域の平均船舶密度" />
      <Num label="評価海域面積" unit="km²" value={c.evaluationAreaKm2 ?? ''} onChange={(v) => u({ evaluationAreaKm2: v })} placeholder="例: 5000" />
      <Num label="リスク許容値 (1フライトあたり)" value={c.riskThresholdPerFlight ?? ''} onChange={(v) => u({ riskThresholdPerFlight: v })} placeholder="例: 1e-6" helpText="例: 1×10⁻⁶（ICAOガイドライン）" />
      <Txt label="メモ" value={c.memo ?? ''} onChange={(v) => u({ memo: v })} rows={2} />
    </>
  );
};

const PiEcForm: React.FC<{ cond: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }> = ({ cond, onChange }) => {
  const c = cond as { missionSuccessCriteria?: string; reliabilityTarget?: number | ''; confidenceLevel?: number | ''; analysisMethod?: string; memo?: string };
  const u = (patch: Partial<typeof c>) => onChange({ ...cond, ...patch });
  return (
    <>
      <Txt label="ミッション成功基準" value={c.missionSuccessCriteria ?? ''} onChange={(v) => u({ missionSuccessCriteria: v })} rows={2} placeholder="例: ペイロードを目標軌道±5km以内に投入" />
      <Num label="信頼性目標値 (Pi)" unit="—" value={c.reliabilityTarget ?? ''} onChange={(v) => u({ reliabilityTarget: v })} placeholder="例: 0.95" helpText="0〜1の範囲で入力" />
      <Num label="信頼水準 (Ec)" unit="%" value={c.confidenceLevel ?? ''} onChange={(v) => u({ confidenceLevel: v })} placeholder="例: 90" />
      <Sel label="解析手法" value={c.analysisMethod ?? 'fta'} options={[
        { value: 'fta', label: 'FTA (フォルトツリー解析)' },
        { value: 'fmea', label: 'FMEA (故障モード影響解析)' },
        { value: 'markov', label: 'マルコフ解析' },
        { value: 'monte_carlo', label: 'モンテカルロ' },
      ]} onChange={(v) => u({ analysisMethod: v })} />
      <Txt label="メモ" value={c.memo ?? ''} onChange={(v) => u({ memo: v })} rows={2} />
    </>
  );
};

const DebrisImpactForm: React.FC<{ cond: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }> = ({ cond, onChange }) => {
  const c = cond as { releaseAltitudeKm?: number | ''; releaseVelocityMps?: number | ''; releaseFlightPathAngleDeg?: number | ''; windModel?: string; terrainModel?: string; memo?: string };
  const u = (patch: Partial<typeof c>) => onChange({ ...cond, ...patch });
  return (
    <>
      <Num label="分離高度" unit="km" value={c.releaseAltitudeKm ?? ''} onChange={(v) => u({ releaseAltitudeKm: v })} placeholder="例: 80" />
      <Num label="分離速度" unit="m/s" value={c.releaseVelocityMps ?? ''} onChange={(v) => u({ releaseVelocityMps: v })} placeholder="例: 2000" />
      <Num label="飛行経路角" unit="deg" value={c.releaseFlightPathAngleDeg ?? ''} onChange={(v) => u({ releaseFlightPathAngleDeg: v })} placeholder="例: -30" helpText="水平を0°とする（降下は負）" />
      <Sel label="風モデル" value={c.windModel ?? 'standard'} options={[
        { value: 'standard', label: '標準大気風プロファイル' },
        { value: 'jra55', label: 'JRA-55 実測値' },
        { value: 'calm', label: '無風' },
      ]} onChange={(v) => u({ windModel: v })} />
      <Sel label="地形モデル" value={c.terrainModel ?? 'flat'} options={[
        { value: 'flat', label: '平坦地形' },
        { value: 'srtm', label: 'SRTM 地形データ' },
      ]} onChange={(v) => u({ terrainModel: v })} />
      <Txt label="メモ" value={c.memo ?? ''} onChange={(v) => u({ memo: v })} rows={2} />
    </>
  );
};

const RfLinkForm: React.FC<{ cond: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }> = ({ cond, onChange }) => {
  const antennas = useMasterDataStore((s) => s.antennas);
  const groundAntennas = antennas.filter((a) => a.type === 'ground');
  const rocketAntennas = antennas.filter((a) => a.type === 'rocket');
  const c = cond as { txPowerDbw?: number | ''; frequencyMHz?: number | ''; groundAntennaId?: string; rocketAntennaId?: string; pathLossModel?: string; requiredMarginDb?: number | ''; polarizationLossDb?: number | ''; memo?: string };
  const u = (patch: Partial<typeof c>) => onChange({ ...cond, ...patch });
  return (
    <>
      <Num label="送信電力" unit="dbw" value={c.txPowerDbw ?? ''} onChange={(v) => u({ txPowerDbw: v })} placeholder="例: 10" />
      <Num label="周波数" unit="mhz" value={c.frequencyMHz ?? ''} onChange={(v) => u({ frequencyMHz: v })} placeholder="例: 2200" />
      <div className="mb-3">
        <label className="form-label fw-medium">地上局アンテナ</label>
        <select className="form-select" value={c.groundAntennaId ?? ''} onChange={(e) => u({ groundAntennaId: e.target.value })}>
          <option value="">— 選択してください —</option>
          {groundAntennas.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.frequencyBand})</option>)}
        </select>
        {groundAntennas.length === 0 && (
          <div className="form-text text-warning"><i className="bi bi-exclamation-triangle me-1" />マスタデータ → アンテナデータ から地上局を先に登録してください</div>
        )}
      </div>
      <div className="mb-3">
        <label className="form-label fw-medium">ロケットアンテナ</label>
        <select className="form-select" value={c.rocketAntennaId ?? ''} onChange={(e) => u({ rocketAntennaId: e.target.value })}>
          <option value="">— 選択してください —</option>
          {rocketAntennas.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.frequencyBand})</option>)}
        </select>
        {rocketAntennas.length === 0 && (
          <div className="form-text text-warning"><i className="bi bi-exclamation-triangle me-1" />マスタデータ → アンテナデータ からロケットアンテナを先に登録してください</div>
        )}
      </div>
      <Sel label="伝搬損失モデル" value={c.pathLossModel ?? 'fspl'} options={[
        { value: 'fspl', label: '自由空間損失 (FSPL)' },
        { value: 'itu_p618', label: 'ITU-R P.618 (降雨損失含む)' },
      ]} onChange={(v) => u({ pathLossModel: v })} />
      <Num label="偏波損失" unit="db" value={c.polarizationLossDb ?? ''} onChange={(v) => u({ polarizationLossDb: v })} placeholder="例: 0.5" />
      <Num label="要求リンクマージン" unit="db" value={c.requiredMarginDb ?? ''} onChange={(v) => u({ requiredMarginDb: v })} placeholder="例: 3" />
      <Txt label="メモ" value={c.memo ?? ''} onChange={(v) => u({ memo: v })} rows={2} />
    </>
  );
};

const AblationForm: React.FC<{ cond: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }> = ({ cond, onChange }) => {
  const c = cond as { reentryVelocityMps?: number | ''; reentryAngleDeg?: number | ''; peakHeatFluxKwm2?: number | ''; heatShieldMaterial?: string; thicknessM?: number | ''; thermalModel?: string; memo?: string };
  const u = (patch: Partial<typeof c>) => onChange({ ...cond, ...patch });
  return (
    <>
      <Num label="再突入速度" unit="m/s" value={c.reentryVelocityMps ?? ''} onChange={(v) => u({ reentryVelocityMps: v })} placeholder="例: 7800" />
      <Num label="再突入角" unit="deg" value={c.reentryAngleDeg ?? ''} onChange={(v) => u({ reentryAngleDeg: v })} helpText="水平からの角度（負値で降下）" placeholder="例: -5" />
      <Num label="最大加熱率" unit="kw/m²" value={c.peakHeatFluxKwm2 ?? ''} onChange={(v) => u({ peakHeatFluxKwm2: v })} placeholder="例: 1500" />
      <Txt label="断熱材材質" value={c.heatShieldMaterial ?? ''} onChange={(v) => u({ heatShieldMaterial: v })} placeholder="例: CFRP, アブレータ (SLA-561V)" />
      <Num label="断熱材厚さ" unit="m" value={c.thicknessM ?? ''} onChange={(v) => u({ thicknessM: v })} placeholder="例: 0.03" />
      <Sel label="加熱モデル" value={c.thermalModel ?? 'eckert'} options={[
        { value: 'eckert', label: 'Eckert 参照温度法' },
        { value: 'fay_riddell', label: 'Fay-Riddell (よどみ点)' },
        { value: 'chapman', label: 'Chapman 球近似' },
      ]} onChange={(v) => u({ thermalModel: v })} />
      <Txt label="メモ" value={c.memo ?? ''} onChange={(v) => u({ memo: v })} rows={2} />
    </>
  );
};

const OrbitLifetimeForm: React.FC<{ cond: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }> = ({ cond, onChange }) => {
  const c = cond as { initialAltitudeKm?: number | ''; inclination?: number | ''; solarActivityLevel?: string; dragCoefficient?: number | ''; crossSectionM2?: number | ''; memo?: string };
  const u = (patch: Partial<typeof c>) => onChange({ ...cond, ...patch });
  return (
    <>
      <Num label="初期高度" unit="km" value={c.initialAltitudeKm ?? ''} onChange={(v) => u({ initialAltitudeKm: v })} placeholder="例: 400" />
      <Num label="軌道傾斜角" unit="deg" value={c.inclination ?? ''} onChange={(v) => u({ inclination: v })} placeholder="例: 51.6" />
      <Sel label="太陽活動レベル" value={c.solarActivityLevel ?? 'medium'} options={[
        { value: 'low', label: '低 (Solar Min)' },
        { value: 'medium', label: '中 (Average)' },
        { value: 'high', label: '高 (Solar Max)' },
      ]} onChange={(v) => u({ solarActivityLevel: v })} />
      <Num label="抗力係数 (Cd)" value={c.dragCoefficient ?? ''} onChange={(v) => u({ dragCoefficient: v })} placeholder="例: 2.2" />
      <Num label="抗力面積" unit="m²" value={c.crossSectionM2 ?? ''} onChange={(v) => u({ crossSectionM2: v })} helpText="代表断面積（平均投影面積）" placeholder="例: 1.5" />
      <Txt label="メモ" value={c.memo ?? ''} onChange={(v) => u({ memo: v })} rows={2} />
    </>
  );
};

const PathRotationRateForm: React.FC<{ cond: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }> = ({ cond, onChange }) => {
  const c = cond as { maxRollRateDegS?: number | ''; rollDirection?: string; rollAxis?: string; spinStabilized?: string; evaluationAltitudeKm?: number | ''; simDurationS?: number | ''; memo?: string };
  const u = (patch: Partial<typeof c>) => onChange({ ...cond, ...patch });
  return (
    <>
      <Num label="最大ロール角速度" unit="deg/s" value={c.maxRollRateDegS ?? ''} onChange={(v) => u({ maxRollRateDegS: v })} placeholder="例: 360" />
      <Sel label="ロール方向" value={c.rollDirection ?? 'cw'} options={[
        { value: 'cw',  label: '時計回り (CW)' },
        { value: 'ccw', label: '反時計回り (CCW)' },
        { value: 'any', label: '両方向' },
      ]} onChange={(v) => u({ rollDirection: v })} />
      <Sel label="機体回転軸" value={c.rollAxis ?? 'x'} options={[
        { value: 'x', label: '機軸 (X軸)' },
        { value: 'y', label: 'Y軸' },
        { value: 'z', label: 'Z軸' },
      ]} onChange={(v) => u({ rollAxis: v })} />
      <Sel label="スピン安定化" value={c.spinStabilized ?? 'no'} options={[
        { value: 'no',  label: 'なし（姿勢制御あり）' },
        { value: 'yes', label: 'あり（スピン安定化）' },
      ]} onChange={(v) => u({ spinStabilized: v })} />
      <Num label="評価高度" unit="km" value={c.evaluationAltitudeKm ?? ''} onChange={(v) => u({ evaluationAltitudeKm: v })} placeholder="例: 80" helpText="評価対象の高度（最大動圧付近など）" />
      <Num label="シミュレーション時間" unit="s" value={c.simDurationS ?? ''} onChange={(v) => u({ simDurationS: v })} placeholder="例: 600" />
      <Txt label="メモ" value={c.memo ?? ''} onChange={(v) => u({ memo: v })} rows={2} />
    </>
  );
};

const GnssSatelliteForm: React.FC<{ cond: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }> = ({ cond, onChange }) => {
  const c = cond as { gnssConstellation?: string; minElevationDeg?: number | ''; pdopRequirement?: number | ''; receiverSensitivityDbm?: number | ''; antennaMaskDeg?: number | ''; multiPathMarginDb?: number | ''; ionosphericModel?: string; memo?: string };
  const u = (patch: Partial<typeof c>) => onChange({ ...cond, ...patch });
  return (
    <>
      <Sel label="測位衛星コンステレーション" value={c.gnssConstellation ?? 'gps'} options={[
        { value: 'gps',        label: 'GPS (米国)' },
        { value: 'glonass',    label: 'GLONASS (ロシア)' },
        { value: 'galileo',    label: 'Galileo (欧州)' },
        { value: 'beidou',     label: 'BeiDou (中国)' },
        { value: 'qzss',       label: 'QZSS (みちびき)' },
        { value: 'multi',      label: 'マルチコンステレーション' },
      ]} onChange={(v) => u({ gnssConstellation: v })} />
      <Num label="最小仰角" unit="deg" value={c.minElevationDeg ?? ''} onChange={(v) => u({ minElevationDeg: v })} placeholder="例: 5" helpText="可視衛星として計上する最低仰角" />
      <Num label="要求 PDOP" value={c.pdopRequirement ?? ''} onChange={(v) => u({ pdopRequirement: v })} placeholder="例: 3.0" helpText="Position Dilution of Precision（小さいほど良）" />
      <Num label="受信機感度" unit="dBm" value={c.receiverSensitivityDbm ?? ''} onChange={(v) => u({ receiverSensitivityDbm: v })} placeholder="例: -130" />
      <Num label="アンテナマスク角" unit="deg" value={c.antennaMaskDeg ?? ''} onChange={(v) => u({ antennaMaskDeg: v })} placeholder="例: 10" helpText="機体構造によるアンテナ遮蔽角" />
      <Num label="マルチパスマージン" unit="dB" value={c.multiPathMarginDb ?? ''} onChange={(v) => u({ multiPathMarginDb: v })} placeholder="例: 3" />
      <Sel label="電離層モデル" value={c.ionosphericModel ?? 'klobuchar'} options={[
        { value: 'klobuchar', label: 'Klobuchar モデル' },
        { value: 'iri',       label: 'IRI (国際参照電離層)' },
        { value: 'none',      label: '補正なし' },
      ]} onChange={(v) => u({ ionosphericModel: v })} />
      <Txt label="メモ" value={c.memo ?? ''} onChange={(v) => u({ memo: v })} rows={2} />
    </>
  );
};

const AeroAnalysisForm: React.FC<{ cond: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }> = ({ cond, onChange }) => {
  const c = cond as {
    method?: string;
    machPoints?: string;
    aoaPointsDeg?: string;
    referenceAltitudeM?: number | '';
    memo?: string;
  };
  const u = (patch: Partial<typeof c>) => onChange({ ...cond, ...patch });
  return (
    <>
      <Sel label="解析メソッド" value={c.method ?? 'datcom'} options={[
        { value: 'datcom',  label: 'DATCOM' },
        { value: 'cfd',     label: 'CFD (OpenFOAM等)' },
        { value: 'manual',  label: '手入力 / その他' },
      ]} onChange={(v) => u({ method: v })} />
      <Txt
        label="マッハ数点（カンマ区切り）"
        value={c.machPoints ?? '0.5, 1.0, 1.5, 2.0, 3.0'}
        onChange={(v) => u({ machPoints: v })}
        placeholder="例: 0.5, 1.0, 1.5, 2.0, 3.0"
      />
      <Txt
        label="AoA点 (deg)（カンマ区切り）"
        value={c.aoaPointsDeg ?? '0, 2, 4, 6'}
        onChange={(v) => u({ aoaPointsDeg: v })}
        placeholder="例: 0, 2, 4, 6"
      />
      <Num
        label="基準高度"
        unit="m"
        value={c.referenceAltitudeM ?? ''}
        onChange={(v) => u({ referenceAltitudeM: v })}
        placeholder="例: 30000"
        helpText="代表的な飛行高度（大気モデルの評価高度）"
      />
      <Txt label="メモ" value={c.memo ?? ''} onChange={(v) => u({ memo: v })} rows={2} />
    </>
  );
};

interface AnalysisConditionViewProps {
  /** モーダルから直接渡す場合に使用。省略時は appStore の値を参照。 */
  caseId?: string;
  serviceType?: AnalysisServiceType;
}

export const AnalysisConditionView: React.FC<AnalysisConditionViewProps> = ({
  caseId: propCaseId,
  serviceType: propServiceType,
}) => {
  const { analysisCaseId: storeCaseId, analysisService: storeService, navigate } = useAppStore();
  const allCases = useAnalysisStore((s) => s.cases);
  const updateCase = useAnalysisStore((s) => s.updateCase);

  // props が渡されていればそちらを優先、なければ appStore を使用
  const analysisCaseId = propCaseId ?? storeCaseId;
  const analysisService = propServiceType ?? storeService;

  const analysisCase = allCases.find((c) => c.id === analysisCaseId) ?? null;
  const serviceType = analysisService as AnalysisServiceType;
  const meta = serviceType ? SERVICE_META[serviceType] : null;

  // ① マスタデータ・② 条件設定（機体諸元）は解析フロー画面の「共通パラメータ」で全解析共通に設定する。

  // 上流解析ケース
  const upstreamServiceType = serviceType ? SERVICE_UPSTREAM[serviceType] : undefined;
  const upstreamCase = analysisCase?.upstreamCaseId
    ? allCases.find((c) => c.id === analysisCase.upstreamCaseId)
    : null;
  const upstreamMeta = upstreamServiceType ? SERVICE_META[upstreamServiceType] : null;

  const handleConditionChange = useCallback((cond: Record<string, unknown>) => {
    if (!analysisCaseId) return;
    updateCase(analysisCaseId, { condition: cond });
  }, [analysisCaseId, updateCase]);

  if (!analysisCaseId || !analysisCase || !serviceType || !meta) {
    return <div className="text-muted p-4">解析ケースが選択されていません。</div>;
  }

  const cond = analysisCase.condition ?? {};

  const renderForm = () => {
    switch (serviceType) {
      case 'aeroAnalysis':    return <AeroAnalysisForm cond={cond} onChange={handleConditionChange} />;
      case 'flightAnalysis':  return <FlightAnalysisForm cond={cond} onChange={handleConditionChange} />;
      case 'dispersedFlight': return <DispersedFlightForm cond={cond} onChange={handleConditionChange} />;
      case 'loadAnalysis':    return <LoadAnalysisForm cond={cond} onChange={handleConditionChange} />;
      case 'shipHazard':      return <ShipHazardForm cond={cond} onChange={handleConditionChange} />;
      case 'piEc':            return <PiEcForm cond={cond} onChange={handleConditionChange} />;
      case 'debrisImpact':    return <DebrisImpactForm cond={cond} onChange={handleConditionChange} />;
      case 'rfLink':           return <RfLinkForm cond={cond} onChange={handleConditionChange} />;
      case 'ablation':        return <AblationForm cond={cond} onChange={handleConditionChange} />;
      case 'orbitLifetime':   return <OrbitLifetimeForm cond={cond} onChange={handleConditionChange} />;
      case 'pathRotationRate': return <PathRotationRateForm cond={cond} onChange={handleConditionChange} />;
      case 'gnssSatellite':   return <GnssSatelliteForm cond={cond} onChange={handleConditionChange} />;
    }
  };

  return (
    // content-area は flex column + overflow:hidden なので、
    // 各ページ root は flex:1 + min-height:0 + overflow:auto で自前スクロール可能領域を作る
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <h1 className="page-title">
          <i className={`bi bi-gear me-2 text-primary`} />
          解析条件 — {analysisCase.name}
        </h1>
        <div className="d-flex align-items-center gap-2">
          <ConditionJsonIO
            caseName={analysisCase.name}
            condition={cond}
            onImport={handleConditionChange}
          />
          <small className="text-muted">入力内容は自動保存されます</small>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-lg-6">
          <div className="card p-3">
            <h6 className="fw-semibold mb-1">
              <span className="badge bg-primary me-2">③</span>この解析の条件
              <small className="text-muted ms-2 fw-normal">解析によって変わる入力</small>
            </h6>
            <p className="text-muted mb-3" style={{ fontSize: '0.78rem' }}>
              <i className={`bi bi-${meta.icon} me-1`} />{meta.label} に固有の入力項目です。
            </p>
            {renderForm()}
          </div>
        </div>

        <div className="col-lg-6">
          <div className="alert alert-light border d-flex align-items-start gap-2 py-2 mb-3" style={{ fontSize: '0.8rem' }}>
            <i className="bi bi-info-circle text-muted mt-1" />
            <span className="text-muted">
              マスタデータ（号機共通）と条件設定（機体諸元）は、解析フロー画面上部の「共通パラメータ」から
              全解析共通で設定します。
            </span>
          </div>

          {/* 上流解析ケース */}
          {upstreamServiceType && upstreamMeta && (
            <div className="card p-3 mb-3">
              <h6 className="fw-semibold mb-1">
                <i className="bi bi-arrow-up-circle me-2 text-warning" />
                上流解析ケース
              </h6>
              <p className="text-muted mb-2" style={{ fontSize: '0.78rem' }}>
                この解析の入力となる上位解析ケース（{upstreamMeta.label}）
              </p>
              {upstreamCase ? (
                <button
                  className="btn btn-sm d-flex align-items-center gap-2 text-start"
                  style={{ border: '1px solid #dee2e6', background: '#fff', borderRadius: 6 }}
                  onClick={() => navigate('analysisCondition', {
                    projectId: upstreamCase.projectId,
                    analysisCaseId: upstreamCase.id,
                    analysisService: upstreamServiceType,
                  })}
                  title={`${upstreamMeta.label}「${upstreamCase.name}」の解析条件へ移動`}
                >
                  <span className="badge bg-warning-subtle text-warning" style={{ minWidth: 28 }}>
                    <i className={`bi bi-${upstreamMeta.icon}`} />
                  </span>
                  <span className="flex-grow-1" style={{ fontSize: '0.83rem' }}>{upstreamCase.name}</span>
                  <span className="text-muted" style={{ fontSize: '0.75rem' }}>{upstreamMeta.label}</span>
                  <i className="bi bi-box-arrow-up-right text-muted" style={{ fontSize: '0.72rem' }} />
                </button>
              ) : (
                <div className="text-warning" style={{ fontSize: '0.83rem' }}>
                  <i className="bi bi-exclamation-triangle me-1" />
                  上流解析ケースが設定されていません
                </div>
              )}
            </div>
          )}

          {/* 解析ケース情報 */}
          <div className="card p-3">
            <h6 className="fw-semibold mb-3 text-muted">解析ケース情報</h6>
            <table className="table table-sm mb-0">
              <tbody>
                <tr>
                  <td className="text-muted" style={{ width: '40%' }}>ケース名</td>
                  <td>{analysisCase.name}</td>
                </tr>
                <tr>
                  <td className="text-muted">作成者</td>
                  <td>{analysisCase.createdBy || '—'}</td>
                </tr>
                <tr>
                  <td className="text-muted">作成日時</td>
                  <td>{new Date(analysisCase.createdAt).toLocaleDateString('ja-JP')}</td>
                </tr>
                <tr>
                  <td className="text-muted">更新日時</td>
                  <td>{new Date(analysisCase.updatedAt).toLocaleString('ja-JP')}</td>
                </tr>
                {analysisCase.memo && (
                  <tr>
                    <td className="text-muted">メモ</td>
                    <td className="text-muted">{analysisCase.memo}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
