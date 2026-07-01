import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { cloudStorage } from '../utils/cloudStorage';
import { v4 as uuidv4 } from 'uuid';
import type { AnalysisFlow, AnalysisFlowStep, DataBinding } from '../types';
import { useAnalysisStore } from './analysisStore';
import { useMassCaseStore } from './massCaseStore';
import { getPredecessorIds, getRootStepIds } from '../components/analysis/flow/flowUtils';

interface AnalysisFlowStore {
  flows: AnalysisFlow[];
  addFlow: (data: Omit<AnalysisFlow, 'id' | 'createdAt' | 'updatedAt'>) => AnalysisFlow;
  updateFlow: (id: string, patch: Partial<Omit<AnalysisFlow, 'id' | 'createdAt'>>) => void;
  deleteFlow: (id: string) => void;
  getFlowsForProject: (projectId: string) => AnalysisFlow[];
  addStep: (flowId: string, step: Omit<AnalysisFlowStep, 'id'>, parentStepId?: string | null) => string;
  updateStep: (flowId: string, stepId: string, patch: Partial<Omit<AnalysisFlowStep, 'id'>>) => void;
  deleteStep: (flowId: string, stepId: string) => void;
  addBinding: (flowId: string, stepId: string, binding: Omit<DataBinding, 'id'>) => void;
  deleteBinding: (flowId: string, stepId: string, bindingId: string) => void;
  markStepDone: (flowId: string, stepId: string) => void;
  startFlow: (flowId: string) => void;
  updateStepPosition: (flowId: string, stepId: string, position: { x: number; y: number }) => void;
  // ---- グラフ編集 ----
  addForwardEdge: (flowId: string, sourceId: string, targetId: string) => void;
  removeForwardEdge: (flowId: string, sourceId: string, targetId: string) => void;
  // ---- 実行 (ダミー実装、各 7s 後に done へ) ----
  /** 全フロー実行: ルートステップから順に in_progress → 7s → done で進行 */
  runFullFlow: (flowId: string) => void;
  /** 単独ステップ実行: in_progress → 7s → done (後続には伝播しない) */
  runSingleStep: (flowId: string, stepId: string) => void;
  /** 全ステータスを pending に戻す (ダミー解析結果の見た目リセット) */
  resetAllSteps: (flowId: string) => void;
}

const now = () => new Date().toISOString();

/**
 * 旧データ (nextStepIds 未定義) を線形フローとみなして nextStepIds を初期化する。
 * グラフを編集する操作の前に呼ぶことで、以降の編集が DAG 前提で安全になる。
 */
function normalizeToDag(steps: AnalysisFlowStep[]): AnalysisFlowStep[] {
  const hasExplicit = steps.some((s) => s.nextStepIds !== undefined);
  if (hasExplicit) {
    // 既に DAG。未定義ステップは空配列に揃える。
    return steps.map((s) => (s.nextStepIds === undefined ? { ...s, nextStepIds: [] } : s));
  }
  const sorted = [...steps].sort((a, b) => a.order - b.order);
  const nextOf = new Map<string, string[]>();
  for (let i = 0; i < sorted.length; i++) {
    nextOf.set(sorted[i].id, i < sorted.length - 1 ? [sorted[i + 1].id] : []);
  }
  return steps.map((s) => ({ ...s, nextStepIds: nextOf.get(s.id) ?? [] }));
}

