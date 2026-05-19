/**
 * Layer Slice - layer tree state and operations
 */
import type { StateCreator } from 'zustand';
import type { SketchLayerUpdates } from '@neko/shared';
import type { LayerData } from '../../types';
import { t } from '../../i18n';
import {
  createLayer,
  createAdjustmentLayer,
  addLayer,
  removeLayer,
  moveLayer,
  duplicateLayer,
  updateLayer,
  groupLayers,
} from '../../layer';
import { findLastEditableLayer, findLayerById } from '../../utils/layer-tree';
import { useSketchOperationStore } from '../sketchOperationStore';

export interface LayerMergeDownRequest {
  readonly id: number;
  readonly layerId: string;
}

let nextLayerMergeDownRequestId = 1;

type LayerPropertyUpdates = Partial<
  Pick<
    LayerData,
    | 'name'
    | 'visible'
    | 'locked'
    | 'opacity'
    | 'blendMode'
    | 'clippingMask'
    | 'maskLayerId'
    | 'alphaLock'
    | 'adjustmentFilter'
    | 'adjustmentParams'
    | 'vectorData'
  >
>;

interface LayerPosition {
  readonly layer: LayerData;
  readonly parentId?: string;
  readonly index: number;
}

export interface LayerSlice {
  // State
  layers: LayerData[];
  activeLayerId: string | null;
  pendingLayerMergeDownRequest: LayerMergeDownRequest | null;

  // Actions
  addNewLayer: (name?: string) => void;
  addVectorLayer: (name?: string) => void;
  addBackgroundLayer: (name?: string) => void;
  removeLayerById: (id: string) => void;
  setActiveLayer: (id: string) => void;
  moveLayerTo: (id: string, index: number) => void;
  duplicateLayerById: (id: string) => void;
  updateLayerProps: (id: string, updates: LayerPropertyUpdates) => void;
  addAdjustmentLayer: (filterId: string, defaultParams: Record<string, number>) => void;
  groupSelectedLayers: (ids: string[]) => void;
  setLayers: (layers: LayerData[]) => void;
  requestMergeLayerDown: (layerId: string) => void;
  clearLayerMergeDownRequest: (requestId: number) => void;
}

