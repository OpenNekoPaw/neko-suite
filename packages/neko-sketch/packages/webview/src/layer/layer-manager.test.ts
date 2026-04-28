import { describe, expect, it } from 'vitest';
import { createLayer } from './layer-manager';

describe('layer-manager vector layers', () => {
  it('creates vector layers with an editable vector payload', () => {
    const layer = createLayer('Vector', 640, 480, 'vector');

    expect(layer.type).toBe('vector');
    expect(layer.vectorData).toEqual({
      paths: [],
      selectedPathId: null,
      selectedNodeRefs: [],
      handleModes: [],
    });
  });

  it('keeps raster layers free of vector payload by default', () => {
    const layer = createLayer('Raster', 640, 480);

    expect(layer.type).toBe('raster');
    expect(layer.vectorData).toBeUndefined();
  });
});
