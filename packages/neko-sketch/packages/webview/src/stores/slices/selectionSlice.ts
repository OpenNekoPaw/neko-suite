/**
 * Selection Slice - manages pixel selection state
 */
import type { StateCreator } from 'zustand';
import type { SelectionMask } from '../../types';
import type { Point2D } from '../../utils/scanline-fill';
import { SelectionManager } from '../../selection/selection-manager';

const selectionManager = new SelectionManager();

export interface SelectionSlice {
  // State
  selection: SelectionMask | null;

  // Actions
  selectAll: () => void;
  selectRect: (x: number, y: number, width: number, height: number) => void;
  selectLasso: (points: readonly Point2D[]) => void;
  selectWand: (
    imageData: Uint8Array,
    startX: number,
    startY: number,
    tolerance: number,
    contiguous: boolean,
  ) => void;
  clearSelection: () => void;
  invertSelection: () => void;
}

export const createSelectionSlice: StateCreator<SelectionSlice> = (set, get) => ({
  selection: null,

  selectAll: () => {
    const canvas = (get() as unknown as { canvas: { width: number; height: number } }).canvas;
    selectionManager.selectAll(canvas.width, canvas.height);
    set({ selection: selectionManager.getSelection() });
  },

  selectRect: (x, y, width, height) => {
    const canvas = (get() as unknown as { canvas: { width: number; height: number } }).canvas;
    selectionManager.selectRect(x, y, width, height, canvas.width, canvas.height);
    set({ selection: selectionManager.getSelection() });
  },

  selectLasso: (points) => {
    const canvas = (get() as unknown as { canvas: { width: number; height: number } }).canvas;
    selectionManager.selectLasso(points, canvas.width, canvas.height);
    set({ selection: selectionManager.getSelection() });
  },

  selectWand: (imageData, startX, startY, tolerance, contiguous) => {
    const canvas = (get() as unknown as { canvas: { width: number; height: number } }).canvas;
    selectionManager.selectWand(
      imageData,
      startX,
      startY,
      tolerance,
      canvas.width,
      canvas.height,
      contiguous,
    );
    set({ selection: selectionManager.getSelection() });
  },

  clearSelection: () => {
    selectionManager.clearSelection();
    set({ selection: null });
  },

  invertSelection: () => {
    const canvas = (get() as unknown as { canvas: { width: number; height: number } }).canvas;
    selectionManager.invertSelection(canvas.width, canvas.height);
    set({ selection: selectionManager.getSelection() });
  },
});
