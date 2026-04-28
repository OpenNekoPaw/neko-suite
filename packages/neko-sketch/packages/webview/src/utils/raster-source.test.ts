import { describe, expect, it } from 'vitest';
import { buildRasterLayer, createRasterLayerFromEncodedPng } from './raster-source';

describe('raster source', () => {
  it('creates a native raster layer from encoded PNG wire pixels', () => {
    const { layer } = createRasterLayerFromEncodedPng(
      { kind: 'encoded', dataBase64: 'AQID', mimeType: 'image/png' },
      {
        name: 'Imported',
        width: 12,
        height: 8,
        offsetX: 3,
        offsetY: 4,
        visible: false,
        opacity: 0.5,
        blendMode: 'multiply',
        clippingMask: true,
      },
    );

    expect(layer).toEqual(
      expect.objectContaining({
        name: 'Imported',
        type: 'raster',
        visible: false,
        locked: false,
        opacity: 0.5,
        blendMode: 'multiply',
        width: 12,
        height: 8,
        offsetX: 3,
        offsetY: 4,
        clippingMask: true,
        maskLayerId: null,
        children: [],
        texture: null,
        pendingData: 'AQID',
        alphaLock: false,
      }),
    );
    expect(layer.id).toMatch(/^layer-/);
  });

  it('applies stable defaults for new raster layers', () => {
    const layer = buildRasterLayer({ name: 'Default Raster' });

    expect(layer).toEqual(
      expect.objectContaining({
        name: 'Default Raster',
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
      }),
    );
    expect(layer.pendingData).toBeUndefined();
  });
});
