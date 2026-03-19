/**
 * Sketch Operation Store — 在 sketch store 操作时生成 EditOperation
 *
 * 桥接层：记录 layer/canvas/stroke 操作为 EditOperation，同步到 Extension。
 * 保持现有 HistorySlice 快照式 undo/redo 不变。
 */

import { create } from 'zustand';
import type { EditOperation, OperationMeta, OperationSource } from '@neko/shared';

// =============================================================================
// Extension Sync
// =============================================================================

function postMessage(message: Record<string, unknown>): void {
  const vscode = (window as any).__vscode_api__;
  if (vscode) {
    vscode.postMessage(message);
  }
}

function syncOperationToExtension(op: EditOperation): void {
  postMessage({ type: 'operationApplied', operation: op });
}

// =============================================================================
// Meta Helper
// =============================================================================

let counter = 0;

function createMeta(source: OperationSource = 'user', description?: string): OperationMeta {
  return {
    id: `sketch-op-${Date.now()}-${++counter}`,
    timestamp: Date.now(),
    source,
    description,
  };
}

// =============================================================================
// Store
// =============================================================================

export interface SketchOperationStore {
  operationLog: EditOperation[];
  maxLogSize: number;

  recordOperation: (op: EditOperation) => void;
  clearLog: () => void;

  // Convenience builders
  recordLayerAdd: (layer: Record<string, unknown>, parentId?: string, index?: number) => void;
  recordLayerRemove: (
    layerId: string,
    layer: Record<string, unknown>,
    parentId?: string,
    index?: number,
  ) => void;
  recordLayerUpdate: (
    layerId: string,
    updates: Record<string, unknown>,
    before: Record<string, unknown>,
  ) => void;
  recordLayerMove: (
    layerId: string,
    targetParentId: string | undefined,
    targetIndex: number,
    oldParentId: string | undefined,
    oldIndex: number,
  ) => void;
  recordLayerDuplicate: (newLayer: Record<string, unknown>, sourceId: string) => void;
  recordLayerGroup: (groupLayer: Record<string, unknown>, childIds: string[]) => void;
  recordLayerUngroup: (
    groupId: string,
    groupLayer: Record<string, unknown>,
    childIds: string[],
  ) => void;
  recordStrokeApply: (layerId: string, regionAfter: unknown, regionBefore: unknown) => void;
  recordCanvasUpdate: (updates: Record<string, unknown>, before: Record<string, unknown>) => void;
}

export const useSketchOperationStore = create<SketchOperationStore>((set, get) => ({
  operationLog: [],
  maxLogSize: 500,

  recordOperation: (op) => {
    const { operationLog, maxLogSize } = get();
    const newLog = [...operationLog, op];
    if (newLog.length > maxLogSize) {
      newLog.splice(0, newLog.length - maxLogSize);
    }
    set({ operationLog: newLog });
    syncOperationToExtension(op);
  },

  clearLog: () => set({ operationLog: [] }),

  recordLayerAdd: (layer, parentId, index) => {
    get().recordOperation({
      type: 'sketch.layer.add',
      meta: createMeta('user', `Add layer: ${(layer as any).name ?? 'Layer'}`),
      payload: { layer, parentId, index },
    } as unknown as EditOperation);
  },

  recordLayerRemove: (layerId, layer, parentId, index) => {
    get().recordOperation({
      type: 'sketch.layer.remove',
      meta: createMeta('user', `Remove layer: ${(layer as any).name ?? 'Layer'}`),
      payload: { layerId },
      before: { layer, parentId, index },
    } as unknown as EditOperation);
  },

  recordLayerUpdate: (layerId, updates, before) => {
    get().recordOperation({
      type: 'sketch.layer.update',
      meta: createMeta('user', 'Update layer'),
      payload: { layerId, updates },
      before: { updates: before },
    } as unknown as EditOperation);
  },

  recordLayerMove: (layerId, targetParentId, targetIndex, oldParentId, oldIndex) => {
    get().recordOperation({
      type: 'sketch.layer.move',
      meta: createMeta('user', 'Move layer'),
      payload: { layerId, targetParentId, targetIndex },
      before: { parentId: oldParentId, index: oldIndex },
    } as unknown as EditOperation);
  },

  recordLayerDuplicate: (newLayer, sourceId) => {
    get().recordOperation({
      type: 'sketch.layer.duplicate',
      meta: createMeta('user', 'Duplicate layer'),
      payload: { sourceLayerId: sourceId, newLayer },
    } as unknown as EditOperation);
  },

  recordLayerGroup: (groupLayer, childIds) => {
    get().recordOperation({
      type: 'sketch.layer.group',
      meta: createMeta('user', 'Group layers'),
      payload: { groupLayer, childIds },
    } as unknown as EditOperation);
  },

  recordLayerUngroup: (groupId, groupLayer, childIds) => {
    get().recordOperation({
      type: 'sketch.layer.ungroup',
      meta: createMeta('user', 'Ungroup layers'),
      payload: { groupId },
      before: { groupLayer, childIds },
    } as unknown as EditOperation);
  },

  recordStrokeApply: (layerId, regionAfter, regionBefore) => {
    get().recordOperation({
      type: 'sketch.stroke.apply',
      meta: createMeta('user', 'Apply stroke'),
      payload: { layerId, regionAfter },
      before: { regionBefore },
    } as unknown as EditOperation);
  },

  recordCanvasUpdate: (updates, before) => {
    get().recordOperation({
      type: 'sketch.canvas.update',
      meta: createMeta('user', 'Update canvas'),
      payload: { updates },
      before: { updates: before },
    } as unknown as EditOperation);
  },
}));
