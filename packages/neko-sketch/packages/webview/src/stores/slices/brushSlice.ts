/**
 * Brush Slice - brush settings state
 */
import type { StateCreator } from 'zustand';
import type { BrushSettings, BrushType } from '../../types';
import { getDefaultBrushSettings } from '../../brush';

export interface BrushSlice {
  brushSettings: BrushSettings;
  setBrushSettings: (updates: Partial<BrushSettings>) => void;
  setBrushType: (type: BrushType) => void;
  setBrushColor: (color: string) => void;
  setBrushSize: (size: number) => void;
  setBrushOpacity: (opacity: number) => void;
}

export const createBrushSlice: StateCreator<BrushSlice> = (set) => ({
  brushSettings: getDefaultBrushSettings('pen'),

  setBrushSettings: (updates) =>
    set((state) => ({
      brushSettings: { ...state.brushSettings, ...updates },
    })),

  setBrushType: (type) =>
    set((state) => ({
      brushSettings: {
        ...getDefaultBrushSettings(type, state.brushSettings.color),
      },
    })),

  setBrushColor: (color) =>
    set((state) => ({
      brushSettings: { ...state.brushSettings, color },
    })),

  setBrushSize: (size) =>
    set((state) => ({
      brushSettings: { ...state.brushSettings, size: Math.max(1, Math.min(500, size)) },
    })),

  setBrushOpacity: (opacity) =>
    set((state) => ({
      brushSettings: { ...state.brushSettings, opacity: Math.max(0, Math.min(1, opacity)) },
    })),
});
