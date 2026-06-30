import React, { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import { useMassCaseStore } from '../../stores/massCaseStore';
import { useRocketShapeStore } from '../../stores/rocketShapeStore';
import { usePropulsionStore } from '../../stores/propulsionStore';
import { useAppStore } from '../../stores/appStore';
import { useCadBindingStore } from '../../stores/cadBindingStore';
import type { MassComponent, ComponentStage, ComponentInputType, DocumentRef, DocumentType, TagDefinition } from '../../types';
import { evaluateComponentMasses, computeGlobalCGMap, computeAggregateInertiaMap, computeAggregateMountMap, type CG3D, type Inertia6, type MountBounds } from '../../utils/formulaEngine';
import { buildCrossRefScope } from '../../utils/crossRefScope';
import { CadImportModal, type CadApplyUpdate } from './CadImportModal';
import { DependencyMap } from './DependencyMap';
import { DependencyMapOverview } from './DependencyMapOverview';
import { listPropulsionVars, listShapeVars } from '../../utils/crossRefScope';
import { useFlags } from '../../stores/featureFlagsStore';
import { MATERIAL_PRESETS, getMaterialsByCategory, findMaterialPreset } from '../../utils/materialPresets';
import { STAGE_LABELS } from '../../utils/constants';
import { DENSITY_UNITS, type DensityUnit, densityToInternal, densityFromInternal } from '../../utils/densityUnits';
import { exportComponentsToCSV, importComponentsFromCSV, downloadFile } from '../../utils/importExport';
import { resolveShadowComponents } from '../../utils/shadowModel';
import { getActiveCollab } from '../../ws/collabClient';
import { LINK_SYNC_FIELDS } from '../../stores/slices/componentSlice';

const INPUT_TYPE_LABELS: Record<ComponentInputType, string> = {
  fixed: '固定値', formula: '計算式', design_var: '設計変数', aggregate: '集計',
};
const INPUT_TYPE_BADGE: Record<ComponentInputType, string> = {
  fixed: '#6b7280', formula: '#0891b2', design_var: '#d97706', aggregate: '#059669',
};

/** プリセットカラーパレット（Bootstrap風） */
const TAG_PALETTE = [
  { label: 'ブルー',    value: '#0d6efd' },
  { label: 'グリーン',  value: '#198754' },
  { label: 'シアン',    value: '#0dcaf0' },
  { label: 'イエロー',  value: '#ffc107' },
  { label: 'レッド',    value: '#dc3545' },
  { label: 'グレー',    value: '#6c757d' },
  { label: 'ダーク',    value: '#212529' },
  { label: 'パープル',  value: '#6f42c1' },
  { label: 'オレンジ',  value: '#fd7e14' },
  { label: 'ピンク',    value: '#d63384' },
];

/** 旧 ComponentCategory → デフォルト色マップ（マイグレーション用） */
const LEGACY_CATEGORY_COLOR: Record<string, string> = {
  structure:  '#6c757d',
  propulsion: '#dc3545',
  avionics:   '#0d6efd',
  payload:    '#198754',
  power:      '#ffc107',
  thermal:    '#0dcaf0',
  other:      '#adb5bd',
};
/** 旧 ComponentCategory → 日本語名 */
const LEGACY_CATEGORY_NAME: Record<string, string> = {
  structure:  '構造系',
  propulsion: '推進系',
  avionics:   'アビオニクス',
  payload:    'ペイロード',
  power:      '電源系',
  thermal:    '熱制御系',
  other:      'その他',
};

const resolveAllocatedMass = (comp: MassComponent, computedMass: number | null): number | null => {
  if (comp.inputType === 'fixed') {
    const v = parseFloat(comp.valueOrFormula);
    if (!Number.isNaN(v)) return v;
  }
  if (computedMass != null) return computedMass;
  return comp.allocatedMass;
};

/**
 * 旧データの tags (ComponentCategory 文字列配列) を tagDefinitions から解決して
 * TagDefinition の id 配列に変換する。突合できない旧カテゴリ名は自動生成する。
 * 純粋関数として tagDefinitions を受け取り、新規生成が必要な定義を返す。
 */
function migrateTagIds(
  rawTags: string[],
  tagDefinitions: TagDefinition[],
): { ids: string[]; newDefs: TagDefinition[] } {
  const ids: string[] = [];
  const newDefs: TagDefinition[] = [];
  for (const raw of rawTags) {
    // すでに id として存在する場合
    const byId = tagDefinitions.find((d) => d.id === raw);
    if (byId) { ids.push(byId.id); continue; }
    // 旧カテゴリ名として name 突合
    const legacyName = LEGACY_CATEGORY_NAME[raw] ?? raw;
    const byName = tagDefinitions.find((d) => d.name === legacyName) ??
                   newDefs.find((d) => d.name === legacyName);
    if (byName) { ids.push(byName.id); continue; }
    // 新規生成
    const { v4: uuidv4gen } = { v4: () => crypto.randomUUID() };
    const newDef: TagDefinition = {
      id: uuidv4gen(),
      name: legacyName,
      color: LEGACY_CATEGORY_COLOR[raw] ?? '#6c757d',
    };
    newDefs.push(newDef);
    ids.push(newDef.id);
  }
  return { ids, newDefs };
}

/**
 * MassComponent の tags を tagDefinitions 上の有効な id 配列として解決する。
 * 旧データ（ComponentCategory 文字列）が混在している場合も対応。
 * 新規 tagDefinition の生成が必要な場合は onAddTagDefs コールバックを呼ぶ。
 */
function resolveTags(
  comp: MassComponent,
  tagDefinitions: TagDefinition[],
  onAddTagDefs?: (defs: TagDefinition[]) => void,
): string[] {
  // 旧 componentCategory フィールドのフォールバック
  const rawTags: string[] = comp.tags && comp.tags.length > 0
    ? comp.tags
    : (() => {
        const legacy = (comp as unknown as { componentCategory?: string }).componentCategory;
        return legacy ? [legacy] : ['structure'];
      })();

  // すべてのタグが既存 id として解決できるか確認
  const allKnownIds = rawTags.every((t) => tagDefinitions.some((d) => d.id === t));
  if (allKnownIds) return rawTags;

  // 旧カテゴリ名が含まれている → マイグレーション
  const { ids, newDefs } = migrateTagIds(rawTags, tagDefinitions);
  if (newDefs.length > 0 && onAddTagDefs) onAddTagDefs(newDefs);
  return ids;
}

type DataView = 'mass' | 'cginertia' | 'material' | 'mounting';

interface RowProps {
  comp: MassComponent;
  depth: number;
  isCollapsed: boolean;
  hasChildren: boolean;
  /** このコンポーネントが CAD セットアップにバインドされているか（mass セルロック判定） */
  isCadBound?: boolean;
  onToggle: () => void;
  onEdit: (field: keyof MassComponent, value: string) => void;
  onAddChild: () => void;
  onDelete: () => void;
  /** 行ドラッグ並び替え */
  onRowDragStart: () => void;
  onRowDragEnd: () => void;
  onRowDragOver: (e: React.DragEvent) => void;
  onRowDrop: (e: React.DragEvent) => void;
  isRowDragging: boolean;
  rowDropIndicator: 'before' | 'after' | null;
  dataView: DataView;
  /** この行に対する計算済み質量。なければ null (= 未計算 or 式未解決) */
  computedMass: number | null;
  /** この行に対する計算済み質量が「有効値として存在」するか (式エラー判定用) */
  computedMassExists: boolean;
  aggregatedActualMass?: number | null;
  childrenSumActualMass?: number | null;
  aggregatedCG?: CG3D | null;
  aggregatedInertia?: Inertia6 | null;
  aggregatedMount?: MountBounds | null;
  onUpdateData: (updates: Partial<MassComponent>) => void;
  onOpenFieldEntry: (field: string, fieldLabel: string, currentValue: string, step?: string, extraUpdate?: (val: string) => Record<string, unknown>) => void;
  onOpenCgInertiaEdit: () => void;
  onOpenMountEdit: () => void;
  onOpenMaterialEdit: () => void;
  onOpenInputValueEdit: () => void;
  onOpenFieldHistory: () => void;
  onNavigateInto?: () => void;
  tagDefinitions: TagDefinition[];
  onSaveTagDefs: (defs: TagDefinition[]) => void;
  onOpenTagMgr: () => void;
  onMove?: () => void;
  /** 履歴バッジに表示するグループ済み件数(子孫含む・モーダル表示と一致) */
  historyCount: number;
  /** リンクアイコン色（グループ識別用）。未設定時はアイコン非表示 */
  linkColor?: string;
  onOpenLinkPanel?: () => void;
}

/**
 * React.memo の比較器: function 型 props は全部「等価扱い」(親で再生成された無名関数でも
 * 振る舞いは同じと仮定)、他は Object.is で比較。
 * これで親の再 render で 行が一括再 render されるのを抑止する。
 * NOTE: ストアアクションそのものは安定参照だが、() => addChildComponent(comp) の様な
 *       per-row closure は毎回新しい関数になる。これらは「同じ comp に対する同じ動作」
 *       なので等価扱いして問題ない (parent state が変わって挙動が変わる場合は scalar prop
 *       経由で検知できる)。
 */
function rowPropsEqual(prev: RowProps, next: RowProps): boolean {
  const keys = Object.keys(next) as (keyof RowProps)[];
  for (const k of keys) {
    const a = prev[k];
    const b = next[k];
    if (typeof b === 'function' && typeof a === 'function') continue;
    if (!Object.is(a, b)) return false;
  }
  // prev に追加 key があった場合の安全策
  for (const k of Object.keys(prev) as (keyof RowProps)[]) {
    if (!(k in next)) return false;
  }
  return true;
}

const ComponentRowInner: React.FC<RowProps> = ({
  comp, depth, isCollapsed, hasChildren, isCadBound,
  onToggle, onEdit, onAddChild, onDelete,
  onRowDragStart, onRowDragEnd, onRowDragOver, onRowDrop, isRowDragging, rowDropIndicator,
  dataView, computedMass, computedMassExists, aggregatedActualMass, childrenSumActualMass, aggregatedCG, aggregatedInertia, aggregatedMount, onUpdateData, onOpenFieldEntry, onOpenCgInertiaEdit, onOpenMountEdit, onOpenMaterialEdit, onOpenInputValueEdit, onOpenFieldHistory,
  onNavigateInto, tagDefinitions, onSaveTagDefs, onOpenTagMgr, onMove,
  linkColor, onOpenLinkPanel, historyCount,
}) => {
  const [editField, setEditField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showTagEdit, setShowTagEdit] = useState(false);
  const [showNewTagForm, setShowNewTagForm] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_PALETTE[0].value);
  const [newTagCustomColor, setNewTagCustomColor] = useState('');

  // タグ編集ポップアップは Portal で document.body に逃がす:
  //  - 親 td が position:sticky で独自のスタッキングコンテキストを作り、
  //    後続行の sticky セル(同 z-index)に隠れる
  //  - .mm-table-wrap の overflow:auto に popup がクリップされる
  // どちらの問題も Portal + position:fixed + getBoundingClientRect の組合せで解消。
  const tagTdRef = useRef<HTMLTableCellElement>(null);
  const [tagPopupRect, setTagPopupRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (showTagEdit && tagTdRef.current) {
      setTagPopupRect(tagTdRef.current.getBoundingClientRect());
    } else {
      setTagPopupRect(null);
    }
  }, [showTagEdit]);
  // スクロール時(ページ・テーブル内部両方)はポップアップを閉じる(位置追従よりシンプル)
  useEffect(() => {
    if (!showTagEdit) return;
    const onScroll = () => setShowTagEdit(false);
    window.addEventListener('scroll', onScroll, true); // capture で子孫スクロールも捕捉
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [showTagEdit]);

  const startEdit = (field: string, current: string) => {
    setEditField(field);
    setEditValue(current);
  };

  const commitEdit = () => {
    if (editField) onEdit(editField as keyof MassComponent, editValue);
    setEditField(null);
  };

  // 旧 recordCell ヘルパは廃止(実質量は td 直書きで mm-clickable-cell パターンに統一)

  const inlineInput = (field: string, value: string, placeholder = '') => {
    if (editField === field) {
      return (
        <input
          className="form-control form-control-sm"
          style={{ minWidth: 80 }}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit();
            if (e.key === 'Escape') setEditField(null);
          }}
          autoFocus
        />
      );
    }
    return (
      <span
        className="editable-cell"
        onClick={() => startEdit(field, value)}
        title="クリックで編集"
      >
        {value || <span className="text-muted fst-italic">{placeholder}</span>}
      </span>
    );
  };

  return (
    <tr
      className={[
        depth === 0 ? 'fw-semibold' : '',
        isRowDragging ? 'mm-row-dragging' : '',
        rowDropIndicator === 'before' ? 'mm-row-drop-before' : '',
        rowDropIndicator === 'after' ? 'mm-row-drop-after' : '',
      ].filter(Boolean).join(' ')}
      onDragOver={onRowDragOver}
      onDrop={onRowDrop}
    >
      {/* Indent + name — ドラッグハンドルは行の最左に固定し、その右側に深さ分のガイド */}
      <td style={{ paddingLeft: '0.25rem' }}>
        <div className="d-flex align-items-center gap-1">
          {/* ドラッグハンドル(行の一番左、depth に依らない固定位置) */}
          <span
            className="mm-row-drag-handle"
            draggable
            onDragStart={onRowDragStart}
            onDragEnd={onRowDragEnd}
            title="ドラッグして並び順を変更"
          >
            <i className="bi bi-grip-vertical" style={{ fontSize: 12 }} />
          </span>
          {/* 親階層を示す縦線 + 最終段に "└─" マーク (深いツリーで親子関係を視覚化) */}
          {Array.from({ length: depth }).map((_, i) => (
            <span
              key={`indent-${i}`}
              className={`mm-indent-guide ${i === depth - 1 ? 'mm-indent-guide-last' : ''}`}
            />
          ))}
          {/* 子追加 + 親変更(行左端へ移設。アクション列から分離して行起点に近づける) */}
          <button
            className="btn btn-sm btn-outline-primary p-0"
            style={{ width: 20, height: 20, lineHeight: 1, fontSize: 12 }}
            onClick={onAddChild}
            title="子コンポーネント追加"
          >
            <i className="bi bi-plus" />
          </button>
          {onMove && (
            <button
              className="btn btn-sm btn-outline-secondary p-0"
              style={{ width: 20, height: 20, lineHeight: 1, fontSize: 11 }}
              onClick={onMove}
              title="親を変更（移動）"
            >
              <i className="bi bi-diagram-3" />
            </button>
          )}
          {hasChildren ? (
            <button
              className="btn btn-sm p-0 text-muted"
              style={{ width: 20, height: 20, lineHeight: 1 }}
              onClick={onToggle}
              title={isCollapsed ? '展開' : '折り畳み'}
            >
              <i className={`bi bi-chevron-${isCollapsed ? 'right' : 'down'}`} style={{ fontSize: 11 }} />
            </button>
          ) : (
            <span style={{ width: 20, display: 'inline-block' }} />
          )}
          <i className={`bi bi-${hasChildren ? 'diagram-2' : 'box'} me-1 text-muted`} style={{ fontSize: 11 }} />
          {inlineInput('paramName', comp.paramName, 'コンポーネント名')}
          {linkColor && (
            <span
              className="badge ms-1"
              style={{
                fontSize: '0.65rem',
                color: '#fff',
                // マスター = グループ色, クローン = 緑(視覚的に役割を即判別)
                background: comp.isLinkMaster ? linkColor : '#198754',
                padding: '2px 6px',
                fontWeight: 'normal',
                whiteSpace: 'nowrap',
              }}
              title={`リンク${comp.isLinkMaster ? 'マスター' : 'クローン'}`}
            >
              {comp.isLinkMaster ? 'マスター' : 'クローン'}
            </span>
          )}
          {hasChildren && onNavigateInto && (
            <button
              className="btn btn-sm p-0 text-muted ms-1"
              style={{ width: 18, height: 18, lineHeight: 1, fontSize: 10 }}
              onClick={onNavigateInto}
              title="フォルダを開く"
            >
              <i className="bi bi-box-arrow-in-right" />
            </button>
          )}
        </div>
      </td>

      {/* Stage. バッジに editable-cell(枠線ハイライト) + onClick で
        * 「バッジ自身が反応する」UX。 */}
      <td>
        {editField === 'stage' ? (
          <select
            className="form-select form-select-sm"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            autoFocus
          >
            {Object.entries(STAGE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        ) : (
          <span
            className="badge bg-light text-dark border editable-cell"
            onClick={() => startEdit('stage', comp.stage)}
            title="クリックで段を変更"
          >
            {STAGE_LABELS[comp.stage]}
          </span>
        )}
      </td>

      {/* Tags. click を td 全体に効かせ、内部 wrapper は inline-flex にして
        * td の vertical-align: middle で自動的に中央配置される構造に揃える
        * (段列の span 直置きと同じ視覚挙動)。 */}
      <td ref={tagTdRef}>
        {(() => {
          const currentIds = resolveTags(comp, tagDefinitions, (newDefs) => {
            onSaveTagDefs([...tagDefinitions, ...newDefs]);
          });
          return (
            <>
              <div
                /* inline-flex で td の vertical-align: middle に従う。
                 * editable-cell で枠線ハイライト + click でポップアップ。
                 * minWidth: 0 で editable-cell の 60px min-width を打ち消し、
                 * 枠線が中身(タグバッジ群)にぴったりフィットするように。 */
                className="d-inline-flex flex-wrap align-items-center gap-1 editable-cell"
                style={{ minWidth: 0 }}
                onClick={() => { setShowTagEdit((v) => !v); setShowNewTagForm(false); }}
                title="クリックでタグを編集"
              >
                {currentIds.length === 0 && (
                  <span className="text-muted fst-italic" style={{ fontSize: '0.75rem' }}>タグなし</span>
                )}
                {currentIds.map((id) => {
                  const def = tagDefinitions.find((d) => d.id === id);
                  if (!def) return null;
                  return (
                    <span
                      key={id}
                      className="badge"
                      style={{ fontSize: '0.72rem', background: def.color, color: '#fff' }}
                    >
                      {def.name}
                    </span>
                  );
                })}
              </div>
              {showTagEdit && tagPopupRect && createPortal(
                <div
                  className="card shadow"
                  style={{
                    // Portal で body に出すので fixed + 計測した td 左下に貼り付ける
                    position: 'fixed',
                    top: tagPopupRect.bottom,
                    left: tagPopupRect.left,
                    zIndex: 1050,
                    minWidth: 200, padding: '8px 10px', background: '#fff',
                    border: '1px solid #dee2e6', borderRadius: 8,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {tagDefinitions.length === 0 && !showNewTagForm && (
                    <div className="text-muted text-center" style={{ fontSize: '0.78rem', padding: '4px 0 6px' }}>
                      タグ未定義
                    </div>
                  )}
                  {tagDefinitions.map((def) => {
                    const checked = currentIds.includes(def.id);
                    return (
                      <div key={def.id} className="form-check mb-1 d-flex align-items-center gap-2" style={{ whiteSpace: 'nowrap' }}>
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id={`tag-${comp.id}-${def.id}`}
                          checked={checked}
                          onChange={() => {
                            const next = checked
                              ? currentIds.filter((t) => t !== def.id)
                              : [...currentIds, def.id];
                            onUpdateData({ tags: next });
                          }}
                        />
                        <span
                          className="badge"
                          style={{ fontSize: '0.72rem', background: def.color, color: '#fff', marginRight: 2 }}
                        >
                          {def.name}
                        </span>
                      </div>
                    );
                  })}
                  {showNewTagForm ? (
                    <div className="mt-2 pt-2 border-top">
                      <input
                        className="form-control form-control-sm mb-1"
                        placeholder="タグ名"
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        autoFocus
                      />
                      <div className="d-flex flex-wrap gap-1 mb-1">
                        {TAG_PALETTE.map((p) => (
                          <button
                            key={p.value}
                            title={p.label}
                            style={{
                              width: 20, height: 20, borderRadius: '50%', border: newTagColor === p.value ? '2px solid #000' : '2px solid transparent',
                              background: p.value, cursor: 'pointer', padding: 0,
                            }}
                            onClick={() => { setNewTagColor(p.value); setNewTagCustomColor(''); }}
                          />
                        ))}
                      </div>
                      <div className="d-flex align-items-center gap-1 mb-2">
                        <input
                          type="color"
                          className="form-control form-control-sm form-control-color"
                          style={{ width: 32, height: 24, padding: 1 }}
                          value={newTagCustomColor || newTagColor}
                          onChange={(e) => { setNewTagCustomColor(e.target.value); setNewTagColor(e.target.value); }}
                          title="カスタムカラー"
                        />
                        <span style={{ fontSize: '0.72rem', color: '#6c757d' }}>カスタム</span>
                      </div>
                      <div className="d-flex gap-1">
                        <button
                          className="btn btn-sm btn-primary flex-grow-1"
                          style={{ fontSize: '0.75rem' }}
                          disabled={!newTagName.trim()}
                          onClick={() => {
                            const def: TagDefinition = {
                              id: crypto.randomUUID(),
                              name: newTagName.trim(),
                              color: newTagColor,
                            };
                            const updatedDefs = [...tagDefinitions, def];
                            onSaveTagDefs(updatedDefs);
                            onUpdateData({ tags: [...currentIds, def.id] });
                            setNewTagName('');
                            setNewTagColor(TAG_PALETTE[0].value);
                            setNewTagCustomColor('');
                            setShowNewTagForm(false);
                          }}
                        >
                          追加
                        </button>
                        <button
                          className="btn btn-sm btn-outline-secondary"
                          style={{ fontSize: '0.75rem' }}
                          onClick={() => { setShowNewTagForm(false); setNewTagName(''); }}
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="btn btn-sm btn-outline-primary w-100 mt-2"
                      style={{ fontSize: '0.75rem' }}
                      onClick={() => setShowNewTagForm(true)}
                    >
                      <i className="bi bi-plus me-1" />新規タグ
                    </button>
                  )}
                  <button
                    className="btn btn-sm btn-outline-secondary w-100 mt-1"
                    style={{ fontSize: '0.75rem' }}
                    onClick={() => {
                      setShowTagEdit(false);
                      setShowNewTagForm(false);
                      onOpenTagMgr();
                    }}
                  >
                    <i className="bi bi-gear me-1" />タグを管理…
                  </button>
                  <button
                    className="btn btn-sm btn-outline-secondary w-100 mt-1"
                    style={{ fontSize: '0.75rem' }}
                    onClick={() => { setShowTagEdit(false); setShowNewTagForm(false); }}
                  >
                    閉じる
                  </button>
                </div>,
                document.body,
              )}
            </>
          );
        })()}
      </td>

      {/* Data columns */}
      {dataView === 'mass' && <>
        {/* Variable name(質量タブのみ表示) */}
        <td>
          {inlineInput('varName', comp.varName ?? '', '変数名')}
        </td>
        {/* 入力タイプ + 値/計算式 を 1セル に統合(1セットで更新する1つの論理単位)。
           * クローン編集の制御は linkColor で判定(孤立クローンは編集可)。 */}
        {(() => {
          const isReadOnly = !!(linkColor && !comp.isLinkMaster);
          const valueDisplay = comp.inputType === 'aggregate'
            ? <span className="text-muted fst-italic" style={{ fontSize: '0.78rem' }}>—</span>
            : comp.valueOrFormula
              ? <span className="font-monospace text-truncate" style={{ fontSize: '0.82rem', color: '#374151', maxWidth: 180 }}>{comp.valueOrFormula}</span>
              : <span className="text-muted fst-italic" style={{ fontSize: '0.78rem' }}>{comp.inputType === 'formula' ? '計算式未入力' : '値未入力'}</span>;
          const fullValue = comp.inputType === 'aggregate'
            ? '集計'
            : (comp.valueOrFormula || (comp.inputType === 'formula' ? '計算式未入力' : '値未入力'));
          // 旧「配分質量 (kg)」列の計算結果を同セル下段に統合表示
          const alloc = resolveAllocatedMass(comp, computedMass);
          const formulaUnresolved = comp.inputType === 'formula' && !computedMassExists;
          return (
            <td>
              <div className="d-flex flex-column gap-1">
                {/* 上段: 入力(badge + 値) — クリックで一括編集 */}
                <span
                  className={isReadOnly ? "d-inline-flex align-items-center gap-2" : "d-inline-flex align-items-center gap-2 editable-cell"}
                  title={isReadOnly
                    ? `リンククローン — マスター部品で編集（値: ${fullValue}）`
                    : `クリックで入力タイプ・値を変更（現在: ${INPUT_TYPE_LABELS[comp.inputType]} / ${fullValue}）`}
                  onClick={isReadOnly ? undefined : onOpenInputValueEdit}
                >
                  <span
                    className="badge border"
                    style={{
                      fontSize: '0.7rem',
                      color: INPUT_TYPE_BADGE[comp.inputType],
                      background: '#fff',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {INPUT_TYPE_LABELS[comp.inputType]}
                  </span>
                  {valueDisplay}
                </span>
                {/* 下段: 計算結果(配分質量) — 左寄せの = 付き表示。読み取り専用 */}
                <div
                  className="d-flex align-items-center justify-content-start gap-1 font-monospace"
                  style={{ fontSize: '0.78rem', color: '#6b7280' }}
                >
                  {formulaUnresolved && (
                    <i
                      className="bi bi-exclamation-triangle-fill text-warning"
                      style={{ fontSize: '0.72rem' }}
                      title="計算式を解決できません。変数名や式の内容を確認してください。"
                    />
                  )}
                  {alloc != null
                    ? <span><span className="text-muted me-1">=</span>{alloc.toFixed(2)} kg</span>
                    : <span className="text-muted">— kg</span>}
                </div>
              </div>
            </td>
          );
        })()}
        {/* 旧「配分質量 (kg)」列はシステム配分値セル下段に統合済 */}
        {(() => {
          // 親: 明示的な actualMassMode 優先、未設定時は actualMass=null で aggregate と暗黙判定
          // 葉: 常に固定値モード
          const ownVal = comp.actualMass;
          const childSum = hasChildren ? (childrenSumActualMass ?? null) : null;
          const effectiveActualMassMode: 'aggregate' | 'fixed' = hasChildren
            ? (comp.actualMassMode ?? (ownVal == null ? 'aggregate' : 'fixed'))
            : 'fixed';
          const isAggregateMode = effectiveActualMassMode === 'aggregate';
          // 集計モードでは ownVal を無視して childSum を採用 (cgInertiaMode と同じ方針)
          const effective = isAggregateMode ? childSum : ownVal;
          const displayValue = effective != null ? effective.toFixed(2) : null;
          const currentValue = ownVal != null ? String(ownVal) : '';
          const cellReadOnly = !!isCadBound;
          // クローン(非マスター)は読み取り専用
          const isCloneReadOnly = !!(linkColor && !comp.isLinkMaster);
          const handleClick = (cellReadOnly || isCloneReadOnly)
            ? undefined
            : () => onOpenFieldEntry('actualMass', '実質量', currentValue, '0.001');
          // badge ラベルと色
          const badgeLabel = isAggregateMode ? '集計' : '固定値';
          const badgeColor = isAggregateMode ? '#059669' : '#6b7280';
          // tooltip
          const tooltipParts: string[] = [];
          if (cellReadOnly) {
            tooltipParts.push('CADバインド中のため編集不可。値を変更するには、CAD取込モーダルで該当バインドを外してください。');
          } else if (isCloneReadOnly) {
            tooltipParts.push('リンククローン — マスター部品で編集');
          } else {
            tooltipParts.push(`クリックで実質量を記録（現在: ${displayValue ?? '—'} kg）`);
            if (hasChildren && !isAggregateMode && childSum != null) {
              tooltipParts.push(`子合計: ${childSum.toFixed(2)} kg`);
            }
          }
          return (
            <td>
              {/* バッジ左固定 / 値右寄せ で badge 位置が縦に揃う配置。
                * d-flex + justify-content-between でセル幅いっぱいに展開。 */}
              <div
                className={(cellReadOnly || isCloneReadOnly) ? "d-flex justify-content-between align-items-center gap-2" : "d-flex justify-content-between align-items-center gap-2 editable-cell"}
                title={tooltipParts.join('\n')}
                onClick={handleClick}
              >
                <span
                  className="badge border"
                  style={{
                    fontSize: '0.7rem',
                    color: badgeColor,
                    background: '#fff',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {badgeLabel}
                </span>
                <span className="d-inline-flex align-items-center gap-1">
                  <span className="font-monospace" style={{ fontSize: '0.82rem', color: '#374151' }}>
                    {displayValue ?? '—'}
                  </span>
                  {cellReadOnly && (
                    <span className="text-muted" style={{ lineHeight: 1, fontSize: 11 }}>
                      <i className="bi bi-lock-fill" />
                    </span>
                  )}
                </span>
              </div>
              {isCadBound && (
                <div
                  className="d-flex justify-content-end align-items-center gap-1 mt-1"
                  style={{ fontSize: 9, lineHeight: 1.2 }}
                >
                  <span
                    title={`CADバインド中（値はCAD取込で更新されます）\nソース: ${comp.cadSoftware ?? '—'}\nリビジョン: ${comp.cadRevision ?? '—'}\n最終取込: ${comp.cadLastImported ? new Date(comp.cadLastImported).toLocaleString('ja-JP') : '—'}`}
                    style={{ color: '#15803d' }}
                  >
                    <i className="bi bi-file-earmark-code-fill" style={{ fontSize: 10 }} />
                    <span style={{ marginLeft: 2 }}>{comp.cadRevision ?? 'CAD'}</span>
                  </span>
                </div>
              )}
            </td>
          );
        })()}
        <td className="text-end font-monospace" style={{ fontSize: '0.82rem' }}>
          {(() => {
            const alloc = resolveAllocatedMass(comp, computedMass);
            const actual = hasChildren ? aggregatedActualMass : comp.actualMass;
            if (alloc == null || actual == null) return <span className="text-muted">—</span>;
            const d = alloc - actual;
            return (
              <span style={{ color: d < 0 ? '#dc2626' : d > 0 ? '#16a34a' : '#6b7280' }}>
                {d > 0 ? '+' : ''}{d.toFixed(2)}
              </span>
            );
          })()}
        </td>
      </>}
      {dataView === 'cginertia' && <>
        {(() => {
          // 集計/手動 を明示モードで判定（既存データは未設定なので、hasChildren で自動推定）
          const effectiveMode: 'aggregate' | 'manual' = hasChildren
            ? (comp.cgInertiaMode ?? 'aggregate')
            : 'manual';
          const isAggregate = effectiveMode === 'aggregate';
          const cgDisplay = isAggregate
            ? aggregatedCG
            : { x: comp.cgX ?? null, y: comp.cgY ?? null, z: comp.cgZ ?? null };
          const inertiaDisplay = isAggregate
            ? aggregatedInertia
            : { ixx: comp.ixx ?? null, iyy: comp.iyy ?? null, izz: comp.izz ?? null,
                ixy: comp.ixy ?? null, ixz: comp.ixz ?? null, iyz: comp.iyz ?? null };

          // 集計モード時は座標系を強制的に "全機" として扱う (子要素の値を全機座標系で
          // 合成するため、局所座標系という概念が成立しない)
          const isGlobal = isAggregate ? true : comp.cgReference === 'global';
          const originX = comp.localOriginX ?? comp.mountPosX ?? null;
          const originY = comp.localOriginY ?? comp.mountPosY ?? null;
          const originZ = comp.localOriginZ ?? comp.mountPosZ ?? null;

          const isCloneReadOnly = !!(linkColor && !comp.isLinkMaster);
          // モーダルはモード問わずクリックで開く(集計モードでもラジオ切替/閲覧のため)。
          // 表上のグレーアウトはしない (モーダル内でのみ disabled で表現)。
          // 集計値は = を前置して「計算結果である」ことを示す (配分質量と同じ規約)。
          const numCell = (val: number | null, decimals = 3) => {
            const formatted = val != null ? val.toFixed(decimals) : '—';
            const inner = (
              <span className="font-monospace" style={{ fontSize: '0.82rem', color: '#374151' }}>
                {isAggregate && val != null && <span className="text-muted me-1">=</span>}
                {formatted}
              </span>
            );
            if (isCloneReadOnly) return inner;
            return (
              <span className="editable-cell mm-group-cginertia" onClick={onOpenCgInertiaEdit} title={isAggregate ? 'クリックで重心・慣性テンソル編集モーダル(集計/入力切替)' : 'クリックで重心・慣性テンソルを編集'}>
                {inner}
              </span>
            );
          };

          return (
            <>
              {/* 座標系 — クローン時は読み取り、それ以外はクリックで一括編集。
                * editable-cell の min-width:60px が badge を不必要に広げるので minWidth:0 で content fit */}
              <td>
                {isCloneReadOnly ? (
                  <span className={`badge border ${isGlobal ? 'text-bg-primary' : 'bg-light text-dark'}`}
                    style={{ fontSize: '0.72rem', minWidth: 0 }}>
                    {isGlobal ? '全機' : '局所'}
                  </span>
                ) : (
                  <span
                    className={`badge border editable-cell mm-group-cginertia ${isGlobal ? 'text-bg-primary' : 'bg-light text-dark'}`}
                    style={{ fontSize: '0.72rem', minWidth: 0 }}
                    onClick={onOpenCgInertiaEdit}
                    title="クリックで重心・慣性テンソルを編集"
                  >
                    {isGlobal ? '全機' : '局所'}
                  </span>
                )}
              </td>
              {/* 状態 — 静的バッジ(切り替えは編集モーダル内のラジオで行う)。leaf は無関係なので — */}
              <td>
                {hasChildren ? (
                  isAggregate ? (
                    <span className="badge bg-secondary-subtle text-secondary border" style={{ fontSize: '0.65rem', whiteSpace: 'nowrap' }}>集計</span>
                  ) : (
                    <span className="badge text-bg-primary" style={{ fontSize: '0.65rem', whiteSpace: 'nowrap' }}>入力</span>
                  )
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
              {/* 原点 X/Y/Z (読み取り専用) */}
              <td className="text-end">
                {(isGlobal || isAggregate)
                  ? <span className="text-muted font-monospace" style={{ fontSize: '0.82rem' }}>—</span>
                  : numCell(originX)}
              </td>
              <td className="text-end">
                {(isGlobal || isAggregate)
                  ? <span className="text-muted font-monospace" style={{ fontSize: '0.82rem' }}>—</span>
                  : numCell(originY)}
              </td>
              <td className="text-end">
                {(isGlobal || isAggregate)
                  ? <span className="text-muted font-monospace" style={{ fontSize: '0.82rem' }}>—</span>
                  : numCell(originZ)}
              </td>
              {/* CG X/Y/Z */}
              <td className="text-end">{numCell(cgDisplay?.x ?? null)}</td>
              <td className="text-end">{numCell(cgDisplay?.y ?? null)}</td>
              <td className="text-end">{numCell(cgDisplay?.z ?? null)}</td>
              {/* 慣性テンソル */}
              <td className="text-end">{numCell(inertiaDisplay?.ixx ?? null, 4)}</td>
              <td className="text-end">{numCell(inertiaDisplay?.iyy ?? null, 4)}</td>
              <td className="text-end">{numCell(inertiaDisplay?.izz ?? null, 4)}</td>
              <td className="text-end">{numCell(inertiaDisplay?.ixy ?? null, 4)}</td>
              <td className="text-end">{numCell(inertiaDisplay?.ixz ?? null, 4)}</td>
              <td className="text-end">{numCell(inertiaDisplay?.iyz ?? null, 4)}</td>
            </>
          );
        })()}
      </>}
      {dataView === 'material' && (() => {
        const isCloneReadOnly = !!(linkColor && !comp.isLinkMaster);
        const wrap = (display: React.ReactNode) => {
          if (isCloneReadOnly) return display;
          return (
            <span className="editable-cell mm-group-material" onClick={onOpenMaterialEdit} title="クリックで材質情報を編集">
              {display}
            </span>
          );
        };
        const unit: DensityUnit = comp.materialDensityUnit ?? 'kg/m³';
        const densityVal = comp.materialDensity != null ? densityFromInternal(comp.materialDensity, unit) : null;
        const densityStr = densityVal != null ? `${densityVal.toLocaleString()} ${unit}` : null;
        return (
          <>
            <td>
              {wrap(comp.materialName
                ? <span className="font-monospace" style={{ fontSize: '0.82rem', color: '#374151' }}>{comp.materialName}</span>
                : <span className="text-muted">—</span>)}
            </td>
            <td>
              {wrap(densityStr
                ? <span className="font-monospace" style={{ fontSize: '0.82rem', color: '#374151' }}>{densityStr}</span>
                : <span className="text-muted">—</span>)}
            </td>
          </>
        );
      })()}
      {dataView === 'mounting' && (() => {
        const isCloneReadOnly = !!(linkColor && !comp.isLinkMaster);
        const wrap = (raw: number | null | undefined) => {
          const display = raw != null ? raw.toFixed(3) : '—';
          if (isCloneReadOnly) return <span className="font-monospace" style={{ fontSize: '0.82rem' }}>{display}</span>;
          return (
            <span
              className="font-monospace editable-cell mm-group-mounting"
              style={{ fontSize: '0.82rem' }}
              onClick={onOpenMountEdit}
              title="クリックで搭載位置を編集"
            >{display}</span>
          );
        };
        // 親(集計)と葉で値ソースだけ変える(編集はどちらも同一モーダル)。
        const src = hasChildren
          ? {
              posX: aggregatedMount?.posX ?? null, endX: aggregatedMount?.endX ?? null,
              posY: aggregatedMount?.posY ?? null, endY: aggregatedMount?.endY ?? null,
              posZ: aggregatedMount?.posZ ?? null, endZ: aggregatedMount?.endZ ?? null,
            }
          : {
              posX: comp.mountPosX, endX: comp.mountEndX,
              posY: comp.mountPosY, endY: comp.mountEndY,
              posZ: comp.mountPosZ, endZ: comp.mountEndZ,
            };
        const tdCls = hasChildren ? 'text-end text-secondary' : 'text-end';
        const cells: (number | null | undefined)[] = [src.posX, src.endX, src.posY, src.endY, src.posZ, src.endZ];
        return cells.map((v, i) => (
          <td key={i} className={tdCls}>{wrap(v)}</td>
        ));
      })()}

      {/* Actions */}
      <td className="col-actions">
        <div className="d-flex gap-1">
          {/* 「編集」ボタンはセル(グループ)クリックで開けるため削除済 */}
          <button
            className="btn btn-sm btn-outline-secondary p-1"
            onClick={onOpenFieldHistory}
            title="変更履歴を表示"
            style={{ position: 'relative' }}
          >
            <i className="bi bi-clock-history" style={{ fontSize: 11 }} />
            {historyCount > 0 && (
              <span
                className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-primary"
                style={{ fontSize: 8, padding: '2px 4px', lineHeight: 1 }}
              >
                {historyCount}
              </span>
            )}
          </button>
          {/* 子追加・親変更は行左端へ移設済(コンポーネント名の起点に近い方が直感的) */}
          {/* 上へ/下へボタンは行左端のドラッグハンドルに置換(順序 swap だけだと
              同 order 重複時に効かないバグがあったため、ドラッグ→0..n 再正規化に統一) */}
          {onOpenLinkPanel && (
            <button
              className="btn btn-sm btn-outline-secondary p-1"
              style={{ fontSize: 11, color: linkColor ?? undefined }}
              onClick={onOpenLinkPanel}
              title="リンク管理"
            >
              <i className="bi bi-link-45deg" />
            </button>
          )}
          <button className="btn btn-sm btn-outline-danger" onClick={onDelete} title="削除">
            <i className="bi bi-trash" />
          </button>
        </div>
      </td>
    </tr>
  );
};
const ComponentRow = React.memo(ComponentRowInner, rowPropsEqual);


export const MassModel: React.FC = () => {
  const { massCaseId } = useAppStore();
  const cases = useMassCaseStore((s) => s.cases);
  const allComponents = useMassCaseStore((s) => s.components);
  const allParameters = useMassCaseStore((s) => s.parameters);
  const getComponentsForCase = useMassCaseStore((s) => s.getComponentsForCase);
  const addComponent = useMassCaseStore((s) => s.addComponent);
  const updateComponent = useMassCaseStore((s) => s.updateComponent);
  const deleteComponent = useMassCaseStore((s) => s.deleteComponent);
  const updateCase = useMassCaseStore((s) => s.updateCase);
  const addActualMassEntry = useMassCaseStore((s) => s.addActualMassEntry);
  const addFieldEntry = useMassCaseStore((s) => s.addFieldEntry);
  const addFieldEntries = useMassCaseStore((s) => s.addFieldEntries);
  const addChangeRecord = useMassCaseStore((s) => s.addChangeRecord);
  const confirmFieldEntry = useMassCaseStore((s) => s.confirmFieldEntry);
  const confirmActualMassEntry = useMassCaseStore((s) => s.confirmActualMassEntry);

  // クロスリファレンス
  const geometries = useRocketShapeStore((s) => s.geometries);
  const allStages = usePropulsionStore((s) => s.stages);

  const getParametersForCase = useMassCaseStore((s) => s.getParametersForCase);

  const flags = useFlags();
  const sizingEnabled = flags.sizing as boolean;

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // 複数フォルダを並行で開くためのタブ管理。tabs[0] は常に "Root"。
  // 「扉アイコン (navigate-into)」 で 新規タブを追加し、ヘッダのタブストリップで切替/閉じる
  interface FolderTab { folderId: string | null; label: string }
  const [tabs, setTabs] = useState<FolderTab[]>([{ folderId: null, label: 'Root' }]);
  const [activeTabIdx, setActiveTabIdx] = useState(0);
  const currentFolderId = tabs[activeTabIdx]?.folderId ?? null;
  /** 現在のタブのフォルダ位置を変更する (breadcrumb / scope picker からの呼び出し用) */
  const setCurrentFolderId = (id: string | null, label?: string) => {
    setTabs((prev) => prev.map((t, i) => i === activeTabIdx
      ? { folderId: id, label: id ? (label ?? t.label) : 'Root' }
      : t));
  };
  /** 新規タブを開いて切替 (フォルダ内に飛び込むときに使う) */
  const openInNewTab = (id: string | null, label: string) => {
    // 既に同じ folderId のタブがあれば、新規追加せず切替
    const existing = tabs.findIndex((t) => t.folderId === id);
    if (existing >= 0) { setActiveTabIdx(existing); return; }
    setTabs((prev) => [...prev, { folderId: id, label }]);
    setActiveTabIdx(tabs.length);
  };
  /** タブを閉じる (Root タブは閉じない、最後の 1 つも閉じない) */
  const closeTab = (idx: number) => {
    if (idx === 0) return;
    setTabs((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next.length > 0 ? next : prev;
    });
    setActiveTabIdx((cur) => {
      if (cur === idx) return Math.max(0, idx - 1);
      if (cur > idx) return cur - 1;
      return cur;
    });
  };
  const [scopePickerOpen, setScopePickerOpen] = useState(false);
  const [scopePickerQuery, setScopePickerQuery] = useState('');
  const scopePickerRef = useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!scopePickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (scopePickerRef.current && !scopePickerRef.current.contains(e.target as Node)) setScopePickerOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [scopePickerOpen]);
  const [viewMode, setViewMode] = useState<'flat' | 'map'>('flat');
  // コンポーネント名列の幅 (px) — ユーザードラッグ可変、localStorage 永続化。
  // 深いツリーで名前が見切れる問題への対策 (CADやPLMでも一般的な列幅可変パターン)
  const COL1_MIN = 240; const COL1_MAX = 1200;
  const [col1Width, setCol1Width] = useState<number>(() => {
    try {
      const v = parseInt(localStorage.getItem('rocketdb.massModel.col1Width') ?? '', 10);
      if (!isNaN(v) && v >= COL1_MIN && v <= COL1_MAX) return v;
    } catch { /* noop */ }
    return 360;
  });
  useEffect(() => {
    try { localStorage.setItem('rocketdb.massModel.col1Width', String(col1Width)); } catch { /* noop */ }
  }, [col1Width]);
  // ドラッグ進行中フラグ (ハンドルの強調用)
  const [col1Dragging, setCol1Dragging] = useState(false);
  const col1DragRef = useRef<{ startX: number; startW: number } | null>(null);
  const onCol1ResizerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    col1DragRef.current = { startX: e.clientX, startW: col1Width };
    setCol1Dragging(true);
    const onMove = (ev: MouseEvent) => {
      if (!col1DragRef.current) return;
      const dx = ev.clientX - col1DragRef.current.startX;
      const w = Math.min(COL1_MAX, Math.max(COL1_MIN, col1DragRef.current.startW + dx));
      setCol1Width(w);
    };
    const onUp = () => {
      col1DragRef.current = null;
      setCol1Dragging(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };
  // 起動時に AnalysisConditionView 等から sessionStorage 経由で初期タブが指定されていれば採用
  const [dataView, setDataView] = useState<DataView>(() => {
    try {
      const v = sessionStorage.getItem('rocketdb.massModel.initialTab');
      if (v) {
        sessionStorage.removeItem('rocketdb.massModel.initialTab');
        if (v === 'mass' || v === 'cginertia' || v === 'material' || v === 'mounting') return v as DataView;
      }
    } catch { /* SSR/プライベートモード等は無視 */ }
    return 'mass';
  });
  // Undo/Redo スタック数 (UI 表示・disabled 判定用)
  const undoCount = useMassCaseStore((s) => s.undoStack.length);
  const redoCount = useMassCaseStore((s) => s.redoStack.length);
  // ⌘Z / ⌘⇧Z (Mac) / Ctrl+Z / Ctrl+Shift+Z (Win/Linux) のグローバルキーバインド。
  // input/textarea/contentEditable フォーカス中は OS/ブラウザ既定の undo に委ねる。
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key !== 'z' && e.key !== 'Z') return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
      }
      e.preventDefault();
      if (e.shiftKey) useMassCaseStore.getState().redo();
      else useMassCaseStore.getState().undo();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  // case 切替時に Undo 履歴をクリア (他 case の操作を巻き戻さないため)
  useEffect(() => {
    useMassCaseStore.getState().clearUndoHistory();
  }, [massCaseId]);
  // case を開いたら全ノードを折り畳んだ状態で始める effect は components 定義後に置く (下方)
  const lastInitCaseRef = useRef<string | null>(null);
  const [mapSubMode, setMapSubMode] = useState<'overview' | 'detail'>('overview');
  const [showCadImportModal, setShowCadImportModal] = useState(false);
  // 統合フィールド記録モーダル
  type FieldEntryState = {
    comp: MassComponent;
    field: string;
    fieldLabel: string;
    currentValue: string;
    step: string;
    extraUpdate?: (val: string) => Record<string, unknown>;
    densityUnit?: DensityUnit; // field === 'materialDensity' の場合に使用
    /** actualMass フィールド専用: 親コンポーネントでの集計/固定値モード */
    hasChildren?: boolean;
  };
  const [fieldEntryState, setFieldEntryState] = useState<FieldEntryState | null>(null);
  const [fieldEntryForm, setFieldEntryForm] = useState({ value: '', changedBy: '', evidence: '' });
  /** actualMass モーダル内での集計/固定値切替 */
  const [actualMassMode, setActualMassMode] = useState<'fixed' | 'aggregate'>('fixed');
  const [fieldEntryMaterialCat, setFieldEntryMaterialCat] = useState('');
  const [fieldEntryDensityUnit, setFieldEntryDensityUnit] = useState<DensityUnit>('kg/m³');
  // 重心・慣性テンソル一括編集モーダル
  type CgInertiaEditState = { comp: MassComponent };
  type CgInertiaForm = {
    /** 集計(子から自動算出) or 入力(手入力) — モーダル内で切り替え */
    mode: 'aggregate' | 'manual';
    cgReference: 'local' | 'global';
    localOriginX: string; localOriginY: string; localOriginZ: string;
    cgX: string; cgY: string; cgZ: string;
    ixx: string; iyy: string; izz: string;
    ixy: string; ixz: string; iyz: string;
    changedBy: string; evidence: string;
  };
  const [cgInertiaEditState, setCgInertiaEditState] = useState<CgInertiaEditState | null>(null);
  const [cgInertiaForm, setCgInertiaForm] = useState<CgInertiaForm>({
    mode: 'manual',
    cgReference: 'local',
    localOriginX: '', localOriginY: '', localOriginZ: '',
    cgX: '', cgY: '', cgZ: '',
    ixx: '', iyy: '', izz: '',
    ixy: '', ixz: '', iyz: '',
    changedBy: '', evidence: '',
  });
  // 入力タイプ + 値/計算式 統合モーダル
  const [inputValueTarget, setInputValueTarget] = useState<MassComponent | null>(null);
  const [inputValueForm, setInputValueForm] = useState({
    inputType: 'fixed' as ComponentInputType,
    valueOrFormula: '',
    changedBy: '',
    evidence: '',
  });
  const formulaInputRef = useRef<HTMLInputElement>(null);
  const insertAtFormulaCursor = (text: string) => {
    const el = formulaInputRef.current;
    if (!el) {
      setInputValueForm((p) => ({ ...p, valueOrFormula: p.valueOrFormula + text }));
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + text + el.value.slice(end);
    setInputValueForm((p) => ({ ...p, valueOrFormula: next }));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    });
  };
  const MATH_FUNCTIONS_LIST = ['log()', 'log10()', 'sqrt()', 'abs()', 'exp()', 'sin()', 'cos()', 'tan()', 'ceil()', 'floor()', 'round()', 'max()', 'min()', 'pi'];
  // CG セット編集モーダル
  const [cgEditTarget, setCgEditTarget] = useState<MassComponent | null>(null);
  const [cgEditForm, setCgEditForm] = useState({ cgReference: 'local' as 'local' | 'global', cgX: '', cgY: '', cgZ: '', changedBy: '', evidence: '' });
  // 慣性テンソル セット編集モーダル
  const [inertiaEditTarget, setInertiaEditTarget] = useState<MassComponent | null>(null);
  const [inertiaEditForm, setInertiaEditForm] = useState({ ixx: '', iyy: '', izz: '', ixy: '', ixz: '', iyz: '', changedBy: '', evidence: '' });
  // 搭載位置 セット編集モーダル
  const [mountEditTarget, setMountEditTarget] = useState<MassComponent | null>(null);
  const [mountEditForm, setMountEditForm] = useState({ mountPosX: '', mountEndX: '', mountPosY: '', mountEndY: '', mountPosZ: '', mountEndZ: '', changedBy: '', evidence: '' });
  // 材質 一括編集モーダル
  type MaterialEditForm = {
    materialName: string;
    materialDensityValue: string;
    materialDensityUnit: DensityUnit;
    materialYoungModulus: string;
    materialNote: string;
    changedBy: string;
    evidence: string;
  };
  const [materialEditTarget, setMaterialEditTarget] = useState<MassComponent | null>(null);
  const [materialEditForm, setMaterialEditForm] = useState<MaterialEditForm>({
    materialName: '', materialDensityValue: '', materialDensityUnit: 'kg/m³',
    materialYoungModulus: '', materialNote: '', changedBy: '', evidence: '',
  });
  const [materialEditPresetCat, setMaterialEditPresetCat] = useState('');
  // 統合履歴モーダル
  const [historyTarget, setHistoryTarget] = useState<MassComponent | null>(null);
  // 親変更（移動）モーダル
  const [moveTarget, setMoveTarget] = useState<MassComponent | null>(null);
  const [moveSearchQuery, setMoveSearchQuery] = useState('');
  // リンク管理パネル
  const [linkPanelTarget, setLinkPanelTarget] = useState<MassComponent | null>(null);
  // 「既存部品をリンク」セレクタ用 state
  const [linkExistingPickerOpen, setLinkExistingPickerOpen] = useState(false);
  const [linkExistingQuery, setLinkExistingQuery] = useState('');

  // データ変更モーダルからのドキュメント添付（CG/慣性/搭載/フィールド共通）
  const emptyAttachDocForm: Omit<DocumentRef, 'id' | 'addedAt' | 'updatedAt'> = {
    docNumber: '', title: '', revision: '', docType: 'drawing', url: '', note: '', addedBy: '', updatedBy: '',
  };
  const [attachDoc, setAttachDoc] = useState<{ enabled: boolean; form: typeof emptyAttachDocForm }>({
    enabled: false, form: emptyAttachDocForm,
  });
  const resetAttachDoc = () => setAttachDoc({ enabled: false, form: emptyAttachDocForm });
  const normalizeDocUrl = (raw: string): string => {
    const u = raw.trim();
    if (!u) return '';
    return /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`;
  };
  const isValidDocUrl = (raw: string): boolean => {
    const u = normalizeDocUrl(raw);
    if (!u) return false;
    try {
      const parsed = new URL(u);
      return /^https?:$/.test(parsed.protocol) && !!parsed.hostname && parsed.hostname.includes('.');
    } catch {
      return false;
    }
  };
  // 添付ドキュメントのバリデーション。問題があれば文字列メッセージ、無ければ null。
  const validateAttachDoc = (): string | null => {
    if (!attachDoc.enabled) return null;
    const f = attachDoc.form;
    const hasContent = f.docNumber.trim() || f.title.trim() || f.url.trim() || f.note.trim();
    if (!hasContent) return null;
    if (!f.url.trim()) return 'ドキュメントURLを入力してください';
    if (!isValidDocUrl(f.url)) return '有効なURLを入力してください（例: https://example.com/...）';
    return null;
  };
  const commitAttachedDoc = (compId: string, fallbackAddedBy: string): string | undefined => {
    if (!attachDoc.enabled) return undefined;
    const f = attachDoc.form;
    const hasContent = f.docNumber.trim() || f.title.trim() || f.url.trim() || f.note.trim();
    if (!hasContent) return undefined;
    const target = components.find((c) => c.id === compId);
    const existing = target?.documents ?? [];
    const newDoc: DocumentRef = {
      id: uuidv4(),
      addedAt: new Date().toISOString(),
      docNumber: f.docNumber.trim(),
      title: f.title.trim(),
      revision: f.revision.trim(),
      docType: f.docType,
      url: normalizeDocUrl(f.url),
      note: f.note.trim(),
      addedBy: (f.addedBy.trim() || fallbackAddedBy.trim()),
      updatedBy: '',
    };
    updateComponent(compId, { documents: [...existing, newDoc] });
    return newDoc.id;
  };
  const ATTACH_DOC_TYPE_LABELS: Record<DocumentType, string> = {
    drawing: '図面', spec: '仕様書', report: 'レポート', other: 'その他',
  };
  const ATTACH_DOC_TYPE_META: Record<DocumentType, { numberLabel: string; numberPlaceholder: string; titlePlaceholder: string; urlPlaceholder: string }> = {
    drawing: { numberLabel: '図番',      numberPlaceholder: '例: STR-001',       titlePlaceholder: '例: 第1段タンク組立図',        urlPlaceholder: '例: https://pdm.example.com/docs/STR-001' },
    spec:    { numberLabel: '仕様書番号', numberPlaceholder: '例: SPEC-2026-01', titlePlaceholder: '例: 推進系インターフェース仕様書', urlPlaceholder: '例: https://pdm.example.com/specs/SPEC-2026-01' },
    report:  { numberLabel: 'レポート番号', numberPlaceholder: '例: TR-2026-003', titlePlaceholder: '例: 振動試験結果レポート',     urlPlaceholder: '例: https://pdm.example.com/reports/TR-2026-003' },
    other:   { numberLabel: '文書番号',   numberPlaceholder: '例: DOC-001',       titlePlaceholder: '例: 関連メモ',                  urlPlaceholder: '例: https://...' },
  };
  const renderAttachDocSection = () => {
    const f = attachDoc.form;
    const setF = (patch: Partial<typeof f>) => setAttachDoc((p) => ({ ...p, form: { ...p.form, ...patch } }));
    const meta = ATTACH_DOC_TYPE_META[f.docType];
    return (
      <div className="mt-2 pt-2 border-top">
        <div className="form-check mb-2">
          <input
            type="checkbox"
            className="form-check-input"
            id="attachDocCheckbox"
            checked={attachDoc.enabled}
            onChange={(e) => setAttachDoc((p) => ({ ...p, enabled: e.target.checked }))}
          />
          <label className="form-check-label fw-medium" htmlFor="attachDocCheckbox" style={{ fontSize: '0.85rem' }}>
            <i className="bi bi-paperclip me-1 text-primary" />ドキュメントを添付
          </label>
        </div>
        {attachDoc.enabled && (
          <div className="ps-1" style={{ fontSize: '0.82rem' }}>
            <div className="mb-2">
              <label className="form-label mb-1">種別</label>
              <select className="form-select form-select-sm" value={f.docType}
                onChange={(e) => setF({ docType: e.target.value as DocumentType })}>
                {(Object.keys(ATTACH_DOC_TYPE_LABELS) as DocumentType[]).map((t) => (
                  <option key={t} value={t}>{ATTACH_DOC_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div className="row g-2 mb-2">
              <div className="col-7">
                <label className="form-label mb-1">{meta.numberLabel}</label>
                <input className="form-control form-control-sm font-monospace" placeholder={meta.numberPlaceholder}
                  value={f.docNumber} onChange={(e) => setF({ docNumber: e.target.value })} />
              </div>
              <div className="col-5">
                <label className="form-label mb-1">{f.docType === 'drawing' ? 'リビジョン' : 'バージョン'}</label>
                <input className="form-control form-control-sm font-monospace" placeholder={f.docType === 'drawing' ? '例: Rev.C' : '例: v1.2'}
                  value={f.revision} onChange={(e) => setF({ revision: e.target.value })} />
              </div>
            </div>
            <div className="mb-2">
              <label className="form-label mb-1">タイトル</label>
              <input className="form-control form-control-sm" placeholder={meta.titlePlaceholder}
                value={f.title} onChange={(e) => setF({ title: e.target.value })} />
            </div>
            <div className="mb-2">
              <label className="form-label mb-1">URL / PDMパス</label>
              <input
                className={`form-control form-control-sm font-monospace ${f.url.trim() && !isValidDocUrl(f.url) ? 'is-invalid' : ''}`}
                placeholder={meta.urlPlaceholder}
                value={f.url} onChange={(e) => setF({ url: e.target.value })} />
              {f.url.trim() && !isValidDocUrl(f.url) && (
                <div className="invalid-feedback d-block" style={{ fontSize: '0.75rem' }}>
                  有効なURLを入力してください（例: https://example.com/...）
                </div>
              )}
            </div>
            <div className="mb-1">
              <label className="form-label mb-1">メモ</label>
              <input className="form-control form-control-sm" placeholder="備考"
                value={f.note} onChange={(e) => setF({ note: e.target.value })} />
            </div>
          </div>
        )}
      </div>
    );
  };
  const [csvImportError, setCsvImportError] = useState<string | null>(null);
  const csvImportRef = useRef<HTMLInputElement>(null);
  const [csvImportModal, setCsvImportModal] = useState<{ file: File; changedBy: string; evidence: string } | null>(null);
  // 大規模 CSV 取込中の進捗オーバーレイ。stage で何をしているか伝える
  const [csvImporting, setCsvImporting] = useState<{ stage: string; total?: number } | null>(null);
  const [cadConfirmModal, setCadConfirmModal] = useState<{ updates: CadApplyUpdate[]; changedBy: string; evidence: string } | null>(null);

  // タグ管理モーダル
  const [showTagMgr, setShowTagMgr] = useState(false);
  // タグ管理モーダル内の編集状態（タグ id -> { name, color }）
  const [tagMgrEdits, setTagMgrEdits] = useState<Record<string, { name: string; color: string }>>({});
  // 削除確認ダイアログ対象 tag id
  const [tagDeleteConfirm, setTagDeleteConfirm] = useState<string | null>(null);

  const massCase = cases.find((c) => c.id === massCaseId) ?? null;
  const components = useMemo(
    () => {
      const resolved = massCaseId ? getComponentsForCase(massCaseId) as MassComponent[] : [];
      // 表示時にクローンへマスターの LINK_SYNC_FIELDS を上書き(永続データのずれを吸収)。
      // 過去に追加・編集された際に伝播経路を通らずクローンが欠落値で残っていても、
      // この後段でマスター値を被せれば表示・編集UI(マスター連動)が常に一致する。
      const groupMasters = new Map<string, MassComponent>();
      for (const c of resolved) {
        if (c.linkGroupId && c.isLinkMaster) groupMasters.set(c.linkGroupId, c);
      }
      return resolved.map((c) => {
        if (c.linkGroupId && !c.isLinkMaster) {
          const master = groupMasters.get(c.linkGroupId);
          if (master) {
            const cRec = c as unknown as Record<string, unknown>;
            const mRec = master as unknown as Record<string, unknown>;
            const synced: Record<string, unknown> = { ...cRec };
            for (const key of LINK_SYNC_FIELDS) synced[key] = mRec[key];
            return synced as unknown as MassComponent;
          }
        }
        return c;
      });
    },
    // allComponents を依存配列に含めることでストア更新時に再計算される
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allComponents, massCaseId],
  );
  const parameters = useMemo(
    () => massCaseId ? getParametersForCase(massCaseId) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allParameters, massCaseId],
  );
  const geom = geometries.find((g) => g.massCaseId === massCaseId);
  const stages = useMemo(
    () => allStages.filter((s) => s.massCaseId === massCaseId).sort((a, b) => a.stageNo - b.stageNo),
    [allStages, massCaseId],
  );

  const crossRefScope = useMemo(
    () => buildCrossRefScope(stages, geom),
    [stages, geom],
  );
  const propVars = useMemo(() => listPropulsionVars(stages), [stages]);
  const shapeVars = useMemo(() => listShapeVars(geom), [geom]);

  const computedMasses = useMemo(
    () => evaluateComponentMasses(components, parameters, crossRefScope),
    [components, parameters, crossRefScope]
  );

  // CADバインドされた componentId 集合（mass セルロック判定用）
  // - 現在の MassCase に属する全 CAD セットアップから集める
  // - 過去の id (シャドウ生成前) は logicalId 経由で現在の id にも反映
  const allCadSetups = useCadBindingStore((s) => s.setups);
  const boundComponentIds = useMemo(() => {
    const set = new Set<string>();
    if (!massCaseId) return set;
    const setupsForCase = allCadSetups.filter((s) => s.massCaseId === massCaseId);
    for (const setup of setupsForCase) {
      for (const binding of setup.componentBindings) {
        if (!binding.componentId) continue;
        set.add(binding.componentId);
        // 過去 id → logicalId → 現在 id 救済
        const past = allComponents.find((c) => c.id === binding.componentId);
        const lid = past?.logicalId;
        if (lid) {
          const current = components.find((c) => (c.logicalId || c.id) === lid);
          if (current) set.add(current.id);
        }
      }
    }
    return set;
  }, [allCadSetups, massCaseId, components, allComponents]);

  const childrenOf = useMemo(() => {
    const map = new Map<string | null, MassComponent[]>();
    components.forEach((c) => {
      const key = c.parentId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    });
    map.forEach((arr) => arr.sort((a, b) => a.order - b.order));
    return map;
  }, [components]);

  // case を開いたら「ルートは開いたまま、それ以下は折り畳んだ」状態で始める。
  //  - useLayoutEffect で paint 前に collapsed を確定させ、全展開のフラッシュを防ぐ
  //  - massCaseId が変化したら一度だけ実行
  //  - components がロード前 (空) なら skip し、ロード完了後に collapse
  //  - その後ユーザが個別に開閉した状態は維持 (components 変化のみでは再収納しない)
  //  - 完全に全閉じだと root しか出ず「壊れている」 ように見えるため
  //    parentId !== null の親ノード (=深い階層の親) だけ閉じる
  useLayoutEffect(() => {
    if (massCaseId === lastInitCaseRef.current) return;
    if (components.length === 0) return;
    lastInitCaseRef.current = massCaseId;
    const parentLids = new Set<string>();
    for (const c of components) if (c.parentId) parentLids.add(c.parentId);
    const initCollapsed = new Set<string>();
    for (const c of components) {
      // ルート(parentId === null) は開いたまま、それ以下の親ノードを閉じる
      if (c.parentId !== null && parentLids.has(c.logicalId || c.id)) {
        initCollapsed.add(c.id);
      }
    }
    setCollapsed(initCollapsed);
  }, [massCaseId, components]);

  /** 履歴バッジ用: 子孫を含めて(モーダル表示と同じ範囲)、かつ
   *  「componentId|changedBy|evidence|documentId|秒」でグルーピング
   *  した数(=登録回数)を返す。 */
  const historyCountMap = useMemo(() => {
    const result = new Map<string, number>();
    // 子孫(comp 自身も含む)を収集
    const descendantsOf = (c: MassComponent): MassComponent[] => {
      const out: MassComponent[] = [c];
      const stack = [c];
      while (stack.length) {
        const cur = stack.pop()!;
        const kids = childrenOf.get(cur.logicalId || cur.id) ?? [];
        for (const k of kids) { out.push(k); stack.push(k); }
      }
      return out;
    };
    for (const comp of components) {
      const groupKeys = new Set<string>();
      for (const tc of descendantsOf(comp)) {
        for (const e of (tc.fieldHistory ?? [])) {
          const sec = (e.changedAt ?? '').slice(0, 19);
          groupKeys.add(`${tc.id}|${e.changedBy ?? ''}|${e.evidence ?? ''}|${e.documentId ?? ''}|${sec}`);
        }
        for (const e of (tc.actualMassHistory ?? [])) {
          const sec = (e.recordedAt ?? '').slice(0, 19);
          groupKeys.add(`${tc.id}|${e.recordedBy ?? ''}|${e.evidence ?? ''}|${e.documentId ?? ''}|${sec}`);
        }
      }
      result.set(comp.id, groupKeys.size);
    }
    return result;
  }, [components, childrenOf]);

  // 実質量の積み上げ
  // - 親に actualMass が直接セットされていれば、それを優先（CAD バインドや手入力で上書き可能）
  // - そうでなければ子の合計を使う
  // childrenSumMap には「子の積み上げ」だけを別途保持しておく（親オーバーライドとの差分検出用）
  const { actualMassAggregated, childrenSumActualMassMap } = useMemo(() => {
    const result = new Map<string, number | null>();
    const childrenSumMap = new Map<string, number | null>();
    const compute = (comp: MassComponent): number | null => {
      if (result.has(comp.id)) return result.get(comp.id)!;
      const children = childrenOf.get(comp.logicalId || comp.id) ?? [];
      let val: number | null;
      if (children.length === 0) {
        val = comp.actualMass ?? null;
      } else {
        let total = 0;
        let hasAny = false;
        for (const child of children) {
          const childVal = compute(child);
          if (childVal != null) { total += childVal; hasAny = true; }
        }
        const sum = hasAny ? total : null;
        childrenSumMap.set(comp.id, sum);
        // 親に actualMass が直接セットされていれば優先（CAD バインドや手入力）
        val = comp.actualMass ?? sum;
      }
      result.set(comp.id, val);
      return val;
    };
    components.forEach((c) => compute(c));
    return { actualMassAggregated: result, childrenSumActualMassMap: childrenSumMap };
  }, [components, childrenOf]);

  const cgAggregatedMap = useMemo(
    () => computeGlobalCGMap(components, actualMassAggregated as Map<string, number>),
    [components, actualMassAggregated]
  );

  const inertiaAggregatedMap = useMemo(
    () => computeAggregateInertiaMap(components, actualMassAggregated as Map<string, number>, cgAggregatedMap),
    [components, actualMassAggregated, cgAggregatedMap]
  );

  const mountAggregatedMap = useMemo(
    () => computeAggregateMountMap(components),
    [components]
  );

  /** リンクグループ ID -> 表示色 のマップ（グループ毎に異なる色）
   * メンバー数が 1 以下のグループ(孤立マスター/孤立クローン)は色を割り当てない。
   * = 色の有無を「有効なリンクグループに属しているか」の真値として使え、
   *   削除等で状態が一時的に中途半端になっても UI 上はバッジが出ない・編集ロックも解ける。
   */
  const linkGroupColorMap = useMemo(() => {
    // NOTE: クローン badge は #198754(緑)固定なので、マスター用パレットから緑を除外する。
    // 同色になると「マスター/クローン」の視覚的区別が付かなくなる。
    const LINK_COLORS = [
      '#0d6efd', '#20c997', '#dc3545', '#fd7e14',
      '#6f42c1', '#0dcaf0', '#d63384', '#ffc107',
    ];
    const counts = new Map<string, number>();
    for (const c of components) {
      if (c.linkGroupId) counts.set(c.linkGroupId, (counts.get(c.linkGroupId) ?? 0) + 1);
    }
    const map = new Map<string, string>();
    let idx = 0;
    for (const comp of components) {
      if (
        comp.linkGroupId &&
        !map.has(comp.linkGroupId) &&
        (counts.get(comp.linkGroupId) ?? 0) >= 2
      ) {
        map.set(comp.linkGroupId, LINK_COLORS[idx % LINK_COLORS.length]);
        idx++;
      }
    }
    return map;
  }, [components]);

  const flattenTree = (parentId: string | null, depth: number): { comp: MassComponent; depth: number }[] => {
    const children = childrenOf.get(parentId) ?? [];
    const result: { comp: MassComponent; depth: number }[] = [];
    for (const child of children) {
      result.push({ comp: child, depth });
      if (!collapsed.has(child.id)) {
        result.push(...flattenTree(child.logicalId || child.id, depth + 1));
      }
    }
    return result;
  };

  const rows = flattenTree(currentFolderId, 0);

  // パンくずリスト用の祖先パス
  const breadcrumbPath = useMemo(() => {
    if (currentFolderId === null) return [];
    const byLogicalId = new Map(components.map(c => [c.logicalId || c.id, c]));
    const path: MassComponent[] = [];
    let current = byLogicalId.get(currentFolderId);
    while (current) {
      path.unshift(current);
      current = current.parentId ? byLogicalId.get(current.parentId) : undefined;
    }
    return path;
  }, [currentFolderId, components]);

  // ── リンク操作ハンドラ ──────────────────────────────────────────────────────

  /** マスターにクローンを新規追加（物理量コピー + 同じ linkGroupId） */
  const handleLinkAddInstance = (master: MassComponent) => {
    if (!massCaseId) return;
    const groupId = master.linkGroupId ?? uuidv4();
    if (!master.linkGroupId) {
      updateComponent(master.id, { linkGroupId: groupId, isLinkMaster: true });
    }
    const siblings = childrenOf.get(master.parentId) ?? [];
    const baseName = master.paramName.replace(/ \(clone\d*\)$/, '');
    const baseVar = master.varName.replace(/_\d+$/, '');
    const existingClones = components.filter((c) => c.linkGroupId === groupId && !c.isLinkMaster);
    const n = existingClones.length + 1;
    addComponent({
      massCaseId,
      parentId: master.parentId,
      paramName: `${baseName} (clone${n})`,
      varName: baseVar ? `${baseVar}_${n}` : '',
      level: master.level,
      stage: master.stage,
      inputType: master.inputType,
      valueOrFormula: master.valueOrFormula,
      order: siblings.length,
      allocatedMass: master.allocatedMass,
      actualMass: master.actualMass,
      actualMassEvidence: master.actualMassEvidence,
      actualMassHistory: master.actualMassHistory ? [...master.actualMassHistory] : undefined,
      cgX: master.cgX, cgY: master.cgY, cgZ: master.cgZ,
      cgEvidence: master.cgEvidence, cgReference: master.cgReference,
      localOriginX: master.localOriginX, localOriginY: master.localOriginY, localOriginZ: master.localOriginZ,
      ixx: master.ixx, iyy: master.iyy, izz: master.izz,
      ixy: master.ixy, ixz: master.ixz, iyz: master.iyz,
      inertiaEvidence: master.inertiaEvidence,
      materialName: master.materialName, materialDensity: master.materialDensity,
      materialDensityUnit: master.materialDensityUnit, materialYoungModulus: master.materialYoungModulus,
      materialNote: master.materialNote,
      debrisShapeType: master.debrisShapeType, debrisCharLength: master.debrisCharLength,
      debrisDiameter: master.debrisDiameter, debrisArea: master.debrisArea, debrisNote: master.debrisNote,
      diff: null,
      linkGroupId: groupId,
      isLinkMaster: false,
    });
  };

  /** 既存部品をリンクグループに追加（マスターの物理量で上書き） */
  const handleLinkExisting = (master: MassComponent, targetId: string) => {
    const target = components.find((c) => c.id === targetId);
    if (!target) return;
    // 別グループに既属の部品を移籍させる場合は警告(無言で他グループを壊さない)
    if (target.linkGroupId && target.linkGroupId !== master.linkGroupId) {
      const ok = window.confirm(
        `「${target.paramName}」は別のリンクグループに所属しています。元のグループから外して新グループへ移動してよいですか？`,
      );
      if (!ok) return;
    }
    const groupId = master.linkGroupId ?? uuidv4();
    if (!master.linkGroupId) {
      updateComponent(master.id, { linkGroupId: groupId, isLinkMaster: true });
    }
    // LINK_SYNC_FIELDS 全項目をマスターから target にコピー(タグ/CAD/ドキュメント/誤差源含む)
    const syncedData: Partial<MassComponent> = { linkGroupId: groupId, isLinkMaster: false };
    const masterRec = master as unknown as Record<string, unknown>;
    const syncedRec = syncedData as unknown as Record<string, unknown>;
    for (const key of LINK_SYNC_FIELDS) {
      syncedRec[key] = masterRec[key];
    }
    updateComponent(target.id, syncedData);
    setLinkExistingPickerOpen(false);
    setLinkExistingQuery('');
  };

  /** クローンを独立部品に戻す（リンク解除） */
  const handleLinkDetach = (clone: MassComponent) => {
    const groupId = clone.linkGroupId;
    if (!groupId) return;
    updateComponent(clone.id, { linkGroupId: undefined, isLinkMaster: undefined });
    // グループの残メンバーが1台になったら独立部品に戻す
    const remaining = components.filter(
      (c) => c.linkGroupId === groupId && c.id !== clone.id,
    );
    if (remaining.length === 1) {
      updateComponent(remaining[0].id, { linkGroupId: undefined, isLinkMaster: undefined });
    }
    setLinkPanelTarget(null);
  };

  // ── CSV エクスポート ──────────────────────────────────────────────────────────
  const handleCsvExport = () => {
    if (!massCase) return;
    const csv = exportComponentsToCSV(massCase, components);
    downloadFile(csv, `${massCase.name}_components.csv`, 'text/csv;charset=utf-8;');
  };

  // CSV インポートで変更があった項目を、手動編集と同じ粒度で履歴に記録
  const recordCsvFieldEntries = (
    compId: string,
    prev: MassComponent | undefined,
    next: Partial<MassComponent>,
    changedBy: string,
    evidence: string,
  ) => {
    const entries: Array<{ field: string; fieldLabel: string; value: string }> = [];
    // 入力タイプ + 値/計算式
    if (next.inputType !== undefined || next.valueOrFormula !== undefined) {
      const it = (next.inputType ?? prev?.inputType ?? 'fixed') as ComponentInputType;
      const vof = next.valueOrFormula ?? prev?.valueOrFormula ?? '';
      const itChanged = next.inputType !== undefined && prev?.inputType !== next.inputType;
      const vofChanged = next.valueOrFormula !== undefined && prev?.valueOrFormula !== next.valueOrFormula;
      if (itChanged || vofChanged) {
        const v = it === 'aggregate' ? INPUT_TYPE_LABELS[it] : `${INPUT_TYPE_LABELS[it]}: ${vof || '—'}`;
        entries.push({ field: 'inputAndValue', fieldLabel: '入力タイプ・値', value: v });
      }
    }
    // 実質量
    if (next.actualMass !== undefined && prev?.actualMass !== next.actualMass) {
      entries.push({ field: 'actualMass', fieldLabel: '実質量', value: next.actualMass != null ? String(next.actualMass) : '—' });
    }
    // 重心
    if ((next.cgX !== undefined || next.cgY !== undefined || next.cgZ !== undefined) &&
        (prev?.cgX !== next.cgX || prev?.cgY !== next.cgY || prev?.cgZ !== next.cgZ)) {
      entries.push({ field: 'cg', fieldLabel: '重心 (CG)', value: `[${next.cgX ?? '—'}, ${next.cgY ?? '—'}, ${next.cgZ ?? '—'}]` });
    }
    // 慣性テンソル
    if ((next.ixx !== undefined || next.iyy !== undefined || next.izz !== undefined ||
         next.ixy !== undefined || next.ixz !== undefined || next.iyz !== undefined) &&
        (prev?.ixx !== next.ixx || prev?.iyy !== next.iyy || prev?.izz !== next.izz ||
         prev?.ixy !== next.ixy || prev?.ixz !== next.ixz || prev?.iyz !== next.iyz)) {
      entries.push({
        field: 'inertia', fieldLabel: '慣性テンソル',
        value: `[${next.ixx ?? '—'}, ${next.iyy ?? '—'}, ${next.izz ?? '—'}, ${next.ixy ?? '—'}, ${next.ixz ?? '—'}, ${next.iyz ?? '—'}]`,
      });
    }
    // 材質
    if (next.materialName !== undefined && prev?.materialName !== next.materialName) {
      entries.push({ field: 'materialName', fieldLabel: '材質', value: next.materialName ?? '—' });
    }
    // 搭載位置
    if ((next.mountPosX !== undefined || next.mountEndX !== undefined ||
         next.mountPosY !== undefined || next.mountEndY !== undefined ||
         next.mountPosZ !== undefined || next.mountEndZ !== undefined) &&
        (prev?.mountPosX !== next.mountPosX || prev?.mountEndX !== next.mountEndX ||
         prev?.mountPosY !== next.mountPosY || prev?.mountEndY !== next.mountEndY ||
         prev?.mountPosZ !== next.mountPosZ || prev?.mountEndZ !== next.mountEndZ)) {
      entries.push({
        field: 'mounting', fieldLabel: '搭載位置',
        value: `X[${next.mountPosX ?? '—'}~${next.mountEndX ?? '—'}] Y[${next.mountPosY ?? '—'}~${next.mountEndY ?? '—'}] Z[${next.mountPosZ ?? '—'}~${next.mountEndZ ?? '—'}]`,
      });
    }
    for (const e of entries) {
      addFieldEntry(compId, {
        changedBy, field: e.field, fieldLabel: e.fieldLabel,
        value: e.value, evidence, status: 'input',
      }, {});
    }
  };

  // CAD取り込み: 受け取った更新を一括反映し、エビデンスを変更履歴に記録
  // kind='unbind' は CAD バインド解除に伴うメタ情報クリア + 解除履歴記録のみ
  const applyCadUpdates = (updates: CadApplyUpdate[]) => {
    updates.forEach(({ componentId, update, source, cadLabel, recordedBy, evidence, kind }) => {
      updateComponent(componentId, update);
      // ── バインド解除の処理 ──────────────────────────────────────────────
      if (kind === 'unbind') {
        const label = (recordedBy && recordedBy.trim()) || cadLabel || 'CAD';
        const ev = (evidence && evidence.trim()) || `CADバインド解除: ${cadLabel ?? 'CAD'}`;
        addFieldEntry(componentId, {
          changedBy: label,
          field: 'cadBinding',
          fieldLabel: 'CADバインド',
          value: `解除 (元: ${cadLabel ?? 'CAD'})`,
          evidence: ev,
          status: 'input',
          source: 'cad',
        }, {});
        return;
      }
      if (source !== 'cad') return;
      const label = (recordedBy && recordedBy.trim()) || cadLabel || 'CAD';
      const ev = (evidence && evidence.trim()) || `CADインポート: ${cadLabel ?? 'CAD'}`;
      // 実質量
      if (update.actualMass !== undefined) {
        addActualMassEntry(componentId, {
          value: update.actualMass,
          evidence: ev,
          recordedBy: label,
          status: 'input',
          source: 'cad',
        });
      }
      // 重心
      if (update.cgX !== undefined || update.cgY !== undefined || update.cgZ !== undefined) {
        addFieldEntry(componentId, {
          changedBy: label, field: 'cg', fieldLabel: '重心',
          value: `(${update.cgX ?? '?'}, ${update.cgY ?? '?'}, ${update.cgZ ?? '?'}) m`,
          evidence: ev, status: 'input', source: 'cad',
        }, {});
      }
      // 慣性テンソル
      if (update.ixx !== undefined || update.iyy !== undefined || update.izz !== undefined) {
        addFieldEntry(componentId, {
          changedBy: label, field: 'inertia', fieldLabel: '慣性テンソル',
          value: `Ixx=${update.ixx ?? '?'}, Iyy=${update.iyy ?? '?'}, Izz=${update.izz ?? '?'} kg·m²`,
          evidence: ev, status: 'input', source: 'cad',
        }, {});
      }
      // 材質
      if (update.materialName !== undefined) {
        addFieldEntry(componentId, {
          changedBy: label, field: 'material', fieldLabel: '材質',
          value: `${update.materialName}${update.materialDensity != null ? ` (${update.materialDensity} kg/m³)` : ''}`,
          evidence: ev, status: 'input', source: 'cad',
        }, {});
      } else if (update.materialDensity !== undefined) {
        addFieldEntry(componentId, {
          changedBy: label, field: 'materialDensity', fieldLabel: '密度',
          value: `${update.materialDensity} kg/m³`,
          evidence: ev, status: 'input', source: 'cad',
        }, {});
      }
      // 搭載位置・長さ
      if (update.mountPosX !== undefined || update.mountEndX !== undefined) {
        addFieldEntry(componentId, {
          changedBy: label, field: 'mounting', fieldLabel: '搭載位置',
          value: [
            update.mountPosX !== undefined ? `X始点=${update.mountPosX} m` : null,
            update.mountEndX !== undefined ? `X終点=${update.mountEndX} m` : null,
          ].filter(Boolean).join(', '),
          evidence: ev, status: 'input', source: 'cad',
        }, {});
      }
    });
  };

  // ── CSV インポート ──────────────────────────────────────────────────────────
  const handleCsvImport = (file: File, changedBy: string, evidence: string) => {
    setCsvImportError(null);
    setCsvImporting({ stage: 'ファイル読み込み中…' });
    const reader = new FileReader();
    reader.onload = (e) => {
      // 重い処理を defer してオーバーレイ初期描画を確実に行わせる (sync block 中は spinner 非表示)
      setTimeout(() => runCsvImport(e.target!.result as string, file, changedBy, evidence), 30);
    };
    reader.onerror = () => {
      setCsvImporting(null);
      setCsvImportError('ファイル読み込みエラー');
    };
    reader.readAsText(file);
  };

  const runCsvImport = (csvText: string, file: File, changedBy: string, evidence: string) => {
    try {
      setCsvImporting({ stage: 'CSV をパース中…' });
      const importRows = importComponentsFromCSV(csvText);
      if (!massCaseId) { setCsvImporting(null); return; }
      setCsvImporting({ stage: `${importRows.length}件を解析中…`, total: importRows.length });
      // ここから旧 onload 内のロジックがそのまま走る (try/catch も継続)
      try {

        // 未知のタグ名は tagDefinitions に自動追加する
        const existingTagDefs = massCase?.tagDefinitions ?? [];
        const knownTagNames = new Set(existingTagDefs.map((d) => d.name));
        const unknownTagNames = new Set<string>();
        for (const row of importRows) {
          for (const tag of row.tags) {
            if (tag && !knownTagNames.has(tag)) unknownTagNames.add(tag);
          }
        }
        if (unknownTagNames.size > 0) {
          const newDefs: TagDefinition[] = [];
          for (const name of unknownTagNames) {
            newDefs.push({ id: crypto.randomUUID(), name, color: '#999999' });
          }
          updateCase(massCaseId, { tagDefinitions: [...existingTagDefs, ...newDefs] });
        }

        // 既存コンポーネント照合用マップ群。優先順位は ID > varName > paramName。
        // 重複 paramName で誤マッチを防ぐため、まず ID を最優先で見る。
        const allComps = resolveShadowComponents(massCaseId, cases, allComponents) as MassComponent[];
        const byComponentId = new Map(allComps.map((c) => [c.logicalId || c.id, c]));
        const byVarName = new Map(allComps.filter((c) => c.varName).map((c) => [c.varName, c]));
        const byParamName = new Map(allComps.map((c) => [c.paramName, c]));
        // varName → id for parent resolution of new rows
        const varToId = new Map(allComps.filter((c) => c.varName).map((c) => [c.varName, c.logicalId || c.id]));

        let updated = 0;
        let added = 0;

        // level → 直前にその level で処理したコンポーネントの lid マップ。
        // parentVarName が未指定の行で、レベル L > 0 なら、レベル L-1 の直近
        // 処理コンポーネント(= 上の行で1段上)を親として推定する(ツリーが
        // DFS 順で並んでいる前提・export 順と一致)。
        const levelToLastLid = new Map<number, string>();
        // 親 logicalId 毎の order カウンタ (allComps の中の既存兄弟数 + バッチ内で増えた数)
        const orderByParent = new Map<string | null, number>();
        for (const c of allComps) {
          const pid = c.parentId ?? null;
          orderByParent.set(pid, (orderByParent.get(pid) ?? 0) + 1);
        }

        // 新規追加分はまずバッファに溜め、最後に bulkAddComponents で 1 set にする。
        // 大規模CSV(数千行)で各 addComponent が React 再描画 + WS 送信を 1 回ずつ
        // 走らせていた → 4000+ 回でブラウザがフリーズしていたため。
        const pendingAdds: Omit<MassComponent, 'id'>[] = [];
        // バッチ内の仮 id 採番用 (varToId / levelToLastLid に積むため)。実 id は bulkAddComponents が再採番。
        // ここでは「現バッチ内での連番文字列」をスタブとして使い、後で実 id とマッピング。
        const stubByPos: string[] = [];

        for (let i = 0; i < importRows.length; i++) {
          const row = importRows[i];
          // 1. component_id 一致 (round-trip 用、最も信頼できる)
          // 2. var_name 一致 (ユーザー定義の変数名)
          // 3. param_name 一致 (フォールバック。重複に弱い)
          const existing =
            (row.componentId ? byComponentId.get(row.componentId) : null)
            ?? (row.varName ? byVarName.get(row.varName) : null)
            ?? byParamName.get(row.paramName);
          const data: Partial<MassComponent> = {
            paramName: row.paramName || existing?.paramName || row.varName,
            varName: row.varName,
            stage: (row.stage as ComponentStage) || 'all',
            tags: row.tags,
            componentCategory: undefined,
            isPropellant: row.isPropellant || undefined,
            inputType: (row.inputType as ComponentInputType) || 'fixed',
            valueOrFormula: row.valueOrFormula,
            actualMass: row.actualMass,
            actualMassMode: row.actualMassMode || undefined,
            actualMassEvidence: row.actualMassEvidence,
            // 座標系 + 原点
            cgReference: (row.cgReference === 'global' || row.cgReference === 'local') ? row.cgReference : undefined,
            localOriginX: row.localOriginX, localOriginY: row.localOriginY, localOriginZ: row.localOriginZ,
            cgX: row.cgX, cgY: row.cgY, cgZ: row.cgZ,
            cgEvidence: row.cgEvidence || undefined,
            ixx: row.ixx, iyy: row.iyy, izz: row.izz,
            ixy: row.ixy, ixz: row.ixz, iyz: row.iyz,
            inertiaEvidence: row.inertiaEvidence || undefined,
            cgInertiaMode: row.cgInertiaMode || undefined,
            materialName: row.materialName,
            materialDensity: row.materialDensity,
            materialDensityUnit: (() => {
              const u = row.materialDensityUnit;
              return (u === 'kg/m³' || u === 'g/cm³' || u === 'kg/L' || u === 'ton/m³') ? u : undefined;
            })(),
            materialYoungModulus: row.materialYoungModulus,
            materialNote: row.materialNote,
            mountPosX: row.mountPosX, mountEndX: row.mountEndX,
            mountPosY: row.mountPosY, mountEndY: row.mountEndY,
            mountPosZ: row.mountPosZ, mountEndZ: row.mountEndZ,
            mountNote: row.mountNote,
            // リンクグループ (round-trip でクローン/マスター関係を保つ)
            linkGroupId: row.linkGroupId || undefined,
            isLinkMaster: row.isLinkMaster || undefined,
            // CAD 参照
            cadFile: row.cadFile || undefined,
            cadLastImported: row.cadLastImported || undefined,
            cadSoftware: row.cadSoftware || undefined,
            cadRevision: row.cadRevision || undefined,
            cadFilePath: row.cadFilePath || undefined,
          };

          if (existing) {
            updateComponent(existing.id, data);
            recordCsvFieldEntries(existing.id, existing, data, changedBy, evidence);
            updated++;
            // 更新も level マップに反映(以降の子行で親候補になる)
            levelToLastLid.set(row.level, existing.logicalId || existing.id);
          } else {
            // 親解決
            let parentId: string | null = null;
            if (row.parentVarName) {
              parentId = varToId.get(row.parentVarName) ?? null;
            } else if (row.level > 0) {
              parentId = levelToLastLid.get(row.level - 1) ?? null;
            }
            const order = orderByParent.get(parentId) ?? 0;
            orderByParent.set(parentId, order + 1);
            // 仮 id (stub) を作り、level マップ等に登録。後で実 id に置き換える
            const stubId = `__pending_${pendingAdds.length}__`;
            pendingAdds.push({
              massCaseId,
              parentId,
              level: row.level,
              order,
              allocatedMass: row.allocatedMass,
              diff: null,
              ...data,
              // CSV に component_id 指定があれば logicalId として保持
              ...(row.componentId ? { logicalId: row.componentId } : {}),
            } as Omit<MassComponent, 'id'>);
            stubByPos.push(stubId);
            varToId.set(row.varName, stubId);
            levelToLastLid.set(row.level, stubId);
            added++;
          }
        }
        // バッチ反映 → 実 id を取得して stub と置換
        if (pendingAdds.length > 0) {
          const newComps = useMassCaseStore.getState().bulkAddComponents(pendingAdds);
          // varToId / levelToLastLid に積んだ stub を実 id に置換
          const stubToReal = new Map<string, string>();
          for (let k = 0; k < newComps.length; k++) {
            stubToReal.set(stubByPos[k], newComps[k].logicalId || newComps[k].id);
          }
          for (const [key, val] of varToId.entries()) {
            const real = stubToReal.get(val);
            if (real) varToId.set(key, real);
          }
          for (const [key, val] of levelToLastLid.entries()) {
            const real = stubToReal.get(val);
            if (real) levelToLastLid.set(key, real);
          }
          // parentId が stub のまま残っているコンポーネントは事後パッチ
          // (バッチ内で親も子も新規だったケース。stubByPos の順序で実 id を逆引き)
          const componentsToFix: { id: string; parentId: string }[] = [];
          for (let k = 0; k < newComps.length; k++) {
            const pid = newComps[k].parentId;
            if (pid && pid.startsWith('__pending_')) {
              const real = stubToReal.get(pid);
              if (real) componentsToFix.push({ id: newComps[k].id, parentId: real });
            }
          }
          if (componentsToFix.length > 0) {
            // 直接 store を 1 set で書き換え (updateComponent ループだと再び O(n) 遅延)
            useMassCaseStore.setState((s) => {
              const fixMap = new Map(componentsToFix.map((f) => [f.id, f.parentId]));
              return {
                components: s.components.map((c) => fixMap.has(c.id) ? { ...c, parentId: fixMap.get(c.id)! } : c),
              };
            });
          }
          // 履歴記録は省略 (CSV 一括ロード時の履歴ノイズを避ける)。必要なら再導入
        }

        // massCase 全体の変更ログにインポート1件を記録
        addChangeRecord(massCaseId, {
          changedBy: changedBy || 'CSVインポート',
          summary: `CSVインポート: ${file.name}（更新 ${updated} 件 / 追加 ${added} 件）`,
          rationale: evidence,
          documentUrls: [],
        });
        setCsvImportError(`インポート完了: 更新 ${updated} 件、追加 ${added} 件`);
      } catch (err) {
        setCsvImportError(`エラー: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setCsvImporting(null);
      }
    } catch (err) {
      // 外側 (parse 失敗等)
      setCsvImportError(`エラー: ${err instanceof Error ? err.message : String(err)}`);
      setCsvImporting(null);
    }
  };

  const openMountEdit = (comp: MassComponent) => {
    // 搭載位置は LINK_SYNC_FIELDS 同期対象なので、クローンでは編集不可。
    if (comp.linkGroupId && !comp.isLinkMaster) {
      const master = components.find((c) => c.linkGroupId === comp.linkGroupId && c.isLinkMaster);
      window.alert(`この部品はクローンです。搭載位置の編集はマスター「${master?.paramName ?? '(マスター)'}」で行ってください。`);
      return;
    }
    setMountEditTarget(comp);
    setMountEditForm({
      mountPosX: comp.mountPosX != null ? String(comp.mountPosX) : '',
      mountEndX: comp.mountEndX != null ? String(comp.mountEndX) : '',
      mountPosY: comp.mountPosY != null ? String(comp.mountPosY) : '',
      mountEndY: comp.mountEndY != null ? String(comp.mountEndY) : '',
      mountPosZ: comp.mountPosZ != null ? String(comp.mountPosZ) : '',
      mountEndZ: comp.mountEndZ != null ? String(comp.mountEndZ) : '',
      changedBy: '',
      evidence: '',
    });
  };

  const openMaterialEdit = (comp: MassComponent) => {
    if (comp.linkGroupId && !comp.isLinkMaster) {
      const master = components.find((c) => c.linkGroupId === comp.linkGroupId && c.isLinkMaster);
      window.alert(`この部品はクローンです。材質の編集はマスター「${master?.paramName ?? '(マスター)'}」で行ってください。`);
      return;
    }
    const unit: DensityUnit = comp.materialDensityUnit ?? 'kg/m³';
    const densityDisplay = comp.materialDensity != null
      ? String(densityFromInternal(comp.materialDensity, unit))
      : '';
    setMaterialEditTarget(comp);
    setMaterialEditForm({
      materialName: comp.materialName ?? '',
      materialDensityValue: densityDisplay,
      materialDensityUnit: unit,
      materialYoungModulus: comp.materialYoungModulus != null ? String(comp.materialYoungModulus) : '',
      materialNote: comp.materialNote ?? '',
      changedBy: '',
      evidence: '',
    });
    setMaterialEditPresetCat('');
    resetAttachDoc();
  };

  const openCgInertiaEdit = (comp: MassComponent) => {
    if (comp.linkGroupId && !comp.isLinkMaster) {
      const master = components.find((c) => c.linkGroupId === comp.linkGroupId && c.isLinkMaster);
      window.alert(`この部品はクローンです。物理量の編集はマスター「${master?.paramName ?? '(マスター)'}」で行ってください。`);
      return;
    }
    setCgInertiaEditState({ comp });
    const hasChildren = (childrenOf.get(comp.logicalId || comp.id)?.length ?? 0) > 0;
    const initialMode: 'aggregate' | 'manual' = hasChildren
      ? (comp.cgInertiaMode ?? 'aggregate')
      : 'manual';
    setCgInertiaForm({
      mode: initialMode,
      cgReference: comp.cgReference ?? 'local',
      localOriginX: comp.localOriginX != null ? String(comp.localOriginX) : '',
      localOriginY: comp.localOriginY != null ? String(comp.localOriginY) : '',
      localOriginZ: comp.localOriginZ != null ? String(comp.localOriginZ) : '',
      cgX: comp.cgX != null ? String(comp.cgX) : '',
      cgY: comp.cgY != null ? String(comp.cgY) : '',
      cgZ: comp.cgZ != null ? String(comp.cgZ) : '',
      ixx: comp.ixx != null ? String(comp.ixx) : '',
      iyy: comp.iyy != null ? String(comp.iyy) : '',
      izz: comp.izz != null ? String(comp.izz) : '',
      ixy: comp.ixy != null ? String(comp.ixy) : '',
      ixz: comp.ixz != null ? String(comp.ixz) : '',
      iyz: comp.iyz != null ? String(comp.iyz) : '',
      changedBy: '', evidence: '',
    });
  };

  const handleCgInertiaSubmit = () => {
    if (!cgInertiaEditState) return;
    const { comp } = cgInertiaEditState;
    const f = cgInertiaForm;
    const parseNum = (s: string) => { const n = parseFloat(s); return isNaN(n) ? null : n; };

    // 変更があったフィールドのみ fieldUpdate / fieldHistory エントリを生成
    const fieldUpdate: Record<string, unknown> = {};
    const entries: Omit<import('../../types').ComponentFieldEntry, 'id' | 'changedAt'>[] = [];

    const changed = <K extends keyof MassComponent>(field: K, newVal: MassComponent[K], oldVal: MassComponent[K], label: string, displayVal: string) => {
      if (newVal !== oldVal) {
        (fieldUpdate as Record<string, unknown>)[field as string] = newVal;
        entries.push({ changedBy: f.changedBy.trim(), field: field as string, fieldLabel: label, value: displayVal || null, evidence: f.evidence.trim(), status: 'input' });
      }
    };

    // 集計/入力 モード(変更時のみ記録)
    const hasChildrenSub = (childrenOf.get(comp.logicalId || comp.id)?.length ?? 0) > 0;
    if (hasChildrenSub) {
      const oldMode = comp.cgInertiaMode ?? 'aggregate';
      if (f.mode !== oldMode) {
        fieldUpdate['cgInertiaMode'] = f.mode;
        entries.push({
          changedBy: f.changedBy.trim(),
          field: 'cgInertiaMode',
          fieldLabel: '集計/入力モード',
          value: f.mode === 'aggregate' ? '集計' : '入力',
          evidence: f.evidence.trim(),
          status: 'input',
        });
      }
    }

    // 座標系 — 集計モードのとき global を強制
    const effectiveCgRef = f.mode === 'aggregate' ? 'global' : f.cgReference;
    changed('cgReference', effectiveCgRef, comp.cgReference ?? 'local', '座標系', effectiveCgRef === 'global' ? '全機座標系' : '局所座標系');

    // 原点
    const newOX = parseNum(f.localOriginX); const newOY = parseNum(f.localOriginY); const newOZ = parseNum(f.localOriginZ);
    const oldOX = comp.localOriginX ?? null; const oldOY = comp.localOriginY ?? null; const oldOZ = comp.localOriginZ ?? null;
    if (newOX !== oldOX || newOY !== oldOY || newOZ !== oldOZ) {
      fieldUpdate['localOriginX'] = newOX; fieldUpdate['localOriginY'] = newOY; fieldUpdate['localOriginZ'] = newOZ;
      entries.push({ changedBy: f.changedBy.trim(), field: 'localOrigin', fieldLabel: '原点', value: `(${f.localOriginX || '—'}, ${f.localOriginY || '—'}, ${f.localOriginZ || '—'}) m`, evidence: f.evidence.trim(), status: 'input' });
    }

    // CG
    const newCgX = parseNum(f.cgX); const newCgY = parseNum(f.cgY); const newCgZ = parseNum(f.cgZ);
    if (newCgX !== (comp.cgX ?? null) || newCgY !== (comp.cgY ?? null) || newCgZ !== (comp.cgZ ?? null)) {
      fieldUpdate['cgX'] = newCgX; fieldUpdate['cgY'] = newCgY; fieldUpdate['cgZ'] = newCgZ;
      entries.push({ changedBy: f.changedBy.trim(), field: 'cg', fieldLabel: '重心', value: `(${f.cgX || '—'}, ${f.cgY || '—'}, ${f.cgZ || '—'}) m`, evidence: f.evidence.trim(), status: 'input' });
    }

    // 慣性テンソル
    const newIxx = parseNum(f.ixx); const newIyy = parseNum(f.iyy); const newIzz = parseNum(f.izz);
    const newIxy = parseNum(f.ixy); const newIxz = parseNum(f.ixz); const newIyz = parseNum(f.iyz);
    if (newIxx !== (comp.ixx ?? null) || newIyy !== (comp.iyy ?? null) || newIzz !== (comp.izz ?? null) ||
        newIxy !== (comp.ixy ?? null) || newIxz !== (comp.ixz ?? null) || newIyz !== (comp.iyz ?? null)) {
      fieldUpdate['ixx'] = newIxx; fieldUpdate['iyy'] = newIyy; fieldUpdate['izz'] = newIzz;
      fieldUpdate['ixy'] = newIxy; fieldUpdate['ixz'] = newIxz; fieldUpdate['iyz'] = newIyz;
      entries.push({ changedBy: f.changedBy.trim(), field: 'inertia', fieldLabel: '慣性テンソル', value: `Ixx=${f.ixx || '—'}, Iyy=${f.iyy || '—'}, Izz=${f.izz || '—'} kg·m²`, evidence: f.evidence.trim(), status: 'input' });
    }

    if (entries.length > 0) {
      addFieldEntries(comp.id, entries, fieldUpdate);
    }
    setCgInertiaEditState(null);
  };

  const openFieldEntry = (
    comp: MassComponent,
    field: string,
    fieldLabel: string,
    currentValue: string,
    step = 'any',
    extraUpdate?: (val: string) => Record<string, unknown>,
  ) => {
    // クローンの物理量フィールドは編集不可
    if (comp.linkGroupId && !comp.isLinkMaster) {
      const master = components.find((c) => c.linkGroupId === comp.linkGroupId && c.isLinkMaster);
      window.alert(`この部品はクローンです。「${fieldLabel}」の編集はマスター「${master?.paramName ?? '(マスター)'}」で行ってください。`);
      return;
    }
    const unit: DensityUnit = comp.materialDensityUnit ?? 'kg/m³';
    if (field === 'materialDensity') {
      // 表示値（選択単位）に変換してフォームに渡す
      const internalVal = parseFloat(currentValue);
      const displayVal = currentValue !== '' && isFinite(internalVal)
        ? String(densityFromInternal(internalVal, unit))
        : currentValue;
      setFieldEntryState({ comp, field, fieldLabel, currentValue, step, extraUpdate, densityUnit: unit });
      setFieldEntryForm({ value: displayVal, changedBy: '', evidence: '' });
      setFieldEntryDensityUnit(unit);
    } else if (field === 'actualMass') {
      // actualMass: 親コンポーネントでは集計/固定値を選べる
      const children = childrenOf.get(comp.logicalId || comp.id) ?? [];
      const compHasChildren = children.length > 0;
      // actualMass == null かつ 子あり → 集計モード。それ以外は固定値モード
      const initMode: 'fixed' | 'aggregate' = (comp.actualMass == null && compHasChildren) ? 'aggregate' : 'fixed';
      setActualMassMode(initMode);
      setFieldEntryState({ comp, field, fieldLabel, currentValue, step, extraUpdate, hasChildren: compHasChildren });
      setFieldEntryForm({ value: currentValue, changedBy: '', evidence: '' });
    } else {
      setFieldEntryState({ comp, field, fieldLabel, currentValue, step, extraUpdate });
      setFieldEntryForm({ value: currentValue, changedBy: '', evidence: '' });
    }
    setFieldEntryMaterialCat('');
    resetAttachDoc();
  };

  const handleFieldEntrySubmit = () => {
    if (!fieldEntryState) return;
    const docErr = validateAttachDoc();
    if (docErr) { window.alert(docErr); return; }
    const { comp, field, fieldLabel, extraUpdate } = fieldEntryState;
    const val = fieldEntryForm.value.trim();
    let fieldUpdate: Record<string, unknown>;
    if (field === 'actualMass' && actualMassMode === 'aggregate') {
      // 集計モード: actualMass を null にセット（子の合計が表示される）
      fieldUpdate = { actualMass: null, actualMassEvidence: fieldEntryForm.evidence.trim() };
    } else if (extraUpdate) {
      fieldUpdate = extraUpdate(val);
    } else if (field === 'materialDensity') {
      const displayNum = parseFloat(val);
      const internalVal = isNaN(displayNum) ? null : densityToInternal(displayNum, fieldEntryDensityUnit);
      fieldUpdate = {
        materialDensity: internalVal,
        materialDensityUnit: fieldEntryDensityUnit,
      };
    } else {
      const numVal = parseFloat(val);
      fieldUpdate = { [field]: isNaN(numVal) ? (val || null) : numVal };
    }
    // actualMass フィールドは addActualMassEntry のみで記録 (重複履歴防止)。
    // 旧コードは fieldHistory にも別エントリを追加していたが、unified 履歴ビューで
    // 同一変更が 2 行に見えて undo も 2 step 必要になっていたため廃止。
    if (field === 'actualMass') {
      const isAggregate = actualMassMode === 'aggregate';
      addActualMassEntry(comp.id, {
        value: isAggregate ? null : (parseFloat(val) || null),
        evidence: fieldEntryForm.evidence.trim(),
        recordedBy: fieldEntryForm.changedBy.trim(),
        status: 'input',
      }, isAggregate ? 'aggregate' : 'fixed');
      // 共同編集
      const collab = getActiveCollab();
      if (collab) {
        const entityId = comp.logicalId || comp.id;
        for (const [fld, v] of Object.entries(fieldUpdate)) {
          collab.sendFieldSet(entityId, 'component', fld, v, fieldEntryForm.evidence.trim());
        }
      }
      resetAttachDoc();
      setFieldEntryState(null);
      return;
    }
    const documentId = commitAttachedDoc(comp.id, fieldEntryForm.changedBy);
    addFieldEntry(comp.id, {
      changedBy: fieldEntryForm.changedBy.trim(),
      field,
      fieldLabel,
      value: val || null,
      evidence: fieldEntryForm.evidence.trim(),
      status: 'input',
      documentId,
    }, fieldUpdate);
    // 共同編集: 変更フィールドをサーバーへ送信（他クライアントへ即時反映）
    const collab = getActiveCollab();
    if (collab) {
      const entityId = comp.logicalId || comp.id;
      for (const [fld, v] of Object.entries(fieldUpdate)) {
        collab.sendFieldSet(entityId, 'component', fld, v, fieldEntryForm.evidence.trim());
      }
    }
    resetAttachDoc();
    setFieldEntryState(null);
  };

  const openInputValueEdit = (comp: MassComponent) => {
    setInputValueTarget(comp);
    setInputValueForm({
      inputType: comp.inputType,
      valueOrFormula: comp.valueOrFormula ?? '',
      changedBy: '',
      evidence: '',
    });
    resetAttachDoc();
  };

  const handleInputValueSubmit = () => {
    if (!inputValueTarget) return;
    const docErr = validateAttachDoc();
    if (docErr) { window.alert(docErr); return; }
    const { inputType, valueOrFormula } = inputValueForm;
    const updates: Partial<MassComponent> = { inputType, valueOrFormula: inputType === 'aggregate' ? '' : valueOrFormula };
    updateComponent(inputValueTarget.id, updates);
    const documentId = commitAttachedDoc(inputValueTarget.id, inputValueForm.changedBy);
    const valueLabel = inputType === 'aggregate'
      ? INPUT_TYPE_LABELS[inputType]
      : `${INPUT_TYPE_LABELS[inputType]}: ${valueOrFormula || '—'}`;
    addFieldEntry(inputValueTarget.id, {
      changedBy: inputValueForm.changedBy.trim(),
      field: 'inputAndValue',
      fieldLabel: '入力タイプ・値',
      value: valueLabel,
      evidence: inputValueForm.evidence.trim(),
      status: 'input',
      documentId,
    }, updates);
    resetAttachDoc();
    setInputValueTarget(null);
  };

  const handleCgEditSubmit = () => {
    if (!cgEditTarget) return;
    const docErr = validateAttachDoc();
    if (docErr) { window.alert(docErr); return; }
    const x = parseFloat(cgEditForm.cgX); const y = parseFloat(cgEditForm.cgY); const z = parseFloat(cgEditForm.cgZ);
    const updates: Partial<MassComponent> = {
      cgReference: cgEditForm.cgReference,
      cgX: isNaN(x) ? null : x, cgY: isNaN(y) ? null : y, cgZ: isNaN(z) ? null : z,
    };
    updateComponent(cgEditTarget.id, updates);
    const documentId = commitAttachedDoc(cgEditTarget.id, cgEditForm.changedBy);
    addFieldEntry(cgEditTarget.id, {
      changedBy: cgEditForm.changedBy.trim(), field: 'cg', fieldLabel: '重心 (CG)',
      value: `${cgEditForm.cgReference} [${cgEditForm.cgX || '—'}, ${cgEditForm.cgY || '—'}, ${cgEditForm.cgZ || '—'}]`,
      evidence: cgEditForm.evidence.trim(), status: 'input',
      documentId,
    }, updates);
    resetAttachDoc();
    setCgEditTarget(null);
  };

  const handleInertiaEditSubmit = () => {
    if (!inertiaEditTarget) return;
    const docErr = validateAttachDoc();
    if (docErr) { window.alert(docErr); return; }
    const parse = (v: string) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
    const updates: Partial<MassComponent> = {
      ixx: parse(inertiaEditForm.ixx), iyy: parse(inertiaEditForm.iyy), izz: parse(inertiaEditForm.izz),
      ixy: parse(inertiaEditForm.ixy), ixz: parse(inertiaEditForm.ixz), iyz: parse(inertiaEditForm.iyz),
    };
    updateComponent(inertiaEditTarget.id, updates);
    const documentId = commitAttachedDoc(inertiaEditTarget.id, inertiaEditForm.changedBy);
    addFieldEntry(inertiaEditTarget.id, {
      changedBy: inertiaEditForm.changedBy.trim(), field: 'inertia', fieldLabel: '慣性テンソル',
      value: `[${inertiaEditForm.ixx || '—'}, ${inertiaEditForm.iyy || '—'}, ${inertiaEditForm.izz || '—'}, ${inertiaEditForm.ixy || '—'}, ${inertiaEditForm.ixz || '—'}, ${inertiaEditForm.iyz || '—'}]`,
      evidence: inertiaEditForm.evidence.trim(), status: 'input',
      documentId,
    }, updates);
    resetAttachDoc();
    setInertiaEditTarget(null);
  };

  const handleMaterialEditSubmit = () => {
    if (!materialEditTarget) return;
    const docErr = validateAttachDoc();
    if (docErr) { window.alert(docErr); return; }
    const f = materialEditForm;
    const name = f.materialName.trim();
    const densityNum = parseFloat(f.materialDensityValue);
    const densityInternal = isNaN(densityNum) ? null : densityToInternal(densityNum, f.materialDensityUnit);
    const youngNum = parseFloat(f.materialYoungModulus);
    const youngModulus = isNaN(youngNum) ? null : youngNum;
    const updates: Partial<MassComponent> = {
      materialName: name || undefined,
      materialDensity: densityInternal ?? undefined,
      materialDensityUnit: f.materialDensityUnit,
      materialYoungModulus: youngModulus ?? undefined,
      materialNote: f.materialNote.trim() || undefined,
    };
    // addFieldEntry が updates も適用するため、ここでの updateComponent は重複(undo step も 2 倍になっていた)
    const documentId = commitAttachedDoc(materialEditTarget.id, f.changedBy);
    const densityLabel = densityInternal != null
      ? `${densityFromInternal(densityInternal, f.materialDensityUnit).toLocaleString()} ${f.materialDensityUnit}`
      : '—';
    const youngLabel = youngModulus != null ? `${youngModulus} GPa` : '—';
    addFieldEntry(materialEditTarget.id, {
      changedBy: f.changedBy.trim(), field: 'material', fieldLabel: '材質',
      value: `${name || '—'} (${densityLabel} / E=${youngLabel})`,
      evidence: f.evidence.trim(), status: 'input',
      documentId,
    }, updates);
    resetAttachDoc();
    setMaterialEditTarget(null);
  };

  const handleMountEditSubmit = () => {
    if (!mountEditTarget) return;
    const docErr = validateAttachDoc();
    if (docErr) { window.alert(docErr); return; }
    const parse = (v: string) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
    const updates: Partial<MassComponent> = {
      mountPosX: parse(mountEditForm.mountPosX), mountEndX: parse(mountEditForm.mountEndX),
      mountPosY: parse(mountEditForm.mountPosY), mountEndY: parse(mountEditForm.mountEndY),
      mountPosZ: parse(mountEditForm.mountPosZ), mountEndZ: parse(mountEditForm.mountEndZ),
    };
    // addFieldEntry が updates も適用するため、ここでの updateComponent は重複(undo step も 2 倍)
    const documentId = commitAttachedDoc(mountEditTarget.id, mountEditForm.changedBy);
    addFieldEntry(mountEditTarget.id, {
      changedBy: mountEditForm.changedBy.trim(), field: 'mounting', fieldLabel: '搭載位置',
      value: `X[${mountEditForm.mountPosX || '—'}~${mountEditForm.mountEndX || '—'}] Y[${mountEditForm.mountPosY || '—'}~${mountEditForm.mountEndY || '—'}] Z[${mountEditForm.mountPosZ || '—'}~${mountEditForm.mountEndZ || '—'}]`,
      evidence: mountEditForm.evidence.trim(), status: 'input',
      documentId,
    }, updates);
    resetAttachDoc();
    setMountEditTarget(null);
  };

  const addRootComponent = () => {
    if (!massCaseId) return;
    // フォルダ内にいる場合はそのフォルダの子として追加
    if (currentFolderId) {
      const parentComp = components.find(c => (c.logicalId || c.id) === currentFolderId);
      if (parentComp) { addChildComponent(parentComp); return; }
    }
    const roots = childrenOf.get(null) ?? [];
    addComponent({
      massCaseId,
      parentId: null,
      paramName: '新規コンポーネント',
      varName: '',
      level: 0,
      stage: 'all',
      inputType: 'aggregate',
      valueOrFormula: '',
      order: roots.length,
      allocatedMass: null,
      actualMass: null,
      actualMassEvidence: '',
      diff: null,
    });
  };

  const addChildComponent = (parentComp: MassComponent) => {
    if (!massCaseId) return;
    const lid = parentComp.logicalId || parentComp.id;
    const children = childrenOf.get(lid) ?? [];
    addComponent({
      massCaseId,
      parentId: lid,
      paramName: '新規コンポーネント',
      varName: '',
      level: parentComp.level + 1,
      stage: parentComp.stage,
      inputType: 'fixed',
      valueOrFormula: '0',
      order: children.length,
      allocatedMass: null,
      actualMass: null,
      actualMassEvidence: '',
      diff: null,
    });
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.delete(parentComp.id);
      return next;
    });
  };

  const NUMERIC_FIELDS: ReadonlySet<keyof MassComponent> = new Set([
    'cgX', 'cgY', 'cgZ',
    'ixx', 'iyy', 'izz', 'ixy', 'ixz', 'iyz',
    'localOriginX', 'localOriginY', 'localOriginZ',
    'mountPosX', 'mountEndX', 'mountPosY', 'mountEndY', 'mountPosZ', 'mountEndZ',
    'materialDensity', 'materialYoungModulus',
    'allocatedMass', 'actualMass',
  ]);

  const handleEdit = (id: string, field: keyof MassComponent, value: string) => {
    if (field === 'stage') {
      updateComponent(id, { stage: value as ComponentStage });
    } else if (NUMERIC_FIELDS.has(field)) {
      const numVal = parseFloat(value);
      updateComponent(id, { [field]: value === '' || isNaN(numVal) ? null : numVal });
    } else {
      updateComponent(id, { [field]: value });
    }
  };

  // 行ドラッグ並び替え:
  //   - draggingId: 掴んでいる行の id
  //   - dropTarget: 現在のドロップ先(行 id と位置)
  // 同じ親内のみ並び替え可能(クロス親移動は「親を変更」モーダルを使う)。
  // 旧 handleMoveUp/Down は単純 swap で order 重複時に効かないバグがあった
  // ため廃止。下記 finalizeDrop で並び順を 0..n に再正規化することで解消。
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; pos: 'before' | 'after' } | null>(null);

  const handleRowDragStart = (comp: MassComponent) => {
    setDraggingId(comp.id);
  };
  const handleRowDragEnd = () => {
    setDraggingId(null);
    setDropTarget(null);
  };
  const handleRowDragOver = (e: React.DragEvent, comp: MassComponent) => {
    if (!draggingId || draggingId === comp.id) return;
    const dragging = components.find((c) => c.id === draggingId);
    if (!dragging || dragging.parentId !== comp.parentId) return; // 同じ親内のみ
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const pos: 'before' | 'after' = e.clientY < midY ? 'before' : 'after';
    if (!dropTarget || dropTarget.id !== comp.id || dropTarget.pos !== pos) {
      setDropTarget({ id: comp.id, pos });
    }
  };
  const handleRowDrop = (e: React.DragEvent, comp: MassComponent) => {
    e.preventDefault();
    if (!draggingId || !dropTarget) { handleRowDragEnd(); return; }
    const dragging = components.find((c) => c.id === draggingId);
    if (!dragging || dragging.parentId !== comp.parentId) { handleRowDragEnd(); return; }
    const siblings = (childrenOf.get(comp.parentId) ?? []).slice().sort((a, b) => a.order - b.order);
    const fromIdx = siblings.findIndex((c) => c.id === draggingId);
    const targetIdx = siblings.findIndex((c) => c.id === comp.id);
    if (fromIdx === -1 || targetIdx === -1) { handleRowDragEnd(); return; }
    let insertIdx = dropTarget.pos === 'after' ? targetIdx + 1 : targetIdx;
    if (insertIdx > fromIdx) insertIdx--;
    if (insertIdx === fromIdx) { handleRowDragEnd(); return; }
    const reordered = siblings.slice();
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(insertIdx, 0, moved);
    // 0..n-1 に再正規化(order 重複バグの根治)
    reordered.forEach((c, i) => {
      if (c.order !== i) updateComponent(c.id, { order: i });
    });
    handleRowDragEnd();
  };

  if (!massCaseId || !massCase) {
    return <div className="text-muted p-4">ロケットデータベースが選択されていません。</div>;
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="page-title">
          <i className="bi bi-diagram-2 me-2 text-primary" />
          コンポーネント構成 — {massCase.name}
        </h1>
        <div className="action-toolbar">
          {/* Undo/Redo (componentSlice の add/update/delete のみ。⌘Z / ⌘⇧Z 対応) */}
          <div className="btn-group btn-group-sm" role="group">
            <button
              className="btn btn-outline-secondary"
              onClick={() => useMassCaseStore.getState().undo()}
              disabled={undoCount === 0}
              title={undoCount === 0 ? '取り消す操作がありません' : `直前の操作を取り消す (⌘Z) — ${undoCount}件`}
            >
              <i className="bi bi-arrow-counterclockwise" />
            </button>
            <button
              className="btn btn-outline-secondary"
              onClick={() => useMassCaseStore.getState().redo()}
              disabled={redoCount === 0}
              title={redoCount === 0 ? 'やり直す操作がありません' : `取り消した操作をやり直す (⌘⇧Z) — ${redoCount}件`}
            >
              <i className="bi bi-arrow-clockwise" />
            </button>
          </div>
          <div className="btn-group btn-group-sm" role="group">
            <button
              className={`btn ${viewMode === 'flat' ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => setViewMode('flat')}
            >
              <i className="bi bi-list-ul me-1" />リスト
            </button>
            <button
              className={`btn ${viewMode === 'map' ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => setViewMode('map')}
            >
              <i className="bi bi-diagram-3 me-1" />マップ
            </button>
          </div>
          {viewMode !== 'map' && (
            <>
              <button
                className="btn btn-outline-secondary btn-sm"
                onClick={handleCsvExport}
                title="コンポーネントデータをCSVにエクスポート"
              >
                <i className="bi bi-download me-1" />CSVエクスポート
              </button>
              <button
                className="btn btn-outline-secondary btn-sm"
                onClick={() => csvImportRef.current?.click()}
                title="CSVからコンポーネントデータをインポート"
              >
                <i className="bi bi-upload me-1" />CSVインポート
              </button>
              <input
                ref={csvImportRef}
                type="file"
                accept=".csv"
                className="d-none"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) { setCsvImportModal({ file: f, changedBy: '', evidence: '' }); e.target.value = ''; } }}
              />
            </>
          )}
          {viewMode !== 'map' && (
            <button
              className="btn btn-outline-success btn-sm"
              onClick={() => setShowCadImportModal(true)}
              title="CADデータをコンポーネントに取り込む"
            >
              <i className="bi bi-file-earmark-code me-1" />CAD取り込み
            </button>
          )}
          {viewMode !== 'map' && (
            <button className="btn btn-primary btn-sm" onClick={addRootComponent}>
              <i className="bi bi-plus-lg me-1" />
              ルート追加
            </button>
          )}
        </div>
      </div>

      {/* マップビュー */}
      {viewMode === 'map' && (
        <div className="card mb-3">
          <div className="card-header d-flex align-items-center gap-3" style={{ fontSize: '0.85rem' }}>
            <span>
              <i className="bi bi-diagram-3 me-1 text-primary" />
              依存関係マップ
            </span>
            {/* サブモード切替 */}
            <div className="btn-group btn-group-sm ms-auto" role="group">
              <button
                className={`btn ${mapSubMode === 'overview' ? 'btn-primary' : 'btn-outline-secondary'}`}
                style={{ fontSize: '0.76rem', padding: '2px 10px' }}
                onClick={() => setMapSubMode('overview')}
              >
                <i className="bi bi-map me-1" />俯瞰
              </button>
              <button
                className={`btn ${mapSubMode === 'detail' ? 'btn-primary' : 'btn-outline-secondary'}`}
                style={{ fontSize: '0.76rem', padding: '2px 10px' }}
                onClick={() => setMapSubMode('detail')}
              >
                <i className="bi bi-card-list me-1" />詳細
              </button>
            </div>
          </div>
          {mapSubMode === 'overview' ? (
            <DependencyMapOverview
              components={components}
              parameters={parameters}
              propVars={propVars}
              shapeVars={shapeVars}
            />
          ) : (
            <DependencyMap
              components={components}
              parameters={parameters}
              propVars={propVars}
              shapeVars={shapeVars}
            />
          )}
        </div>
      )}

      {/* CSV インポート中オーバーレイ (大規模ファイルでフリーズに見えないように) */}
      {csvImporting && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ background: 'rgba(0,0,0,0.45)', zIndex: 2000 }}
        >
          <div className="card p-4 shadow" style={{ minWidth: 360 }}>
            <div className="d-flex align-items-center gap-3 mb-2">
              <div className="spinner-border text-primary" role="status" style={{ width: 32, height: 32 }} />
              <div>
                <div className="fw-semibold">CSV インポート中…</div>
                <div className="text-muted small">{csvImporting.stage}</div>
              </div>
            </div>
            {/* 件数が分かれば bar 表示 (今は確定情報のみ、進行率は示さない) */}
            {csvImporting.total != null && (
              <div className="progress mt-2" style={{ height: 6 }}>
                <div
                  className="progress-bar progress-bar-striped progress-bar-animated"
                  style={{ width: '100%' }}
                />
              </div>
            )}
            <div className="text-muted mt-2" style={{ fontSize: '0.75rem' }}>
              数千行のファイルでは数秒かかります。画面を閉じずにお待ちください。
            </div>
          </div>
        </div>
      )}

      {/* CSVインポート結果バナー */}
      {csvImportError && (
        <div
          className={`alert py-2 px-3 mb-2 ${csvImportError.startsWith('エラー') ? 'alert-danger' : 'alert-success'}`}
          style={{ fontSize: '0.83rem' }}
        >
          <i className={`bi ${csvImportError.startsWith('エラー') ? 'bi-exclamation-triangle' : 'bi-check-circle'} me-1`} />
          {csvImportError}
          <button className="btn-close float-end py-1" style={{ fontSize: '0.7rem' }} onClick={() => setCsvImportError(null)} />
        </div>
      )}

      {/* ツリー / リストビュー */}
      {viewMode !== 'map' && (
      <>
      {/* card 自体を flex column 化し、内側 mm-table-wrap を flex:1 で残り高を埋める。
        * Bootstrap の .card-body は flex:1 1 auto がデフォルトで、ここで grow させると
        * mm-table-wrap と取り合って table 領域が押しつぶされる。明示的に grow:0 に。 */}
      <div className="card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="card-header d-flex align-items-center gap-2 py-2 mm-card-header" style={{ fontSize: '0.82rem', flex: '0 0 auto' }}>
          <span className="text-muted fw-semibold">表示データ</span>
          <div className="btn-group btn-group-sm" role="group">
            {([
              { id: 'mass',      label: '質量',             icon: 'graph-up' },
              { id: 'cginertia', label: '重心・慣性テンソル', icon: 'crosshair' },
              { id: 'material',  label: '材質',             icon: 'layers' },
              { id: 'mounting',  label: '搭載位置',          icon: 'rulers' },
            ] as { id: DataView; label: string; icon: string }[]).map((opt) => (
              <button
                key={opt.id}
                className={`btn ${dataView === opt.id ? 'btn-primary' : 'btn-outline-secondary'}`}
                style={{ fontSize: '0.76rem', padding: '2px 10px' }}
                onClick={() => setDataView(opt.id)}
              >
                <i className={`bi bi-${opt.icon} me-1`} />{opt.label}
              </button>
            ))}
          </div>
        </div>
        {/* タブストリップ: 複数フォルダを並行で開いて切替できる。Root タブは常に存在 */}
        {tabs.length > 1 && (
          <div
            className="d-flex align-items-end gap-1 px-2 pt-1 border-bottom"
            style={{ background: '#f1f3f5', flex: '0 0 auto', overflowX: 'auto' }}
          >
            {tabs.map((tab, idx) => {
              const isActive = idx === activeTabIdx;
              return (
                <div
                  key={`${tab.folderId ?? 'root'}-${idx}`}
                  className="d-inline-flex align-items-center gap-1 px-2 py-1"
                  style={{
                    background: isActive ? '#fff' : 'transparent',
                    borderTop: isActive ? '2px solid #0d6efd' : '2px solid transparent',
                    borderLeft: isActive ? '1px solid #dee2e6' : '1px solid transparent',
                    borderRight: isActive ? '1px solid #dee2e6' : '1px solid transparent',
                    borderTopLeftRadius: 4,
                    borderTopRightRadius: 4,
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? '#212529' : '#6c757d',
                    whiteSpace: 'nowrap',
                  }}
                  onClick={() => setActiveTabIdx(idx)}
                  title={tab.folderId ? tab.label : 'Root (全体表示)'}
                >
                  <i className={`bi bi-${tab.folderId ? 'folder2-open' : 'house-fill'}`} style={{ fontSize: '0.8rem' }} />
                  <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{tab.label}</span>
                  {idx !== 0 && (
                    <button
                      className="btn btn-sm p-0 ms-1 text-muted"
                      style={{ width: 16, height: 16, lineHeight: 1, fontSize: 10 }}
                      onClick={(e) => { e.stopPropagation(); closeTab(idx); }}
                      title="タブを閉じる"
                    >
                      <i className="bi bi-x" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="card-body py-2 border-bottom mm-card-body" style={{ background: '#f8f9fa', flex: '0 0 auto' }}>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <nav aria-label="breadcrumb" className="flex-grow-1">
              <ol className="breadcrumb mb-0" style={{ fontSize: '0.82rem' }}>
                <li className="breadcrumb-item">
                  <a href="#" onClick={(e) => { e.preventDefault(); setCurrentFolderId(null); }}
                     style={{ textDecoration: 'none' }}>
                    <i className="bi bi-house-fill me-1" />Root
                  </a>
                </li>
                {breadcrumbPath.map((bc, i) => {
                  const lid = bc.logicalId || bc.id;
                  const isLast = i === breadcrumbPath.length - 1;
                  return isLast ? (
                    <li key={lid} className="breadcrumb-item active">{bc.paramName}</li>
                  ) : (
                    <li key={lid} className="breadcrumb-item">
                      <a href="#" onClick={(e) => { e.preventDefault(); setCurrentFolderId(lid, bc.paramName); }}
                         style={{ textDecoration: 'none' }}>
                        {bc.paramName}
                      </a>
                    </li>
                  );
                })}
              </ol>
            </nav>
            {/* 絞り込みピッカー */}
            <div ref={scopePickerRef} style={{ position: 'relative' }}>
              <button
                className="btn btn-sm btn-outline-secondary"
                onClick={() => { setScopePickerOpen((v) => !v); setScopePickerQuery(''); }}
                title="特定のコンポーネント以下に絞り込み"
              >
                <i className="bi bi-funnel me-1" />絞り込み
              </button>
              {scopePickerOpen && (
                <div
                  className="shadow border bg-white rounded"
                  style={{ position: 'absolute', top: '100%', right: 0, zIndex: 1050, minWidth: 280, marginTop: 4, padding: 8, fontSize: '0.82rem' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    className="form-control form-control-sm mb-2"
                    placeholder="コンポーネント名で検索…"
                    value={scopePickerQuery}
                    onChange={(e) => setScopePickerQuery(e.target.value)}
                    autoFocus
                  />
                  <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                    <button
                      className="btn btn-sm btn-link text-start w-100 px-2 py-1"
                      style={{ textDecoration: 'none', fontSize: '0.82rem' }}
                      onClick={() => { setCurrentFolderId(null); setScopePickerOpen(false); }}
                    >
                      <i className="bi bi-house-fill me-1" />Root（全て表示）
                    </button>
                    {(() => {
                      const q = scopePickerQuery.trim().toLowerCase();
                      const matched = components
                        .filter((c) => !q || c.paramName.toLowerCase().includes(q) || (c.varName ?? '').toLowerCase().includes(q))
                        .sort((a, b) => a.level - b.level || a.order - b.order)
                        .slice(0, 100);
                      if (matched.length === 0) return <div className="text-muted px-2 py-1">該当なし</div>;
                      return matched.map((c) => {
                        const lid = c.logicalId || c.id;
                        const indent = '　'.repeat(c.level);
                        return (
                          <button
                            key={c.id}
                            className="btn btn-sm btn-link text-start w-100 px-2 py-1"
                            style={{ textDecoration: 'none', fontSize: '0.82rem' }}
                            onClick={() => { setCurrentFolderId(lid, c.paramName); setScopePickerOpen(false); }}
                          >
                            <span className="text-muted me-1">{indent}</span>
                            <i className="bi bi-box me-1 text-muted" />
                            {c.paramName}
                            {c.varName && <span className="text-muted ms-1" style={{ fontSize: '0.72rem' }}>({c.varName})</span>}
                          </button>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="table-responsive mm-table-wrap" style={{ ['--mm-col1-w' as never]: `${col1Width}px` }}>
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                {/* 注意: 子要素に position:relative + z-index を付けると、
                  *   親(th)の position:sticky が予期せず外れて 縦スクロールで列見出しが
                  *   流れ去るバグが発生する (一部 Chromium ビルドで再現)。
                  *   よってラッパー span は使わず、resizer 側を pointer-events:auto
                  *   なまま絶対配置するに留める。 */}
                <th>
                  コンポーネント名
                  <span
                    className={`mm-col1-resizer ${col1Dragging ? 'dragging' : ''}`}
                    onMouseDown={onCol1ResizerMouseDown}
                    title="ドラッグして列幅を調整"
                  />
                </th>
                <th style={{ width: 72 }}>段</th>
                <th style={{ width: 110 }}>タグ</th>
                {dataView === 'mass' && <>
                  <th style={{ minWidth: 120 }}>変数名</th>
                  <th style={{ minWidth: 240 }}>システム配分値 (kg)</th>
                  <th className="text-end" style={{ minWidth: 100 }}>実質量 (kg)</th>
                  <th className="text-end" style={{ minWidth: 90 }}>差分 (kg)</th>
                </>}
                {dataView === 'cginertia' && <>
                  <th style={{ minWidth: 60 }}>座標系</th>
                  <th style={{ minWidth: 100 }}>状態</th>
                  <th className="text-end" style={{ minWidth: 90 }}>原点X (m)</th>
                  <th className="text-end" style={{ minWidth: 90 }}>原点Y (m)</th>
                  <th className="text-end" style={{ minWidth: 90 }}>原点Z (m)</th>
                  <th className="text-end" style={{ minWidth: 95 }}>CG-X (m)</th>
                  <th className="text-end" style={{ minWidth: 95 }}>CG-Y (m)</th>
                  <th className="text-end" style={{ minWidth: 95 }}>CG-Z (m)</th>
                  <th className="text-end" style={{ minWidth: 100 }}>Ixx (kg·m²)</th>
                  <th className="text-end" style={{ minWidth: 100 }}>Iyy (kg·m²)</th>
                  <th className="text-end" style={{ minWidth: 100 }}>Izz (kg·m²)</th>
                  <th className="text-end" style={{ minWidth: 100 }}>Ixy (kg·m²)</th>
                  <th className="text-end" style={{ minWidth: 100 }}>Ixz (kg·m²)</th>
                  <th className="text-end" style={{ minWidth: 100 }}>Iyz (kg·m²)</th>
                </>}
                {dataView === 'material' && <>
                  <th style={{ minWidth: 130 }}>材質名</th>
                  <th className="text-end" style={{ minWidth: 140 }}>密度</th>
                </>}
                {dataView === 'mounting' && <>
                  <th className="text-end" style={{ minWidth: 110 }}>搭載X始点 (m)</th>
                  <th className="text-end" style={{ minWidth: 110 }}>搭載X終点 (m)</th>
                  <th className="text-end" style={{ minWidth: 100 }}>搭載Y始点 (m)</th>
                  <th className="text-end" style={{ minWidth: 100 }}>搭載Y終点 (m)</th>
                  <th className="text-end" style={{ minWidth: 100 }}>搭載Z始点 (m)</th>
                  <th className="text-end" style={{ minWidth: 100 }}>搭載Z終点 (m)</th>
                </>}
                <th className="col-actions" style={{ minWidth: 160 }}><i className="bi bi-gear" /></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center text-muted py-5">
                    <i className={`bi bi-${currentFolderId ? 'folder2-open' : 'diagram-2'} fs-3 d-block mb-2 opacity-25`} />
                    <div>{currentFolderId ? 'このフォルダにはコンポーネントがありません' : 'コンポーネントがありません'}</div>
                    <button className="btn btn-primary btn-sm mt-2" onClick={addRootComponent}>
                      <i className="bi bi-plus-lg me-1" />
                      {currentFolderId ? 'コンポーネントを追加' : 'ルートコンポーネントを追加'}
                    </button>
                  </td>
                </tr>
              ) : (
                rows.map(({ comp, depth }) => (
                  <ComponentRow
                    key={comp.id}
                    comp={comp}
                    depth={depth}
                    isCollapsed={collapsed.has(comp.id)}
                    hasChildren={(childrenOf.get(comp.logicalId || comp.id)?.length ?? 0) > 0}
                    isCadBound={boundComponentIds.has(comp.id)}
                    onToggle={() =>
                      setCollapsed((prev) => {
                        const next = new Set(prev);
                        if (next.has(comp.id)) next.delete(comp.id);
                        else next.add(comp.id);
                        return next;
                      })
                    }
                    onEdit={(field, value) => handleEdit(comp.id, field, value)}
                    onAddChild={() => addChildComponent(comp)}
                    onDelete={() => deleteComponent(comp.id)}
                    onRowDragStart={() => handleRowDragStart(comp)}
                    onRowDragEnd={handleRowDragEnd}
                    onRowDragOver={(e) => handleRowDragOver(e, comp)}
                    onRowDrop={(e) => handleRowDrop(e, comp)}
                    isRowDragging={draggingId === comp.id}
                    rowDropIndicator={dropTarget?.id === comp.id ? dropTarget.pos : null}
                    dataView={dataView}
                    computedMass={computedMasses.get(comp.id) ?? null}
                    computedMassExists={computedMasses.has(comp.id)}
                    aggregatedActualMass={actualMassAggregated.get(comp.id)}
                    childrenSumActualMass={childrenSumActualMassMap.get(comp.id)}
                    aggregatedCG={cgAggregatedMap.get(comp.id)}
                    aggregatedInertia={inertiaAggregatedMap.get(comp.id)}
                    aggregatedMount={mountAggregatedMap.get(comp.id)}
                    onUpdateData={(updates) => updateComponent(comp.id, updates)}
                    onOpenFieldEntry={(field, label, val, step, extra) => openFieldEntry(comp, field, label, val, step, extra)}
                    onOpenCgInertiaEdit={() => openCgInertiaEdit(comp)}
                    onOpenMountEdit={() => openMountEdit(comp)}
                    onOpenMaterialEdit={() => openMaterialEdit(comp)}
                    onOpenInputValueEdit={() => openInputValueEdit(comp)}
                    onOpenFieldHistory={() => setHistoryTarget(comp)}
                    historyCount={historyCountMap.get(comp.id) ?? 0}
                    onNavigateInto={() => openInNewTab(comp.logicalId || comp.id, comp.paramName || '(無名)')}
                    tagDefinitions={massCase.tagDefinitions ?? []}
                    onSaveTagDefs={(defs) => updateCase(massCase.id, { tagDefinitions: defs })}
                    onOpenTagMgr={() => {
                      const defs = massCase.tagDefinitions ?? [];
                      const init: Record<string, { name: string; color: string }> = {};
                      defs.forEach((d) => { init[d.id] = { name: d.name, color: d.color }; });
                      setTagMgrEdits(init);
                      setTagDeleteConfirm(null);
                      setShowTagMgr(true);
                    }}
                    onMove={() => setMoveTarget(comp)}
                    linkColor={comp.linkGroupId ? linkGroupColorMap.get(comp.linkGroupId) : undefined}
                    onOpenLinkPanel={() => setLinkPanelTarget(comp)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* /viewMode !== 'map' */}
      </>
      )}


      {/* ── 重心・慣性テンソル一括編集モーダル ── */}
      {cgInertiaEditState && (() => {
        const { comp } = cgInertiaEditState;
        const f = cgInertiaForm;
        const setF = (patch: Partial<CgInertiaForm>) => setCgInertiaForm((prev) => ({ ...prev, ...patch }));
        // 集計/入力 はモーダル内のトグルから取得(行のバッジは表示のみ)
        const hasChildren = (childrenOf.get(comp.logicalId || comp.id)?.length ?? 0) > 0;
        const isAggregate = hasChildren && f.mode === 'aggregate';
        // 集計モード時は実 input value をフォームでなく aggregated 値で上書き表示する
        // (disabled でグレーアウト状態のまま、ハイフン placeholder ではなく実値を見せたい)
        const aggCG = cgAggregatedMap.get(comp.id) ?? null;
        const aggIn = inertiaAggregatedMap.get(comp.id) ?? null;
        const aggregateValueMap: Partial<Record<keyof CgInertiaForm, number | null>> = {
          cgX: aggCG?.x ?? null, cgY: aggCG?.y ?? null, cgZ: aggCG?.z ?? null,
          ixx: aggIn?.ixx ?? null, iyy: aggIn?.iyy ?? null, izz: aggIn?.izz ?? null,
          ixy: aggIn?.ixy ?? null, ixz: aggIn?.ixz ?? null, iyz: aggIn?.iyz ?? null,
        };
        const numField = (label: string, key: keyof CgInertiaForm, unit = 'm') => {
          const aggVal = isAggregate ? aggregateValueMap[key] : undefined;
          const displayValue = isAggregate
            ? (aggVal != null ? aggVal.toFixed(unit.startsWith('kg') ? 4 : 3) : '')
            : (f[key] as string);
          return (
            <div className="mb-2">
              <label className="form-label fw-medium" style={{ fontSize: '0.82rem' }}>{label} <span className="text-muted fw-normal">({unit})</span></label>
              <input
                className="form-control form-control-sm font-monospace"
                type="text"
                value={displayValue}
                onChange={(e) => !isAggregate && setF({ [key]: e.target.value } as Partial<CgInertiaForm>)}
                placeholder=""
                disabled={isAggregate}
              />
            </div>
          );
        };
        return (
          <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.45)', zIndex: 1060 }} onClick={() => setCgInertiaEditState(null)}>
            <div className="modal-dialog modal-lg modal-dialog-scrollable" onClick={(e) => e.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header py-2">
                  <h5 className="modal-title">
                    <i className="bi bi-crosshair me-2 text-primary" />
                    重心・慣性テンソル編集 — {comp.paramName}
                  </h5>
                  <button className="btn-close" onClick={() => setCgInertiaEditState(null)} />
                </div>
                <div className="modal-body">
                  {/* 集計/入力 モード切り替え(子要素を持つ場合のみ。leaf は常に手入力) */}
                  {hasChildren && (
                    <div className="mb-3 p-2 border rounded" style={{ background: '#fff8e1' }}>
                      <div className="fw-semibold mb-2" style={{ fontSize: '0.85rem' }}>
                        <i className="bi bi-toggles me-1 text-secondary" />状態
                      </div>
                      <div className="d-flex gap-3 align-items-center">
                        <div className="form-check">
                          <input className="form-check-input" type="radio" id="cgmode-aggregate" name="cgMode" value="aggregate"
                            checked={f.mode === 'aggregate'} onChange={() => setF({ mode: 'aggregate' })} />
                          <label className="form-check-label" htmlFor="cgmode-aggregate" style={{ fontSize: '0.85rem' }}>
                            集計 <span className="text-muted">— 子要素から自動算出</span>
                          </label>
                        </div>
                        <div className="form-check">
                          <input className="form-check-input" type="radio" id="cgmode-manual" name="cgMode" value="manual"
                            checked={f.mode === 'manual'} onChange={() => setF({ mode: 'manual' })} />
                          <label className="form-check-label" htmlFor="cgmode-manual" style={{ fontSize: '0.85rem' }}>
                            入力 <span className="text-muted">— 子要素からの集計値を上書き</span>
                          </label>
                        </div>
                      </div>
                      {isAggregate && (
                        <div className="text-muted mt-1" style={{ fontSize: '0.78rem' }}>
                          <i className="bi bi-info-circle me-1" />
                          集計モード中は下記フィールドは編集できません。「入力」に切り替えて手入力できます。
                        </div>
                      )}
                    </div>
                  )}
                  {/* 座標系 */}
                  <div className="mb-3 p-2 border rounded" style={{ background: '#f8f9fa' }}>
                    <div className="fw-semibold mb-2" style={{ fontSize: '0.85rem' }}>
                      <i className="bi bi-globe me-1 text-secondary" />座標系
                    </div>
                    <div className="d-flex gap-2 align-items-center">
                      <div className="form-check">
                        <input className="form-check-input" type="radio" id="cg-ref-local" name="cgRef" value="local"
                          checked={!isAggregate && f.cgReference === 'local'} onChange={() => setF({ cgReference: 'local' })}
                          disabled={isAggregate} />
                        <label className="form-check-label" htmlFor="cg-ref-local" style={{ fontSize: '0.85rem' }}>局所座標系</label>
                      </div>
                      <div className="form-check">
                        <input className="form-check-input" type="radio" id="cg-ref-global" name="cgRef" value="global"
                          checked={isAggregate || f.cgReference === 'global'} onChange={() => setF({ cgReference: 'global' })}
                          disabled={isAggregate} />
                        <label className="form-check-label" htmlFor="cg-ref-global" style={{ fontSize: '0.85rem' }}>全機座標系</label>
                      </div>
                      {isAggregate && (
                        <span className="text-muted" style={{ fontSize: '0.78rem' }}>
                          (集計モードは全機座標系で固定)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 原点 */}
                  {f.cgReference === 'local' && (
                    <div className="mb-3 p-2 border rounded" style={{ background: '#f8f9fa' }}>
                      <div className="fw-semibold mb-2" style={{ fontSize: '0.85rem' }}>
                        <i className="bi bi-pin-map me-1 text-secondary" />局所原点
                      </div>
                      <div className="row g-2">
                        <div className="col-4">{numField('原点 X', 'localOriginX')}</div>
                        <div className="col-4">{numField('原点 Y', 'localOriginY')}</div>
                        <div className="col-4">{numField('原点 Z', 'localOriginZ')}</div>
                      </div>
                    </div>
                  )}

                  {/* CG */}
                  <div className="mb-3 p-2 border rounded" style={{ background: '#f8f9fa' }}>
                    <div className="fw-semibold mb-2" style={{ fontSize: '0.85rem' }}>
                      <i className="bi bi-crosshair me-1 text-secondary" />重心 CG
                    </div>
                    <div className="row g-2">
                      <div className="col-4">{numField('CG-X', 'cgX')}</div>
                      <div className="col-4">{numField('CG-Y', 'cgY')}</div>
                      <div className="col-4">{numField('CG-Z', 'cgZ')}</div>
                    </div>
                  </div>

                  {/* 慣性テンソル */}
                  <div className="mb-3 p-2 border rounded" style={{ background: '#f8f9fa' }}>
                    <div className="fw-semibold mb-2" style={{ fontSize: '0.85rem' }}>
                      <i className="bi bi-grid-3x3 me-1 text-secondary" />慣性テンソル
                    </div>
                    <div className="row g-2">
                      <div className="col-4">{numField('Ixx', 'ixx', 'kg·m²')}</div>
                      <div className="col-4">{numField('Iyy', 'iyy', 'kg·m²')}</div>
                      <div className="col-4">{numField('Izz', 'izz', 'kg·m²')}</div>
                      <div className="col-4">{numField('Ixy', 'ixy', 'kg·m²')}</div>
                      <div className="col-4">{numField('Ixz', 'ixz', 'kg·m²')}</div>
                      <div className="col-4">{numField('Iyz', 'iyz', 'kg·m²')}</div>
                    </div>
                  </div>

                  {/* エビデンス(モード変更時の記録にも使う) */}
                  <div className="mb-2">
                    <label className="form-label fw-medium" style={{ fontSize: '0.85rem' }}>記入者</label>
                    <input className="form-control form-control-sm" value={f.changedBy}
                      onChange={(e) => setF({ changedBy: e.target.value })} placeholder="例: 山田太郎" />
                  </div>
                  <div className="mb-0">
                    <label className="form-label fw-medium" style={{ fontSize: '0.85rem' }}>エビデンス・備考</label>
                    <textarea className="form-control form-control-sm" rows={2} value={f.evidence}
                      onChange={(e) => setF({ evidence: e.target.value })}
                      placeholder="例: 試験計測値。TR-2026-003 参照。" />
                  </div>
                </div>
                <div className="modal-footer py-2">
                  <button className="btn btn-secondary btn-sm" onClick={() => setCgInertiaEditState(null)}>キャンセル</button>
                  <button className="btn btn-primary btn-sm" onClick={handleCgInertiaSubmit}>
                    <i className="bi bi-check-lg me-1" />保存
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── 統合フィールド記録モーダル ── */}
      {fieldEntryState && (() => {
        const { field, fieldLabel, step } = fieldEntryState;
        const isMaterial = field === 'materialName';
        const isDensity = field === 'materialDensity';
        const isActualMass = field === 'actualMass';
        const compHasChildren = fieldEntryState.hasChildren ?? false;
        const allMaterialCats = [...new Set(MATERIAL_PRESETS.map((m) => m.category))];
        const presetsForCat: ReturnType<typeof getMaterialsByCategory>[string] = fieldEntryMaterialCat
          ? (getMaterialsByCategory()[fieldEntryMaterialCat] ?? [])
          : [];
        return (
          <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)', zIndex: 1060 }}>
            <div className="modal-dialog modal-sm">
              <div className="modal-content">
                <div className="modal-header py-2">
                  <h6 className="modal-title">
                    <i className="bi bi-pencil-square me-2 text-primary" />{fieldLabel}を記録
                  </h6>
                  <button className="btn-close btn-sm" onClick={() => setFieldEntryState(null)} />
                </div>
                <div className="modal-body">
                  <div className="mb-2 text-muted" style={{ fontSize: '0.78rem' }}>
                    <i className="bi bi-box me-1" />{fieldEntryState.comp.paramName}
                  </div>
                  {isActualMass && (
                    <div className="mb-3">
                      <label className="form-label fw-medium" style={{ fontSize: '0.85rem' }}>タイプ</label>
                      <div className="d-flex gap-3">
                        <div className="form-check mb-0">
                          <input
                            className="form-check-input"
                            type="radio"
                            id="am-mode-fixed"
                            name="actualMassMode"
                            value="fixed"
                            checked={actualMassMode === 'fixed'}
                            onChange={() => setActualMassMode('fixed')}
                          />
                          <label className="form-check-label" htmlFor="am-mode-fixed" style={{ fontSize: '0.85rem' }}>
                            固定値
                          </label>
                        </div>
                        <div className="form-check mb-0">
                          <input
                            className="form-check-input"
                            type="radio"
                            id="am-mode-aggregate"
                            name="actualMassMode"
                            value="aggregate"
                            checked={actualMassMode === 'aggregate'}
                            onChange={() => setActualMassMode('aggregate')}
                            disabled={!compHasChildren}
                          />
                          <label
                            className={`form-check-label${!compHasChildren ? ' text-muted' : ''}`}
                            htmlFor="am-mode-aggregate"
                            style={{ fontSize: '0.85rem' }}
                            title={!compHasChildren ? '子コンポーネントがないため集計は選択できません' : '子コンポーネントの合計値を使用します'}
                          >
                            集計（子の合計）
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                  {isMaterial ? (
                    <>
                      <div className="mb-2">
                        <label className="form-label fw-medium" style={{ fontSize: '0.85rem' }}>カテゴリで絞り込み</label>
                        <select
                          className="form-select form-select-sm"
                          value={fieldEntryMaterialCat}
                          onChange={(e) => {
                            setFieldEntryMaterialCat(e.target.value);
                            setFieldEntryForm((prev) => ({ ...prev, value: '' }));
                          }}
                        >
                          <option value="">— カテゴリを選択 —</option>
                          {allMaterialCats.map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>
                      {fieldEntryMaterialCat && (
                        <div className="mb-2">
                          <label className="form-label fw-medium" style={{ fontSize: '0.85rem' }}>材質プリセット</label>
                          <select
                            className="form-select form-select-sm"
                            value={fieldEntryForm.value}
                            onChange={(e) => setFieldEntryForm((prev) => ({ ...prev, value: e.target.value }))}
                          >
                            <option value="">— プリセットを選択 —</option>
                            {presetsForCat.map((p) => (
                              <option key={p.name} value={p.name}>
                                {p.name} ({p.density.toLocaleString()} kg/m³)
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="mb-2">
                        <label className="form-label fw-medium" style={{ fontSize: '0.85rem' }}>
                          材質名 <span className="text-muted fw-normal" style={{ fontSize: '0.75rem' }}>（直接入力も可）</span>
                        </label>
                        <input
                          className="form-control form-control-sm"
                          value={fieldEntryForm.value}
                          onChange={(e) => setFieldEntryForm((prev) => ({ ...prev, value: e.target.value }))}
                          placeholder="例: アルミ合金 A2024-T3"
                        />
                      </div>
                    </>
                  ) : isDensity ? (
                    <div className="mb-2">
                      <label className="form-label fw-medium" style={{ fontSize: '0.85rem' }}>
                        密度 <span className="text-danger">*</span>
                      </label>
                      <div className="d-flex gap-2">
                        <input
                          className="form-control form-control-sm font-monospace"
                          type="number"
                          step="any"
                          value={fieldEntryForm.value}
                          onChange={(e) => setFieldEntryForm((prev) => ({ ...prev, value: e.target.value }))}
                          onKeyDown={(e) => e.key === 'Enter' && handleFieldEntrySubmit()}
                          autoFocus
                          placeholder="値を入力"
                        />
                        <select
                          className="form-select form-select-sm"
                          style={{ width: 100, flexShrink: 0 }}
                          value={fieldEntryDensityUnit}
                          onChange={(e) => {
                            const newUnit = e.target.value as DensityUnit;
                            const currentNum = parseFloat(fieldEntryForm.value);
                            if (isFinite(currentNum)) {
                              const internalKgM3 = densityToInternal(currentNum, fieldEntryDensityUnit);
                              const newDisplay = densityFromInternal(internalKgM3, newUnit);
                              setFieldEntryForm((prev) => ({ ...prev, value: String(newDisplay) }));
                            }
                            setFieldEntryDensityUnit(newUnit);
                          }}
                        >
                          {DENSITY_UNITS.map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-2">
                      <label className="form-label fw-medium" style={{ fontSize: '0.85rem' }}>
                        {fieldLabel}
                        {!(isActualMass && actualMassMode === 'aggregate') && <span className="text-danger"> *</span>}
                      </label>
                      {isActualMass && actualMassMode === 'aggregate' ? (
                        <div
                          className="form-control form-control-sm font-monospace bg-light text-muted"
                          style={{ cursor: 'default', fontSize: '0.82rem' }}
                        >
                          子コンポーネントの合計を使用
                        </div>
                      ) : (
                        <input
                          className="form-control form-control-sm font-monospace"
                          type="number"
                          step={step}
                          value={fieldEntryForm.value}
                          onChange={(e) => setFieldEntryForm((prev) => ({ ...prev, value: e.target.value }))}
                          onKeyDown={(e) => e.key === 'Enter' && handleFieldEntrySubmit()}
                          autoFocus
                          placeholder="値を入力"
                        />
                      )}
                    </div>
                  )}
                  <div className="mb-2">
                    <label className="form-label fw-medium" style={{ fontSize: '0.85rem' }}>記入者</label>
                    <input
                      className="form-control form-control-sm"
                      value={fieldEntryForm.changedBy}
                      onChange={(e) => setFieldEntryForm((prev) => ({ ...prev, changedBy: e.target.value }))}
                      placeholder="例: 山田太郎"
                    />
                  </div>
                  <div className="mb-0">
                    <label className="form-label fw-medium" style={{ fontSize: '0.85rem' }}>エビデンス・備考</label>
                    <textarea
                      className="form-control form-control-sm"
                      rows={2}
                      value={fieldEntryForm.evidence}
                      onChange={(e) => setFieldEntryForm((prev) => ({ ...prev, evidence: e.target.value }))}
                      placeholder="例: 試験計測値。TR-2026-003 参照。"
                    />
                  </div>
                  {renderAttachDocSection()}
                </div>
                <div className="modal-footer py-2">
                  <button className="btn btn-secondary btn-sm" onClick={() => setFieldEntryState(null)}>キャンセル</button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleFieldEntrySubmit}
                    disabled={
                      isActualMass
                        ? (actualMassMode === 'fixed' && fieldEntryForm.value.trim() === '')
                        : fieldEntryForm.value.trim() === ''
                    }
                  >
                    記録する
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── CSVインポート確認モーダル ── */}
      {csvImportModal && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)', zIndex: 1060 }}>
          <div className="modal-dialog modal-dialog-centered modal-sm">
            <div className="modal-content">
              <div className="modal-header py-2">
                <h6 className="modal-title">
                  <i className="bi bi-upload me-2 text-primary" />CSVインポート
                </h6>
                <button className="btn-close btn-sm" onClick={() => setCsvImportModal(null)} />
              </div>
              <div className="modal-body">
                <div className="mb-2 text-muted" style={{ fontSize: '0.78rem' }}>
                  <i className="bi bi-file-earmark-spreadsheet me-1" />{csvImportModal.file.name}
                </div>
                <div className="alert alert-info py-2" style={{ fontSize: '0.78rem' }}>
                  CSV内の各コンポーネントについて、変更項目を変更履歴に記録します。
                </div>
                <div className="mb-2">
                  <label className="form-label fw-medium" style={{ fontSize: '0.85rem' }}>記入者</label>
                  <input
                    className="form-control form-control-sm"
                    value={csvImportModal.changedBy}
                    onChange={(e) => setCsvImportModal((p) => p ? { ...p, changedBy: e.target.value } : p)}
                    placeholder="例: 山田太郎"
                    autoFocus
                  />
                </div>
                <div className="mb-0">
                  <label className="form-label fw-medium" style={{ fontSize: '0.85rem' }}>エビデンス・備考</label>
                  <textarea
                    className="form-control form-control-sm"
                    rows={2}
                    value={csvImportModal.evidence}
                    onChange={(e) => setCsvImportModal((p) => p ? { ...p, evidence: e.target.value } : p)}
                    placeholder={`例: ${csvImportModal.file.name} を取り込み`}
                  />
                </div>
              </div>
              <div className="modal-footer py-2">
                <button className="btn btn-secondary btn-sm" onClick={() => setCsvImportModal(null)}>キャンセル</button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    const m = csvImportModal;
                    handleCsvImport(m.file, m.changedBy.trim(), m.evidence.trim() || `CSVインポート: ${m.file.name}`);
                    setCsvImportModal(null);
                  }}
                >
                  取り込む
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 入力タイプ + 値/計算式 統合モーダル ── */}
      {inputValueTarget && (() => {
        const isFormula = inputValueForm.inputType === 'formula';
        const isAggregate = inputValueForm.inputType === 'aggregate';
        const componentVars = components
          .filter((c) => c.varName && c.id !== inputValueTarget.id)
          .map((c) => ({ varName: c.varName, label: c.paramName }));
        const paramVars = parameters
          .filter((p) => p.varName)
          .map((p) => ({ varName: p.varName, label: p.name }));
        const externalVars = [...shapeVars, ...propVars];
        return (
          <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)', zIndex: 1060 }}>
            <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 560 }}>
              <div className="modal-content">
                <div className="modal-header py-2">
                  <h6 className="modal-title">
                    <i className="bi bi-pencil-square me-2 text-primary" />入力タイプ・値を変更
                  </h6>
                  <button className="btn-close btn-sm" onClick={() => setInputValueTarget(null)} />
                </div>
                <div className="modal-body">
                  <div className="mb-2 text-muted" style={{ fontSize: '0.78rem' }}>
                    <i className="bi bi-box me-1" />{inputValueTarget.paramName}
                  </div>
                  <div className="mb-2">
                    <label className="form-label fw-medium" style={{ fontSize: '0.85rem' }}>入力タイプ <span className="text-danger">*</span></label>
                    <select
                      className="form-select form-select-sm"
                      value={inputValueForm.inputType}
                      onChange={(e) => setInputValueForm((p) => ({ ...p, inputType: e.target.value as ComponentInputType }))}
                    >
                      {(Object.entries(INPUT_TYPE_LABELS) as [ComponentInputType, string][])
                        .filter(([k]) => k !== 'design_var' || sizingEnabled)
                        .map(([k, v]) => (
                          <option key={k} value={k} style={{ color: INPUT_TYPE_BADGE[k] }}>{v}</option>
                        ))}
                    </select>
                  </div>
                  {!isAggregate && (
                    <div className="mb-2">
                      <label className="form-label fw-medium" style={{ fontSize: '0.85rem' }}>
                        {isFormula ? '計算式' : '値'} <span className="text-danger">*</span>
                      </label>
                      <input
                        ref={formulaInputRef}
                        className="form-control form-control-sm font-monospace"
                        type="text"
                        value={inputValueForm.valueOrFormula}
                        onChange={(e) => setInputValueForm((p) => ({ ...p, valueOrFormula: e.target.value }))}
                        placeholder={isFormula ? '例: m_eng1 * 2 + 5' : '例: 12.5'}
                        autoFocus
                      />
                    </div>
                  )}
                  {isFormula && (
                    <div className="mb-2 p-2 bg-light rounded" style={{ fontSize: '0.78rem' }}>
                      {paramVars.length > 0 && (
                        <div className="mb-2">
                          <span className="text-muted fw-semibold me-1">パラメータ変数:</span>
                          <div className="d-flex flex-wrap gap-1 mt-1">
                            {paramVars.map((v) => (
                              <button key={v.varName} type="button"
                                className="btn btn-outline-secondary btn-sm py-0 font-monospace"
                                style={{ fontSize: '0.72rem' }}
                                title={v.label}
                                onClick={() => insertAtFormulaCursor(v.varName)}>
                                {v.varName}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {componentVars.length > 0 && (
                        <div className="mb-2">
                          <span className="text-muted fw-semibold me-1">コンポーネント変数:</span>
                          <div className="d-flex flex-wrap gap-1 mt-1">
                            {componentVars.map((v) => (
                              <button key={v.varName} type="button"
                                className="btn btn-outline-success btn-sm py-0 font-monospace"
                                style={{ fontSize: '0.72rem' }}
                                title={v.label}
                                onClick={() => insertAtFormulaCursor(v.varName)}>
                                {v.varName}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {externalVars.length > 0 && (
                        <div className="mb-2">
                          <span className="text-muted fw-semibold me-1">外部参照変数:</span>
                          <div className="d-flex flex-wrap gap-1 mt-1">
                            {externalVars.map((v) => (
                              <button key={v.varName} type="button"
                                className="btn btn-outline-primary btn-sm py-0 font-monospace"
                                style={{ fontSize: '0.72rem' }}
                                title={v.description}
                                onClick={() => insertAtFormulaCursor(v.varName)}>
                                {v.varName}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div>
                        <span className="text-muted fw-semibold me-1">数学関数:</span>
                        <div className="d-flex flex-wrap gap-1 mt-1">
                          {MATH_FUNCTIONS_LIST.map((fn) => (
                            <button key={fn} type="button"
                              className="btn btn-outline-info btn-sm py-0 font-monospace"
                              style={{ fontSize: '0.72rem' }}
                              onClick={() => insertAtFormulaCursor(fn)}>
                              {fn}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="mb-2">
                    <label className="form-label fw-medium" style={{ fontSize: '0.85rem' }}>記入者</label>
                    <input
                      className="form-control form-control-sm"
                      value={inputValueForm.changedBy}
                      onChange={(e) => setInputValueForm((p) => ({ ...p, changedBy: e.target.value }))}
                      placeholder="例: 山田太郎"
                    />
                  </div>
                  <div className="mb-0">
                    <label className="form-label fw-medium" style={{ fontSize: '0.85rem' }}>エビデンス・備考</label>
                    <textarea
                      className="form-control form-control-sm"
                      rows={2}
                      value={inputValueForm.evidence}
                      onChange={(e) => setInputValueForm((p) => ({ ...p, evidence: e.target.value }))}
                      placeholder="例: 設計レビューNo.3 で決定"
                    />
                  </div>
                  {renderAttachDocSection()}
                </div>
                <div className="modal-footer py-2">
                  <button className="btn btn-secondary btn-sm" onClick={() => setInputValueTarget(null)}>キャンセル</button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleInputValueSubmit}
                    disabled={!isAggregate && inputValueForm.valueOrFormula.trim() === ''}
                  >
                    記録する
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── 重心セット編集モーダル ── */}
      {cgEditTarget && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)', zIndex: 1060 }}>
          <div className="modal-dialog modal-sm">
            <div className="modal-content">
              <div className="modal-header py-2">
                <h6 className="modal-title"><i className="bi bi-pencil-square me-2 text-primary" />重心 (CG) を編集</h6>
                <button className="btn-close btn-sm" onClick={() => setCgEditTarget(null)} />
              </div>
              <div className="modal-body">
                <div className="mb-2 text-muted" style={{ fontSize: '0.78rem' }}>
                  <i className="bi bi-box me-1" />{cgEditTarget.paramName}
                </div>
                <div className="mb-2">
                  <label className="form-label fw-medium" style={{ fontSize: '0.85rem' }}>座標系</label>
                  <select className="form-select form-select-sm" value={cgEditForm.cgReference}
                    onChange={(e) => setCgEditForm(p => ({ ...p, cgReference: e.target.value as 'local' | 'global' }))}>
                    <option value="local">局所座標系</option>
                    <option value="global">全機座標系</option>
                  </select>
                </div>
                <div className="row g-2 mb-2">
                  {(['cgX', 'cgY', 'cgZ'] as const).map((f, i) => (
                    <div className="col-4" key={f}>
                      <label className="form-label fw-medium" style={{ fontSize: '0.85rem' }}>{['X (m)', 'Y (m)', 'Z (m)'][i]}</label>
                      <input className="form-control form-control-sm font-monospace" type="number" step="any"
                        value={cgEditForm[f]} onChange={(e) => setCgEditForm(p => ({ ...p, [f]: e.target.value }))}
                        autoFocus={i === 0} placeholder="—" />
                    </div>
                  ))}
                </div>
                <div className="mb-2">
                  <label className="form-label fw-medium" style={{ fontSize: '0.85rem' }}>記入者</label>
                  <input className="form-control form-control-sm" value={cgEditForm.changedBy}
                    onChange={(e) => setCgEditForm(p => ({ ...p, changedBy: e.target.value }))} placeholder="例: 山田太郎" />
                </div>
                <div className="mb-0">
                  <label className="form-label fw-medium" style={{ fontSize: '0.85rem' }}>エビデンス・備考</label>
                  <textarea className="form-control form-control-sm" rows={2} value={cgEditForm.evidence}
                    onChange={(e) => setCgEditForm(p => ({ ...p, evidence: e.target.value }))} placeholder="例: CAD計算値。" />
                </div>
                {renderAttachDocSection()}
              </div>
              <div className="modal-footer py-2">
                <button className="btn btn-secondary btn-sm" onClick={() => setCgEditTarget(null)}>キャンセル</button>
                <button className="btn btn-primary btn-sm" onClick={handleCgEditSubmit}>記録する</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 慣性テンソルセット編集モーダル ── */}
      {inertiaEditTarget && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)', zIndex: 1060 }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header py-2">
                <h6 className="modal-title"><i className="bi bi-pencil-square me-2 text-primary" />慣性テンソルを編集</h6>
                <button className="btn-close btn-sm" onClick={() => setInertiaEditTarget(null)} />
              </div>
              <div className="modal-body">
                <div className="mb-2 text-muted" style={{ fontSize: '0.78rem' }}>
                  <i className="bi bi-box me-1" />{inertiaEditTarget.paramName}
                </div>
                <div className="row g-2 mb-2">
                  {(['ixx', 'iyy', 'izz', 'ixy', 'ixz', 'iyz'] as const).map((f, i) => (
                    <div className="col-4" key={f}>
                      <label className="form-label fw-medium" style={{ fontSize: '0.85rem' }}>{f.charAt(0).toUpperCase() + f.slice(1)} (kg·m²)</label>
                      <input className="form-control form-control-sm font-monospace" type="number" step="any"
                        value={inertiaEditForm[f]} onChange={(e) => setInertiaEditForm(p => ({ ...p, [f]: e.target.value }))}
                        autoFocus={i === 0} placeholder="—" />
                    </div>
                  ))}
                </div>
                <div className="mb-2">
                  <label className="form-label fw-medium" style={{ fontSize: '0.85rem' }}>記入者</label>
                  <input className="form-control form-control-sm" value={inertiaEditForm.changedBy}
                    onChange={(e) => setInertiaEditForm(p => ({ ...p, changedBy: e.target.value }))} placeholder="例: 山田太郎" />
                </div>
                <div className="mb-0">
                  <label className="form-label fw-medium" style={{ fontSize: '0.85rem' }}>エビデンス・備考</label>
                  <textarea className="form-control form-control-sm" rows={2} value={inertiaEditForm.evidence}
                    onChange={(e) => setInertiaEditForm(p => ({ ...p, evidence: e.target.value }))} placeholder="例: CAD計算値。" />
                </div>
                {renderAttachDocSection()}
              </div>
              <div className="modal-footer py-2">
                <button className="btn btn-secondary btn-sm" onClick={() => setInertiaEditTarget(null)}>キャンセル</button>
                <button className="btn btn-primary btn-sm" onClick={handleInertiaEditSubmit}>記録する</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 搭載位置セット編集モーダル ── */}
      {mountEditTarget && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)', zIndex: 1060 }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header py-2">
                <h6 className="modal-title"><i className="bi bi-pencil-square me-2 text-primary" />搭載位置を編集</h6>
                <button className="btn-close btn-sm" onClick={() => setMountEditTarget(null)} />
              </div>
              <div className="modal-body">
                <div className="mb-2 text-muted" style={{ fontSize: '0.78rem' }}>
                  <i className="bi bi-box me-1" />{mountEditTarget.paramName}
                </div>
                {(['X', 'Y', 'Z'] as const).map((axis) => (
                  <div className="row g-2 mb-2" key={axis}>
                    <div className="col-6">
                      <label className="form-label fw-medium" style={{ fontSize: '0.85rem' }}>{axis} 始点 (m)</label>
                      <input className="form-control form-control-sm font-monospace" type="number" step="any"
                        value={mountEditForm[`mountPos${axis}` as keyof typeof mountEditForm]}
                        onChange={(e) => setMountEditForm(p => ({ ...p, [`mountPos${axis}`]: e.target.value }))}
                        placeholder="—" />
                    </div>
                    <div className="col-6">
                      <label className="form-label fw-medium" style={{ fontSize: '0.85rem' }}>{axis} 終点 (m)</label>
                      <input className="form-control form-control-sm font-monospace" type="number" step="any"
                        value={mountEditForm[`mountEnd${axis}` as keyof typeof mountEditForm]}
                        onChange={(e) => setMountEditForm(p => ({ ...p, [`mountEnd${axis}`]: e.target.value }))}
                        placeholder="—" />
                    </div>
                  </div>
                ))}
                <div className="mb-2">
                  <label className="form-label fw-medium" style={{ fontSize: '0.85rem' }}>記入者</label>
                  <input className="form-control form-control-sm" value={mountEditForm.changedBy}
                    onChange={(e) => setMountEditForm(p => ({ ...p, changedBy: e.target.value }))} placeholder="例: 山田太郎" />
                </div>
                <div className="mb-0">
                  <label className="form-label fw-medium" style={{ fontSize: '0.85rem' }}>エビデンス・備考</label>
                  <textarea className="form-control form-control-sm" rows={2} value={mountEditForm.evidence}
                    onChange={(e) => setMountEditForm(p => ({ ...p, evidence: e.target.value }))} placeholder="例: CAD計算値。" />
                </div>
                {renderAttachDocSection()}
              </div>
              <div className="modal-footer py-2">
                <button className="btn btn-secondary btn-sm" onClick={() => setMountEditTarget(null)}>キャンセル</button>
                <button className="btn btn-primary btn-sm" onClick={handleMountEditSubmit}>記録する</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 材質情報 一括編集モーダル ── */}
      {materialEditTarget && (() => {
        const allMaterialCats = [...new Set(MATERIAL_PRESETS.map((m) => m.category))];
        const presetsForCat = materialEditPresetCat
          ? (getMaterialsByCategory()[materialEditPresetCat] ?? [])
          : [];
        return (
          <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)', zIndex: 1060 }}>
            <div className="modal-dialog">
              <div className="modal-content">
                <div className="modal-header py-2">
                  <h6 className="modal-title"><i className="bi bi-pencil-square me-2 text-primary" />材質情報を編集</h6>
                  <button className="btn-close btn-sm" onClick={() => setMaterialEditTarget(null)} />
                </div>
                <div className="modal-body">
                  <div className="mb-3 text-muted" style={{ fontSize: '0.78rem' }}>
                    <i className="bi bi-box me-1" />{materialEditTarget.paramName}
                  </div>

                  {/* ─── セクション1: プリセット ─── */}
                  <div className="mb-3 pb-2 border-bottom">
                    <div className="text-muted fw-semibold mb-2" style={{ fontSize: '0.72rem', letterSpacing: '0.04em' }}>
                      プリセットから選ぶ（任意）
                    </div>
                    <div className="mb-2">
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>カテゴリで絞り込み</label>
                      <select
                        className="form-select form-select-sm"
                        value={materialEditPresetCat}
                        onChange={(e) => setMaterialEditPresetCat(e.target.value)}
                      >
                        <option value="">— カテゴリを選択 —</option>
                        {allMaterialCats.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                    {materialEditPresetCat && (
                      <div className="mb-1">
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>材質プリセット</label>
                        <select
                          className="form-select form-select-sm"
                          /* value を form.materialName にバインドして、選択結果を維持表示 */
                          value={materialEditForm.materialName}
                          onChange={(e) => {
                            const preset = findMaterialPreset(e.target.value);
                            if (preset) {
                              const unit = materialEditForm.materialDensityUnit;
                              const displayDensity = densityFromInternal(preset.density, unit);
                              setMaterialEditForm((p) => ({
                                ...p,
                                materialName: preset.name,
                                materialDensityValue: String(displayDensity),
                                materialYoungModulus: preset.youngModulus != null ? String(preset.youngModulus) : '',
                              }));
                            }
                          }}
                        >
                          <option value="">— プリセットを選択 —</option>
                          {presetsForCat.map((p) => (
                            <option key={p.name} value={p.name}>
                              {p.name} ({p.density.toLocaleString()} kg/m³)
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* ─── セクション2: 材質情報 ─── */}
                  <div className="mb-3 pb-2 border-bottom">
                    <div className="text-muted fw-semibold mb-2" style={{ fontSize: '0.72rem', letterSpacing: '0.04em' }}>
                      材質情報
                    </div>
                    <div className="mb-2">
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>
                        材質名 <span className="text-muted" style={{ fontSize: '0.72rem' }}>（直接入力も可）</span>
                      </label>
                      <input
                        className="form-control form-control-sm"
                        value={materialEditForm.materialName}
                        onChange={(e) => setMaterialEditForm((p) => ({ ...p, materialName: e.target.value }))}
                        placeholder="例: アルミ合金 A2024-T3"
                      />
                    </div>
                    <div className="mb-2">
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>密度</label>
                      <div className="d-flex gap-2">
                        <input
                          className="form-control form-control-sm font-monospace"
                          type="number"
                          step="any"
                          value={materialEditForm.materialDensityValue}
                          onChange={(e) => setMaterialEditForm((p) => ({ ...p, materialDensityValue: e.target.value }))}
                          placeholder="値を入力"
                        />
                        <select
                          className="form-select form-select-sm"
                          style={{ width: 110, flexShrink: 0 }}
                          value={materialEditForm.materialDensityUnit}
                          onChange={(e) => {
                            const newUnit = e.target.value as DensityUnit;
                            const currentNum = parseFloat(materialEditForm.materialDensityValue);
                            if (isFinite(currentNum)) {
                              const internalVal = densityToInternal(currentNum, materialEditForm.materialDensityUnit);
                              const newDisplay = densityFromInternal(internalVal, newUnit);
                              setMaterialEditForm((p) => ({ ...p, materialDensityValue: String(newDisplay), materialDensityUnit: newUnit }));
                            } else {
                              setMaterialEditForm((p) => ({ ...p, materialDensityUnit: newUnit }));
                            }
                          }}
                        >
                          {DENSITY_UNITS.map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="mb-2">
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>ヤング率 (GPa)</label>
                      <input
                        className="form-control form-control-sm font-monospace"
                        type="number"
                        step="any"
                        value={materialEditForm.materialYoungModulus}
                        onChange={(e) => setMaterialEditForm((p) => ({ ...p, materialYoungModulus: e.target.value }))}
                        placeholder="例: 70"
                      />
                    </div>
                    <div className="mb-1">
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>メモ（任意）</label>
                      <textarea
                        className="form-control form-control-sm"
                        rows={2}
                        value={materialEditForm.materialNote}
                        onChange={(e) => setMaterialEditForm((p) => ({ ...p, materialNote: e.target.value }))}
                        placeholder="備考"
                      />
                    </div>
                  </div>

                  {/* ─── セクション3: 記録情報 ─── */}
                  <div>
                    <div className="text-muted fw-semibold mb-2" style={{ fontSize: '0.72rem', letterSpacing: '0.04em' }}>
                      記録
                    </div>
                    <div className="mb-2">
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>記入者</label>
                      <input
                        className="form-control form-control-sm"
                        value={materialEditForm.changedBy}
                        onChange={(e) => setMaterialEditForm((p) => ({ ...p, changedBy: e.target.value }))}
                        placeholder="例: 山田太郎"
                      />
                    </div>
                    <div className="mb-2">
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>エビデンス・備考</label>
                      <textarea
                        className="form-control form-control-sm"
                        rows={2}
                        value={materialEditForm.evidence}
                        onChange={(e) => setMaterialEditForm((p) => ({ ...p, evidence: e.target.value }))}
                        placeholder="例: 材料仕様書 SPEC-2026-01 参照。"
                      />
                    </div>
                    {renderAttachDocSection()}
                  </div>
                </div>
                <div className="modal-footer py-2">
                  <button className="btn btn-secondary btn-sm" onClick={() => setMaterialEditTarget(null)}>キャンセル</button>
                  <button className="btn btn-primary btn-sm" onClick={handleMaterialEditSubmit}>記録する</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── 親変更（移動）モーダル ── */}
      {moveTarget && (() => {
        // 自分自身と子孫を除外（循環防止）
        const collectDescendantLids = (c: MassComponent): Set<string> => {
          const set = new Set<string>();
          const lid = c.logicalId || c.id;
          set.add(lid);
          const children = childrenOf.get(lid) ?? [];
          children.forEach((ch) => {
            collectDescendantLids(ch).forEach((d) => set.add(d));
          });
          return set;
        };
        const excludeLids = collectDescendantLids(moveTarget);
        // パンくず的なフルパス表示
        const fullPath = (c: MassComponent): string => {
          const parts: string[] = [c.paramName];
          let curParentId = c.parentId;
          let safety = 0;
          while (curParentId && safety++ < 50) {
            const p = components.find((x) => (x.logicalId || x.id) === curParentId);
            if (!p) break;
            parts.unshift(p.paramName);
            curParentId = p.parentId;
          }
          return parts.join(' / ');
        };
        // 自分・子孫除外 → 削除済除外 → 検索フィルタ → 名前順ソート
        // (リンク候補ピッカーと同じ UX)
        const candidates = components
          .filter((c) => {
            const lid = c.logicalId || c.id;
            return !excludeLids.has(lid) && !c.isDeleted;
          })
          .filter((c) => {
            const q = moveSearchQuery.trim().toLowerCase();
            if (!q) return true;
            return c.paramName.toLowerCase().includes(q)
              || (c.varName ?? '').toLowerCase().includes(q)
              || fullPath(c).toLowerCase().includes(q);
          })
          .sort((a, b) => a.paramName.localeCompare(b.paramName, 'ja'));
        const handleMoveTo = (newParentId: string | null) => {
          if (!moveTarget) return;
          // 新しい親と新しい階層を計算
          const newParent = newParentId
            ? components.find((c) => (c.logicalId || c.id) === newParentId)
            : null;
          const newLevel = newParent ? newParent.level + 1 : 0;
          const siblingsOfNew = newParentId
            ? (childrenOf.get(newParentId) ?? [])
            : (childrenOf.get(null) ?? []);
          const newOrder = siblingsOfNew.length;
          const levelDelta = newLevel - moveTarget.level;
          updateComponent(moveTarget.id, {
            parentId: newParentId,
            level: newLevel,
            order: newOrder,
          });
          // 子孫の level を再帰的に再計算
          if (levelDelta !== 0) {
            const updateDescendantLevels = (parentLid: string) => {
              const children = childrenOf.get(parentLid) ?? [];
              children.forEach((ch) => {
                updateComponent(ch.id, { level: ch.level + levelDelta });
                updateDescendantLevels(ch.logicalId || ch.id);
              });
            };
            updateDescendantLevels(moveTarget.logicalId || moveTarget.id);
          }
          setMoveTarget(null);
          setMoveSearchQuery('');
        };
        return (
          <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 1050 }} onClick={() => { setMoveTarget(null); setMoveSearchQuery(''); }}>
            <div className="modal-dialog modal-dialog-scrollable" onClick={(e) => e.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header py-2">
                  <h6 className="modal-title">
                    <i className="bi bi-diagram-3 me-2 text-primary" />
                    親を変更 — {moveTarget.paramName}
                  </h6>
                  <button className="btn-close btn-sm" onClick={() => { setMoveTarget(null); setMoveSearchQuery(''); }} />
                </div>
                <div className="modal-body py-2" style={{ maxHeight: '60vh' }}>
                  <div className="text-muted mb-2" style={{ fontSize: '0.78rem' }}>
                    新しい親コンポーネントを選択してください。<br />
                    自分自身と子孫は選択できません。
                  </div>
                  <input
                    className="form-control form-control-sm mb-2"
                    placeholder="コンポーネント名で検索…"
                    value={moveSearchQuery}
                    onChange={(e) => setMoveSearchQuery(e.target.value)}
                    autoFocus
                  />
                  <div className="list-group" style={{ fontSize: '0.85rem' }}>
                    <button
                      type="button"
                      className={`list-group-item list-group-item-action ${moveTarget.parentId === null ? 'active' : ''}`}
                      onClick={() => handleMoveTo(null)}
                    >
                      <i className="bi bi-house me-2" />
                      （ルートに移動）
                    </button>
                    {candidates.length === 0 && (
                      <div className="text-muted text-center py-3" style={{ fontSize: '0.78rem' }}>候補なし</div>
                    )}
                    {candidates.slice(0, 50).map((c) => {
                      const lid = c.logicalId || c.id;
                      const isCurrent = moveTarget.parentId === lid;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className={`list-group-item list-group-item-action ${isCurrent ? 'active' : ''}`}
                          onClick={() => handleMoveTo(lid)}
                        >
                          <i className="bi bi-folder me-2" />
                          {fullPath(c)}
                          {c.varName && <span className="text-muted ms-2" style={{ fontSize: '0.72rem' }}>({c.varName})</span>}
                          {isCurrent && <span className="badge bg-light text-dark ms-2">現在の親</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="modal-footer py-2">
                  <button className="btn btn-secondary btn-sm" onClick={() => { setMoveTarget(null); setMoveSearchQuery(''); }}>キャンセル</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── 統合変更履歴モーダル ── */}
      {historyTarget && (() => {
        const comp = allComponents.find((c) => c.id === historyTarget.id) ?? historyTarget;
        type HistoryRow = {
          id: string;
          date: string;
          fieldLabel: string;
          value: string | null;
          changedBy: string;
          evidence: string;
          status: 'input' | 'confirmed';
          confirmedBy?: string;
          confirmedAt?: string;
          kind: 'field' | 'mass';
          entryId: string;
          componentName?: string;
          componentId: string;
          documentId?: string;
          source?: 'manual' | 'cad';
        };
        const DOC_TYPE_LABELS: Record<DocumentType, string> = {
          drawing: '図面', spec: '仕様書', report: 'レポート', other: 'その他',
        };
        // 子孫コンポーネントを再帰的に収集
        const collectDescendants = (c: MassComponent): MassComponent[] => {
          const children = childrenOf.get(c.logicalId || c.id) ?? [];
          return children.flatMap((ch) => [ch, ...collectDescendants(ch)]);
        };
        const targetComps = [comp, ...collectDescendants(comp)];
        const hasChildren = targetComps.length > 1;
        const rowsFromComp = (c: MassComponent): HistoryRow[] => {
          const fRows: HistoryRow[] = (c.fieldHistory ?? []).map((e) => {
            const displayValue = e.field === 'inputType' && e.value
              ? (INPUT_TYPE_LABELS[e.value as ComponentInputType] ?? e.value)
              : e.value;
            return {
              id: `${c.id}-${e.id}`, date: e.changedAt, fieldLabel: e.fieldLabel, value: displayValue,
              changedBy: e.changedBy, evidence: e.evidence, status: e.status,
              confirmedBy: e.confirmedBy, confirmedAt: e.confirmedAt, kind: 'field', entryId: e.id,
              componentName: c.paramName, componentId: c.id, documentId: e.documentId,
              source: e.source,
            };
          });
          const mRows: HistoryRow[] = (c.actualMassHistory ?? []).map((e) => ({
            id: `${c.id}-${e.id}`, date: e.recordedAt, fieldLabel: '実質量',
            value: e.value != null ? String(e.value) : null,
            changedBy: e.recordedBy, evidence: e.evidence, status: e.status,
            confirmedBy: e.confirmedBy, confirmedAt: e.confirmedAt, kind: 'mass', entryId: e.id,
            componentName: c.paramName, componentId: c.id, documentId: e.documentId,
            source: e.source,
          }));
          return [...fRows, ...mRows];
        };
        const allRows = targetComps.flatMap(rowsFromComp).sort((a, b) => b.date.localeCompare(a.date));
        // 同一コンポーネント・同一記入者・同一エビデンス・同一秒のエントリをまとめる
        type HistoryGroup = {
          key: string;
          date: string;
          componentId: string;
          componentName?: string;
          changedBy: string;
          evidence: string;
          documentId?: string;
          rows: HistoryRow[];
        };
        const groupBucket = (r: HistoryRow) => {
          const sec = r.date.slice(0, 19); // YYYY-MM-DDTHH:MM:SS
          return `${r.componentId}|${r.changedBy}|${r.evidence}|${r.documentId ?? ''}|${sec}`;
        };
        const groupMap = new Map<string, HistoryGroup>();
        for (const r of allRows) {
          const k = groupBucket(r);
          const g = groupMap.get(k);
          if (g) {
            g.rows.push(r);
          } else {
            groupMap.set(k, {
              key: k, date: r.date, componentId: r.componentId, componentName: r.componentName,
              changedBy: r.changedBy, evidence: r.evidence, documentId: r.documentId, rows: [r],
            });
          }
        }
        const groups = Array.from(groupMap.values()).sort((a, b) => b.date.localeCompare(a.date));
        return (
          <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 1050 }} onClick={() => setHistoryTarget(null)}>
            <div className="modal-dialog modal-xl modal-dialog-scrollable" onClick={(e) => e.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">
                    <i className="bi bi-clock-history me-2 text-primary" />
                    変更履歴 — {comp.paramName}
                  </h5>
                  <button className="btn-close" onClick={() => setHistoryTarget(null)} />
                </div>
                <div className="modal-body p-0">
                  {groups.length === 0 ? (
                    <div className="text-center text-muted py-5">
                      <i className="bi bi-clock-history fs-3 d-block mb-2 opacity-25" />
                      変更履歴がありません
                    </div>
                  ) : (
                    <table className="table table-hover mb-0 align-top" style={{ fontSize: '0.83rem' }}>
                      <thead className="table-light">
                        <tr>
                          <th style={{ width: 110 }}>日時</th>
                          {hasChildren && <th style={{ width: 120 }}>コンポーネント</th>}
                          <th>変更内容</th>
                          <th style={{ width: 100 }}>記入者</th>
                          <th style={{ width: 200 }}>エビデンス</th>
                          <th style={{ width: 160 }}>添付資料</th>
                          <th style={{ width: 80 }}>状態</th>
                          <th style={{ width: 80 }}>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groups.map((g) => {
                          const inputCount = g.rows.filter((r) => r.status === 'input').length;
                          const confirmedCount = g.rows.length - inputCount;
                          const allConfirmed = inputCount === 0;
                          const someConfirmed = confirmedCount > 0 && inputCount > 0;
                          return (
                            <tr key={g.key}>
                              <td className="text-muted" style={{ fontSize: '0.75rem' }}>
                                {new Date(g.date).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                {g.rows.length > 1 && (
                                  <div><span className="badge bg-light text-dark border mt-1" style={{ fontSize: '0.65rem' }}>{g.rows.length}項目</span></div>
                                )}
                              </td>
                              {hasChildren && (
                                <td>
                                  <span className="badge bg-info-subtle text-info" style={{ fontSize: '0.72rem' }}>{g.componentName}</span>
                                </td>
                              )}
                              <td>
                                <div className="d-flex flex-column gap-1">
                                  {g.rows.map((row) => (
                                    <div key={row.id} className="d-flex align-items-baseline gap-2">
                                      <span className="badge bg-secondary-subtle text-secondary flex-shrink-0" style={{ fontSize: '0.7rem', minWidth: 78, textAlign: 'center' }}>{row.fieldLabel}</span>
                                      {row.source === 'cad' && (
                                        <span
                                          className="badge flex-shrink-0 d-inline-flex align-items-center gap-1"
                                          style={{ background: '#e8f4ff', color: '#0d6efd', fontSize: '0.62rem', padding: '1px 5px' }}
                                          title="CAD取り込みによる変更"
                                        >
                                          <i className="bi bi-file-earmark-code" style={{ fontSize: '0.6rem' }} />CAD
                                        </span>
                                      )}
                                      <span className="font-monospace text-truncate" style={{ fontSize: '0.78rem' }}>
                                        {row.value ?? <span className="text-muted">—</span>}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                              <td>{g.changedBy || <span className="text-muted">—</span>}</td>
                              <td style={{ fontSize: '0.78rem' }}>{g.evidence || <span className="text-muted">—</span>}</td>
                              <td style={{ fontSize: '0.75rem' }}>
                                {(() => {
                                  if (!g.documentId) return <span className="text-muted">—</span>;
                                  const ownerComp = targetComps.find((tc) => tc.id === g.componentId);
                                  const doc = ownerComp?.documents?.find((d) => d.id === g.documentId);
                                  if (!doc) return <span className="text-muted" title="削除済み">（削除済）</span>;
                                  const meta = [doc.docNumber, doc.revision].filter(Boolean).join(' ');
                                  const tip = [doc.title, doc.note].filter(Boolean).join('\n');
                                  const href = doc.url && !/^[a-z][a-z0-9+.-]*:/i.test(doc.url) ? `https://${doc.url}` : doc.url;
                                  return (
                                    <div title={tip}>
                                      <div>
                                        <span className="badge bg-light text-dark border me-1" style={{ fontSize: '0.7rem' }}>{DOC_TYPE_LABELS[doc.docType]}</span>
                                        {doc.url ? (
                                          <a href={href} target="_blank" rel="noopener noreferrer">
                                            <i className="bi bi-paperclip me-1" />{doc.title || meta || doc.url}
                                          </a>
                                        ) : (
                                          <span><i className="bi bi-paperclip me-1 text-primary" />{doc.title || meta || '—'}</span>
                                        )}
                                      </div>
                                      {meta && doc.title && (
                                        <div className="text-muted font-monospace" style={{ fontSize: '0.7rem' }}>{meta}</div>
                                      )}
                                      {doc.note && (
                                        <div className="text-muted text-truncate" style={{ fontSize: '0.7rem', maxWidth: 220 }}>{doc.note}</div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </td>
                              <td>
                                {allConfirmed ? (
                                  <span className="badge bg-success-subtle text-success">
                                    <i className="bi bi-check-circle me-1" />確認済
                                  </span>
                                ) : someConfirmed ? (
                                  <span className="badge bg-warning-subtle text-warning" title={`確認済 ${confirmedCount} / 入力済 ${inputCount}`}>
                                    一部確認済
                                  </span>
                                ) : (
                                  <span className="badge bg-warning-subtle text-warning">入力済</span>
                                )}
                              </td>
                              <td>
                                {inputCount > 0 && (
                                  <button
                                    className="btn btn-sm btn-outline-success py-0 px-1"
                                    style={{ fontSize: '0.75rem' }}
                                    title={`未確認 ${inputCount} 件をまとめて確認`}
                                    onClick={() => {
                                      const confirmedBy = window.prompt('確認者名を入力してください');
                                      if (!confirmedBy) return;
                                      g.rows.filter((r) => r.status === 'input').forEach((row) => {
                                        if (row.kind === 'field') {
                                          confirmFieldEntry(row.componentId, row.entryId, confirmedBy);
                                        } else {
                                          confirmActualMassEntry(row.componentId, row.entryId, confirmedBy);
                                        }
                                      });
                                    }}
                                  >
                                    <i className="bi bi-check2" /> 確認
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
                <div className="modal-footer">
                  <button className="btn btn-secondary btn-sm" onClick={() => setHistoryTarget(null)}>閉じる</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {showCadImportModal && (
        <CadImportModal
          components={components}
          onApply={(updates: CadApplyUpdate[]) => {
            // recordedBy/evidence のいずれかが入っていれば即時反映、無ければ confirm モーダルでユーザー入力を求める
            const hasMeta = updates.some((u) => (u.recordedBy && u.recordedBy.trim()) || (u.evidence && u.evidence.trim()));
            if (hasMeta) {
              applyCadUpdates(updates);
            } else {
              setCadConfirmModal({ updates, changedBy: '', evidence: '' });
            }
          }}
          onClose={() => setShowCadImportModal(false)}
        />
      )}

      {/* タグ管理モーダル */}
      {showTagMgr && massCase && (() => {
        const defs = massCase.tagDefinitions ?? [];
        const resolvedComponents = massCaseId ? getComponentsForCase(massCaseId) as MassComponent[] : [];

        const countUsage = (tagId: string) =>
          resolvedComponents.filter((c) => (c.tags ?? []).includes(tagId)).length;

        const handleSaveAll = () => {
          const updatedDefs: TagDefinition[] = defs.map((d) => {
            const edit = tagMgrEdits[d.id];
            if (!edit) return d;
            return { ...d, name: edit.name.trim() || d.name, color: edit.color };
          });
          updateCase(massCase.id, { tagDefinitions: updatedDefs });
          setShowTagMgr(false);
        };

        const handleDelete = (tagId: string) => {
          const updatedDefs = defs.filter((d) => d.id !== tagId);
          updateCase(massCase.id, { tagDefinitions: updatedDefs });
          // 全コンポーネントからタグ id を除去
          resolvedComponents.forEach((c) => {
            if ((c.tags ?? []).includes(tagId)) {
              updateComponent(c.id, { tags: (c.tags ?? []).filter((t) => t !== tagId) });
            }
          });
          setTagDeleteConfirm(null);
          // tagMgrEdits からも除去
          setTagMgrEdits((prev) => {
            const next = { ...prev };
            delete next[tagId];
            return next;
          });
        };

        return (
          <div
            className="modal d-block"
            style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
            onClick={() => setShowTagMgr(false)}
          >
            <div
              className="modal-dialog modal-dialog-centered"
              style={{ maxWidth: 480 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-content">
                <div className="modal-header py-2">
                  <h6 className="modal-title mb-0">
                    <i className="bi bi-tags me-2" />タグを管理
                  </h6>
                  <button type="button" className="btn-close btn-sm" onClick={() => setShowTagMgr(false)} />
                </div>
                <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                  {defs.length === 0 && (
                    <p className="text-muted text-center" style={{ fontSize: '0.85rem' }}>タグが定義されていません</p>
                  )}
                  {defs.map((def) => {
                    const edit = tagMgrEdits[def.id] ?? { name: def.name, color: def.color };
                    const usageCount = countUsage(def.id);
                    return (
                      <div key={def.id} className="mb-3 pb-3 border-bottom">
                        <div className="d-flex align-items-center gap-2 mb-1">
                          <span
                            className="badge"
                            style={{ background: edit.color, color: '#fff', fontSize: '0.72rem', minWidth: 40 }}
                          >
                            {edit.name || '(未入力)'}
                          </span>
                          <small className="text-muted">{usageCount} 件で使用中</small>
                        </div>
                        <div className="d-flex gap-2 align-items-center mb-1">
                          <input
                            className="form-control form-control-sm"
                            style={{ maxWidth: 180 }}
                            value={edit.name}
                            placeholder="タグ名"
                            onChange={(e) =>
                              setTagMgrEdits((prev) => ({
                                ...prev,
                                [def.id]: { ...edit, name: e.target.value },
                              }))
                            }
                          />
                          <div className="d-flex flex-wrap gap-1">
                            {TAG_PALETTE.map((p) => (
                              <button
                                key={p.value}
                                title={p.label}
                                style={{
                                  width: 18, height: 18, borderRadius: '50%',
                                  border: edit.color === p.value ? '2px solid #000' : '2px solid transparent',
                                  background: p.value, cursor: 'pointer', padding: 0,
                                }}
                                onClick={() =>
                                  setTagMgrEdits((prev) => ({
                                    ...prev,
                                    [def.id]: { ...edit, color: p.value },
                                  }))
                                }
                              />
                            ))}
                            <input
                              type="color"
                              className="form-control form-control-color"
                              style={{ width: 24, height: 18, padding: 1 }}
                              value={edit.color}
                              title="カスタムカラー"
                              onChange={(e) =>
                                setTagMgrEdits((prev) => ({
                                  ...prev,
                                  [def.id]: { ...edit, color: e.target.value },
                                }))
                              }
                            />
                          </div>
                        </div>
                        {tagDeleteConfirm === def.id ? (
                          <div className="d-flex align-items-center gap-2 mt-1">
                            <small className="text-danger">
                              {usageCount > 0
                                ? `${usageCount} 件から削除されます。`
                                : '削除しますか？'}
                            </small>
                            <button
                              className="btn btn-danger btn-sm py-0"
                              style={{ fontSize: '0.72rem' }}
                              onClick={() => handleDelete(def.id)}
                            >
                              削除する
                            </button>
                            <button
                              className="btn btn-outline-secondary btn-sm py-0"
                              style={{ fontSize: '0.72rem' }}
                              onClick={() => setTagDeleteConfirm(null)}
                            >
                              キャンセル
                            </button>
                          </div>
                        ) : (
                          <button
                            className="btn btn-outline-danger btn-sm py-0"
                            style={{ fontSize: '0.72rem' }}
                            onClick={() => setTagDeleteConfirm(def.id)}
                          >
                            <i className="bi bi-trash me-1" />削除
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="modal-footer py-2">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowTagMgr(false)}
                  >
                    キャンセル
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleSaveAll}
                  >
                    保存して閉じる
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── CAD反映確認モーダル ── */}
      {cadConfirmModal && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 1080 }}>
          <div className="modal-dialog modal-dialog-centered modal-sm">
            <div className="modal-content">
              <div className="modal-header py-2">
                <h6 className="modal-title">
                  <i className="bi bi-pencil-square me-2 text-primary" />CAD反映情報の入力
                </h6>
                <button className="btn-close btn-sm" onClick={() => setCadConfirmModal(null)} />
              </div>
              <div className="modal-body">
                <div className="alert alert-info py-2" style={{ fontSize: '0.78rem' }}>
                  CAD取り込みによる {cadConfirmModal.updates.length} コンポーネントの変更を、変更履歴に記録します。
                </div>
                <div className="mb-2">
                  <label className="form-label fw-medium" style={{ fontSize: '0.85rem' }}>記入者</label>
                  <input
                    className="form-control form-control-sm"
                    value={cadConfirmModal.changedBy}
                    onChange={(e) => setCadConfirmModal((p) => p ? { ...p, changedBy: e.target.value } : p)}
                    placeholder="例: 山田太郎"
                    autoFocus
                  />
                </div>
                <div className="mb-0">
                  <label className="form-label fw-medium" style={{ fontSize: '0.85rem' }}>エビデンス・備考</label>
                  <textarea
                    className="form-control form-control-sm"
                    rows={2}
                    value={cadConfirmModal.evidence}
                    onChange={(e) => setCadConfirmModal((p) => p ? { ...p, evidence: e.target.value } : p)}
                    placeholder="例: CAD Rev.3 を反映"
                  />
                </div>
              </div>
              <div className="modal-footer py-2">
                <button className="btn btn-secondary btn-sm" onClick={() => setCadConfirmModal(null)}>キャンセル</button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    const m = cadConfirmModal;
                    const enriched = m.updates.map((u) => ({
                      ...u,
                      recordedBy: u.recordedBy || m.changedBy.trim(),
                      evidence: u.evidence || m.evidence.trim() || `CADインポート: ${u.cadLabel ?? 'CAD'}`,
                    }));
                    applyCadUpdates(enriched);
                    setCadConfirmModal(null);
                  }}
                >
                  記録して反映する
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── リンク管理パネル ── */}
      {linkPanelTarget && (() => {
        const target = components.find((c) => c.id === linkPanelTarget.id) ?? linkPanelTarget;
        const isMaster = !!target.isLinkMaster;
        const isLinked = !!target.linkGroupId;
        const groupId = target.linkGroupId;
        const groupColor = groupId ? (linkGroupColorMap.get(groupId) ?? '#6c757d') : '#6c757d';

        const groupMembers = groupId
          ? components.filter((c) => c.linkGroupId === groupId)
          : [];
        const master = groupMembers.find((c) => c.isLinkMaster);
        const clones = groupMembers.filter((c) => !c.isLinkMaster);

        // 既存部品リンク候補。自分自身・削除済み(Tombstone)・同じ link group のメンバーを除外。
        // target が独立部品(groupId=undefined)のときは linkGroupId による除外を行わない
        // (undefined !== undefined が false で他の独立部品も除外されてしまう問題の修正)。
        const linkCandidates = components.filter(
          (c) =>
            c.id !== target.id &&
            !c.isDeleted &&
            (groupId === undefined || c.linkGroupId !== groupId),
        );
        const filteredCandidates = linkCandidates
          .filter((c) => {
            const q = linkExistingQuery.trim().toLowerCase();
            return !q || c.paramName.toLowerCase().includes(q) || (c.varName ?? '').toLowerCase().includes(q);
          })
          // 日本語対応の名前順で安定ソート(下位が50件で切られるとき優先順位を予測可能に)
          .sort((a, b) => a.paramName.localeCompare(b.paramName, 'ja'));

        return (
          <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.45)', zIndex: 1070 }} onClick={() => { setLinkPanelTarget(null); setLinkExistingPickerOpen(false); }}>
            <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header py-2">
                  <h6 className="modal-title">
                    <i className="bi bi-link-45deg me-1" style={{ color: groupColor }} />
                    リンク管理 — {target.paramName}
                  </h6>
                  <button className="btn-close btn-sm" onClick={() => { setLinkPanelTarget(null); setLinkExistingPickerOpen(false); }} />
                </div>
                <div className="modal-body py-2" style={{ fontSize: '0.85rem' }}>
                  {!isLinked && (
                    <div className="mb-3">
                      <div className="text-muted mb-2">この部品はリンクされていません（独立部品）。インスタンスを追加するか、既存部品をリンクするとマスターになります。</div>
                      <div className="d-flex gap-2 flex-wrap">
                        <button
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => {
                            handleLinkAddInstance(target);
                          }}
                        >
                          <i className="bi bi-plus-circle me-1" />インスタンス追加（マスターにして複製）
                        </button>
                        <button
                          className="btn btn-sm btn-outline-secondary"
                          onClick={() => setLinkExistingPickerOpen((v) => !v)}
                        >
                          <i className="bi bi-box-arrow-in-right me-1" />既存部品をリンク
                        </button>
                      </div>
                      {linkExistingPickerOpen && (
                        <div className="mt-2 border rounded p-2" style={{ background: '#fff' }}>
                          <input
                            className="form-control form-control-sm mb-2"
                            placeholder="コンポーネント名で検索…"
                            value={linkExistingQuery}
                            onChange={(e) => setLinkExistingQuery(e.target.value)}
                            autoFocus
                          />
                          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                            {filteredCandidates.length === 0 && (
                              <div className="text-muted px-1" style={{ fontSize: '0.78rem' }}>候補なし</div>
                            )}
                            {filteredCandidates.slice(0, 50).map((c) => (
                              <button
                                key={c.id}
                                className="btn btn-sm btn-link text-start w-100 px-1 py-1"
                                style={{ textDecoration: 'none', fontSize: '0.82rem' }}
                                onClick={() => handleLinkExisting(target, c.id)}
                              >
                                <i className="bi bi-box me-1 text-muted" />
                                {c.paramName}
                                {c.varName && <span className="text-muted ms-1">({c.varName})</span>}
                                {c.linkGroupId && (
                                  <span className="badge ms-1" style={{ background: linkGroupColorMap.get(c.linkGroupId) ?? '#6c757d', fontSize: 9 }}>
                                    リンク済
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {isLinked && isMaster && (
                    <div className="mb-3 p-2 border rounded" style={{ borderColor: groupColor, background: '#f8f9fa' }}>
                      <div className="fw-semibold mb-2" style={{ color: groupColor }}>
                        <i className="bi bi-link-45deg me-1" />マスター部品
                      </div>
                      <div className="mb-2">
                        <span className="text-muted">リンク済みクローン ({clones.length}個):</span>
                        {clones.length === 0 && <span className="text-muted ms-2 fst-italic">なし</span>}
                        <ul className="list-unstyled mb-0 mt-1 ps-2">
                          {clones.map((c) => (
                            <li key={c.id} style={{ fontSize: '0.82rem' }}>
                              <i className="bi bi-link me-1 text-muted" />{c.paramName}
                              {c.varName && <span className="text-muted ms-1">({c.varName})</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="d-flex gap-2 flex-wrap">
                        <button
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => {
                            handleLinkAddInstance(target);
                          }}
                        >
                          <i className="bi bi-plus-circle me-1" />インスタンス追加
                        </button>
                        <button
                          className="btn btn-sm btn-outline-secondary"
                          onClick={() => setLinkExistingPickerOpen((v) => !v)}
                        >
                          <i className="bi bi-box-arrow-in-right me-1" />既存部品をリンク
                        </button>
                      </div>
                      {linkExistingPickerOpen && (
                        <div className="mt-2 border rounded p-2" style={{ background: '#fff' }}>
                          <input
                            className="form-control form-control-sm mb-2"
                            placeholder="コンポーネント名で検索…"
                            value={linkExistingQuery}
                            onChange={(e) => setLinkExistingQuery(e.target.value)}
                            autoFocus
                          />
                          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                            {filteredCandidates.length === 0 && (
                              <div className="text-muted px-1" style={{ fontSize: '0.78rem' }}>候補なし</div>
                            )}
                            {filteredCandidates.slice(0, 50).map((c) => (
                              <button
                                key={c.id}
                                className="btn btn-sm btn-link text-start w-100 px-1 py-1"
                                style={{ textDecoration: 'none', fontSize: '0.82rem' }}
                                onClick={() => handleLinkExisting(target, c.id)}
                              >
                                <i className="bi bi-box me-1 text-muted" />
                                {c.paramName}
                                {c.varName && <span className="text-muted ms-1">({c.varName})</span>}
                                {c.linkGroupId && (
                                  <span className="badge ms-1" style={{ background: linkGroupColorMap.get(c.linkGroupId) ?? '#6c757d', fontSize: 9 }}>
                                    リンク済
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {isLinked && !isMaster && (
                    <div className="mb-3 p-2 border rounded" style={{ borderColor: groupColor, background: '#f8f9fa' }}>
                      <div className="fw-semibold mb-1" style={{ color: groupColor }}>
                        <i className="bi bi-link-45deg me-1" />クローン
                        {master && <span className="text-muted fw-normal ms-1">(マスター: {master.paramName})</span>}
                      </div>
                      <div className="text-muted mb-2" style={{ fontSize: '0.82rem' }}>
                        物理量はマスターから同期されます。編集はマスターで行ってください。
                      </div>
                      <div className="d-flex gap-2">
                        {master && (
                          <button
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => {
                              setLinkPanelTarget(master);
                              setLinkExistingPickerOpen(false);
                            }}
                          >
                            <i className="bi bi-pencil-square me-1" />マスターを編集
                          </button>
                        )}
                        <button
                          className="btn btn-sm btn-outline-secondary"
                          onClick={() => handleLinkDetach(target)}
                        >
                          <i className="bi bi-scissors me-1" />リンク解除
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="modal-footer py-2">
                  <button className="btn btn-secondary btn-sm" onClick={() => { setLinkPanelTarget(null); setLinkExistingPickerOpen(false); }}>閉じる</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
