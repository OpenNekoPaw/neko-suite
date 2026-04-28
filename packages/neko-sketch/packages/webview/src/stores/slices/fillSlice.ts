/**
 * Fill Slice - solid and pattern fill tool settings
 */
import type { StateCreator } from 'zustand';
import type { FillSettings } from '../../types';

export interface FillSlice {
  fillSettings: FillSettings;
  setFillSettings: (updates: Partial<FillSettings>) => void;
}

export const createFillSlice: StateCreator<FillSlice> = (set) => ({
  fillSettings: {
    pattern: 'solid',
    patternSize: 12,
  },

  setFillSettings: (updates) =>
    set((state) => ({
      fillSettings: {
        ...state.fillSettings,
        ...updates,
        patternSize:
          updates.patternSize === undefined
            ? state.fillSettings.patternSize
            : Math.max(2, Math.min(96, Math.round(updates.patternSize))),
      },
    })),
});
