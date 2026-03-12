/**
 * UI Slice - panel visibility, layout state
 */
import type { StateCreator } from 'zustand';

export interface UISlice {
  showBrushPanel: boolean;
  showColorPanel: boolean;
  showLayerPanel: boolean;
  toggleBrushPanel: () => void;
  toggleColorPanel: () => void;
  toggleLayerPanel: () => void;
}

export const createUISlice: StateCreator<UISlice> = (set) => ({
  showBrushPanel: true,
  showColorPanel: true,
  showLayerPanel: true,
  toggleBrushPanel: () => set((s) => ({ showBrushPanel: !s.showBrushPanel })),
  toggleColorPanel: () => set((s) => ({ showColorPanel: !s.showColorPanel })),
  toggleLayerPanel: () => set((s) => ({ showLayerPanel: !s.showLayerPanel })),
});
