/**
 * Layer Slice - layer tree state and operations
 */
import type { StateCreator } from 'zustand';
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
import { useSketchOperationStore } from '../sketchOperationStore';

export interface LayerSlice {
  // State
  layers: LayerData[];
  activeLayerId: string | null;

  // Actions
  addNewLayer: (name?: string) => void;
  removeLayerById: (id: string) => void;
  setActiveLayer: (id: string) => void;
  moveLayerTo: (id: string, index: number) => void;
  duplicateLayerById: (id: string) => void;
  updateLayerProps: (
    id: string,
    updates: Partial<
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
      >
    >,
  ) => void;
  addAdjustmentLayer: (filterId: string, defaultParams: Record<string, number>) => void;
  groupSelectedLayers: (ids: string[]) => void;
  setLayers: (layers: LayerData[]) => void;
}

export const createLayerSlice: StateCreator<LayerSlice> = (set, get) => ({
  layers: [],
  activeLayerId: null,

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
    useSketchOperationStore.getState().recordLayerAdd(newLayer as any);
  },

  removeLayerById: (id) => {
    const state = get();
    const layer = state.layers.find((l) => l.id === id);
    set({
      layers: removeLayer(state.layers, id),
      activeLayerId: state.activeLayerId === id ? null : state.activeLayerId,
    });
    if (layer) {
      useSketchOperationStore.getState().recordLayerRemove(id, layer as any);
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
      useSketchOperationStore.getState().recordLayerDuplicate(newLayer as any, id);
    }
  },

  updateLayerProps: (id, updates) => {
    const state = get();
    const oldLayer = state.layers.find((l) => l.id === id);
    const before: Record<string, unknown> = {};
    if (oldLayer) {
      for (const key of Object.keys(updates)) {
        before[key] = (oldLayer as any)[key];
      }
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

  setLayers: (layers) => set({ layers }),
});
