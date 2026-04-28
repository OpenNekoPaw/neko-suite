/**
 * Viewport Slice - pan, zoom, rotation state
 */
import type { StateCreator } from 'zustand';
import type { ViewportState } from '../../types';

export interface ViewportSlice {
  viewport: ViewportState;
  setViewport: (updates: Partial<ViewportState>) => void;
  zoomTo: (zoom: number) => void;
  rotateViewportBy: (radians: number) => void;
  resetViewportRotation: () => void;
  resetViewport: () => void;
  panBy: (dx: number, dy: number) => void;
}

const DEFAULT_VIEWPORT: ViewportState = {
  panX: 0,
  panY: 0,
  zoom: 1,
  rotation: 0,
};

export const createViewportSlice: StateCreator<ViewportSlice> = (set) => ({
  viewport: { ...DEFAULT_VIEWPORT },

  setViewport: (updates) =>
    set((state) => ({
      viewport: { ...state.viewport, ...updates },
    })),

  zoomTo: (zoom) =>
    set((state) => ({
      viewport: { ...state.viewport, zoom: Math.max(0.1, Math.min(32, zoom)) },
    })),

  rotateViewportBy: (radians) =>
    set((state) => ({
      viewport: {
        ...state.viewport,
        rotation: normalizeRotation(state.viewport.rotation + radians),
      },
    })),

  resetViewportRotation: () =>
    set((state) => ({
      viewport: { ...state.viewport, rotation: 0 },
    })),

  resetViewport: () => set({ viewport: { ...DEFAULT_VIEWPORT } }),

  panBy: (dx, dy) =>
    set((state) => ({
      viewport: {
        ...state.viewport,
        panX: state.viewport.panX + dx,
        panY: state.viewport.panY + dy,
      },
    })),
});

function normalizeRotation(radians: number): number {
  const fullTurn = Math.PI * 2;
  const normalized = ((radians % fullTurn) + fullTurn) % fullTurn;
  return normalized > Math.PI ? normalized - fullTurn : normalized;
}
