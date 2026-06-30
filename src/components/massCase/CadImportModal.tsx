import React, { useMemo, useRef, useState } from 'react';
import type { MassComponent } from '../../types';
import type { CadSetup, CadType } from '../../types';
import { CAD_TYPE_LABELS } from '../../types';
import {
  parseCadFile, parseCadCsv, cadDataToComponentUpdate, getCadImportSummary,
  type CadParseResult, type CadAssemblyItem,
} from '../../utils/cadImport';
import { useCadBindingStore } from '../../stores/cadBindingStore';
import { useAppStore } from '../../stores/appStore';
import { useMassCaseStore } from '../../stores/massCaseStore';
import { parseStep, type StepNode } from '../../utils/stepParser';
import { MATERIAL_PRESETS, getMaterialsByCategory } from '../../utils/materialPresets';
import { DENSITY_UNITS, type DensityUnit, densityToInternal, densityFromInternal } from '../../utils/densityUnits';
import { CadApplyPreviewModal, type DuplicateBindingDetail } from './CadApplyPreviewModal';

// ─── バインド解除候補の検出 ──────────────────────────────────────────────────
// 「過去に CAD で更新されたが、現在は MassCase 内のどのセットアップにも紐付いて
// いない」コンポーネントを「unbind 候補」として返す。
// これにより、X ボタンで componentId を外した結果ロックが解けた部品を、
// データ反映フローで CAD メタ情報のクリア＋履歴記録できる。
export function buildUnbindCandidates(
  components: MassComponent[],
  currentMassCaseId: string | null,
  allSetups: CadSetup[],
  setupLabel: string,
): CadApplyUpdate[] {
  return buildUnbindCandidatesWithPending(components, currentMassCaseId, allSetups, null, {}, setupLabel);
}

// pending 変更込みで unbind 候補を判定する版。
// currentSetupId / pendingBindings が指定された場合、その setup の bindings は
// pending overlay を適用したものとみなす (pending で外したものは「外れている」扱い)。
//
// 重要: シャドウ生成で binding.componentId が古い id になっているケースに対応するため、
//       boundIds は logicalId ベースで管理する (現在 components の logicalId と比較)。
export function buildUnbindCandidatesWithPending(
  components: MassComponent[],
  currentMassCaseId: string | null,
  allSetups: CadSetup[],
  currentSetupId: string | null,
  pendingBindings: Record<string, { componentId: string | null }>,
  setupLabel: string,
  allComponents?: MassComponent[],
): CadApplyUpdate[] {
  if (!currentMassCaseId) return [];
  // componentId (古い・新しいシャドウどちらでも) を logicalId に正規化するヘルパー
  const allComps = allComponents ?? components;
  const lidOf = (componentId: string): string | null => {
    const direct = components.find((c) => c.id === componentId);
    if (direct) return direct.logicalId ?? direct.id;
    const past = allComps.find((c) => c.id === componentId);
    return past?.logicalId ?? past?.id ?? componentId;
  };

  const boundLids = new Set<string>();
  for (const s of allSetups) {
    if (s.massCaseId !== currentMassCaseId) continue;
    if (s.id === currentSetupId) {
      const handled = new Set<string>();
      for (const b of s.componentBindings) {
        const compId = b.cadObjectName in pendingBindings
          ? pendingBindings[b.cadObjectName].componentId
          : b.componentId;
        if (compId) {
          const lid = lidOf(compId);
          if (lid) boundLids.add(lid);
        }
        handled.add(b.cadObjectName);
      }
      for (const cadName of Object.keys(pendingBindings)) {
        if (handled.has(cadName)) continue;
        const compId = pendingBindings[cadName].componentId;
        if (compId) {
          const lid = lidOf(compId);
          if (lid) boundLids.add(lid);
        }
      }
    } else {
      for (const b of s.componentBindings) {
        if (b.componentId) {
          const lid = lidOf(b.componentId);
          if (lid) boundLids.add(lid);
        }
      }
    }
  }
  const candidates: CadApplyUpdate[] = [];
  for (const c of components) {
    if (!c.cadLastImported) continue;
    const lid = c.logicalId ?? c.id;
    if (boundLids.has(lid)) continue;
    candidates.push({
      componentId: c.id,
      update: {
        cadLastImported: undefined,
        cadSoftware: undefined,
        cadRevision: undefined,
        cadFilePath: undefined,
        cadFile: undefined,
      },
      kind: 'unbind',
      cadLabel: setupLabel,
    });
  }
  return candidates;
}

// ─── 重複バインド検知 ────────────────────────────────────────────────────────
// 反映対象 updates[] それぞれの componentId が、同 MassCase の別バインド
// (同一セットアップの別 cadObjectName / 別セットアップ) で使われていないか調べる。
// id ずれを考慮するため logicalId で名寄せ。
export function buildDuplicateBindingMap(
  updates: { componentId: string }[],
  currentSetupId: string,
  allSetups: CadSetup[],
  currentMassCaseId: string | null,
  components: MassComponent[],
  allComponents: MassComponent[],
): Map<string, DuplicateBindingDetail[]> {
  const map = new Map<string, DuplicateBindingDetail[]>();
  if (!currentMassCaseId) return map;

  // 各 update を logicalId にマップ（突き合わせのキー）
  const updateLidByCompId = new Map<string, string>();
  for (const u of updates) {
    const comp = components.find((c) => c.id === u.componentId)
      ?? allComponents.find((c) => c.id === u.componentId);
    const lid = comp?.logicalId ?? u.componentId;
    updateLidByCompId.set(u.componentId, lid);
  }

  const setupsInCase = allSetups.filter((s) => s.massCaseId === currentMassCaseId);
  // 全バインドを (logicalId, setupId, cadObjectName) で展開
  type Indexed = { lid: string; setupId: string; setupLabel: string; cadObjectName: string };
  const all: Indexed[] = [];
  for (const s of setupsInCase) {
    for (const b of s.componentBindings) {
      if (!b.componentId) continue;
      const past = components.find((c) => c.id === b.componentId)
        ?? allComponents.find((c) => c.id === b.componentId);
      const lid = past?.logicalId ?? b.componentId;
      all.push({ lid, setupId: s.id, setupLabel: s.label, cadObjectName: b.cadObjectName });
    }
  }

  for (const u of updates) {
    const targetLid = updateLidByCompId.get(u.componentId);
    if (!targetLid) continue;
    // 「自分」を除外して同 logicalId のバインドを集める
    // 自分の判別: 同じ setup かつ updates[].componentId に該当する binding
    // ここでは厳密に同 setup の「いま反映しようとしている binding」が自分なので、
    // 同 setup の同 cadObjectName ペアを単純に1つだけ自己とみなすのは難しい。
    // → currentSetupId 内の同 lid バインドは1件分だけ自分として除外する。
    let selfExcluded = false;
    const others: DuplicateBindingDetail[] = [];
    for (const e of all) {
      if (e.lid !== targetLid) continue;
      if (!selfExcluded && e.setupId === currentSetupId) {
        selfExcluded = true;
        continue;
      }
      others.push({
        setupLabel: e.setupLabel,
        cadObjectName: e.cadObjectName,
        isSameSetup: e.setupId === currentSetupId,
      });
    }
    if (others.length > 0) map.set(u.componentId, others);
  }
  return map;
}

// ─── バインド先コンポーネントの解決（id ずれ救済） ──────────────────────────
// シャドウ生成で id が変わるとバインドが「— スキップ —」表示になる問題への対処。
// 1) id 完全一致 → そのコンポーネント
// 2) なければ allComponents から componentId に該当する logicalId を取得 → 現在の
//    components(同 logicalId) と突き合わせ
// 戻り値: { component, recovered: true なら id ずれを救済した }
export function resolveBoundComponent(
  componentId: string | null,
  components: MassComponent[],
  allComponents: MassComponent[],
): { component: MassComponent | null; recovered: boolean } {
  if (!componentId) return { component: null, recovered: false };
  const direct = components.find((c) => c.id === componentId);
  if (direct) return { component: direct, recovered: false };
  // 全コンポーネント（全ケース／全シャドウ）から該当 id を探し logicalId を取得
  const past = allComponents.find((c) => c.id === componentId);
  const lid = past?.logicalId;
  if (!lid) return { component: null, recovered: false };
  // 現在の components で同 logicalId のものを探す（resolveShadowComponents 後なので一意）
  const viaLogical = components.find((c) => (c.logicalId || c.id) === lid);
  if (viaLogical) return { component: viaLogical, recovered: true };
  return { component: null, recovered: false };
}

const MATERIAL_CATEGORIES = getMaterialsByCategory();

// ─── 定数 ─────────────────────────────────────────────────────────────────────

const CAD_TYPE_ICONS: Record<CadType, string> = {
  step:     'bi-box-seam',
  json:     'bi-filetype-json',
  csv:      'bi-filetype-csv',
};

