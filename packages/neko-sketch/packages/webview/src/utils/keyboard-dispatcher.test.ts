import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SketchStore } from '../stores/sketch-store';
import type { LayerData, SelectionMask } from '../types';
import { dispatchKeyboardAction } from './keyboard-dispatcher';

describe('dispatchKeyboardAction', () => {
  beforeEach(() => {
    document.body.innerHTML = '<canvas id="sketch-canvas"></canvas>';
  });

  it('refreshes the active layer state after deleting selected pixels', () => {
    const texture = { id: 'texture' } as unknown as WebGLTexture;
    const layer = createLayer({ texture });
    const selection: SelectionMask = {
      width: 1,
      height: 1,
      data: new Uint8Array([255]),
    };
    const gl = createDeleteSelectionWebGLContext(new Uint8Array([10, 20, 30, 255]));
    const canvas = document.getElementById('sketch-canvas') as HTMLCanvasElement;
    vi.spyOn(canvas, 'getContext').mockReturnValue(gl as unknown as RenderingContext);
    const postMessage = vi.fn();
    const store = createStore({
      activeLayerId: layer.id,
      layers: [layer],
      selection,
    });

    dispatchKeyboardAction('deleteSelected', store, { postMessage });

    expect(gl.texSubImage2D).toHaveBeenCalledWith(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0]),
    );
    expect(store.setLayers).toHaveBeenCalledTimes(1);
    expect(store.layers).toHaveLength(1);
    expect(store.layers[0]).not.toBe(layer);
    expect(store.layers[0]?.texture).toBe(texture);
    expect(store.markDirty).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'operationApplied',
        operation: expect.objectContaining({
          type: 'sketch.pixel.edit',
        }),
      }),
    );
  });
});

function createStore(params: {
  readonly activeLayerId: string | null;
  readonly layers: LayerData[];
  readonly selection: SelectionMask | null;
}): SketchStore {
  const store = {
    activeLayerId: params.activeLayerId,
    layers: params.layers,
    selection: params.selection,
    pushHistory: vi.fn(),
    setLayers: vi.fn((layers: LayerData[]) => {
      store.layers = layers;
    }),
    markDirty: vi.fn(),
    setActiveLayer: vi.fn(),
    selectAll: vi.fn(),
    clearSelection: vi.fn(),
    setActiveTool: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    resetViewport: vi.fn(),
    rotateViewportBy: vi.fn(),
    resetViewportRotation: vi.fn(),
    setBrushSize: vi.fn(),
    brushSettings: { size: 6 },
  } as unknown as SketchStore;

  return store;
}

function createLayer(overrides: Partial<LayerData> = {}): LayerData {
  return {
    id: 'layer-1',
    name: 'Layer 1',
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 1,
    height: 1,
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

function createDeleteSelectionWebGLContext(pixels: Uint8Array): WebGL2RenderingContext {
  const gl = {
    FRAMEBUFFER: 0x8d40,
    COLOR_ATTACHMENT0: 0x8ce0,
    TEXTURE_2D: 0x0de1,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    createFramebuffer: vi.fn(() => ({ id: 'fbo' })),
    bindFramebuffer: vi.fn(),
    framebufferTexture2D: vi.fn(),
    readPixels: vi.fn(
      (
        _x: number,
        _y: number,
        _width: number,
        _height: number,
        _format: number,
        _type: number,
        target: Uint8Array,
      ) => {
        target.set(pixels);
      },
    ),
    bindTexture: vi.fn(),
    texSubImage2D: vi.fn(),
    deleteFramebuffer: vi.fn(),
  } as unknown as WebGL2RenderingContext;

  return gl;
}
