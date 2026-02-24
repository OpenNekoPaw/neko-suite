/**
 * Operation History Slice — 操作式 undo/redo
 *
 * 与旧的 historySlice（快照式）并行运行。
 * 已迁移的 slice 通过 dispatch → pushOperation 进入此栈。
 * 未迁移的 slice 仍使用旧的 pushHistory → history[] 栈。
 */

import { StateCreator } from 'zustand';
import type { ProjectData } from '../../types';
import { applyOperation, invertOperation, type EditOperation } from '@neko/shared';

const MAX_OP_HISTORY_SIZE = 200;

// 依赖接口
interface ProjectDependency {
  project: ProjectData | null;
}

export interface OperationHistorySlice {
  // State
  opUndoStack: EditOperation[];
  opRedoStack: EditOperation[];

  // Actions
  /** 推入操作到 undo 栈（由 dispatch 调用） */
  pushOperation: (op: EditOperation) => void;
  /** 操作式撤销 */
  opUndo: () => void;
  /** 操作式重做 */
  opRedo: () => void;
  /** 清空操作历史 */
  clearOpHistory: () => void;
}

export const createOperationHistorySlice: StateCreator<
  OperationHistorySlice & ProjectDependency,
  [],
  [],
  OperationHistorySlice
> = (set, get) => ({
  opUndoStack: [],
  opRedoStack: [],

  pushOperation: (op) => {
    const { opUndoStack } = get();
    set({
      opUndoStack: [...opUndoStack.slice(-(MAX_OP_HISTORY_SIZE - 1)), op],
      opRedoStack: [],
    });
  },

  opUndo: () => {
    const { opUndoStack, project } = get();
    if (opUndoStack.length === 0 || !project) return;

    const op = opUndoStack[opUndoStack.length - 1];
    const inv = invertOperation(op);

    try {
      const newProject = applyOperation(project as any, inv);
      const { opRedoStack } = get();
      set({
        project: newProject as any,
        opUndoStack: opUndoStack.slice(0, -1),
        opRedoStack: [...opRedoStack, op],
      });
    } catch (e) {
      console.error('[OperationHistory] opUndo failed:', e);
    }
  },

  opRedo: () => {
    const { opRedoStack, project } = get();
    if (opRedoStack.length === 0 || !project) return;

    const op = opRedoStack[opRedoStack.length - 1];

    try {
      const newProject = applyOperation(project as any, op);
      const { opUndoStack } = get();
      set({
        project: newProject as any,
        opUndoStack: [...opUndoStack, op],
        opRedoStack: opRedoStack.slice(0, -1),
      });
    } catch (e) {
      console.error('[OperationHistory] opRedo failed:', e);
    }
  },

  clearOpHistory: () => {
    set({ opUndoStack: [], opRedoStack: [] });
  },
});
