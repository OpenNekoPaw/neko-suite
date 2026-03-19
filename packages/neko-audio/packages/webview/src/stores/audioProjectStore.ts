/**
 * Audio Project Store — 管理 .nka 项目数据 + EditOperation dispatch + undo/redo
 *
 * 仅在 projectMode 下使用。effectsChain 和 markers 通过 dispatch 修改，
 * 支持操作级别的 undo/redo 和 Extension 同步。
 */

import { create } from 'zustand';
import {
  applyAudioOperation,
  invertOperation,
  type AudioProjectData,
  type EditOperation,
  type AudioEffectSnapshot,
  type AudioMarkerSnapshot,
} from '@neko/shared';
import { syncOperationToExtension } from './utils/extension-sync';
import { createMeta } from './utils/operation-helpers';

const MAX_OP_HISTORY_SIZE = 200;

export interface AudioProjectStore {
  // State
  audioProjectData: AudioProjectData | null;
  opUndoStack: EditOperation[];
  opRedoStack: EditOperation[];

  // Init / Reset
  initProject: (data: AudioProjectData) => void;
  reset: () => void;

  // Dispatch
  dispatch: (op: EditOperation) => void;
  dispatchBatch: (ops: EditOperation[]) => void;

  // Undo / Redo
  opUndo: () => void;
  opRedo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Convenience actions (build EditOperation internally)
  addEffect: (effect: AudioEffectSnapshot) => void;
  removeEffect: (effectId: string) => void;
  toggleEffect: (effectId: string) => void;
  updateEffectParams: (effectId: string, params: Partial<Omit<AudioEffectSnapshot, 'id'>>) => void;
  moveEffect: (fromIndex: number, toIndex: number) => void;
  addMarker: (marker: AudioMarkerSnapshot) => void;
  removeMarker: (markerId: string) => void;
  updateMarker: (markerId: string, updates: Partial<Omit<AudioMarkerSnapshot, 'id'>>) => void;
}

