/**
 * UI Slice - panel visibility, layout state
 */
import type { StateCreator } from 'zustand';

export interface UISlice {
  showSidebar: boolean;
  showBrushPanel: boolean;
  showColorPanel: boolean;
  showLayerPanel: boolean;
  toggleSidebar: () => void;
  toggleBrushPanel: () => void;
  toggleColorPanel: () => void;
  toggleLayerPanel: () => void;
}

export const createUISlice: StateCreator<UISlice> = (set) => ({
  showSidebar: true,
  showBrushPanel: true,
  showColorPanel: true,
  showLayerPanel: true,
  toggleSidebar: () => set((s) => ({ showSidebar: !s.showSidebar })),
  toggleBrushPanel: () => set((s) => ({ showBrushPanel: !s.showBrushPanel })),
  toggleColorPanel: () => set((s) => ({ showColorPanel: !s.showColorPanel })),
  toggleLayerPanel: () => set((s) => ({ showLayerPanel: !s.showLayerPanel })),
});
