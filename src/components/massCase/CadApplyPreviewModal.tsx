import React, { useMemo, useState } from 'react';
import type { MassComponent } from '../../types';
import type { CadApplyUpdate } from './CadImportModal';

// ─── 比較対象フィールド定義 ───────────────────────────────────────────────────
// CAD取り込みで上書きされる可能性のあるフィールドだけを並べる。
// (cadSoftware / cadLastImported のようなメタ情報は除外)

type FieldKey =
  | 'actualMass'
  | 'cg'
  | 'inertia'
  | 'material'
  | 'mountPos'
  | 'mountEnd';

interface FieldDiff {
  key: FieldKey;
  label: string;
  before: string;
  after: string;
  changed: boolean;
}

const fmt = (v: unknown, digits = 3): string => {
  if (v == null || v === '') return '—';
  if (typeof v === 'number') {
    if (!isFinite(v)) return '—';
    return v.toLocaleString('ja-JP', { maximumFractionDigits: digits });
  }
  return String(v);
};

const eq = (a: unknown, b: unknown, eps = 1e-6): boolean => {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < eps;
  return a === b;
};

/** 1コンポーネントの全フィールド差分を計算 */
const computeDiffs = (comp: MassComponent | undefined, update: Partial<MassComponent>): FieldDiff[] => {
  const diffs: FieldDiff[] = [];
  const cur = comp ?? ({} as Partial<MassComponent>);

  // 実質量
  if ('actualMass' in update) {
    diffs.push({
      key: 'actualMass',
      label: '実質量',
      before: `${fmt(cur.actualMass)} kg`,
      after: `${fmt(update.actualMass)} kg`,
      changed: !eq(cur.actualMass, update.actualMass),
    });
  }
  // 重心
  if ('cgX' in update || 'cgY' in update || 'cgZ' in update) {
    const before = `(${fmt(cur.cgX)}, ${fmt(cur.cgY)}, ${fmt(cur.cgZ)}) m`;
    const after = `(${fmt(update.cgX ?? cur.cgX)}, ${fmt(update.cgY ?? cur.cgY)}, ${fmt(update.cgZ ?? cur.cgZ)}) m`;
    diffs.push({
      key: 'cg',
      label: '重心',
      before, after,
      changed: !eq(cur.cgX, update.cgX) || !eq(cur.cgY, update.cgY) || !eq(cur.cgZ, update.cgZ),
    });
  }
  // 慣性テンソル
  if ('ixx' in update || 'iyy' in update || 'izz' in update) {
    const before = `Ixx=${fmt(cur.ixx)}, Iyy=${fmt(cur.iyy)}, Izz=${fmt(cur.izz)}`;
    const after = `Ixx=${fmt(update.ixx ?? cur.ixx)}, Iyy=${fmt(update.iyy ?? cur.iyy)}, Izz=${fmt(update.izz ?? cur.izz)}`;
    diffs.push({
      key: 'inertia',
      label: '慣性テンソル',
      before, after,
      changed: !eq(cur.ixx, update.ixx) || !eq(cur.iyy, update.iyy) || !eq(cur.izz, update.izz),
    });
  }
  // 材質
  if ('materialName' in update || 'materialDensity' in update) {
    const matBefore = `${cur.materialName ?? '—'}${cur.materialDensity != null ? ` (${fmt(cur.materialDensity, 1)} kg/m³)` : ''}`;
    const newName = update.materialName ?? cur.materialName;
    const newDen = update.materialDensity ?? cur.materialDensity;
    const matAfter = `${newName ?? '—'}${newDen != null ? ` (${fmt(newDen, 1)} kg/m³)` : ''}`;
    diffs.push({
      key: 'material',
      label: '材質',
      before: matBefore, after: matAfter,
      changed: cur.materialName !== update.materialName || !eq(cur.materialDensity, update.materialDensity),
    });
  }
  // 搭載位置 (始点)
  if ('mountPosX' in update || 'mountPosY' in update || 'mountPosZ' in update) {
    const before = `(${fmt(cur.mountPosX)}, ${fmt(cur.mountPosY)}, ${fmt(cur.mountPosZ)}) m`;
    const after = `(${fmt(update.mountPosX ?? cur.mountPosX)}, ${fmt(update.mountPosY ?? cur.mountPosY)}, ${fmt(update.mountPosZ ?? cur.mountPosZ)}) m`;
    diffs.push({
      key: 'mountPos',
      label: '搭載位置(始点)',
      before, after,
      changed:
        !eq(cur.mountPosX, update.mountPosX) ||
        !eq(cur.mountPosY, update.mountPosY) ||
        !eq(cur.mountPosZ, update.mountPosZ),
    });
  }
  // 搭載位置 (終点)
  if ('mountEndX' in update || 'mountEndY' in update || 'mountEndZ' in update) {
    const before = `(${fmt(cur.mountEndX)}, ${fmt(cur.mountEndY)}, ${fmt(cur.mountEndZ)}) m`;
    const after = `(${fmt(update.mountEndX ?? cur.mountEndX)}, ${fmt(update.mountEndY ?? cur.mountEndY)}, ${fmt(update.mountEndZ ?? cur.mountEndZ)}) m`;
    diffs.push({
      key: 'mountEnd',
      label: '搭載位置(終点)',
      before, after,
      changed:
        !eq(cur.mountEndX, update.mountEndX) ||
        !eq(cur.mountEndY, update.mountEndY) ||
        !eq(cur.mountEndZ, update.mountEndZ),
    });
  }
  return diffs;
};

