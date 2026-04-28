import { create } from 'zustand';
import { describe, expect, it } from 'vitest';
import { createLayerSlice, type LayerSlice } from './layerSlice';

type LayerSliceTestStore = LayerSlice & {
  canvas: { width: number; height: number };
};

function createLayerStore() {
  return create<LayerSliceTestStore>()((set, get, api) => ({
    canvas: { width: 320, height: 240 },
    ...createLayerSlice(set, get, api),
  }));
}

describe('layer slice vector layers', () => {
  it('adds a vector layer with editable vector data and selects it', () => {
    const store = createLayerStore();

    store.getState().addVectorLayer('Editable Shape');

    const layer = store.getState().layers[0];
    expect(layer).toMatchObject({
      name: 'Editable Shape',
      type: 'vector',
      width: 320,
      height: 240,
    });
    expect(layer?.vectorData).toEqual({
      paths: [],
      selectedPathId: null,
      selectedNodeRefs: [],
      handleModes: [],
    });
    expect(store.getState().activeLayerId).toBe(layer?.id);
  });
});