export const useAnalysisFlowStore = create<AnalysisFlowStore>()(
  persist(
    (set, get) => ({
      flows: [],

      addFlow: (data) => {
        const flow: AnalysisFlow = { id: uuidv4(), ...data, createdAt: now(), updatedAt: now() };
        set((s) => ({ flows: [...s.flows, flow] }));
        return flow;
      },

      updateFlow: (id, patch) =>
        set((s) => ({
          flows: s.flows.map((f) =>
            f.id === id ? { ...f, ...patch, updatedAt: now() } : f
          ),
        })),

      deleteFlow: (id) =>
        set((s) => ({ flows: s.flows.filter((f) => f.id !== id) })),

      getFlowsForProject: (projectId) =>
        get().flows.filter((f) => f.projectId === projectId),

      addStep: (flowId, step, parentStepId) => {
        const newId = uuidv4();
        set((s) => ({
          flows: s.flows.map((f) => {
            if (f.id !== flowId) return f;
            const normalizedSteps = normalizeToDag(f.steps);
            const maxY = normalizedSteps.reduce(
              (acc, st) => Math.max(acc, st.position?.y ?? st.order * 160),
              -160
            );
            const newStep: AnalysisFlowStep = {
              id: newId,
              ...step,
              nextStepIds: step.nextStepIds ?? [],
              position: step.position ?? { x: 0, y: maxY + 160 },
            };
            // 親ステップが明示指定されていればそれだけにリンク。
            // 指定なし（パレットからのD&D等）は自動接続しない（ユーザーが手動で線を繋ぐ）。
            let linkedSteps: AnalysisFlowStep[];
            if (parentStepId) {
              linkedSteps = normalizedSteps.map((st) =>
                st.id === parentStepId
                  ? { ...st, nextStepIds: [...(st.nextStepIds ?? []), newId] }
                  : st
              );
            } else {
              linkedSteps = normalizedSteps;
            }
            return {
              ...f,
              steps: [...linkedSteps, newStep],
              updatedAt: now(),
            };
          }),
        }));
        return newId;
      },

      updateStep: (flowId, stepId, patch) =>
        set((s) => ({
          flows: s.flows.map((f) =>
            f.id === flowId
              ? {
                  ...f,
                  steps: f.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)),
                  updatedAt: now(),
                }
              : f
          ),
        })),

      deleteStep: (flowId, stepId) =>
        set((s) => ({
          flows: s.flows.map((f) => {
            if (f.id !== flowId) return f;
            const normalizedSteps = normalizeToDag(f.steps);
            // 削除前に「前駆→削除対象→後続」を bypass して繋ぎ直す
            const target = normalizedSteps.find((st) => st.id === stepId);
            const successors = target?.nextStepIds ?? [];
            const cleaned = normalizedSteps
              .filter((st) => st.id !== stepId)
              .map((st) => {
                const next = (st.nextStepIds ?? []).filter((id) => id !== stepId);
                const isPredecessor = (st.nextStepIds ?? []).includes(stepId);
                if (isPredecessor && successors.length > 0) {
                  // 前駆ステップに削除対象の後続を引き継がせる (重複排除)
                  const merged = Array.from(new Set([...next, ...successors]));
                  return { ...st, nextStepIds: merged };
                }
                return { ...st, nextStepIds: next };
              })
              // ループ先が削除対象を指していたら解除
              .map((st) =>
                st.loopBackToStepId === stepId
                  ? { ...st, loopBackToStepId: undefined, loopCondition: undefined }
                  : st
              );
            return { ...f, steps: cleaned, updatedAt: now() };
          }),
        })),

      addBinding: (flowId, stepId, binding) =>
        set((s) => ({
          flows: s.flows.map((f) =>
            f.id === flowId
              ? {
                  ...f,
                  steps: f.steps.map((step) =>
                    step.id === stepId
                      ? { ...step, dataBindings: [...step.dataBindings, { id: uuidv4(), ...binding }] }
                      : step
                  ),
                  updatedAt: now(),
                }
              : f
          ),
        })),

      deleteBinding: (flowId, stepId, bindingId) =>
        set((s) => ({
          flows: s.flows.map((f) =>
            f.id === flowId
              ? {
                  ...f,
                  steps: f.steps.map((step) =>
                    step.id === stepId
                      ? { ...step, dataBindings: step.dataBindings.filter((b) => b.id !== bindingId) }
                      : step
                  ),
                  updatedAt: now(),
                }
              : f
          ),
        })),

      updateStepPosition: (flowId, stepId, position) =>
        set((s) => ({
          flows: s.flows.map((f) =>
            f.id === flowId
              ? {
                  ...f,
                  steps: f.steps.map((step) =>
                    step.id === stepId ? { ...step, position } : step
                  ),
                  // 座標変更は updatedAt を更新しない（レイアウトのみ）
                }
              : f
          ),
        })),

      addForwardEdge: (flowId, sourceId, targetId) =>
        set((s) => ({
          flows: s.flows.map((f) => {
            if (f.id !== flowId) return f;
            const normalizedSteps = normalizeToDag(f.steps);
            const updated = normalizedSteps.map((st) => {
              if (st.id !== sourceId) return st;
              const next = st.nextStepIds ?? [];
              if (next.includes(targetId)) return st;
              return { ...st, nextStepIds: [...next, targetId] };
            });
            return { ...f, steps: updated, updatedAt: now() };
          }),
        })),

      removeForwardEdge: (flowId, sourceId, targetId) =>
        set((s) => ({
          flows: s.flows.map((f) => {
            if (f.id !== flowId) return f;
            const normalizedSteps = normalizeToDag(f.steps);
            const updated = normalizedSteps.map((st) =>
              st.id === sourceId
                ? { ...st, nextStepIds: (st.nextStepIds ?? []).filter((id) => id !== targetId) }
                : st
            );
            return { ...f, steps: updated, updatedAt: now() };
          }),
        })),

      runSingleStep: (flowId, stepId) => {
        // ステータスを in_progress にしてから 7s 後に done に
        const STEP_DURATION_MS = 7000;
        set((s) => ({
          flows: s.flows.map((f) =>
            f.id !== flowId
              ? f
              : {
                  ...f,
                  steps: f.steps.map((st) =>
                    st.id === stepId ? { ...st, status: 'in_progress' as const } : st
                  ),
                  updatedAt: now(),
                }
          ),
        }));
        setTimeout(() => {
          set((s) => ({
            flows: s.flows.map((f) =>
              f.id !== flowId
                ? f
                : {
                    ...f,
                    steps: f.steps.map((st) =>
                      st.id === stepId ? { ...st, status: 'done' as const } : st
                    ),
                    updatedAt: now(),
                  }
            ),
          }));
        }, STEP_DURATION_MS);
      },

      runFullFlow: (flowId) => {
        // DAG の トポロジカル順 で各ステップを 7s 間隔で done にしていく
        // 並列ブランチは順次直列で実行する簡易実装 (依存関係順なので結果は正しい)
        const STEP_DURATION_MS = 7000;
        const flow = get().flows.find((f) => f.id === flowId);
        if (!flow) return;
        const steps = normalizeToDag(flow.steps);
        // トポロジカルソート (Kahn)
        const indeg = new Map<string, number>();
        for (const s of steps) indeg.set(s.id, 0);
        for (const s of steps) for (const n of s.nextStepIds ?? []) indeg.set(n, (indeg.get(n) ?? 0) + 1);
        const queue = steps.filter((s) => (indeg.get(s.id) ?? 0) === 0).map((s) => s.id);
        const order: string[] = [];
        const map = new Map(steps.map((s) => [s.id, s]));
        while (queue.length > 0) {
          const id = queue.shift()!;
          order.push(id);
          for (const n of map.get(id)?.nextStepIds ?? []) {
            const v = (indeg.get(n) ?? 0) - 1;
            indeg.set(n, v);
            if (v === 0) queue.push(n);
          }
        }
        // 順に in_progress → 7s → done
        order.forEach((stepId, i) => {
          setTimeout(() => {
            set((s) => ({
              flows: s.flows.map((f) =>
                f.id !== flowId
                  ? f
                  : {
                      ...f,
                      steps: f.steps.map((st) =>
                        st.id === stepId ? { ...st, status: 'in_progress' as const } : st
                      ),
                      updatedAt: now(),
                    }
              ),
            }));
            setTimeout(() => {
              set((s) => ({
                flows: s.flows.map((f) =>
                  f.id !== flowId
                    ? f
                    : {
                        ...f,
                        steps: f.steps.map((st) =>
                          st.id === stepId ? { ...st, status: 'done' as const } : st
                        ),
                        updatedAt: now(),
                      }
                ),
              }));
            }, STEP_DURATION_MS);
          }, i * STEP_DURATION_MS);
        });
      },

      resetAllSteps: (flowId) =>
        set((s) => ({
          flows: s.flows.map((f) =>
            f.id !== flowId
              ? f
              : {
                  ...f,
                  steps: f.steps.map((st) => ({ ...st, status: 'pending' as const })),
                  updatedAt: now(),
                }
          ),
        })),

      startFlow: (flowId) =>
        set((s) => ({
          flows: s.flows.map((f) => {
            if (f.id !== flowId) return f;
            const rootIds = new Set(getRootStepIds(f.steps));
            return {
              ...f,
              steps: f.steps.map((step) =>
                step.status === 'pending' && rootIds.has(step.id)
                  ? { ...step, status: 'in_progress' as const }
                  : step
              ),
              updatedAt: now(),
            };
          }),
        })),

      markStepDone: (flowId, stepId) => {
        const flow = get().flows.find((f) => f.id === flowId);
        const step = flow?.steps.find((s) => s.id === stepId);
        if (!flow || !step) return;

        // 1. ステータスを done に更新し、後続のうち全前駆が done なら in_progress にプロパゲート
        set((s) => ({
          flows: s.flows.map((f) => {
            if (f.id !== flowId) return f;
            // まず対象ステップを done に
            const afterDone = f.steps.map((st) =>
              st.id === stepId ? { ...st, status: 'done' as const } : st
            );
            // 後続候補を集めて、全前駆が done なら in_progress に
            // (サイクルは存在しない前提だが、念のため visited で多重訪問を防ぐ)
            const stepMap = new Map(afterDone.map((st) => [st.id, st]));
            const ready: string[] = [];
            const visited = new Set<string>();
            const queue: string[] = [stepId];
            while (queue.length > 0) {
              const cur = queue.shift()!;
              if (visited.has(cur)) continue;
              visited.add(cur);
              const curStep = stepMap.get(cur);
              if (!curStep) continue;
              for (const nextId of curStep.nextStepIds ?? []) {
                const nextStep = stepMap.get(nextId);
                if (!nextStep || nextStep.status !== 'pending') continue;
                const preds = getPredecessorIds(nextId, afterDone);
                const allDone = preds.every((pid) => stepMap.get(pid)?.status === 'done');
                if (allDone) ready.push(nextId);
              }
            }
            const readySet = new Set(ready);
            return {
              ...f,
              steps: afterDone.map((st) =>
                readySet.has(st.id) ? { ...st, status: 'in_progress' as const } : st
              ),
              updatedAt: now(),
            };
          }),
        }));

        // 2. データバインド処理（自動バインド）
        if (step.dataBindings.length === 0) return;

        const analysisStore = useAnalysisStore.getState();
        const massCaseStore = useMassCaseStore.getState();

        step.dataBindings.forEach((binding) => {
          const results = analysisStore.getResultsForCase(binding.fromAnalysisCaseId);
          const matched = results.find(
            (r) =>
              r.label.includes(binding.fromResultLabel) ||
              binding.fromResultLabel.includes(r.label)
          );
          if (!matched) return;
          const numVal = parseFloat(matched.value);
          if (isNaN(numVal)) return;

          const mc = massCaseStore.getCase(binding.massCaseId);
          if (!mc?.deltaVBudget) return;

          const updatedEntries = mc.deltaVBudget.entries.map((e) =>
            e.key === binding.toDeltaVEntryKey
              ? { ...e, value: numVal, source: 'analysis_bind' as const }
              : e
          );
          massCaseStore.updateDeltaVBudget(binding.massCaseId, {
            ...mc.deltaVBudget,
            entries: updatedEntries,
          });
        });
      },
    }),
    {
      name: 'rocketdb-analysis-flow-store',
      storage: createJSONStorage(() => cloudStorage),
      skipHydration: true,
    }
  )
);