// ─── Props ────────────────────────────────────────────────────────────────────

/** 同 MassCase 内で重複バインドされている場所の情報 */
export interface DuplicateBindingDetail {
  setupLabel: string;     // 重複側の CADセットアップ label
  cadObjectName: string;  // 重複側の CADオブジェクト名
  isSameSetup: boolean;   // 同じセットアップ内の重複か (より重大)
}

interface Props {
  updates: CadApplyUpdate[];
  components: MassComponent[];
  cadLabel: string;
  /**
   * componentId → 重複バインド一覧（自分以外の場所で同じ component に紐付いてるバインドのリスト）。
   * 1件でも該当があれば該当行はエラー表示。マップに存在する update が1件でもあれば反映ボタンは
   * disabled。
   */
  duplicateBindings?: Map<string, DuplicateBindingDetail[]>;
  onConfirm: (filtered: CadApplyUpdate[]) => void;
  onCancel: () => void;
}

interface RowData {
  update: CadApplyUpdate;
  comp: MassComponent | undefined;
  diffs: FieldDiff[];
  hasChange: boolean;
  isUnbind: boolean;
}

export const CadApplyPreviewModal: React.FC<Props> = ({
  updates, components, cadLabel, duplicateBindings, onConfirm, onCancel,
}) => {
  // 各行のデータ計算（変更あり/なしを判定）
  const rows: RowData[] = useMemo(() => {
    const compById = new Map(components.map((c) => [c.id, c]));
    return updates.map((u) => {
      const comp = compById.get(u.componentId);
      const isUnbind = u.kind === 'unbind';
      const diffs = isUnbind ? [] : computeDiffs(comp, u.update);
      // unbind は常に「変更あり」扱い (値は変わらないが、メタ情報クリア＋履歴記録される)
      const hasChange = isUnbind || diffs.some((d) => d.changed);
      return { update: u, comp, diffs, hasChange, isUnbind };
    });
  }, [updates, components]);

  // 「変更なし」も含めて表示するかのトグル（デフォルト: 隠す）
  const [showUnchanged, setShowUnchanged] = useState(false);

  // 選択状態（componentId → checked）。初期値: 変更ありは ON、変更なしは OFF
  const [selected, setSelected] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    rows.forEach((r) => { init[r.update.componentId] = r.hasChange; });
    return init;
  });

  const visibleRows = useMemo(
    () => (showUnchanged ? rows : rows.filter((r) => r.hasChange)),
    [rows, showUnchanged],
  );

  const visibleCheckedCount = visibleRows.filter((r) => selected[r.update.componentId]).length;
  const visibleAllChecked = visibleRows.length > 0 && visibleCheckedCount === visibleRows.length;

  const toggleAll = () => {
    const next = { ...selected };
    const flag = !visibleAllChecked;
    visibleRows.forEach((r) => { next[r.update.componentId] = flag; });
    setSelected(next);
  };

  const handleConfirm = () => {
    const filtered = updates.filter((u) => selected[u.componentId]);
    if (filtered.length === 0) return;
    onConfirm(filtered);
  };

  const totalCount = rows.length;
  const changedCount = rows.filter((r) => r.hasChange && !r.isUnbind).length;
  const unbindCount = rows.filter((r) => r.isUnbind).length;
  const unchangedCount = totalCount - changedCount - unbindCount;
  const checkedTotal = rows.filter((r) => selected[r.update.componentId]).length;

  // 重複バインドを持つ行の一覧と件数
  const conflictRows = useMemo(
    () => rows.filter((r) => (duplicateBindings?.get(r.update.componentId)?.length ?? 0) > 0),
    [rows, duplicateBindings],
  );
  const hasConflicts = conflictRows.length > 0;

  return (
    <div
      className="modal d-block"
      style={{ background: 'rgba(0,0,0,0.55)', zIndex: 1075 }}
      onClick={onCancel}
    >
      <div
        className="modal-dialog modal-xl modal-dialog-scrollable"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content">
          <div className="modal-header py-2">
            <h6 className="modal-title">
              <i className="bi bi-check2-square me-2 text-primary" />
              反映プレビュー — <span className="text-muted fw-normal">{cadLabel}</span>
            </h6>
            <button className="btn-close btn-sm" onClick={onCancel} />
          </div>

          <div className="modal-body p-0">
            {/* ヘッダー: サマリー + フィルタ */}
            <div
              className="d-flex align-items-center gap-3 px-3 py-2 border-bottom flex-wrap"
              style={{ background: '#f8faff', fontSize: '0.8rem' }}
            >
              <span>
                対象部品 <strong>{totalCount}</strong> 件
                {' '}/ 変更あり <strong className="text-primary">{changedCount}</strong>
                {unbindCount > 0 && (
                  <>
                    {' '}/ <strong className="text-warning-emphasis">バインド解除 {unbindCount}</strong>
                  </>
                )}
                {' '}/ 変更なし <span className="text-muted">{unchangedCount}</span>
                {hasConflicts && (
                  <>
                    {' '}/ <strong className="text-danger">重複バインド {conflictRows.length}</strong>
                  </>
                )}
              </span>
              <span className="ms-auto">
                <span className="me-2 text-muted">選択中: {checkedTotal}</span>
                <div className="form-check form-check-inline mb-0">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id="cad-preview-show-unchanged"
                    checked={showUnchanged}
                    onChange={(e) => setShowUnchanged(e.target.checked)}
                  />
                  <label className="form-check-label" htmlFor="cad-preview-show-unchanged">
                    変更なしも表示
                  </label>
                </div>
              </span>
            </div>

            {/* 行リスト */}
            {visibleRows.length === 0 ? (
              <p className="text-muted text-center py-4 mb-0" style={{ fontSize: '0.85rem' }}>
                {showUnchanged
                  ? 'バインドされた部品がありません'
                  : '差分のある部品はありません（全て現在値と一致）'}
              </p>
            ) : (
              <table className="table table-sm mb-0" style={{ fontSize: '0.8rem' }}>
                <thead className="table-light" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={visibleAllChecked}
                        ref={(el) => {
                          if (el) el.indeterminate = visibleCheckedCount > 0 && !visibleAllChecked;
                        }}
                        onChange={toggleAll}
                        title="表示中をすべて選択 / 解除"
                      />
                    </th>
                    <th style={{ width: '22%' }}>コンポーネント</th>
                    <th>変更内容（現在値 → 新値）</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const checked = !!selected[row.update.componentId];
                    const comp = row.comp;
                    const conflicts = duplicateBindings?.get(row.update.componentId) ?? [];
                    const hasConflict = conflicts.length > 0;
                    return (
                      <tr
                        key={row.update.componentId}
                        style={{
                          background: hasConflict
                            ? '#fef2f2'
                            : row.isUnbind
                              ? '#fff7ed' // unbind: 薄オレンジ
                              : !row.hasChange ? '#f8f9fa' : checked ? '#fff' : '#fefefe',
                          opacity: row.hasChange ? 1 : 0.65,
                        }}
                      >
                        <td className="align-top">
                          <input
                            type="checkbox"
                            className="form-check-input mt-1"
                            checked={checked}
                            onChange={(e) =>
                              setSelected((p) => ({
                                ...p,
                                [row.update.componentId]: e.target.checked,
                              }))
                            }
                          />
                        </td>
                        <td className="align-top">
                          <div className="fw-semibold" style={{ color: '#1558c0' }}>
                            {comp?.paramName ?? <span className="text-danger">（不明な部品）</span>}
                          </div>
                          {comp?.varName && (
                            <code className="text-muted" style={{ fontSize: '0.72rem' }}>
                              {comp.varName}
                            </code>
                          )}
                          {row.isUnbind && (
                            <div className="mt-1">
                              <span
                                className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle"
                                style={{ fontSize: '0.65rem', fontWeight: 600 }}
                                title="このコンポーネントは過去に CAD で更新されたが、現在どのセットアップにも紐付いていません。反映で CAD メタ情報をクリアし「バインド解除」を履歴に記録します。"
                              >
                                <i className="bi bi-link-45deg me-1" />
                                バインド解除
                              </span>
                            </div>
                          )}
                          {!row.hasChange && (
                            <div>
                              <span
                                className="badge bg-secondary-subtle text-secondary border border-secondary-subtle mt-1"
                                style={{ fontSize: '0.62rem', fontWeight: 500 }}
                              >
                                変更なし
                              </span>
                            </div>
                          )}
                          {hasConflict && (
                            <div className="mt-1">
                              <span
                                className="badge bg-danger-subtle text-danger border border-danger-subtle"
                                style={{ fontSize: '0.65rem', fontWeight: 600 }}
                                title={conflicts.map((c) =>
                                  `${c.isSameSetup ? '同セットアップ' : c.setupLabel}: ${c.cadObjectName}`
                                ).join('\n')}
                              >
                                <i className="bi bi-exclamation-triangle-fill me-1" />
                                重複バインド {conflicts.length}
                              </span>
                              <div className="text-danger mt-1" style={{ fontSize: '0.7rem' }}>
                                {conflicts.slice(0, 2).map((c, i) => (
                                  <div key={i}>
                                    ↳ {c.isSameSetup ? '同じセットアップ' : `「${c.setupLabel}」`}
                                    の <code>{c.cadObjectName}</code> でも紐付け
                                  </div>
                                ))}
                                {conflicts.length > 2 && (
                                  <div>…他 {conflicts.length - 2} 件</div>
                                )}
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="align-top">
                          {row.isUnbind ? (
                            <div style={{ fontSize: '0.78rem', color: '#9a3412' }}>
                              <i className="bi bi-eraser-fill me-1" />
                              CAD ソース情報をクリア
                              <div className="text-muted mt-1" style={{ fontSize: '0.72rem' }}>
                                値そのもの（実質量・重心など）は維持。CADバッジ／ロックが解除され、編集可能になります。
                                <div>履歴に「CADバインド解除」が記録されます。</div>
                              </div>
                            </div>
                          ) : row.diffs.length === 0 ? (
                            <span className="text-muted">—</span>
                          ) : (
                            <div className="d-flex flex-column gap-1">
                              {row.diffs.map((d) => (
                                <div
                                  key={d.key}
                                  className="d-flex align-items-baseline gap-2 flex-wrap"
                                  style={{
                                    opacity: d.changed ? 1 : 0.55,
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: '0.72rem',
                                      fontWeight: 600,
                                      color: d.changed ? '#0d6efd' : '#6c757d',
                                      minWidth: 100,
                                      display: 'inline-block',
                                    }}
                                  >
                                    {d.label}
                                  </span>
                                  <span className="text-muted font-monospace" style={{ fontSize: '0.74rem' }}>
                                    {d.before}
                                  </span>
                                  <span style={{ color: '#adb5bd' }}>→</span>
                                  <span
                                    className="font-monospace"
                                    style={{
                                      fontSize: '0.74rem',
                                      fontWeight: d.changed ? 600 : 400,
                                      color: d.changed ? '#0d6efd' : '#495057',
                                    }}
                                  >
                                    {d.after}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="modal-footer py-2">
            <span className="me-auto" style={{ fontSize: '0.78rem' }}>
              {hasConflicts ? (
                <span className="text-danger">
                  <i className="bi bi-exclamation-triangle-fill me-1" />
                  重複バインドが {conflictRows.length} 件あります。CAD取込モーダルでどちらかのバインドを外してから反映してください。
                </span>
              ) : (
                <span className="text-muted">
                  <i className="bi bi-info-circle me-1" />
                  チェックを外すと、その部品はこの取り込みでは反映されません
                </span>
              )}
            </span>
            <button className="btn btn-secondary btn-sm" onClick={onCancel}>キャンセル</button>
            <button
              className="btn btn-primary btn-sm"
              disabled={checkedTotal === 0 || hasConflicts}
              title={hasConflicts ? '重複バインドを解消してください' : undefined}
              onClick={handleConfirm}
            >
              <i className="bi bi-check2-circle me-1" />
              選択した {checkedTotal} 件を反映へ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
