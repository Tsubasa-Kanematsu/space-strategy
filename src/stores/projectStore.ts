import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { cloudStorage } from '../utils/cloudStorage';
import { v4 as uuidv4 } from 'uuid';
import type { Project } from '../types';

interface ProjectStore {
  projects: Project[];
  addProject: (data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => Project;
  updateProject: (id: string, data: Partial<Omit<Project, 'id' | 'createdAt'>>) => void;
  deleteProject: (id: string) => void;
  getProject: (id: string) => Project | undefined;
  setActiveDb: (projectId: string, dbId: string) => void;
}

const now = () => new Date().toISOString();

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      projects: [],

      addProject: (data) => {
        const project: Project = {
          id: uuidv4(),
          ...data,
          createdAt: now(),
          updatedAt: now(),
        };
        set((s) => ({ projects: [...s.projects, project] }));
        return project;
      },

      updateProject: (id, data) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, ...data, updatedAt: now() } : p
          ),
        })),

      deleteProject: (id) =>
        set((s) => ({ projects: s.projects.filter((p) => p.id !== id) })),

      getProject: (id) => get().projects.find((p) => p.id === id),

      setActiveDb: (projectId, dbId) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId ? { ...p, activeDbId: dbId, updatedAt: now() } : p
          ),
        })),
    }),
    {
      name: 'sizing-projects',
      storage: createJSONStorage(() => cloudStorage),
      // 認証完了後に App.tsx から明示的に rehydrate を呼ぶ。
      // 自動 rehydrate だと token なし状態で 401 になり初期化失敗する。
      skipHydration: true,
    }
  )
);
