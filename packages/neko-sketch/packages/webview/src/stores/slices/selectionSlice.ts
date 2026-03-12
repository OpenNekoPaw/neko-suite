/**
 * Selection Slice - manages pixel selection state
 */
import type { StateCreator } from 'zustand';
import type { SelectionMask } from '../../types';
import { SelectionManager } from '../../selection/selection-manager';

const selectionManager = new SelectionManager();

export interface SelectionSlice {
  // State
  selection: SelectionMask | null;

  // Actions
  selectAll: () => void;
  selectRect: (x: number, y: number, width: number, height: number) => void;
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
