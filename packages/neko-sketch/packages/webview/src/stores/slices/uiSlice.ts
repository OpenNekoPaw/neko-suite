/**
 * UI Slice - panel visibility, layout state
 */
import type { StateCreator } from 'zustand';

export interface UISlice {
  showSidebar: boolean;
  showBrushPanel: boolean;
  showLayerPanel: boolean;
  sidebarWidth: number;
  toggleSidebar: () => void;
  toggleBrushPanel: () => void;
  toggleLayerPanel: () => void;
  setSidebarWidth: (width: number) => void;
}

export const createUISlice: StateCreator<UISlice> = (set) => ({
  showSidebar: true,
  showBrushPanel: true,
  showLayerPanel: true,
  sidebarWidth: 240,
  toggleSidebar: () => set((s) => ({ showSidebar: !s.showSidebar })),
  toggleBrushPanel: () => set((s) => ({ showBrushPanel: !s.showBrushPanel })),
  toggleLayerPanel: () => set((s) => ({ showLayerPanel: !s.showLayerPanel })),
  setSidebarWidth: (width) => set({ sidebarWidth: Math.max(200, Math.min(400, width)) }),
});
