import React from 'react';
import { useMassCaseStore } from '../../stores/massCaseStore';
import { useRocketShapeStore } from '../../stores/rocketShapeStore';
import { useAppStore } from '../../stores/appStore';
import type { NoseConeType } from '../../types';

const NOSE_CONE_OPTIONS: { value: NoseConeType; label: string }[] = [
  { value: 'ogive',      label: 'オジーブ (Ogive)' },
  { value: 'conical',    label: '円錐 (Conical)' },
  { value: 'haack',      label: 'ハーク (Von Kármán)' },
  { value: 'elliptical', label: '楕円 (Elliptical)' },
  { value: 'parabolic',  label: '放物線 (Parabolic)' },
];

export const RocketShapeView: React.FC = () => {
  const { massCaseId } = useAppStore();
  const cases = useMassCaseStore((s) => s.cases);
  const geometries = useRocketShapeStore((s) => s.geometries);
  const upsertGeometry = useRocketShapeStore((s) => s.upsertGeometry);
  const addBodySection = useRocketShapeStore((s) => s.addBodySection);
  const updateBodySection = useRocketShapeStore((s) => s.updateBodySection);
  const deleteBodySection = useRocketShapeStore((s) => s.deleteBodySection);
  const addFinSet = useRocketShapeStore((s) => s.addFinSet);
  const updateFinSet = useRocketShapeStore((s) => s.updateFinSet);
  const deleteFinSet = useRocketShapeStore((s) => s.deleteFinSet);

  const massCase = cases.find((c) => c.id === massCaseId) ?? null;
  const geom = geometries.find((g) => g.massCaseId === massCaseId);
  const noseCone = geom?.noseCone ?? { type: 'ogive' as NoseConeType, lengthM: 2.0, baseDiameterM: 1.0 };
  const bodySections = geom?.bodySections ?? [];
  const finSets = geom?.finSets ?? [];

  // 基準値の自動計算
  const refAreaM2 = noseCone.baseDiameterM > 0
    ? Math.PI * (noseCone.baseDiameterM / 2) ** 2
    : 0;
  const totalLengthM = noseCone.lengthM + bodySections.reduce((acc, bs) => acc + bs.lengthM, 0);

  if (!massCaseId || !massCase) {
    return <div className="text-muted p-4">ロケットデータベースが選択されていません。</div>;
  }

  const numInput = (
    value: number,
    onChange: (v: number) => void,
    step = '0.001',
    min?: number,
  ) => (
    <input
      type="number"
      className="form-control form-control-sm text-end font-monospace"
      style={{ width: 100 }}
      step={step}
      min={min}
      value={value}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (!isNaN(v)) onChange(v);
      }}
    />
  );

  const intInput = (value: number, onChange: (v: number) => void) => (
    <input
      type="number"
      className="form-control form-control-sm text-end font-monospace"
      style={{ width: 70 }}
      step="1"
      min="1"
      value={value}
      onChange={(e) => {
        const v = parseInt(e.target.value, 10);
        if (!isNaN(v) && v >= 1) onChange(v);
      }}
    />
  );

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="page-title">
          <i className="bi bi-rulers-combined me-2 text-primary" />
          空力形状 — {massCase.name}
        </h1>
        <small className="text-muted">入力内容は自動保存されます</small>
      </div>

      <div className="alert alert-info d-flex align-items-start gap-2 py-2 mb-3">
        <i className="bi bi-info-circle mt-1 flex-shrink-0" />
        <small>
          ロケット全体の幾何形状を定義します。空力解析（DATCOM / CFD）の入力データとして利用されます。
          ノーズコーン・胴体セクション・フィンセットを入力してください。
        </small>
      </div>

      {/* ノーズコーン */}
      <div className="card mb-3">
        <div className="card-header fw-semibold" style={{ fontSize: '0.88rem' }}>
          <i className="bi bi-triangle me-2 text-primary" />ノーズコーン
        </div>
        <div className="card-body">
          <div className="row g-3 align-items-end">
            <div className="col-auto">
              <label className="form-label" style={{ fontSize: '0.82rem' }}>形状タイプ</label>
              <select
                className="form-select form-select-sm"
                style={{ width: 220 }}
                value={noseCone.type}
                onChange={(e) =>
                  upsertGeometry(massCaseId, {
                    noseCone: { ...noseCone, type: e.target.value as NoseConeType },
                  })
                }
              >
                {NOSE_CONE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="col-auto">
              <label className="form-label" style={{ fontSize: '0.82rem' }}>長さ (m)</label>
              {numInput(noseCone.lengthM, (v) =>
                upsertGeometry(massCaseId, { noseCone: { ...noseCone, lengthM: v } })
              )}
            </div>
            <div className="col-auto">
              <label className="form-label" style={{ fontSize: '0.82rem' }}>基部直径 (m)</label>
              {numInput(noseCone.baseDiameterM, (v) =>
                upsertGeometry(massCaseId, { noseCone: { ...noseCone, baseDiameterM: v } })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 胴体セクション */}
      <div className="card mb-3">
        <div className="card-header d-flex align-items-center gap-2" style={{ fontSize: '0.88rem' }}>
          <i className="bi bi-distribute-vertical text-primary" />
          <span className="fw-semibold">胴体セクション</span>
          <button
            className="btn btn-sm btn-outline-primary ms-auto"
            style={{ fontSize: '0.75rem', padding: '2px 10px' }}
            onClick={() =>
              addBodySection(massCaseId, { stageNo: 1, outerDiameterM: 1.0, lengthM: 5.0 })
            }
          >
            <i className="bi bi-plus-lg me-1" />追加
          </button>
        </div>
        <div className="card-body p-0">
          {bodySections.length === 0 ? (
            <p className="text-muted px-3 py-3 mb-0" style={{ fontSize: '0.82rem' }}>
              胴体セクションがありません。「追加」ボタンで追加してください。
            </p>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm table-hover mb-0">
                <thead>
                  <tr style={{ fontSize: '0.82rem' }}>
                    <th style={{ width: 80 }}>段</th>
                    <th className="text-end" style={{ width: 130 }}>外径 (m)</th>
                    <th className="text-end" style={{ width: 130 }}>長さ (m)</th>
                    <th style={{ width: 60 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {bodySections.map((bs) => (
                    <tr key={bs.id}>
                      <td>{intInput(bs.stageNo, (v) => updateBodySection(massCaseId, bs.id, { stageNo: v }))}</td>
                      <td className="text-end">
                        {numInput(bs.outerDiameterM, (v) => updateBodySection(massCaseId, bs.id, { outerDiameterM: v }))}
                      </td>
                      <td className="text-end">
                        {numInput(bs.lengthM, (v) => updateBodySection(massCaseId, bs.id, { lengthM: v }))}
                      </td>
                      <td>
                        <button
                          className="btn btn-sm btn-outline-danger"
                          style={{ padding: '2px 8px' }}
                          onClick={() => deleteBodySection(massCaseId, bs.id)}
                        >
                          <i className="bi bi-trash" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* フィンセット */}
      <div className="card mb-3">
        <div className="card-header d-flex align-items-center gap-2" style={{ fontSize: '0.88rem' }}>
          <i className="bi bi-pentagon text-primary" />
          <span className="fw-semibold">フィンセット</span>
          <button
            className="btn btn-sm btn-outline-primary ms-auto"
            style={{ fontSize: '0.75rem', padding: '2px 10px' }}
            onClick={() =>
              addFinSet(massCaseId, {
                stageNo: 1, count: 4,
                rootChordM: 0.6, tipChordM: 0.2, spanM: 0.6,
                sweepAngleDeg: 45, thicknessM: 0.005,
              })
            }
          >
            <i className="bi bi-plus-lg me-1" />追加
          </button>
        </div>
        <div className="card-body p-0">
          {finSets.length === 0 ? (
            <p className="text-muted px-3 py-3 mb-0" style={{ fontSize: '0.82rem' }}>
              フィンセットがありません。「追加」ボタンで追加してください。
            </p>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm table-hover mb-0">
                <thead>
                  <tr style={{ fontSize: '0.82rem' }}>
                    <th style={{ width: 60 }}>段</th>
                    <th style={{ width: 70 }}>枚数</th>
                    <th className="text-end" style={{ width: 120 }}>付根cd (m)</th>
                    <th className="text-end" style={{ width: 120 }}>先端cd (m)</th>
                    <th className="text-end" style={{ width: 110 }}>スパン (m)</th>
                    <th className="text-end" style={{ width: 110 }}>後退角 (°)</th>
                    <th className="text-end" style={{ width: 110 }}>厚さ (m)</th>
                    <th style={{ width: 60 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {finSets.map((fs) => (
                    <tr key={fs.id}>
                      <td>{intInput(fs.stageNo, (v) => updateFinSet(massCaseId, fs.id, { stageNo: v }))}</td>
                      <td>{intInput(fs.count, (v) => updateFinSet(massCaseId, fs.id, { count: v }))}</td>
                      <td className="text-end">
                        {numInput(fs.rootChordM, (v) => updateFinSet(massCaseId, fs.id, { rootChordM: v }))}
                      </td>
                      <td className="text-end">
                        {numInput(fs.tipChordM, (v) => updateFinSet(massCaseId, fs.id, { tipChordM: v }))}
                      </td>
                      <td className="text-end">
                        {numInput(fs.spanM, (v) => updateFinSet(massCaseId, fs.id, { spanM: v }))}
                      </td>
                      <td className="text-end">
                        {numInput(fs.sweepAngleDeg, (v) => updateFinSet(massCaseId, fs.id, { sweepAngleDeg: v }), '1')}
                      </td>
                      <td className="text-end">
                        {numInput(fs.thicknessM, (v) => updateFinSet(massCaseId, fs.id, { thicknessM: v }), '0.001')}
                      </td>
                      <td>
                        <button
                          className="btn btn-sm btn-outline-danger"
                          style={{ padding: '2px 8px' }}
                          onClick={() => deleteFinSet(massCaseId, fs.id)}
                        >
                          <i className="bi bi-trash" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 基準値（自動計算） */}
      <div className="card">
        <div className="card-header fw-semibold" style={{ fontSize: '0.88rem' }}>
          <i className="bi bi-calculator me-2 text-primary" />基準値（自動計算）
        </div>
        <div className="card-body">
          <div className="row g-4">
            <div className="col-auto">
              <div className="text-muted mb-1" style={{ fontSize: '0.8rem' }}>基準面積</div>
              <div className="font-monospace fw-semibold" style={{ fontSize: '1.05rem' }}>
                {refAreaM2.toFixed(4)} m²
              </div>
              <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                π × (D/2)² ， D = {noseCone.baseDiameterM} m
              </div>
            </div>
            <div className="col-auto">
              <div className="text-muted mb-1" style={{ fontSize: '0.8rem' }}>全長</div>
              <div className="font-monospace fw-semibold" style={{ fontSize: '1.05rem' }}>
                {totalLengthM.toFixed(3)} m
              </div>
              <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                ノーズ + 胴体セクション合計
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
