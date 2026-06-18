import { create } from 'zustand';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMockVSCodeApi,
  installMockWebviewWindow,
  type MockWebviewWindow,
} from '@neko/shared/vscode/test-utils';
import type { EditOperation } from '@neko/shared';
import type { LayerData } from '../../types';
import { createLayerSlice, type LayerSlice } from './layerSlice';
import { useSketchOperationStore } from '../sketchOperationStore';

type LayerSliceTestStore = LayerSlice & {
  canvas: { width: number; height: number };
};

function createLayerStore() {
  return create<LayerSliceTestStore>()((set, get, api) => ({
    canvas: { width: 320, height: 240 },
    ...createLayerSlice(set, get, api),
  }));
}

let mockWindow: MockWebviewWindow | undefined;
let postMessage: (message: unknown) => void;

beforeEach(() => {
  useSketchOperationStore.getState().clearLog();
  const api = createMockVSCodeApi();
  postMessage = vi.fn();
  api.postMessage = postMessage;
  mockWindow = installMockWebviewWindow(api);
});

afterEach(() => {
  mockWindow?.dispose();
  mockWindow = undefined;
});

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

describe('layer slice background layers', () => {
  it('adds a fill background layer at the bottom and selects it', () => {
    const store = createLayerStore();
    const paintLayer = createRuntimeLayer({ id: 'paint-layer' });

    store.setState({ layers: [paintLayer], activeLayerId: paintLayer.id });
    store.getState().addBackgroundLayer();

    const [background, paint] = store.getState().layers;
    expect(background).toMatchObject({
      name: 'Background',
      type: 'fill',
      width: 320,
      height: 240,
    });
    expect(paint?.id).toBe(paintLayer.id);
    expect(store.getState().activeLayerId).toBe(background?.id);

    const operation = useSketchOperationStore.getState().operationLog.at(-1);
    expect(operation).toMatchObject({
      type: 'sketch.layer.add',
      payload: {
        index: 0,
        layer: { type: 'fill' },
      },
    });
  });
});

describe('layer slice operation snapshots', () => {
  it('records removed layers without WebGL runtime handles', () => {
    const store = createLayerStore();
    const texture = { runtime: 'webgl-texture' } as unknown as WebGLTexture;
    const normalTexture = { runtime: 'normal-texture' } as unknown as WebGLTexture;
    const layer = createRuntimeLayer({ texture, normalTexture, pendingData: 'pixels' });

    store.setState({ layers: [layer], activeLayerId: layer.id });
    store.getState().removeLayerById(layer.id);

    const operation = useSketchOperationStore.getState().operationLog.at(-1) as EditOperation;
    expect(operation.type).toBe('sketch.layer.remove');
    expect(operation).not.toHaveProperty('before.layer.texture');
    expect(operation).not.toHaveProperty('before.layer.normalTexture');
    expect(operation).not.toHaveProperty('before.layer.pendingData');
    expect(operation).not.toHaveProperty('before.layer.pendingNormalData');
    expect(() => structuredClone(operation)).not.toThrow();
    expect(postMessage).toHaveBeenCalledWith({
      type: 'operationApplied',
      operation,
    });
  });

  it('records nested layer removal parent and index', () => {
    const store = createLayerStore();
    const child = createRuntimeLayer({ id: 'child-layer' });
    const group = createRuntimeLayer({
      id: 'group-layer',
      type: 'group',
      children: [createRuntimeLayer({ id: 'sibling-layer' }), child],
    });

    store.setState({ layers: [group], activeLayerId: child.id });
    store.getState().removeLayerById(child.id);

    const operation = useSketchOperationStore.getState().operationLog.at(-1);
    expect(operation).toMatchObject({
      type: 'sketch.layer.remove',
      before: {
        parentId: 'group-layer',
        index: 1,
      },
    });
  });
});

describe('layer slice active layer recovery', () => {
  it('selects the remaining topmost editable layer when removing the active layer', () => {
    const store = createLayerStore();
    const bottom = createRuntimeLayer({ id: 'bottom-layer' });
    const top = createRuntimeLayer({ id: 'top-layer' });

    store.setState({ layers: [bottom, top], activeLayerId: top.id });
    store.getState().removeLayerById(top.id);

    expect(store.getState().layers.map((layer) => layer.id)).toEqual([bottom.id]);
    expect(store.getState().activeLayerId).toBe(bottom.id);
  });

  it('clears active layer after removing the last layer and selects a new layer after add', () => {
    const store = createLayerStore();
    const layer = createRuntimeLayer({ id: 'only-layer' });

    store.setState({ layers: [layer], activeLayerId: layer.id });
    store.getState().removeLayerById(layer.id);
    expect(store.getState().layers).toEqual([]);
    expect(store.getState().activeLayerId).toBeNull();

    store.getState().addNewLayer('Replacement');
    const replacement = store.getState().layers[0];
    expect(replacement).toMatchObject({ name: 'Replacement', type: 'raster' });
    expect(store.getState().activeLayerId).toBe(replacement?.id);
  });

  it('repairs stale active layer ids when replacing the layer tree', () => {
    const store = createLayerStore();
    const replacement = createRuntimeLayer({ id: 'replacement-layer' });

    store.setState({ activeLayerId: 'deleted-layer' });
    store.getState().setLayers([replacement]);

    expect(store.getState().activeLayerId).toBe(replacement.id);
  });
});

function createRuntimeLayer(overrides: Partial<LayerData> = {}): LayerData {
  return {
    id: 'layer-runtime',
    name: 'Runtime Layer',
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 320,
    height: 240,
    offsetX: 0,
    offsetY: 0,
    clippingMask: false,
    maskLayerId: null,
    children: [],
    texture: null,
    alphaLock: false,
    ...overrides,
  };
}
