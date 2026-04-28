/**
 * Perspective Grid Slice - construction grid overlay state
 */
import type { StateCreator } from 'zustand';
import type {
  DocumentPoint,
  PerspectiveGridState,
  PerspectiveVanishingPointKey,
} from '../../types';

export interface PerspectiveGridSlice {
  perspectiveGrid: PerspectiveGridState;
  setPerspectiveGrid: (updates: Partial<Omit<PerspectiveGridState, 'vanishingPoints'>>) => void;
  setPerspectiveVanishingPoint: (key: PerspectiveVanishingPointKey, point: DocumentPoint) => void;
  resetPerspectiveGrid: (canvasWidth?: number, canvasHeight?: number) => void;
}

export function createDefaultPerspectiveGrid(
  canvasWidth = 800,
  canvasHeight = 600,
): PerspectiveGridState {
  const horizonY = canvasHeight * 0.42;
  return {
    enabled: false,
    snapEnabled: false,
    mode: 'two-point',
    divisions: 8,
    opacity: 0.42,
    vanishingPoints: {
      center: { x: canvasWidth * 0.5, y: horizonY },
      left: { x: -canvasWidth * 0.55, y: horizonY },
      right: { x: canvasWidth * 1.55, y: horizonY },
      vertical: { x: canvasWidth * 0.5, y: -canvasHeight * 0.8 },
    },
  };
}

export const createPerspectiveGridSlice: StateCreator<PerspectiveGridSlice> = (set) => ({
  perspectiveGrid: createDefaultPerspectiveGrid(),

  setPerspectiveGrid: (updates) =>
    set((state) => ({
      perspectiveGrid: {
        ...state.perspectiveGrid,
        ...updates,
        divisions:
          updates.divisions === undefined
            ? state.perspectiveGrid.divisions
            : Math.max(2, Math.min(24, Math.round(updates.divisions))),
        opacity:
          updates.opacity === undefined
            ? state.perspectiveGrid.opacity
            : Math.max(0.05, Math.min(1, updates.opacity)),
      },
    })),

  setPerspectiveVanishingPoint: (key, point) =>
    set((state) => ({
      perspectiveGrid: {
        ...state.perspectiveGrid,
        vanishingPoints: {
          ...state.perspectiveGrid.vanishingPoints,
          [key]: point,
        },
      },
    })),

  resetPerspectiveGrid: (canvasWidth, canvasHeight) =>
    set({
      perspectiveGrid: createDefaultPerspectiveGrid(canvasWidth, canvasHeight),
    }),
});
