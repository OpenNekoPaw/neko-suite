/**
 * Sketch Operation Store — 在 sketch store 操作时生成 EditOperation
 *
 * 桥接层：记录 layer/canvas/stroke 操作为 EditOperation，同步到 Extension。
 * 保持现有 HistorySlice 快照式 undo/redo 不变。
 */

import { create } from 'zustand';
import type {
  EditOperation,
  OperationMeta,
  OperationSource,
  RegionSnapshot,
  SketchCanvasUpdateOperation,
  SketchLayerAddOperation,
  SketchLayerDuplicateOperation,
  SketchLayerGroupOperation,
  SketchLayerMoveOperation,
  SketchLayerRemoveOperation,
  SketchLayerSnapshot,
  SketchLayerUngroupOperation,
  SketchLayerUpdateOperation,
  SketchLayerUpdates,
  SketchStrokeApplyOperation,
} from '@neko/shared';
import type { LayerData } from '../types';
import { postSketchMessage } from '../utils/vscode';

// =============================================================================
// Extension Sync
// =============================================================================

function postMessage(message: Record<string, unknown>): void {
  postSketchMessage(message);
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
  recordLayerAdd: (layer: LayerData, parentId?: string, index?: number) => void;
  recordLayerRemove: (layerId: string, layer: LayerData, parentId?: string, index?: number) => void;
  recordLayerUpdate: (
    layerId: string,
    updates: SketchLayerUpdates,
    before: SketchLayerUpdates,
  ) => void;
  recordLayerMove: (
    layerId: string,
    targetParentId: string | undefined,
    targetIndex: number,
    oldParentId: string | undefined,
    oldIndex: number,
  ) => void;
  recordLayerDuplicate: (newLayer: LayerData, sourceId: string) => void;
  recordLayerGroup: (groupLayer: LayerData, childIds: string[]) => void;
  recordLayerUngroup: (groupId: string, groupLayer: LayerData, childIds: string[]) => void;
  recordStrokeApply: (
    layerId: string,
    regionAfter: RegionSnapshot,
    regionBefore: RegionSnapshot,
  ) => void;
  recordCanvasUpdate: (
    updates: SketchCanvasUpdateOperation['payload']['updates'],
    before: SketchCanvasUpdateOperation['before']['updates'],
  ) => void;
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
    const operation: SketchLayerAddOperation = {
      type: 'sketch.layer.add',
      meta: createMeta('user', `Add layer: ${layer.name}`),
      payload: { layer: toLayerSnapshot(layer), parentId, index },
    };
    get().recordOperation(operation);
  },

  recordLayerRemove: (layerId, layer, parentId, index) => {
    const operation: SketchLayerRemoveOperation = {
      type: 'sketch.layer.remove',
      meta: createMeta('user', `Remove layer: ${layer.name}`),
      payload: { layerId },
      before: { layer: toLayerSnapshot(layer), parentId, index: index ?? 0 },
    };
    get().recordOperation(operation);
  },

  recordLayerUpdate: (layerId, updates, before) => {
    const operation: SketchLayerUpdateOperation = {
      type: 'sketch.layer.update',
      meta: createMeta('user', 'Update layer'),
      payload: { layerId, updates: toLayerUpdatesSnapshot(updates) },
      before: { updates: toLayerUpdatesSnapshot(before) },
    };
    get().recordOperation(operation);
  },

  recordLayerMove: (layerId, targetParentId, targetIndex, oldParentId, oldIndex) => {
    const operation: SketchLayerMoveOperation = {
      type: 'sketch.layer.move',
      meta: createMeta('user', 'Move layer'),
      payload: { layerId, targetParentId, targetIndex },
      before: { parentId: oldParentId, index: oldIndex },
    };
    get().recordOperation(operation);
  },

  recordLayerDuplicate: (newLayer, sourceId) => {
    const operation: SketchLayerDuplicateOperation = {
      type: 'sketch.layer.duplicate',
      meta: createMeta('user', 'Duplicate layer'),
      payload: { sourceLayerId: sourceId, newLayer: toLayerSnapshot(newLayer) },
    };
    get().recordOperation(operation);
  },

  recordLayerGroup: (groupLayer, childIds) => {
    const operation: SketchLayerGroupOperation = {
      type: 'sketch.layer.group',
      meta: createMeta('user', 'Group layers'),
      payload: { groupLayer: toLayerSnapshot(groupLayer), childIds },
    };
    get().recordOperation(operation);
  },

  recordLayerUngroup: (groupId, groupLayer, childIds) => {
    const operation: SketchLayerUngroupOperation = {
      type: 'sketch.layer.ungroup',
      meta: createMeta('user', 'Ungroup layers'),
      payload: { groupId },
      before: { groupLayer: toLayerSnapshot(groupLayer), childIds },
    };
    get().recordOperation(operation);
  },

  recordStrokeApply: (layerId, regionAfter, regionBefore) => {
    const operation: SketchStrokeApplyOperation = {
      type: 'sketch.stroke.apply',
      meta: createMeta('user', 'Apply stroke'),
      payload: { layerId, regionAfter },
      before: { regionBefore },
    };
    get().recordOperation(operation);
  },

  recordCanvasUpdate: (updates, before) => {
    const operation: SketchCanvasUpdateOperation = {
      type: 'sketch.canvas.update',
      meta: createMeta('user', 'Update canvas'),
      payload: { updates },
      before: { updates: before },
    };
    get().recordOperation(operation);
  },
}));

function toLayerSnapshot(layer: LayerData): SketchLayerSnapshot {
  return {
    id: layer.id,
    name: layer.name,
    type: layer.type,
    visible: layer.visible,
    locked: layer.locked,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    width: layer.width,
    height: layer.height,
    offsetX: layer.offsetX,
    offsetY: layer.offsetY,
    clippingMask: layer.clippingMask,
    maskLayerId: layer.maskLayerId,
    children: layer.children.map(toLayerSnapshot),
    alphaLock: layer.alphaLock,
    adjustmentFilter: layer.adjustmentFilter,
    adjustmentParams: cloneNumberRecord(layer.adjustmentParams),
    vectorData: layer.vectorData,
  };
}

function toLayerUpdatesSnapshot(updates: SketchLayerUpdates): SketchLayerUpdates {
  return {
    ...updates,
    adjustmentParams: cloneNumberRecord(updates.adjustmentParams),
  };
}

function cloneNumberRecord(
  value: Record<string, number> | undefined,
): Record<string, number> | undefined {
  return value ? { ...value } : undefined;
}