/** STEPセットアップの fileContent に詰める形式 */
interface StepFileContent {
  tree: StepNode[];
  hasVolume: boolean;
  hasMass: boolean;
  hasCG: boolean;
  hasInertia: boolean;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CadApplyUpdate {
  componentId: string;
  update: Partial<MassComponent>;
  /** CADデータからの更新の場合 'cad' を指定 */
  source?: 'cad';
  /** CADファイル名 / セットアップラベル（履歴の recordedBy に使用） */
  cadLabel?: string;
  /** ユーザーが入力した記入者名（履歴の changedBy/recordedBy に使用） */
  recordedBy?: string;
  /** ユーザーが入力したエビデンス・備考（履歴の evidence に使用） */
  evidence?: string;
  /**
   * 'apply' (default): CADデータをコンポーネントへ適用する通常更新
   * 'unbind': バインド解除に伴うメタ情報クリア (cadLastImported 等を null に)
   *           + fieldHistory に「バインド解除」記録を追加
   */
  kind?: 'apply' | 'unbind';
}

interface Props {
  components: MassComponent[];
  onApply: (updates: CadApplyUpdate[]) => void;
  onClose: () => void;
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export const CadImportModal: React.FC<Props> = ({ components, onApply, onClose }) => {
  const { massCaseId } = useAppStore();
  const store = useCadBindingStore();
  // 全ケース・全シャドウ含む生コンポーネント。バインドの id ずれ救済に使用。
  const allComponents = useMassCaseStore((s) => s.components) as MassComponent[];
  // 差し替えイベントを MassCase.changeLog に記録するために使う
  const addChangeRecord = useMassCaseStore((s) => s.addChangeRecord);

  const setups      = massCaseId ? store.getSetups(massCaseId) : [];

  const dataSetups = setups.filter((s) => s.cadType === 'json' || s.cadType === 'csv' || s.cadType === 'step');

  // ── データファイル取り込み state ─────────────────────────────────────────
  const [dataFileError, setDataFileError] = useState<string | null>(null);
  const dataFileRef  = useRef<HTMLInputElement>(null);

  // ── データファイル取り込み（JSON / CSV → CadSetup として永続化）────────────
  const handleDataFile = (file: File) => {
    if (!massCaseId) return;
    setDataFileError(null);
    const ext = file.name.split('.').pop()?.toLowerCase();
    const isStep = ext === 'stp' || ext === 'step';
    const cadType: CadType = isStep ? 'step' : ext === 'csv' ? 'csv' : 'json';
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const label = file.name.replace(/\.[^.]+$/, '');

        if (isStep) {
          // STEPファイル: 統合パーサで階層 + 検証プロパティを抽出
          const result = parseStep(text);
          if (result.productNames.length === 0) {
            throw new Error('STEPファイルから部品名(PRODUCT)を検出できませんでした');
          }
          const autoBindings = result.productNames.map((name) => {
            const matched = components.find((c) => c.paramName.toLowerCase() === name.toLowerCase());
            return {
              id: crypto.randomUUID(),
              cadObjectName: name,
              componentId: matched?.id ?? null,
            };
          });
          const fileContent: StepFileContent = {
            tree: result.roots,
            hasVolume: result.hasVolume,
            hasMass: result.hasMass,
            hasCG: result.hasCG,
            hasInertia: result.hasInertia,
          };
          store.addSetup(massCaseId, {
            label,
            cadType,
            s3Key: '',
            fileContent: JSON.stringify(fileContent),
            detectedObjectNames: result.productNames,
            componentBindings: autoBindings,
            paramBindings: [],
          });
          return;
        }

        const result: CadParseResult = cadType === 'csv' ? parseCadCsv(text) : parseCadFile(text);
        const items: CadAssemblyItem[] =
          result.type === 'assembly' ? result.items : [{ name: label, data: result.data }];

        // 名前でコンポーネントを自動マッチ
        const autoBindings = items.map((item) => {
          const matched = components.find((c) => c.paramName.toLowerCase() === item.name.toLowerCase());
          return {
            id: crypto.randomUUID(),
            cadObjectName: item.name,
            componentId: matched?.id ?? null,
          };
        });

        store.addSetup(massCaseId, {
          label,
          cadType,
          s3Key: '',
          fileContent: JSON.stringify(items),
          detectedObjectNames: items.map((i) => i.name),
          componentBindings: autoBindings,
          paramBindings: [],
        });
      } catch (err) {
        setDataFileError(err instanceof Error ? err.message : 'ファイルの解析に失敗しました');
      }
    };
    reader.readAsText(file);
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div className="modal-dialog modal-xl modal-dialog-scrollable">
        <div className="modal-content">

          <div className="modal-header">
            <h5 className="modal-title">
              <i className="bi bi-file-earmark-code me-2 text-primary" />CADデータ取り込み
            </h5>
            <button className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body p-0">

            {/* ══ データファイル取り込み（JSON / CSV / STEP）═══════════════ */}
            <div className="p-3">
              <div className="fw-semibold mb-2" style={{ fontSize: '0.88rem' }}>
                <i className="bi bi-file-earmark-spreadsheet me-1 text-secondary" />データファイル取り込み
                <span className="ms-2 text-muted fw-normal" style={{ fontSize: '0.75rem' }}>JSON / CSV / STEP</span>
              </div>

              {/* 登録済みデータセット */}
              <div className="d-flex flex-column gap-2 mb-2">
                {dataSetups.map((setup) => (
                  <DataSetupCard
                    key={setup.id}
                    setup={setup}
                    store={store}
                    components={components}
                    allComponents={allComponents}
                    onApply={onApply}
                    massCaseId={massCaseId}
                    addChangeRecord={addChangeRecord}
                  />
                ))}
              </div>

              {/* エラー表示 */}
              {dataFileError && (
                <div className="alert alert-danger py-1 px-2 mb-2" style={{ fontSize: '0.8rem' }}>
                  <i className="bi bi-exclamation-triangle me-1" />{dataFileError}
                </div>
              )}

              {/* 追加ボタン */}
              <div>
                <input
                  ref={dataFileRef}
                  type="file"
                  accept=".json,.csv,.stp,.step,.STP,.STEP"
                  className="d-none"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleDataFile(f);
                    if (dataFileRef.current) dataFileRef.current.value = '';
                  }}
                />
                <button
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => dataFileRef.current?.click()}
                >
                  <i className="bi bi-plus-lg me-1" />ファイルを追加
                </button>
                <span className="ms-2 text-muted" style={{ fontSize: '0.75rem' }}>.json / .csv / .stp / .step</span>
              </div>
            </div>

          </div>

          <div className="modal-footer">
            <button className="btn btn-secondary btn-sm" onClick={onClose}>閉じる</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── DataSetupCard (JSON / CSV) ───────────────────────────────────────────────

