import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { AnalysisFlowStep } from '../types';
import type { CustomTemplate } from '../components/analysis/flow/flowTemplates';
import { normalizeStepsForTemplateSave } from '../components/analysis/flow/flowTemplates';

interface FlowTemplateStore {
  templates: CustomTemplate[];
  saveTemplate: (data: { name: string; description: string; steps: AnalysisFlowStep[] }) => CustomTemplate;
  deleteTemplate: (id: string) => void;
  renameTemplate: (id: string, name: string, description?: string) => void;
}

const nowIso = () => new Date().toISOString();

export const useFlowTemplateStore = create<FlowTemplateStore>()(
  persist(
    (set) => ({
      templates: [],

      saveTemplate: ({ name, description, steps }) => {
        // DB(massCase)/ケースID/ステータス/バインドを空に正規化して保存
        const tpl: CustomTemplate = {
          id: uuidv4(),
          name: name.trim() || 'マイテンプレート',
          description: description.trim(),
          icon: 'bookmark-star',
          steps: normalizeStepsForTemplateSave(steps),
          createdAt: nowIso(),
        };
        set((s) => ({ templates: [tpl, ...s.templates] }));
        return tpl;
      },

      deleteTemplate: (id) =>
        set((s) => ({ templates: s.templates.filter((t) => t.id !== id) })),

      renameTemplate: (id, name, description) =>
        set((s) => ({
          templates: s.templates.map((t) =>
            t.id === id
              ? { ...t, name: name.trim() || t.name, description: description ?? t.description }
              : t
          ),
        })),
    }),
    {
      name: 'rocketdb-flow-template-store',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