export const createLayerSlice: StateCreator<LayerSlice> = (set, get) => ({
  layers: [],
  activeLayerId: null,
  pendingLayerMergeDownRequest: null,

  addNewLayer: (name) => {
    const state = get();
    const canvas = (state as unknown as { canvas: { width: number; height: number } }).canvas;
    const newLayer = createLayer(
      name ?? t('sketch.layer.defaultName', { index: String(state.layers.length + 1) }),
      canvas?.width ?? 1920,
      canvas?.height ?? 1080,
    );
    set({
      layers: addLayer(state.layers, newLayer),
      activeLayerId: newLayer.id,
    });
    useSketchOperationStore.getState().recordLayerAdd(newLayer, undefined, state.layers.length);
  },

  addVectorLayer: (name) => {
    const state = get();
    const canvas = (state as unknown as { canvas: { width: number; height: number } }).canvas;
    const newLayer = createLayer(
      name ?? t('sketch.layer.vectorDefaultName', { index: String(state.layers.length + 1) }),
      canvas?.width ?? 1920,
      canvas?.height ?? 1080,
      'vector',
    );
    set({
      layers: addLayer(state.layers, newLayer),
      activeLayerId: newLayer.id,
    });
    useSketchOperationStore.getState().recordLayerAdd(newLayer, undefined, state.layers.length);
  },

  addBackgroundLayer: (name) => {
    const state = get();
    const canvas = (state as unknown as { canvas: { width: number; height: number } }).canvas;
    const newLayer = createLayer(
      name ?? t('sketch.template.layer.background'),
      canvas?.width ?? 1920,
      canvas?.height ?? 1080,
      'fill',
    );
    set({
      layers: [newLayer, ...state.layers],
      activeLayerId: newLayer.id,
    });
    useSketchOperationStore.getState().recordLayerAdd(newLayer, undefined, 0);
  },

  removeLayerById: (id) => {
    const state = get();
    const found = findLayerPosition(state.layers, id);
    const nextLayers = removeLayer(state.layers, id);
    const nextActiveLayerId = resolveActiveLayerId(nextLayers, state.activeLayerId);
    set({
      layers: nextLayers,
      activeLayerId: nextActiveLayerId,
    });
    if (found) {
      useSketchOperationStore
        .getState()
        .recordLayerRemove(id, found.layer, found.parentId, found.index);
    }
  },

  setActiveLayer: (id) => set({ activeLayerId: id }),

  moveLayerTo: (id, index) => {
    const state = get();
    const oldIndex = state.layers.findIndex((l) => l.id === id);
    set({ layers: moveLayer(state.layers, id, index) });
    useSketchOperationStore.getState().recordLayerMove(id, undefined, index, undefined, oldIndex);
  },

  duplicateLayerById: (id) => {
    const state = get();
    const newLayers = duplicateLayer(state.layers, id);
    set({ layers: newLayers });
    // Find the new layer (last one added)
    const newLayer = newLayers.find((l) => !state.layers.some((ol) => ol.id === l.id));
    if (newLayer) {
      useSketchOperationStore.getState().recordLayerDuplicate(newLayer, id);
    }
  },

  updateLayerProps: (id, updates) => {
    const state = get();
    const oldLayer = findLayerPosition(state.layers, id)?.layer;
    const before: SketchLayerUpdates = {};
    if (oldLayer) {
      beforeLayerUpdates(oldLayer, updates, before);
    }
    set({ layers: updateLayer(state.layers, id, updates) });
    useSketchOperationStore.getState().recordLayerUpdate(id, updates, before);
  },

  addAdjustmentLayer: (filterId, defaultParams) => {
    const state = get();
    const canvas = (state as unknown as { canvas: { width: number; height: number } }).canvas;
    const name = filterId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const newLayer = createAdjustmentLayer(
      name,
      canvas?.width ?? 1920,
      canvas?.height ?? 1080,
      filterId,
      defaultParams,
    );
    set({
      layers: addLayer(state.layers, newLayer),
      activeLayerId: newLayer.id,
    });
  },

  groupSelectedLayers: (ids) =>
    set((state) => ({
      layers: groupLayers(state.layers, ids),
    })),

  setLayers: (layers) =>
    set((state) => ({
      layers,
      activeLayerId: resolveActiveLayerId(layers, state.activeLayerId),
    })),

  requestMergeLayerDown: (layerId) =>
    set({
      pendingLayerMergeDownRequest: {
        id: nextLayerMergeDownRequestId++,
        layerId,
      },
    }),

  clearLayerMergeDownRequest: (requestId) =>
    set((state) =>
      state.pendingLayerMergeDownRequest?.id === requestId
        ? { pendingLayerMergeDownRequest: null }
        : {},
    ),
});

function findLayerPosition(
  layers: readonly LayerData[],
  layerId: string,
  parentId?: string,
): LayerPosition | null {
  for (let index = 0; index < layers.length; index++) {
    const layer = layers[index];
    if (!layer) continue;
    if (layer.id === layerId) {
      return { layer, parentId, index };
    }
    const child = findLayerPosition(layer.children, layerId, layer.id);
    if (child) {
      return child;
    }
  }
  return null;
}

function resolveActiveLayerId(
  layers: readonly LayerData[],
  currentActiveLayerId: string | null,
): string | null {
  if (currentActiveLayerId && findLayerById(layers, currentActiveLayerId)) {
    return currentActiveLayerId;
  }
  return findLastEditableLayer(layers)?.id ?? null;
}

function beforeLayerUpdates(
  oldLayer: LayerData,
  updates: LayerPropertyUpdates,
  before: SketchLayerUpdates,
): void {
  if (updates.name !== undefined) before.name = oldLayer.name;
  if (updates.visible !== undefined) before.visible = oldLayer.visible;
  if (updates.locked !== undefined) before.locked = oldLayer.locked;
  if (updates.opacity !== undefined) before.opacity = oldLayer.opacity;
  if (updates.blendMode !== undefined) before.blendMode = oldLayer.blendMode;
  if (updates.clippingMask !== undefined) before.clippingMask = oldLayer.clippingMask;
  if (updates.maskLayerId !== undefined) before.maskLayerId = oldLayer.maskLayerId;
  if (updates.alphaLock !== undefined) before.alphaLock = oldLayer.alphaLock;
  if (updates.adjustmentFilter !== undefined) before.adjustmentFilter = oldLayer.adjustmentFilter;
  if (updates.adjustmentParams !== undefined) before.adjustmentParams = oldLayer.adjustmentParams;
  if (updates.vectorData !== undefined) before.vectorData = oldLayer.vectorData;
}
