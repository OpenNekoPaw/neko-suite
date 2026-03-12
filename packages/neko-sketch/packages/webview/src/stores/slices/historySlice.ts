/**
 * History Slice - undo/redo state using HistoryManager
 */
import type { StateCreator } from 'zustand';
import type { HistoryEntry } from '../../types';
import { HistoryManager } from '../../history';

const historyManager = new HistoryManager();

export interface HistorySlice {
  canUndo: boolean;
  canRedo: boolean;
  pushHistory: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void;
  undo: () => HistoryEntry | null;
  redo: () => HistoryEntry | null;
  clearHistory: () => void;
}

export const createHistorySlice: StateCreator<HistorySlice> = (set) => ({
  canUndo: false,
  canRedo: false,

  pushHistory: (entry) => {
    historyManager.push(entry);
    set({
      canUndo: historyManager.canUndo(),
      canRedo: historyManager.canRedo(),
    });
  },

  undo: () => {
    const entry = historyManager.undo();
    set({
      canUndo: historyManager.canUndo(),
      canRedo: historyManager.canRedo(),
    });
    return entry;
  },

  redo: () => {
    const entry = historyManager.redo();
    set({
      canUndo: historyManager.canUndo(),
      canRedo: historyManager.canRedo(),
    });
    return entry;
  },

  clearHistory: () => {
    historyManager.clear();
    set({ canUndo: false, canRedo: false });
  },
});
