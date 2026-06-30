import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { cloudStorage } from '../utils/cloudStorage';
import { createCaseSlice } from './slices/caseSlice';
import { createComponentSlice } from './slices/componentSlice';
import { createParameterSlice } from './slices/parameterSlice';
import { createMassApplySlice } from './slices/massApplySlice';
import { createChangeSlice } from './slices/changeSlice';
import { createUndoSlice } from './slices/undoSlice';
import type { MassCaseStore } from './massCaseStore.types';

export type { MassCaseStore };

export const useMassCaseStore = create<MassCaseStore>()(
  persist(
    (...a) => ({
      ...createCaseSlice(...a),
      ...createComponentSlice(...a),
      ...createParameterSlice(...a),
      ...createMassApplySlice(...a),
      ...createChangeSlice(...a),
      ...createUndoSlice(...a),
    }),
    {
      name: 'sizing-mass-cases',
      // undoStack/redoStack は揮発でよい(永続化するとリロードで意図せず古い状態に戻り得る)
      partialize: (state) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { undoStack: _u, redoStack: _r, isUndoRedoActive: _a, ...rest } = state;
        return rest as unknown as MassCaseStore;
      },
      storage: createJSONStorage(() => cloudStorage),
      skipHydration: true,
    }
  )
);
