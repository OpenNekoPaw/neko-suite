/**
 * History Slice
 * 管理撤销/重做历史栈
 *
 * 优化策略：
 * 1. 防抖机制：连续快速操作只保存最后一个状态
 * 2. 批量操作：允许将多个操作合并为一个历史记录
 * 3. 延迟克隆：只在必要时进行深拷贝
 */

import { StateCreator } from 'zustand';
import type { ProjectData } from '../../types';

const MAX_HISTORY_SIZE = 50;
const DEBOUNCE_DELAY = 300; // ms

// 需要依赖的其他 Slices 接口
interface ProjectDependency {
  project: ProjectData | null;
}

// Module-level state for debouncing (not in Zustand to avoid re-renders)
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSnapshot: ProjectData | null = null;
let batchDepth = 0;
let batchStartSnapshot: ProjectData | null = null;

export interface HistorySlice {
  // State
  history: ProjectData[];
  redoStack: ProjectData[];

  // Actions
  /**
   * Push current state to history (with debouncing)
   * @param project - Current project state
   * @param immediate - If true, bypass debounce and save immediately
   */
  pushHistory: (project: ProjectData, immediate?: boolean) => void;

  /**
   * Start a batch operation - all changes until endBatch() will be merged into one history entry
   */
  startBatch: () => void;

  /**
   * End a batch operation and save to history
   */
  endBatch: () => void;

  /**
   * Undo last change
   */
  undo: () => void;

  /**
   * Redo last undone change
   */
  redo: () => void;

  /**
   * Clear all history
   */
  clearHistory: () => void;

  /**
   * Flush any pending debounced history
   */
  flushHistory: () => void;
}

export const createHistorySlice: StateCreator<
  HistorySlice & ProjectDependency,
  [],
  [],
  HistorySlice
> = (set, get) => ({
  // Initial state
  history: [],
  redoStack: [],

  // Actions
  pushHistory: (project, immediate = false) => {
    // If in batch mode, just update the pending snapshot
    if (batchDepth > 0) {
      pendingSnapshot = project;
      return;
    }

    // Clear any existing timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    // Store the pending snapshot
    pendingSnapshot = project;

    if (immediate) {
      // Immediate save: flush now
      const { history } = get();
      set({
        history: [...history.slice(-(MAX_HISTORY_SIZE - 1)), structuredClone(project)],
        redoStack: [],
      });
      pendingSnapshot = null;
    } else {
      // Debounced save: wait before committing
      debounceTimer = setTimeout(() => {
        if (pendingSnapshot) {
          const { history } = get();
          set({
            history: [...history.slice(-(MAX_HISTORY_SIZE - 1)), structuredClone(pendingSnapshot)],
            redoStack: [],
          });
          pendingSnapshot = null;
        }
        debounceTimer = null;
      }, DEBOUNCE_DELAY);
    }
  },

  startBatch: () => {
    if (batchDepth === 0) {
      // Save initial state at batch start
      const { project } = get();
      batchStartSnapshot = project ? structuredClone(project) : null;
    }
    batchDepth++;
  },

  endBatch: () => {
    if (batchDepth > 0) {
      batchDepth--;

      if (batchDepth === 0 && batchStartSnapshot) {
        // Batch ended, save the initial state to history
        const { history } = get();
        set({
          history: [...history.slice(-(MAX_HISTORY_SIZE - 1)), batchStartSnapshot],
          redoStack: [],
        });
        batchStartSnapshot = null;
        pendingSnapshot = null;
      }
    }
  },

  flushHistory: () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    if (pendingSnapshot && batchDepth === 0) {
      const { history } = get();
      set({
        history: [...history.slice(-(MAX_HISTORY_SIZE - 1)), structuredClone(pendingSnapshot)],
        redoStack: [],
      });
      pendingSnapshot = null;
    }
  },

  undo: () => {
    // Flush any pending changes first
    get().flushHistory();

    const { history, project, redoStack } = get();
    if (history.length === 0 || !project) return;

    const prev = history[history.length - 1];

    set({
      project: prev,
      history: history.slice(0, -1),
      redoStack: [...redoStack, structuredClone(project)],
    });
  },

  redo: () => {
    const { redoStack, project, history } = get();
    if (redoStack.length === 0 || !project) return;

    const next = redoStack[redoStack.length - 1];

    set({
      project: next,
      redoStack: redoStack.slice(0, -1),
      history: [...history, structuredClone(project)],
    });
  },

  clearHistory: () => {
    // Clear debounce timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    pendingSnapshot = null;
    batchDepth = 0;
    batchStartSnapshot = null;

    set({ history: [], redoStack: [] });
  },
});