const DataSetupCard: React.FC<{
  setup: CadSetup;
  store: ReturnType<typeof useCadBindingStore.getState>;
  components: MassComponent[];
  allComponents: MassComponent[];
  onApply: (updates: CadApplyUpdate[]) => void;
  massCaseId: string | null;
  addChangeRecord: (massCaseId: string, record: { changedBy: string; summary: string; rationale: string; documentUrls: string[] }) => void;
}> = ({ setup, store, components, allComponents, onApply, massCaseId, addChangeRecord }) => {
  const [applyResult, setApplyResult] = useState<string | null>(null);
  const [stepDetailOpen, setStepDetailOpen] = useState(false);
  // JSON/CSV 反映前プレビュー
  const [previewUpdates, setPreviewUpdates] = useState<CadApplyUpdate[] | null>(null);
  // ファイル差し替え
  const replaceFileRef = useRef<HTMLInputElement>(null);
  const [replaceMsg, setReplaceMsg] = useState<{ kind: 'success' | 'danger'; text: string } | null>(null);
  // ── pending binding 変更 ───────────────────────────────────────────────────
  // X や dropdown の即時反映を止め、「反映へ」確定時にまとめて store コミット。
  // key: cadObjectName  /  value: { componentId: 新値 (null = 解除) }
  // この map にエントリがあれば「pending あり」、apply 後に空にリセットする。
  const [pendingBindings, setPendingBindings] = useState<Record<string, { componentId: string | null }>>({});
  const isStep = setup.cadType === 'step';

  // 表示・apply 用の「実効バインド」算出: store + pending overlay
  const effectiveBindingFor = (cadObjectName: string): { id: string | null; componentId: string | null } => {
    const stored = setup.componentBindings.find((b) => b.cadObjectName === cadObjectName);
    if (cadObjectName in pendingBindings) {
      return { id: stored?.id ?? null, componentId: pendingBindings[cadObjectName].componentId };
    }
    return { id: stored?.id ?? null, componentId: stored?.componentId ?? null };
  };

  // pending を store へコミット
  const commitPendingBindings = () => {
    for (const cadObjectName of Object.keys(pendingBindings)) {
      const newCompId = pendingBindings[cadObjectName].componentId;
      const stored = setup.componentBindings.find((b) => b.cadObjectName === cadObjectName);
      if (stored) {
        store.updateComponentBinding(setup.id, stored.id, { componentId: newCompId });
      } else {
        store.addComponentBinding(setup.id, { cadObjectName, componentId: newCompId });
      }
    }
    setPendingBindings({});
  };
  // pending を更新するヘルパー。新値が現在の保存値 (id ずれは logicalId 経由で正規化) と
  // 一致する場合は pending エントリを削除して「変更予定」表示を消す。
  const updatePendingBinding = (cadObjectName: string, newCompId: string | null) => {
    const stored = setup.componentBindings.find((b) => b.cadObjectName === cadObjectName);
    let storedNormalized: string | null = null;
    if (stored?.componentId) {
      const { component: resolved } = resolveBoundComponent(stored.componentId, components, allComponents);
      storedNormalized = resolved?.id ?? stored.componentId;
    }
    if (newCompId === storedNormalized) {
      setPendingBindings((p) => {
        if (!(cadObjectName in p)) return p;
        const next = { ...p };
        delete next[cadObjectName];
        return next;
      });
    } else {
      setPendingBindings((p) => ({ ...p, [cadObjectName]: { componentId: newCompId } }));
    }
  };
  const hasPending = Object.keys(pendingBindings).length > 0;

  // ── id ずれの自動修復 ──────────────────────────────────────────────────────
  // シャドウ生成で binding.componentId が古い id を指していた場合、logicalId 経由で
  // 現在の id へ静かに書き換える。1度直せば次回以降は recover フラグも出ない。
  React.useEffect(() => {
    for (const b of setup.componentBindings) {
      if (!b.componentId) continue;
      const { component: resolved, recovered } = resolveBoundComponent(b.componentId, components, allComponents);
      if (recovered && resolved && resolved.id !== b.componentId) {
        store.updateComponentBinding(setup.id, b.id, { componentId: resolved.id });
      }
    }
    // 依存配列は setup.id のみ: マウント時 / セットアップ切替時に1度走らせる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup.id]);

  // STEP: fileContent から { tree, hasVolume, ... } を復元
  const stepContent: StepFileContent | null = (() => {
    if (!isStep) return null;
    try {
      const parsed = JSON.parse(setup.fileContent ?? '{}');
      if (parsed && Array.isArray(parsed.tree)) return parsed as StepFileContent;
    } catch { /* fallthrough */ }
    return null;
  })();

  // 既存のフラットアイテム表示用 (JSON/CSV)
  const items: CadAssemblyItem[] = (() => {
    if (isStep) return [];
    try { return JSON.parse(setup.fileContent ?? '[]') as CadAssemblyItem[]; }
    catch { return []; }
  })();

  // ── ファイル差し替え ────────────────────────────────────────────────────────
  // 新ファイルを読み込み、既存セットアップの fileContent / detectedObjectNames を更新。
  // componentBindings は cadObjectName で名寄せして引き継ぐ:
  //   - 名前が新ファイルにもある → 既存バインドを維持 (componentId / per-node 設定を保持)
  //   - 名前が新ファイルに無い   → バインドを削除（CAD 側で消えた部品）
  //   - 新ファイルにだけある名前 → スキップ状態のバインドを新規作成
  const handleReplaceFile = (file: File) => {
    setReplaceMsg(null);
    const ext = file.name.split('.').pop()?.toLowerCase();
    const newCadType: CadType =
      ext === 'stp' || ext === 'step' ? 'step' :
      ext === 'csv' ? 'csv' :
      ext === 'json' ? 'json' : setup.cadType;

    if (newCadType !== setup.cadType) {
      setReplaceMsg({
        kind: 'danger',
        text: `ファイル形式が異なります（既存: ${setup.cadType}, 新規: ${newCadType}）。同じ形式のファイルを選択してください。`,
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        let newFileContent: string;
        let newNames: string[];

        if (newCadType === 'step') {
          const result = parseStep(text);
          if (result.productNames.length === 0) {
            throw new Error('STEPファイルから部品名(PRODUCT)を検出できませんでした');
          }
          const fileContent: StepFileContent = {
            tree: result.roots,
            hasVolume: result.hasVolume,
            hasMass: result.hasMass,
            hasCG: result.hasCG,
            hasInertia: result.hasInertia,
          };
          newFileContent = JSON.stringify(fileContent);
          newNames = result.productNames;
        } else {
          const result: CadParseResult = newCadType === 'csv' ? parseCadCsv(text) : parseCadFile(text);
          const fallbackLabel = file.name.replace(/\.[^.]+$/, '');
          const newItems: CadAssemblyItem[] =
            result.type === 'assembly' ? result.items : [{ name: fallbackLabel, data: result.data }];
          newFileContent = JSON.stringify(newItems);
          newNames = newItems.map((i) => i.name);
        }

        // バインドのマージ
        const oldByName = new Map(setup.componentBindings.map((b) => [b.cadObjectName, b]));
        const newSet = new Set(newNames);
        const mergedBindings = newNames.map((name) => {
          const existing = oldByName.get(name);
          if (existing) return existing;
          // 名前は同じだが未バインドだったケース等 → 自動マッチ試行
          const matched = components.find((c) => c.paramName.toLowerCase() === name.toLowerCase());
          return {
            id: crypto.randomUUID(),
            cadObjectName: name,
            componentId: matched?.id ?? null,
          };
        });
        const removedNames = [...oldByName.keys()].filter((n) => !newSet.has(n));
        const removedBoundCount = removedNames.filter((n) => !!oldByName.get(n)?.componentId).length;
        const preservedBoundCount = mergedBindings.filter(
          (b) => !!b.componentId && oldByName.has(b.cadObjectName),
        ).length;
        const addedCount = newNames.filter((n) => !oldByName.has(n)).length;

        store.upsertSetup(setup.id, {
          cadType: newCadType,
          fileContent: newFileContent,
          detectedObjectNames: newNames,
          componentBindings: mergedBindings,
          lastGeneratedAt: undefined, // ファイル変わった → 前回反映タイムスタンプは無効化
        });

        const parts: string[] = [];
        parts.push(`${newNames.length} 部品を再読込`);
        parts.push(`バインド維持 ${preservedBoundCount} 件`);
        if (removedBoundCount > 0) parts.push(`削除 ${removedBoundCount} 件`);
        if (addedCount > 0) parts.push(`新規 ${addedCount} 件`);
        const summary = parts.join(' / ');
        setReplaceMsg({ kind: 'success', text: summary });

        // MassCase.changeLog に差し替えを記録 (件名・詳細・新ファイル名)
        if (massCaseId) {
          addChangeRecord(massCaseId, {
            changedBy: 'CAD取込',
            summary: `CADファイル差し替え: ${setup.label}`,
            rationale: [
              `新ファイル: ${file.name}`,
              `形式: ${newCadType}`,
              summary,
              ...(removedNames.length > 0
                ? [`削除された部品名: ${removedNames.join(', ')}`]
                : []),
            ].join(' / '),
            documentUrls: [],
          });
        }

        // STEP の場合は詳細モーダルを自動オープン:
        // ユーザーがバインド見直し → どのコンポーネントに反映するかを選べる動線にする
        if (newCadType === 'step') {
          setStepDetailOpen(true);
        }
      } catch (err) {
        setReplaceMsg({
          kind: 'danger',
          text: err instanceof Error ? err.message : 'ファイルの解析に失敗しました',
        });
      }
    };
    reader.readAsText(file);
  };

  // JSON/CSV 用: プレビューを開く（即時反映ではなく差分確認を挟む）
  // pending 込みの実効バインドで updates を組み立てる
  const handleApplyJsonCsv = () => {
    const updates: CadApplyUpdate[] = [];
    // 全 cadObjectName を走査 (item.name を網羅)
    for (const item of items) {
      const eff = effectiveBindingFor(item.name);
      if (!eff.componentId) continue;
      const { component: resolved } = resolveBoundComponent(eff.componentId, components, allComponents);
      if (!resolved) continue;
      updates.push({
        componentId: resolved.id,
        update: { ...cadDataToComponentUpdate(item.data, setup.label), cadSoftware: setup.cadType as 'json' },
        source: 'cad',
        cadLabel: setup.label,
        kind: 'apply',
      });
    }
    // バインド解除候補も含める (pending で外したものも cadLastImported を残してるので拾える)
    const unbinds = buildUnbindCandidatesWithPending(
      components, massCaseId, store.setups, setup.id, pendingBindings, setup.label, allComponents,
    );
    const all = [...updates, ...unbinds];
    if (all.length === 0) return;
    setPreviewUpdates(all);
  };

  // pending を全部捨てる
  const discardPending = () => {
    if (Object.keys(pendingBindings).length === 0) return;
    if (!window.confirm('未保存のバインド変更を破棄します。よろしいですか？')) return;
    setPendingBindings({});
  };

  // プレビューで「選択した N 件を反映」→ まず pending を store にコミット、続けて apply
  const handlePreviewConfirm = (filtered: CadApplyUpdate[]) => {
    // コミット前に pending 件数を確定（commitPendingBindings でリセットされるため）
    const pendingCount = Object.keys(pendingBindings).length;
    commitPendingBindings();
    onApply(filtered);
    store.markGenerated(setup.id);
    const applyCount = filtered.filter((u) => u.kind !== 'unbind').length;
    const unbindCount = filtered.filter((u) => u.kind === 'unbind').length;
    const parts: string[] = [];
    if (applyCount > 0) parts.push(`更新 ${applyCount} 件`);
    if (unbindCount > 0) parts.push(`バインド解除 ${unbindCount} 件`);
    setApplyResult(parts.join(' / '));
    setPreviewUpdates(null);
    // バインド変更があった場合のみ変更履歴に1件記録
    if (pendingCount > 0 && massCaseId) {
      addChangeRecord(massCaseId, {
        changedBy: 'CADバインド',
        summary: `CADバインド更新: ${setup.label}（${pendingCount} 件）`,
        rationale: 'CADバインド設定の更新',
        documentUrls: [],
      });
    }
  };

  // 現セットアップから見たバインド解除候補件数 (ボタン有効化判定用、pending 込み)
  const unbindCount = useMemo(
    () => buildUnbindCandidatesWithPending(
      components, massCaseId, store.setups, setup.id, pendingBindings, setup.label, allComponents,
    ).length,
    [components, massCaseId, store.setups, setup.id, pendingBindings, setup.label, allComponents],
  );

  // boundCount は pending 込みの実効値
  const boundCount = useMemo(() => {
    const handled = new Set<string>();
    let n = 0;
    for (const b of setup.componentBindings) {
      const compId = b.cadObjectName in pendingBindings
        ? pendingBindings[b.cadObjectName].componentId
        : b.componentId;
      if (compId) n++;
      handled.add(b.cadObjectName);
    }
    // pending で新規追加されたものも数える
    for (const cadName of Object.keys(pendingBindings)) {
      if (handled.has(cadName)) continue;
      if (pendingBindings[cadName].componentId) n++;
    }
    return n;
  }, [setup.componentBindings, pendingBindings]);
  const typeColor = setup.cadType === 'json' ? '#0d6efd' : setup.cadType === 'csv' ? '#198754' : '#9333ea';
  const typeBg = setup.cadType === 'json' ? '#e8f4ff' : setup.cadType === 'csv' ? '#e8f5e9' : '#f3e8ff';

  const stepPartCount = isStep ? (setup.detectedObjectNames?.length ?? 0) : items.length;

  return (
    <div className="border rounded" style={{ background: '#f8faff' }}>
      {/* ヘッダー */}
      <div className="d-flex align-items-center gap-2 p-2 flex-wrap">
        <div className="flex-grow-1" style={{ minWidth: 0 }}>
          <div className="d-flex align-items-center gap-2 text-truncate fw-semibold" style={{ fontSize: '0.88rem' }}>
            <i className={`bi ${CAD_TYPE_ICONS[setup.cadType]} text-primary`} />
            {setup.label || 'データファイル'}
            <span style={{ background: typeBg, color: typeColor, fontSize: '0.65rem', fontWeight: 700, padding: '1px 6px', borderRadius: 4 }}>
              {CAD_TYPE_LABELS[setup.cadType]}
            </span>
            {isStep && stepContent && (
              <>
                {stepContent.hasVolume && <span className="badge bg-info-subtle text-info" style={{ fontSize: '0.62rem' }}>体積</span>}
                {stepContent.hasMass && <span className="badge bg-success-subtle text-success" style={{ fontSize: '0.62rem' }}>質量</span>}
                {stepContent.hasCG && <span className="badge bg-secondary-subtle text-secondary" style={{ fontSize: '0.62rem' }}>重心</span>}
              </>
            )}
          </div>
          <div className="text-muted" style={{ fontSize: '0.75rem' }}>
            {isStep ? `${stepPartCount} 部品` : `${items.length} アイテム`} &nbsp;·&nbsp; バインド済 {boundCount} 件
            {setup.lastGeneratedAt && (
              <> &nbsp;·&nbsp; 前回反映: {new Date(setup.lastGeneratedAt).toLocaleString('ja-JP')}</>
            )}
          </div>
        </div>
        <div className="d-flex gap-1 flex-shrink-0">
          {isStep ? (
            <button
              className="btn btn-sm btn-primary"
              onClick={() => setStepDetailOpen(true)}
            >
              <i className="bi bi-gear me-1" />詳細設定 / 反映
            </button>
          ) : (
            <button
              className="btn btn-sm btn-primary"
              // バインド0でも、過去CAD適用→今は外れている部品があれば「解除反映」できるようにする
              disabled={boundCount === 0 && unbindCount === 0}
              onClick={handleApplyJsonCsv}
              title={
                boundCount === 0 && unbindCount > 0
                  ? `バインド解除 ${unbindCount} 件をDB側へ反映 (CADメタ情報のクリア＋履歴記録)`
                  : undefined
              }
            >
              <i className="bi bi-check2-circle me-1" />データ反映
              {boundCount === 0 && unbindCount > 0 && (
                <span className="ms-1" style={{ fontSize: '0.75rem' }}>
                  (解除 {unbindCount})
                </span>
              )}
            </button>
          )}
          {/* ファイル差し替え（新しいリビジョン読み込み）*/}
          <input
            ref={replaceFileRef}
            type="file"
            accept={
              setup.cadType === 'step' ? '.stp,.step,.STP,.STEP'
              : setup.cadType === 'csv' ? '.csv'
              : '.json'
            }
            className="d-none"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleReplaceFile(f);
              if (replaceFileRef.current) replaceFileRef.current.value = '';
            }}
          />
          <button
            className="btn btn-sm btn-outline-secondary"
            title="新しいリビジョンのファイルで差し替え（バインドは部品名で引き継ぎ）"
            onClick={() => replaceFileRef.current?.click()}
          >
            <i className="bi bi-arrow-repeat me-1" />差し替え
          </button>
          <button
            className="btn btn-sm btn-outline-danger"
            onClick={() => { if (window.confirm(`「${setup.label}」を削除しますか？`)) store.deleteSetup(setup.id); }}
          >
            <i className="bi bi-trash" />
          </button>
        </div>
      </div>

      {/* pending あり時の警告 */}
      {hasPending && (
        <div className="mx-2 mb-2 alert alert-warning py-1 px-2 d-flex align-items-center" style={{ fontSize: '0.78rem' }}>
          <i className="bi bi-clock-history me-2" />
          <span className="flex-grow-1">
            未保存のバインド変更が <strong>{Object.keys(pendingBindings).length}</strong> 件あります。
            「データ反映」→「反映へ」で確定してください。
          </span>
          <button
            className="btn btn-sm btn-outline-secondary py-0 px-2"
            style={{ fontSize: '0.72rem' }}
            onClick={discardPending}
          >
            破棄
          </button>
        </div>
      )}
      {/* 差し替え結果バナー */}
      {replaceMsg && (
        <div
          className={`mx-2 mb-2 alert alert-${replaceMsg.kind} py-1 px-2 d-flex align-items-center`}
          style={{ fontSize: '0.78rem' }}
        >
          <i className={`bi ${replaceMsg.kind === 'success' ? 'bi-arrow-repeat' : 'bi-exclamation-triangle'} me-2`} />
          <span className="flex-grow-1">{replaceMsg.text}</span>
          <button
            className="btn-close btn-sm"
            style={{ fontSize: '0.6rem' }}
            onClick={() => setReplaceMsg(null)}
          />
        </div>
      )}

      {/* 結果バナー */}
      {applyResult && (
        <div className="mx-2 mb-2 alert alert-success py-1 px-2" style={{ fontSize: '0.8rem' }}>
          <i className="bi bi-check-circle me-1" />{applyResult}
        </div>
      )}

      {/* コンポーネントバインド: STEPはモーダルへ、その他はフラット表 */}
      <div className="px-2 pb-2">
        {isStep ? null : (
          <table className="table table-sm table-bordered mb-1" style={{ fontSize: '0.8rem' }}>
            <thead className="table-light">
              <tr>
                <th>ファイル内名称</th>
                <th>データ内容</th>
                <th>適用先コンポーネント</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                // pending 込みの実効バインドを使う
                const eff = effectiveBindingFor(item.name);
                const isPending = item.name in pendingBindings;
                const { component: resolved, recovered } = resolveBoundComponent(
                  eff.componentId,
                  components,
                  allComponents,
                );
                const compId = resolved?.id ?? '';
                return (
                  <tr key={item.name} style={isPending ? { background: '#fff7ed' } : undefined}>
                    <td className="fw-semibold align-middle">
                      {item.name}
                      {recovered && (
                        <span
                          className="badge bg-info-subtle text-info border border-info-subtle ms-2"
                          style={{ fontSize: '0.6rem', fontWeight: 500 }}
                          title="バインド時のIDが古くなっていたため、logicalId 経由で再解決しました"
                        >
                          <i className="bi bi-arrow-repeat" /> 復元
                        </span>
                      )}
                      {isPending && (
                        <span
                          className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle ms-2"
                          style={{ fontSize: '0.6rem', fontWeight: 600 }}
                          title="未保存の変更。「データ反映」→「反映へ」で確定します"
                        >
                          <i className="bi bi-clock-history me-1" />変更予定
                        </span>
                      )}
                    </td>
                    <td className="text-muted align-middle">{getCadImportSummary(item.data).slice(0, 3).join(' / ') || '—'}</td>
                    <td>
                      <div className="d-flex gap-1 align-items-center">
                        <select
                          className="form-select form-select-sm"
                          value={compId}
                          onChange={(e) => {
                            const newCompId = e.target.value || null;
                            updatePendingBinding(item.name, newCompId);
                          }}
                        >
                          <option value="">— スキップ —</option>
                          {components.map((c) => <option key={c.id} value={c.id}>{c.paramName}</option>)}
                        </select>
                        {compId && (
                          <button
                            className="btn btn-sm btn-outline-secondary px-2"
                            title="バインドを外す（材質・密度設定は残ります、確定は「データ反映」から）"
                            onClick={() => updatePendingBinding(item.name, null)}
                          >
                            <i className="bi bi-x-lg" style={{ fontSize: '0.7rem' }} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* STEP詳細設定モーダル */}
      {stepDetailOpen && isStep && stepContent && (
        <StepDetailModal
          setup={setup}
          stepContent={stepContent}
          store={store}
          components={components}
          allComponents={allComponents}
          onApply={(updates) => {
            onApply(updates);
            store.markGenerated(setup.id);
            setApplyResult(`更新完了: ${updates.length} コンポーネント`);
          }}
          onClose={() => { setStepDetailOpen(false); setReplaceMsg(null); }}
          noticeMessage={replaceMsg}
          onDismissNotice={() => setReplaceMsg(null)}
        />
      )}

      {/* JSON / CSV 反映プレビューモーダル */}
      {previewUpdates && (
        <CadApplyPreviewModal
          updates={previewUpdates}
          components={components}
          cadLabel={setup.label}
          duplicateBindings={buildDuplicateBindingMap(
            previewUpdates, setup.id, store.setups, massCaseId, components, allComponents,
          )}
          onConfirm={handlePreviewConfirm}
          onCancel={() => setPreviewUpdates(null)}
        />
      )}
    </div>
  );
};

// ─── StepTreeBindings: STEPアセンブリ階層を折りたたみツリーで表示 ─────────────

const StepTreeBindings: React.FC<{
  tree: StepNode[];
  setup: CadSetup;
  store: ReturnType<typeof useCadBindingStore.getState>;
  components: MassComponent[];
  allComponents: MassComponent[];
  stepMode: 'A' | 'B';
  perNodeDensity: Record<string, string>;
  setPerNodeDensity: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  perNodeMaterial: Record<string, string>;
  setPerNodeMaterial: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  perNodeUnit: Record<string, DensityUnit>;
  setPerNodeUnit: React.Dispatch<React.SetStateAction<Record<string, DensityUnit>>>;
  onPersistNode: (nodeName: string, materialName: string | null, densityStr: string | null) => void;
  /** pending binding 変更 (即時 store 反映を回避) */
  pendingBindings: Record<string, { componentId: string | null }>;
  setPendingBinding: (cadObjectName: string, componentId: string | null) => void;
}> = ({ tree, setup, components, allComponents, stepMode, perNodeDensity, setPerNodeDensity, perNodeMaterial, setPerNodeMaterial, perNodeUnit, setPerNodeUnit, onPersistNode, pendingBindings, setPendingBinding }) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // 紐付けコンポーネントの材質を「初期値」として使う
  // perNodeMaterial / perNodeDensity が空 && そのノードに紐付けされたコンポーネントが materialName を持っている → そっちを使う
  const getEffectiveMaterial = (nodeName: string): { name: string; density: string } => {
    // 1. ノード個別オーバーライド
    if (perNodeMaterial[nodeName]) {
      const m = MATERIAL_PRESETS.find((mp) => mp.name === perNodeMaterial[nodeName]);
      return { name: perNodeMaterial[nodeName], density: m ? String(m.density) : (perNodeDensity[nodeName] || '') };
    }
    if (perNodeDensity[nodeName]) {
      return { name: '', density: perNodeDensity[nodeName] };
    }
    // 2. 紐付けコンポーネントの材質
    const binding = setup.componentBindings.find((b) => b.cadObjectName === nodeName);
    const { component: comp } = resolveBoundComponent(
      binding?.componentId ?? null,
      components,
      allComponents,
    );
    if (comp?.materialName && comp.materialDensity) {
      return { name: comp.materialName, density: String(comp.materialDensity) };
    }
    if (comp?.materialDensity) {
      return { name: '', density: String(comp.materialDensity) };
    }
    // 3. 密度未設定
    return { name: '', density: '' };
  };

  const toggle = (name: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const renderRow = (node: StepNode, depth: number): React.ReactElement[] => {
    const binding = setup.componentBindings.find((b) => b.cadObjectName === node.name);
    // pending overlay 適用
    const effComponentId = node.name in pendingBindings
      ? pendingBindings[node.name].componentId
      : (binding?.componentId ?? null);
    const isPending = node.name in pendingBindings;
    // id ずれ救済 (logicalId 経由)
    const { component: resolvedBound, recovered: bindRecovered } = resolveBoundComponent(
      effComponentId,
      components,
      allComponents,
    );
    const compId = resolvedBound?.id ?? '';
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.name);

    const eff = getEffectiveMaterial(node.name);
    // 質量プレビュー (モードA: volume × density / モードB: massKg)
    let massDisplay: string | null = null;
    if (stepMode === 'B' && node.massKg !== undefined) {
      massDisplay = `${node.massKg.toFixed(3)} kg`;
    } else if (stepMode === 'A' && node.volumeM3 !== undefined) {
      const d = parseFloat(eff.density);
      if (isFinite(d) && d > 0) {
        massDisplay = `${(node.volumeM3 * d).toFixed(3)} kg`;
      }
    }

    const rows: React.ReactElement[] = [
      <tr key={node.name}>
        <td className="align-middle" style={{ paddingLeft: 8 + depth * 16 }}>
          {hasChildren ? (
            <button
              className="btn btn-sm btn-link p-0 me-1"
              style={{ fontSize: 11, lineHeight: 1, textDecoration: 'none' }}
              onClick={() => toggle(node.name)}
            >
              <i className={`bi ${isCollapsed ? 'bi-chevron-right' : 'bi-chevron-down'}`} />
            </button>
          ) : (
            <span className="me-1" style={{ display: 'inline-block', width: 14 }} />
          )}
          <span className="fw-semibold">{node.name}</span>
          {bindRecovered && (
            <span
              className="badge bg-info-subtle text-info border border-info-subtle ms-2"
              style={{ fontSize: '0.6rem', fontWeight: 500 }}
              title="バインド時のIDが古くなっていたため、logicalId 経由で再解決しました"
            >
              <i className="bi bi-arrow-repeat" /> 復元
            </span>
          )}
          {isPending && (
            <span
              className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle ms-2"
              style={{ fontSize: '0.6rem', fontWeight: 600 }}
              title="未保存の変更。「データ反映へ進む」→「反映へ」で確定します"
            >
              <i className="bi bi-clock-history me-1" />変更予定
            </span>
          )}
        </td>
        <td className="text-muted align-middle" style={{ fontSize: '0.74rem' }}>
          {node.volumeM3 !== undefined && (
            <span className="badge bg-info-subtle text-info border border-info-subtle me-1" style={{ fontWeight: 500 }}>
              <i className="bi bi-box me-1" />{(node.volumeM3 * 1000).toFixed(2)} L
            </span>
          )}
          {node.massKg !== undefined && (
            <span className="badge bg-success-subtle text-success border border-success-subtle me-1" style={{ fontWeight: 500 }}>
              <i className="bi bi-speedometer me-1" />{node.massKg.toFixed(3)} kg
            </span>
          )}
          {node.cgX !== undefined && (
            <span
              className="badge bg-secondary-subtle text-secondary border border-secondary-subtle me-1"
              style={{ fontWeight: 500 }}
              title={`重心 (m): X=${node.cgX.toFixed(3)}, Y=${node.cgY?.toFixed(3)}, Z=${node.cgZ?.toFixed(3)}`}
            >
              CG ({node.cgX.toFixed(2)}, {node.cgY?.toFixed(2)}, {node.cgZ?.toFixed(2)})
            </span>
          )}
          {node.bboxMinX !== undefined && (
            <span
              className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle me-1"
              style={{ fontWeight: 500 }}
              title={`バウンディングボックス (m):\nX=[${node.bboxMinX.toFixed(3)}, ${node.bboxMaxX!.toFixed(3)}]\nY=[${node.bboxMinY!.toFixed(3)}, ${node.bboxMaxY!.toFixed(3)}]\nZ=[${node.bboxMinZ!.toFixed(3)}, ${node.bboxMaxZ!.toFixed(3)}]`}
            >
              X=[{node.bboxMinX.toFixed(2)},{node.bboxMaxX!.toFixed(2)}]
              Y=[{node.bboxMinY!.toFixed(2)},{node.bboxMaxY!.toFixed(2)}]
              Z=[{node.bboxMinZ!.toFixed(2)},{node.bboxMaxZ!.toFixed(2)}]
            </span>
          )}
          {massDisplay && stepMode === 'A' && (
            <span className="text-primary ms-1">→ {massDisplay}</span>
          )}
        </td>
        {stepMode === 'A' && (
          <td className="align-middle" style={{ width: 260 }}>
            <select
              className="form-select form-select-sm py-0 mb-1"
              style={{ fontSize: '0.72rem' }}
              value={
                perNodeMaterial[node.name]
                  ? perNodeMaterial[node.name]
                  : perNodeDensity[node.name]
                  ? '__custom__'
                  : eff.name || ''
              }
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' ) {
                  setPerNodeMaterial((p) => { const n = { ...p }; delete n[node.name]; return n; });
                  setPerNodeDensity((p) => { const n = { ...p }; delete n[node.name]; return n; });
                  onPersistNode(node.name, null, null);
                } else if (val === '__custom__') {
                  setPerNodeMaterial((p) => { const n = { ...p }; delete n[node.name]; return n; });
                  onPersistNode(node.name, null, perNodeDensity[node.name] ?? null);
                } else {
                  const preset = MATERIAL_PRESETS.find((m) => m.name === val);
                  if (preset) {
                    setPerNodeMaterial((p) => ({ ...p, [node.name]: preset.name }));
                    setPerNodeDensity((p) => ({ ...p, [node.name]: String(preset.density) }));
                    onPersistNode(node.name, preset.name, String(preset.density));
                  }
                }
              }}
            >
              <option value="">— 未設定 —</option>
              {Object.entries(MATERIAL_CATEGORIES).map(([category, materials]) => (
                <optgroup key={category} label={category}>
                  {materials.map((m) => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </optgroup>
              ))}
              <optgroup label="カスタム">
                <option value="__custom__">カスタム入力…</option>
              </optgroup>
            </select>
            <div className="d-flex gap-1">
              <input
                type="number"
                className="form-control form-control-sm font-monospace py-0"
                style={{ fontSize: '0.72rem', width: 80 }}
                placeholder="密度"
                value={(() => {
                  const unit = perNodeUnit[node.name] ?? 'kg/m³';
                  const internalStr = perNodeDensity[node.name] ?? (eff.name ? eff.density : '');
                  const internal = parseFloat(internalStr);
                  if (!internalStr || !isFinite(internal)) return internalStr;
                  return unit === 'kg/m³' ? internalStr : String(densityFromInternal(internal, unit));
                })()}
                onChange={(e) => {
                  const unit = perNodeUnit[node.name] ?? 'kg/m³';
                  const displayVal = e.target.value;
                  const parsed = parseFloat(displayVal);
                  const internalStr = displayVal === '' ? '' : (isFinite(parsed) ? String(densityToInternal(parsed, unit)) : displayVal);
                  setPerNodeDensity((p) => ({ ...p, [node.name]: internalStr }));
                  setPerNodeMaterial((p) => { const n = { ...p }; delete n[node.name]; return n; });
                  onPersistNode(node.name, null, internalStr);
                }}
                title={`密度 (${perNodeUnit[node.name] ?? 'kg/m³'}) — 直接入力するとカスタム扱い`}
              />
              <select
                className="form-select form-select-sm py-0"
                style={{ fontSize: '0.68rem', width: 72 }}
                value={perNodeUnit[node.name] ?? 'kg/m³'}
                onChange={(e) => {
                  setPerNodeUnit((p) => ({ ...p, [node.name]: e.target.value as DensityUnit }));
                }}
              >
                {DENSITY_UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </td>
        )}
        <td className="align-middle" style={{ width: 220 }}>
          <div className="d-flex gap-1 align-items-center">
            <select
              className="form-select form-select-sm"
              value={compId}
              onChange={(e) => {
                const newCompId = e.target.value || null;
                setPendingBinding(node.name, newCompId);
              }}
            >
              <option value="">— スキップ —</option>
              {components.map((c) => <option key={c.id} value={c.id}>{c.paramName}</option>)}
            </select>
            {compId && (
              <button
                className="btn btn-sm btn-outline-secondary px-2"
                title="バインドを外す（材質・密度設定は残ります、確定は「反映へ」から）"
                onClick={() => setPendingBinding(node.name, null)}
              >
                <i className="bi bi-x-lg" style={{ fontSize: '0.7rem' }} />
              </button>
            )}
          </div>
        </td>
      </tr>
    ];
    if (!isCollapsed) {
      for (const child of node.children) {
        rows.push(...renderRow(child, depth + 1));
      }
    }
    return rows;
  };

  return (
    <table className="table table-sm table-bordered mb-1" style={{ fontSize: '0.78rem' }}>
      <thead className="table-light">
        <tr>
          <th>部品名</th>
          <th>体積 (l) / 質量 (kg)</th>
          {stepMode === 'A' && <th title="材質プリセット または 個別密度（単位選択可）">材質 / 密度</th>}
          <th>適用先コンポーネント</th>
        </tr>
      </thead>
      <tbody>
        {tree.flatMap((root) => renderRow(root, 0))}
      </tbody>
    </table>
  );
};

// ─── StepDetailModal: STEPセットアップの詳細設定モーダル ─────────────────────

const StepDetailModal: React.FC<{
  setup: CadSetup;
  stepContent: StepFileContent;
  store: ReturnType<typeof useCadBindingStore.getState>;
  components: MassComponent[];
  allComponents: MassComponent[];
  onApply: (updates: CadApplyUpdate[]) => void;
  onClose: () => void;
  /** 差し替え直後など、上部に表示する一時通知 */
  noticeMessage?: { kind: 'success' | 'danger'; text: string } | null;
  onDismissNotice?: () => void;
}> = ({ setup, stepContent, store, components, allComponents, onApply, onClose, noticeMessage, onDismissNotice }) => {
  const canUseModeB = !!(stepContent.hasMass && stepContent.hasCG);
  const [stepMode, setStepMode] = useState<'A' | 'B'>(canUseModeB ? 'B' : 'A');
  // 変更履歴記録: DataSetupCard 側と同じく massCaseStore から取得
  const addChangeRecord = useMassCaseStore((s) => s.addChangeRecord);

  // ── pending binding 変更 (DataSetupCard と同じ仕組み) ─────────────────────
  const [pendingBindings, setPendingBindings] = useState<Record<string, { componentId: string | null }>>({});
  const commitPendingBindings = () => {
    for (const cadObjectName of Object.keys(pendingBindings)) {
      const newCompId = pendingBindings[cadObjectName].componentId;
      const stored = setup.componentBindings.find((b) => b.cadObjectName === cadObjectName);
      if (stored) {
        store.updateComponentBinding(setup.id, stored.id, { componentId: newCompId });
      } else {
        store.addComponentBinding(setup.id, { cadObjectName, componentId: newCompId });
      }
    }
    setPendingBindings({});
  };
  const hasPendingBindings = Object.keys(pendingBindings).length > 0;

  // ストアに保存済みのバインド情報から perNodeDensity / perNodeMaterial を復元
  const [perNodeDensity, setPerNodeDensity] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const b of setup.componentBindings) {
      if (b.densityOverride != null) {
        init[b.cadObjectName] = String(b.densityOverride);
      }
    }
    return init;
  });
  const [perNodeMaterial, setPerNodeMaterial] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const b of setup.componentBindings) {
      if (b.materialName) {
        init[b.cadObjectName] = b.materialName;
      }
    }
    return init;
  });
  // ノード毎の表示単位（デフォルト kg/m³）。perNodeDensity は常に内部値(kg/m³)で保持。
  const [perNodeUnit, setPerNodeUnit] = useState<Record<string, DensityUnit>>({});

  // ストアへの保存ヘルパー: perNodeDensity / perNodeMaterial が変わったら binding に書き戻す
  const persistNodeBinding = (nodeName: string, materialName: string | null, densityStr: string | null) => {
    const binding = setup.componentBindings.find((b) => b.cadObjectName === nodeName);
    const density = densityStr !== null && densityStr !== '' ? parseFloat(densityStr) : null;
    const patch = {
      materialName: materialName ?? null,
      densityOverride: density !== null && isFinite(density) ? density : null,
    };
    if (binding) {
      store.updateComponentBinding(setup.id, binding.id, patch);
    } else {
      store.addComponentBinding(setup.id, { cadObjectName: nodeName, componentId: null, ...patch });
    }
  };
  // 搭載位置の反映可否を自動判定
  // 1. 検証プロパティのバウンディングボックス (絶対座標) が最優先
  // 2. それが無ければ NAUO 由来の origin (但し全ノード(0,0,0)ならスキップ)
  const hasBBox = (() => {
    let any = false;
    const walk = (n: StepNode) => {
      if (n.bboxMinX !== undefined) any = true;
      n.children.forEach(walk);
    };
    stepContent.tree.forEach(walk);
    return any;
  })();
  const hasNonZeroOrigin = (() => {
    let any = false;
    const walk = (n: StepNode) => {
      if ((n.originX ?? 0) !== 0 || (n.originY ?? 0) !== 0 || (n.originZ ?? 0) !== 0) any = true;
      n.children.forEach(walk);
    };
    stepContent.tree.forEach(walk);
    return any;
  })();
  // プレビュー（部品選択）フェーズで残った componentId セット。null = プレビューまだ
  const [selectedComponentIds, setSelectedComponentIds] = useState<Set<string> | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applyMountPos, setApplyMountPos] = useState<boolean>(hasBBox || hasNonZeroOrigin);
  // CG: 検証プロパティの 'centre point' (StepNode.cgX/Y/Z) があれば反映
  const hasCgFromGVP = (() => {
    let any = false;
    const walk = (n: StepNode) => {
      if (n.cgX !== undefined) any = true;
      n.children.forEach(walk);
    };
    stepContent.tree.forEach(walk);
    return any;
  })();
  const [applyCG, setApplyCG] = useState<boolean>(hasCgFromGVP);
  // 反映確認フェーズ
  const [confirming, setConfirming] = useState(false);
  const [recordedBy, setRecordedBy] = useState('');
  const [evidence, setEvidence] = useState('');

  // ノード名 → StepNode マップ
  const stepNodeByName = (() => {
    const map = new Map<string, StepNode>();
    const walk = (n: StepNode) => { map.set(n.name, n); n.children.forEach(walk); };
    stepContent.tree.forEach(walk);
    return map;
  })();

  // 反映用データを構築 (確認ダイアログでも使用)
  // pending 込みの実効バインドを使う
  const buildUpdates = (): CadApplyUpdate[] => {
    const updates: CadApplyUpdate[] = [];
    const cadLabel = setup.label;
    // 走査対象は (既存 binding + pending で新規追加されたもの) の和集合
    const seen = new Set<string>();
    const targets: Array<{ cadObjectName: string; componentId: string | null }> = [];
    for (const b of setup.componentBindings) {
      const compId = b.cadObjectName in pendingBindings
        ? pendingBindings[b.cadObjectName].componentId
        : b.componentId;
      targets.push({ cadObjectName: b.cadObjectName, componentId: compId });
      seen.add(b.cadObjectName);
    }
    for (const cadName of Object.keys(pendingBindings)) {
      if (seen.has(cadName)) continue;
      targets.push({ cadObjectName: cadName, componentId: pendingBindings[cadName].componentId });
    }
    for (const t of targets) {
      if (!t.componentId) continue;
      const { component: resolvedComp } = resolveBoundComponent(t.componentId, components, allComponents);
      if (!resolvedComp) continue;
      const node = stepNodeByName.get(t.cadObjectName);
      if (!node) continue;
      const update: Record<string, unknown> = {
        cadSoftware: 'step',
        cadLastImported: new Date().toISOString(),
      };

      if (stepMode === 'B') {
        if (node.massKg !== undefined) {
          update.actualMass = node.massKg;
          update.actualMassEvidence = evidence || `STEP取り込み: ${cadLabel}`;
        }
        if (node.cgX !== undefined) update.cgX = node.cgX;
        if (node.cgY !== undefined) update.cgY = node.cgY;
        if (node.cgZ !== undefined) update.cgZ = node.cgZ;
        if (node.cgX !== undefined) update.cgEvidence = evidence || `STEP取り込み: ${cadLabel}`;
        if (node.ixx !== undefined) update.ixx = node.ixx;
        if (node.iyy !== undefined) update.iyy = node.iyy;
        if (node.izz !== undefined) update.izz = node.izz;
        if (node.ixy !== undefined) update.ixy = node.ixy;
        if (node.ixz !== undefined) update.ixz = node.ixz;
        if (node.iyz !== undefined) update.iyz = node.iyz;
        if (node.ixx !== undefined) update.inertiaEvidence = evidence || `STEP取り込み: ${cadLabel}`;
      } else {
        // モードA
        if (node.volumeM3 === undefined) continue;
        // 有効密度 + 材質名の決定
        const matName = perNodeMaterial[node.name];
        let densityStr = perNodeDensity[node.name];
        if (!densityStr && resolvedComp.materialDensity) {
          // 紐付け先コンポーネントの材質を fallback として使う
          densityStr = String(resolvedComp.materialDensity);
        }
        const density = parseFloat(densityStr ?? '');
        if (!isFinite(density) || density <= 0) continue;
        update.actualMass = node.volumeM3 * density;
        update.actualMassEvidence = evidence || `STEP体積×密度 (${density} kg/m³): ${cadLabel}`;
        update.materialDensity = density;
        if (matName) update.materialName = matName;
      }
      // mountPos / mountEnd (チェックボックスONの時のみ)
      if (applyMountPos) {
        // 優先1: 検証プロパティのバウンディングボックス (絶対座標)
        if (node.bboxMinX !== undefined) {
          update.mountPosX = node.bboxMinX;
          update.mountEndX = node.bboxMaxX;
          update.mountPosY = node.bboxMinY;
          update.mountEndY = node.bboxMaxY;
          update.mountPosZ = node.bboxMinZ;
          update.mountEndZ = node.bboxMaxZ;
        } else if (node.originX !== undefined) {
          // 優先2: NAUO 由来の組立変換
          update.mountPosX = node.originX;
          update.mountPosY = node.originY;
          update.mountPosZ = node.originZ;
        }
      }
      // CG (モードAでも検証プロパティから取れる場合は反映)
      if (applyCG && stepMode === 'A') {
        if (node.cgX !== undefined) {
          update.cgX = node.cgX;
          update.cgY = node.cgY;
          update.cgZ = node.cgZ;
          update.cgEvidence = evidence || `STEP検証プロパティ: ${cadLabel}`;
        }
      }

      updates.push({
        componentId: resolvedComp.id,
        update,
        source: 'cad',
        cadLabel: recordedBy || cadLabel,
        recordedBy: recordedBy || cadLabel,
        evidence: evidence || `STEP取り込み: ${cadLabel}`,
        kind: 'apply',
      });
    }
    // バインド解除候補も含める (pending 込み)
    const unbinds = buildUnbindCandidatesWithPending(
      components, setup.massCaseId, store.setups, setup.id, pendingBindings, setup.label, allComponents,
    );
    for (const u of unbinds) {
      if (recordedBy) u.recordedBy = recordedBy;
      if (evidence) u.evidence = evidence;
    }
    return [...updates, ...unbinds];
  };

  const handleConfirmApply = () => {
    const all = buildUpdates();
    const updates = selectedComponentIds
      ? all.filter((u) => selectedComponentIds.has(u.componentId))
      : all;
    if (updates.length === 0) return;
    // コミット前に pending 件数を確定（commitPendingBindings でリセットされるため）
    const pendingCount = Object.keys(pendingBindings).length;
    // pending バインド変更を確定し、続けてデータ反映
    commitPendingBindings();
    onApply(updates);
    setConfirming(false);
    setPreviewing(false);
    setSelectedComponentIds(null);
    // バインド変更があった場合のみ変更履歴に1件記録
    if (pendingCount > 0 && setup.massCaseId) {
      addChangeRecord(setup.massCaseId, {
        changedBy: recordedBy || 'CADバインド',
        summary: `CADバインド更新: ${setup.label}（${pendingCount} 件）`,
        rationale: 'CADバインド設定の更新',
        documentUrls: [],
      });
    }
    onClose();
  };

  // プレビュー → recordedBy/evidence サブモーダルへ
  const handlePreviewConfirm = (filtered: CadApplyUpdate[]) => {
    setSelectedComponentIds(new Set(filtered.map((u) => u.componentId)));
    setPreviewing(false);
    setConfirming(true);
  };

  // pending 込み boundCount
  const boundCount = useMemo(() => {
    const handled = new Set<string>();
    let n = 0;
    for (const b of setup.componentBindings) {
      const compId = b.cadObjectName in pendingBindings
        ? pendingBindings[b.cadObjectName].componentId
        : b.componentId;
      if (compId) n++;
      handled.add(b.cadObjectName);
    }
    for (const cadName of Object.keys(pendingBindings)) {
      if (handled.has(cadName)) continue;
      if (pendingBindings[cadName].componentId) n++;
    }
    return n;
  }, [setup.componentBindings, pendingBindings]);

  const stepUnbindCount = useMemo(
    () => buildUnbindCandidatesWithPending(
      components, setup.massCaseId, store.setups, setup.id, pendingBindings, setup.label, allComponents,
    ).length,
    [components, setup.massCaseId, store.setups, setup.id, pendingBindings, setup.label, allComponents],
  );
  // バインド0でも、unbind 候補があれば反映フローへ進める
  const canApply = (boundCount > 0 && (stepMode === 'B' || stepContent.hasVolume)) || stepUnbindCount > 0;

  return (
    <div
      className="modal d-block"
      style={{ background: 'rgba(0,0,0,0.55)', zIndex: 1070 }}
      onClick={onClose}
    >
      <div className="modal-dialog modal-xl modal-dialog-scrollable" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header py-2">
            <h6 className="modal-title">
              <i className="bi bi-box-seam me-2 text-primary" />
              STEP取り込み — {setup.label}
            </h6>
            <button className="btn-close btn-sm" onClick={onClose} />
          </div>
          <div className="modal-body" style={{ fontSize: '0.85rem' }}>
            {/* 差し替え直後の通知バナー */}
            {noticeMessage && (
              <div
                className={`alert alert-${noticeMessage.kind} py-2 px-2 mb-2 d-flex align-items-center`}
                style={{ fontSize: '0.78rem' }}
              >
                <i className={`bi ${noticeMessage.kind === 'success' ? 'bi-arrow-repeat' : 'bi-exclamation-triangle'} me-2`} />
                <span className="flex-grow-1">
                  {noticeMessage.text}
                  {noticeMessage.kind === 'success' && (
                    <span className="ms-2 text-muted">
                      — 新規・要見直しの部品はバインド欄で割り当ててください
                    </span>
                  )}
                </span>
                {onDismissNotice && (
                  <button
                    className="btn-close btn-sm"
                    style={{ fontSize: '0.6rem' }}
                    onClick={onDismissNotice}
                  />
                )}
              </div>
            )}
            {/* pending バインド変更の警告 */}
            {hasPendingBindings && (
              <div className="alert alert-warning py-1 px-2 mb-2 d-flex align-items-center" style={{ fontSize: '0.78rem' }}>
                <i className="bi bi-clock-history me-2" />
                <span className="flex-grow-1">
                  未保存のバインド変更が <strong>{Object.keys(pendingBindings).length}</strong> 件あります。
                  「データ反映へ進む」→「反映へ」で確定します。
                </span>
                <button
                  className="btn btn-sm btn-outline-secondary py-0 px-2"
                  style={{ fontSize: '0.72rem' }}
                  onClick={() => {
                    if (window.confirm('未保存のバインド変更を破棄します。よろしいですか？')) {
                      setPendingBindings({});
                    }
                  }}
                >
                  破棄
                </button>
              </div>
            )}
            {/* モード切替 + 共通密度 */}
            <div className="mb-3 px-2 py-2 border rounded" style={{ background: '#fafbff' }}>
              <div className="d-flex align-items-center gap-3 flex-wrap mb-2">
                <span className="fw-semibold">取り込みモード:</span>
                <div className="form-check form-check-inline mb-0">
                  <input
                    type="radio"
                    className="form-check-input"
                    id={`md-a-${setup.id}`}
                    checked={stepMode === 'A'}
                    disabled={!stepContent.hasVolume}
                    onChange={() => setStepMode('A')}
                  />
                  <label className="form-check-label" htmlFor={`md-a-${setup.id}`}>
                    A: 体積×密度 {!stepContent.hasVolume && <span className="text-muted">(体積データなし)</span>}
                  </label>
                </div>
                <div className="form-check form-check-inline mb-0">
                  <input
                    type="radio"
                    className="form-check-input"
                    id={`md-b-${setup.id}`}
                    checked={stepMode === 'B'}
                    disabled={!canUseModeB}
                    onChange={() => setStepMode('B')}
                  />
                  <label
                    className="form-check-label"
                    htmlFor={`md-b-${setup.id}`}
                    title={canUseModeB ? '' : 'このSTEPには質量/重心が含まれていません'}
                  >
                    B: 検証プロパティ直接 {!canUseModeB && <span className="text-muted">(質量/重心なし)</span>}
                  </label>
                </div>
              </div>
              <div className="form-check mb-1">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id={`mp-${setup.id}`}
                  checked={applyMountPos}
                  onChange={(e) => setApplyMountPos(e.target.checked)}
                />
                <label className="form-check-label" htmlFor={`mp-${setup.id}`}>
                  搭載位置 (mountPos / mountEnd) を反映する
                  {hasBBox ? (
                    <span className="text-success ms-1" style={{ fontSize: '0.74rem' }}>
                      ✓ 検証プロパティのバウンディングボックスから絶対座標を取得
                    </span>
                  ) : !hasNonZeroOrigin ? (
                    <span className="text-muted ms-1" style={{ fontSize: '0.74rem' }}>
                      ※ 全部品が (0,0,0) (Master Datum方式)
                    </span>
                  ) : null}
                </label>
              </div>
              {hasCgFromGVP && (
                <div className="form-check mb-2">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id={`cg-${setup.id}`}
                    checked={applyCG}
                    onChange={(e) => setApplyCG(e.target.checked)}
                  />
                  <label className="form-check-label" htmlFor={`cg-${setup.id}`}>
                    重心 (CG) を反映する
                    <span className="text-success ms-1" style={{ fontSize: '0.74rem' }}>
                      ✓ 検証プロパティの centre point から絶対座標を取得
                    </span>
                  </label>
                </div>
              )}
            </div>

            <StepTreeBindings
              tree={stepContent.tree}
              setup={setup}
              store={store}
              components={components}
              allComponents={allComponents}
              stepMode={stepMode}
              perNodeDensity={perNodeDensity}
              setPerNodeDensity={setPerNodeDensity}
              perNodeMaterial={perNodeMaterial}
              setPerNodeMaterial={setPerNodeMaterial}
              perNodeUnit={perNodeUnit}
              setPerNodeUnit={setPerNodeUnit}
              onPersistNode={persistNodeBinding}
              pendingBindings={pendingBindings}
              setPendingBinding={(cadObjectName, componentId) => {
                // 現在の保存値と一致するなら pending エントリ削除 (id ずれは logicalId 経由で正規化)
                const stored = setup.componentBindings.find((b) => b.cadObjectName === cadObjectName);
                let storedNormalized: string | null = null;
                if (stored?.componentId) {
                  const { component: resolved } = resolveBoundComponent(stored.componentId, components, allComponents);
                  storedNormalized = resolved?.id ?? stored.componentId;
                }
                if (componentId === storedNormalized) {
                  setPendingBindings((p) => {
                    if (!(cadObjectName in p)) return p;
                    const next = { ...p };
                    delete next[cadObjectName];
                    return next;
                  });
                } else {
                  setPendingBindings((p) => ({ ...p, [cadObjectName]: { componentId } }));
                }
              }}
            />
          </div>
          <div className="modal-footer py-2">
            <span className="text-muted me-auto" style={{ fontSize: '0.78rem' }}>
              バインド済 {boundCount} 件
            </span>
            <button className="btn btn-secondary btn-sm" onClick={onClose}>閉じる</button>
            <button
              className="btn btn-primary btn-sm"
              disabled={!canApply}
              onClick={() => setPreviewing(true)}
            >
              <i className="bi bi-check2-circle me-1" />データ反映へ進む
            </button>
          </div>
        </div>
      </div>

      {/* 反映プレビュー（部品選択）モーダル */}
      {previewing && (() => {
        const updates = buildUpdates();
        return (
          <CadApplyPreviewModal
            updates={updates}
            components={components}
            cadLabel={setup.label}
            duplicateBindings={buildDuplicateBindingMap(
              updates, setup.id, store.setups, setup.massCaseId, components, allComponents,
            )}
            onConfirm={handlePreviewConfirm}
            onCancel={() => setPreviewing(false)}
          />
        );
      })()}

      {/* 反映確認サブモーダル */}
      {confirming && (
        <div
          className="modal d-block"
          style={{ background: 'rgba(0,0,0,0.6)', zIndex: 1080 }}
          onClick={() => setConfirming(false)}
        >
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header py-2">
                <h6 className="modal-title">
                  <i className="bi bi-pencil-square me-2 text-primary" />
                  反映情報の入力
                </h6>
                <button className="btn-close btn-sm" onClick={() => setConfirming(false)} />
              </div>
              <div className="modal-body" style={{ fontSize: '0.85rem' }}>
                <div className="mb-2 text-muted" style={{ fontSize: '0.78rem' }}>
                  STEP取り込み: {setup.label} ({stepMode === 'A' ? '体積×密度' : '検証プロパティ直接'})
                </div>
                <div className="mb-2">
                  <label className="form-label fw-medium mb-1">記入者</label>
                  <input
                    className="form-control form-control-sm"
                    value={recordedBy}
                    onChange={(e) => setRecordedBy(e.target.value)}
                    placeholder="例: 山田太郎"
                    autoFocus
                  />
                </div>
                <div className="mb-0">
                  <label className="form-label fw-medium mb-1">エビデンス・備考</label>
                  <textarea
                    className="form-control form-control-sm"
                    rows={2}
                    value={evidence}
                    onChange={(e) => setEvidence(e.target.value)}
                    placeholder={`例: STEPファイル ${setup.label} から取り込み。CATIA出力。`}
                  />
                </div>
              </div>
              <div className="modal-footer py-2">
                <button className="btn btn-secondary btn-sm" onClick={() => setConfirming(false)}>キャンセル</button>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={!recordedBy.trim()}
                  onClick={handleConfirmApply}
                >
                  記録して反映する
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