export const useAudioProjectStore = create<AudioProjectStore>()((set, get) => ({
  audioProjectData: null,
  opUndoStack: [],
  opRedoStack: [],

  initProject: (data) => {
    set({ audioProjectData: data, opUndoStack: [], opRedoStack: [] });
  },

  reset: () => {
    set({ audioProjectData: null, opUndoStack: [], opRedoStack: [] });
  },

  dispatch: (op) => {
    const { audioProjectData, opUndoStack } = get();
    if (!audioProjectData) return;

    try {
      const newData = applyAudioOperation(audioProjectData, op as any);
      set({
        audioProjectData: newData,
        opUndoStack: [...opUndoStack.slice(-(MAX_OP_HISTORY_SIZE - 1)), op],
        opRedoStack: [],
      });
      syncOperationToExtension(op);
    } catch (e) {
      console.error('[AudioProject] dispatch failed:', e, op);
    }
  },

  dispatchBatch: (ops) => {
    const { audioProjectData, opUndoStack } = get();
    if (!audioProjectData || ops.length === 0) return;

    const batchOp: EditOperation = {
      type: 'batch',
      meta: createMeta('user'),
      payload: { operations: ops },
    };

    try {
      let data = audioProjectData;
      for (const op of ops) {
        data = applyAudioOperation(data, op as any);
      }
      set({
        audioProjectData: data,
        opUndoStack: [...opUndoStack.slice(-(MAX_OP_HISTORY_SIZE - 1)), batchOp],
        opRedoStack: [],
      });
      syncOperationToExtension(batchOp);
    } catch (e) {
      console.error('[AudioProject] batch failed:', e, ops);
    }
  },

  opUndo: () => {
    const { opUndoStack, audioProjectData } = get();
    if (opUndoStack.length === 0 || !audioProjectData) return;

    const op = opUndoStack[opUndoStack.length - 1]!;
    const inv = invertOperation(op);

    try {
      const newData = applyAudioOperation(audioProjectData, inv as any);
      const { opRedoStack } = get();
      set({
        audioProjectData: newData,
        opUndoStack: opUndoStack.slice(0, -1),
        opRedoStack: [...opRedoStack, op],
      });
      syncOperationToExtension(inv);
    } catch (e) {
      console.error('[AudioProject] opUndo failed:', e);
    }
  },

  opRedo: () => {
    const { opRedoStack, audioProjectData } = get();
    if (opRedoStack.length === 0 || !audioProjectData) return;

    const op = opRedoStack[opRedoStack.length - 1]!;

    try {
      const newData = applyAudioOperation(audioProjectData, op as any);
      const { opUndoStack } = get();
      set({
        audioProjectData: newData,
        opUndoStack: [...opUndoStack, op],
        opRedoStack: opRedoStack.slice(0, -1),
      });
      syncOperationToExtension(op);
    } catch (e) {
      console.error('[AudioProject] opRedo failed:', e);
    }
  },

  canUndo: () => get().opUndoStack.length > 0,
  canRedo: () => get().opRedoStack.length > 0,

  // =========================================================================
  // Convenience actions — 构建 EditOperation 并 dispatch
  // =========================================================================

  addEffect: (effect) => {
    get().dispatch({
      type: 'audio.effect.add',
      meta: createMeta('user', `Add effect: ${effect.name}`),
      payload: { effect },
    });
  },

  removeEffect: (effectId) => {
    const data = get().audioProjectData;
    if (!data) return;
    const idx = data.effectsChain.findIndex((e) => e.id === effectId);
    if (idx === -1) return;
    const effect = data.effectsChain[idx]!;
    get().dispatch({
      type: 'audio.effect.remove',
      meta: createMeta('user', `Remove effect: ${effect.name}`),
      payload: { effectId },
      before: { effect, index: idx },
    });
  },

  toggleEffect: (effectId) => {
    get().dispatch({
      type: 'audio.effect.toggle',
      meta: createMeta('user', 'Toggle effect'),
      payload: { effectId, field: 'enabled' },
    });
  },

  updateEffectParams: (effectId, updates) => {
    const data = get().audioProjectData;
    if (!data) return;
    const effect = data.effectsChain.find((e) => e.id === effectId);
    if (!effect) return;
    const before: Partial<Omit<AudioEffectSnapshot, 'id'>> = {};
    for (const key of Object.keys(updates) as Array<keyof typeof updates>) {
      (before as any)[key] = (effect as any)[key];
    }
    get().dispatch({
      type: 'audio.effect.update',
      meta: createMeta('user', 'Update effect params'),
      payload: { effectId, updates },
      before: { updates: before },
    });
  },

  moveEffect: (fromIndex, toIndex) => {
    const data = get().audioProjectData;
    if (!data) return;
    const effect = data.effectsChain[fromIndex];
    if (!effect) return;
    get().dispatch({
      type: 'audio.effect.move',
      meta: createMeta('user', 'Move effect'),
      payload: { effectId: effect.id, fromIndex, toIndex },
    });
  },

  addMarker: (marker) => {
    get().dispatch({
      type: 'audio.marker.add',
      meta: createMeta('user', `Add marker: ${marker.label}`),
      payload: { marker },
    });
  },

  removeMarker: (markerId) => {
    const data = get().audioProjectData;
    if (!data) return;
    const marker = data.markers.find((m) => m.id === markerId);
    if (!marker) return;
    get().dispatch({
      type: 'audio.marker.remove',
      meta: createMeta('user', `Remove marker: ${marker.label}`),
      payload: { markerId },
      before: { marker },
    });
  },

  updateMarker: (markerId, updates) => {
    const data = get().audioProjectData;
    if (!data) return;
    const marker = data.markers.find((m) => m.id === markerId);
    if (!marker) return;
    const before: Partial<Omit<AudioMarkerSnapshot, 'id'>> = {};
    for (const key of Object.keys(updates) as Array<keyof typeof updates>) {
      (before as any)[key] = (marker as any)[key];
    }
    get().dispatch({
      type: 'audio.marker.update',
      meta: createMeta('user', 'Update marker'),
      payload: { markerId, updates },
      before: { updates: before },
    });
  },
}));
