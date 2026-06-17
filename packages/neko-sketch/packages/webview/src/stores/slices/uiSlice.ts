/**
 * UI Slice - panel visibility, layout state
 */
import type { StateCreator } from 'zustand';

export interface UISlice {
  showSidebar: boolean;
  showBrushPanel: boolean;
  showLayerPanel: boolean;
  showFrameTimeline: boolean;
  sidebarWidth: number;
  toggleSidebar: () => void;
  toggleBrushPanel: () => void;
  toggleLayerPanel: () => void;
  toggleFrameTimeline: () => void;
  setSidebarWidth: (width: number) => void;
}

export const createUISlice: StateCreator<UISlice> = (set) => ({
  showSidebar: false,
  showBrushPanel: true,
  showLayerPanel: true,
  showFrameTimeline: true,
  sidebarWidth: 300,
  toggleSidebar: () => set((s) => ({ showSidebar: !s.showSidebar })),
  toggleBrushPanel: () => set((s) => ({ showBrushPanel: !s.showBrushPanel })),
  toggleLayerPanel: () => set((s) => ({ showLayerPanel: !s.showLayerPanel })),
  toggleFrameTimeline: () => set((s) => ({ showFrameTimeline: !s.showFrameTimeline })),
  setSidebarWidth: (width) => set({ sidebarWidth: Math.max(220, Math.min(440, width)) }),
});
