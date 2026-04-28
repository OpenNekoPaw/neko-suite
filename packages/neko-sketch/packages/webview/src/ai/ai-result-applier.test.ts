import { describe, expect, it } from 'vitest';
import type { BrushSettings, LayerData, SelectionMask } from '../types';
import { buildRasterLayer } from '../utils/raster-source';
import {
  applySketchAIResult,
  rgbaToSelectionMask,
  type SketchAIApplyStore,
  type SketchAIResultApplierDependencies,
} from './ai-result-applier';

describe('AI result applier', () => {
  it('applies layer results as new native raster layers', async () => {
    const store = createStore();
    const deps = createDeps({
      layer: { ...buildRasterLayer({ name: 'Generated' }), pendingData: 'AQID' },
    });

    const result = await applySketchAIResult(
      {
        kind: 'layer',
        data: {
          kind: 'webviewUri',
          ref: 'https://example.local/generated.png',
          mimeType: 'image/png',
        },
        name: 'Generated',
      },
      store,
      deps,
    );

    expect(result).toEqual({ applied: true, target: 'layer', layerId: store.layers[0]?.id });
    expect(store.layers).toHaveLength(1);
    expect(store.activeLayerId).toBe(store.layers[0]?.id);
    expect(store.dirty).toBe(true);
  });

  it('applies selection results without marking the document dirty', async () => {
    const store = createStore();
    const selection: SelectionMask = {
      width: 2,
      height: 1,
      data: new Uint8Array([255, 0]),
    };
    const deps = createDeps({ selection });

    const result = await applySketchAIResult(
      {
        kind: 'selection',
        data: {
          kind: 'webviewUri',
          ref: 'https://example.local/mask.png',
          mimeType: 'image/png',
        },
      },
      store,
      deps,
    );

    expect(result).toEqual({ applied: true, target: 'selection' });
    expect(store.selection).toBe(selection);
    expect(store.dirty).toBe(false);
  });

  it('applies palette results as custom palettes', async () => {
    const deps = createDeps({});
    const result = await applySketchAIResult(
      { kind: 'palette', data: ['#000000', 'bad', '#ffffff'], metadata: { name: 'Mood' } },
      createStore(),
      deps,
    );

    expect(result).toEqual({
      applied: true,
      target: 'palette',
      paletteId: 'palette-test',
    });
    expect(deps.palettes).toEqual([{ name: 'Mood', colors: ['#000000', 'bad', '#ffffff'] }]);
  });

  it('applies brush preset results to current brush settings', async () => {
    const store = createStore();
    const result = await applySketchAIResult(
      {
        kind: 'brushPreset',
        data: {
          name: 'Brush',
          type: 'pen',
          size: 12,
          opacity: 1,
          hardness: 0.8,
          spacing: 0.2,
        },
        issues: [],
        metadata: {},
      },
      store,
      createDeps({}),
    );

    expect(result).toEqual({ applied: true, target: 'brushPreset' });
    expect(store.brushSettings).toMatchObject({
      type: 'pen',
      size: 12,
      opacity: 1,
      hardness: 0.8,
      spacing: 0.2,
    });
  });

  it('requires injectable dependencies for non-webview asset refs', async () => {
    await expect(
      applySketchAIResult(
        {
          kind: 'layer',
          data: { kind: 'fileUri', ref: 'file:///tmp/generated.png', mimeType: 'image/png' },
        },
        createStore(),
      ),
    ).rejects.toThrow('AI asset kind "fileUri" cannot be loaded in the webview');
  });

  it('converts alpha and opaque grayscale masks to selection bitmasks', () => {
    expect(
      Array.from(rgbaToSelectionMask(2, 1, new Uint8Array([0, 0, 0, 0, 0, 0, 0, 255])).data),
    ).toEqual([0, 255]);

    expect(
      Array.from(
        rgbaToSelectionMask(2, 1, new Uint8Array([255, 255, 255, 255, 0, 0, 0, 255])).data,
      ),
    ).toEqual([255, 0]);
  });
});

interface TestStore extends SketchAIApplyStore {
  activeLayerId: string | null;
  selection: SelectionMask | null;
  dirty: boolean;
  layers: LayerData[];
  brushSettings: Partial<BrushSettings>;
}

function createStore(): TestStore {
  return {
    layers: [],
    activeLayerId: null,
    selection: null,
    dirty: false,
    brushSettings: {},
    getLayers() {
      return this.layers;
    },
    setLayers(layers) {
      this.layers = layers;
    },
    setActiveLayer(id) {
      this.activeLayerId = id;
    },
    setSelectionMask(mask) {
      this.selection = mask;
    },
    setBrushSettings(updates) {
      this.brushSettings = { ...this.brushSettings, ...updates };
    },
    markDirty() {
      this.dirty = true;
    },
  };
}

function createDeps(params: {
  readonly layer?: LayerData;
  readonly selection?: SelectionMask;
}): SketchAIResultApplierDependencies & {
  readonly palettes: Array<{ readonly name: string; readonly colors: readonly string[] }>;
} {
  const palettes: Array<{ readonly name: string; readonly colors: readonly string[] }> = [];
  return {
    palettes,
    async loadRasterLayer() {
      return { layer: params.layer ?? buildRasterLayer({ name: 'AI Layer' }) };
    },
    async loadSelectionMask() {
      return params.selection ?? { width: 1, height: 1, data: new Uint8Array([255]) };
    },
    addPalette(name, colors) {
      palettes.push({ name, colors });
      return { id: 'palette-test', name, colors };
    },
  };
}
