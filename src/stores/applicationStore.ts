import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { cloudStorage } from '../utils/cloudStorage';
import { v4 as uuidv4 } from 'uuid';
import type { Application, ApplicationStatus } from '../types';

interface ApplicationStore {
  applications: Application[];
  /** 申請書を作成（同一号機に既存があれば上書きせず既存を返す） */
  upsertForUnit: (data: Omit<Application, 'id' | 'createdAt' | 'updatedAt'>) => Application;
  updateApplication: (id: string, data: Partial<Omit<Application, 'id' | 'createdAt'>>) => void;
  deleteApplication: (id: string) => void;
  getApplication: (id: string) => Application | undefined;
  getByUnit: (vehicleUnitId: string) => Application | undefined;
  /** 内閣府へ提出済みにする */
  submit: (id: string) => void;
  setStatus: (id: string, status: ApplicationStatus) => void;
}

const now = () => new Date().toISOString();

export const useApplicationStore = create<ApplicationStore>()(
  persist(
    (set, get) => ({
      applications: [],

      upsertForUnit: (data) => {
        const existing = get().applications.find((a) => a.vehicleUnitId === data.vehicleUnitId);
        if (existing) {
          // 既存はステータス・提出情報を維持しつつ本文（results 等）を更新
          const merged: Application = {
            ...existing,
            ...data,
            status: existing.status,
            submittedTo: existing.submittedTo,
            submittedAt: existing.submittedAt,
            generatedAt: existing.generatedAt,
            updatedAt: now(),
          };
          set((s) => ({
            applications: s.applications.map((a) => (a.id === existing.id ? merged : a)),
          }));
          return merged;
        }
        const app: Application = {
          id: uuidv4(),
          ...data,
          createdAt: now(),
          updatedAt: now(),
        };
        set((s) => ({ applications: [...s.applications, app] }));
        return app;
      },

      updateApplication: (id, data) =>
        set((s) => ({
          applications: s.applications.map((a) =>
            a.id === id ? { ...a, ...data, updatedAt: now() } : a
          ),
        })),

      deleteApplication: (id) =>
        set((s) => ({ applications: s.applications.filter((a) => a.id !== id) })),

      getApplication: (id) => get().applications.find((a) => a.id === id),

      getByUnit: (vehicleUnitId) =>
        get().applications.find((a) => a.vehicleUnitId === vehicleUnitId),

      submit: (id) =>
        set((s) => ({
          applications: s.applications.map((a) =>
            a.id === id ? { ...a, status: '提出済み', submittedAt: now(), updatedAt: now() } : a
          ),
        })),

      setStatus: (id, status) =>
        set((s) => ({
          applications: s.applications.map((a) =>
            a.id === id ? { ...a, status, updatedAt: now() } : a
          ),
        })),
    }),
    {
      name: 'applications',
      storage: createJSONStorage(() => cloudStorage),
      skipHydration: true,
    }
  )
);
