/**
 * Layer Slice - layer tree state and operations
 */
import type { StateCreator } from 'zustand';
import type { LayerData } from '../../types';
import {
  createLayer,
  addLayer,
  removeLayer,
  moveLayer,
  duplicateLayer,
  updateLayer,
  groupLayers,
} from '../../layer';

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
    updates: Partial<Pick<LayerData, 'name' | 'visible' | 'locked' | 'opacity' | 'blendMode'>>,
  ) => void;
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
      name ?? `Layer ${state.layers.length + 1}`,
      canvas?.width ?? 1920,
      canvas?.height ?? 1080,
    );
    set({
      layers: addLayer(state.layers, newLayer),
      activeLayerId: newLayer.id,
    });
  },

  removeLayerById: (id) =>
    set((state) => ({
      layers: removeLayer(state.layers, id),
      activeLayerId: state.activeLayerId === id ? null : state.activeLayerId,
    })),

  setActiveLayer: (id) => set({ activeLayerId: id }),

  moveLayerTo: (id, index) =>
    set((state) => ({
      layers: moveLayer(state.layers, id, index),
    })),

  duplicateLayerById: (id) =>
    set((state) => ({
      layers: duplicateLayer(state.layers, id),
    })),

  updateLayerProps: (id, updates) =>
    set((state) => ({
      layers: updateLayer(state.layers, id, updates),
    })),

  groupSelectedLayers: (ids) =>
    set((state) => ({
      layers: groupLayers(state.layers, ids),
    })),

  setLayers: (layers) => set({ layers }),
});
