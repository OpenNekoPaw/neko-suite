/**
 * Brush Slice - brush settings state
 */
import type { StateCreator } from 'zustand';
import type { BrushSettings, BrushType, SymmetryConfig } from '../../types';
import { getDefaultBrushSettings } from '../../brush';

export interface BrushSlice {
  brushSettings: BrushSettings;
  symmetry: SymmetryConfig;
  setBrushSettings: (updates: Partial<BrushSettings>) => void;
  setSymmetry: (updates: Partial<SymmetryConfig>) => void;
  setBrushType: (type: BrushType) => void;
  setBrushColor: (color: string) => void;
  setBrushSize: (size: number) => void;
  setBrushOpacity: (opacity: number) => void;
}

export const createBrushSlice: StateCreator<BrushSlice> = (set) => ({
  brushSettings: getDefaultBrushSettings('pen'),
  symmetry: { mode: 'none', axisX: 0, axisY: 0, radialCount: 4 },

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

  setSymmetry: (updates) =>
    set((state) => ({
      symmetry: { ...state.symmetry, ...updates },
    })),
});
