import { describe, expect, it } from 'vitest';
import type { PsdDocumentTreeWire, PsdLayerNodeWire } from '@neko/shared';
import { enforcePsdImportLimits } from './psd-import-limits';

describe('PSD import limits', () => {
  it('drops pixel data for layers exceeding max texture size', () => {
    const result = enforcePsdImportLimits(createTree([createRasterLayer('Huge', 4096, 16)]), {
      maxTextureSize: 1024,
      maxLayerCount: 100,
      maxPixelBytes: 512 * 1024 * 1024,
    });

    expect(result.tree.layers[0]?.pixels).toBeUndefined();
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'texture-size-exceeded',
        layerPath: ['Huge'],
      }),
    ]);
  });

  it('drops the largest raster pixels until the memory budget is respected', () => {
    const result = enforcePsdImportLimits(
      createTree([createRasterLayer('Small', 1, 1), createRasterLayer('Large', 4, 4)]),
      {
        maxTextureSize: 1024,
        maxLayerCount: 100,
        maxPixelBytes: 8,
      },
    );

    expect(result.tree.layers[0]?.pixels).toBeDefined();
    expect(result.tree.layers[1]?.pixels).toBeUndefined();
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'memory-budget-exceeded',
        severity: 'warning',
        layerPath: ['Large'],
      }),
    );
  });

  it('reports layer count pressure without removing the layer tree', () => {
    const result = enforcePsdImportLimits(
      createTree([createGroupLayer('Group', [createRasterLayer('A', 1, 1)])]),
      {
        maxTextureSize: 1024,
        maxLayerCount: 1,
        maxPixelBytes: 512 * 1024 * 1024,
      },
    );

    expect(result.tree.layers[0]?.children).toHaveLength(1);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'layer-count-exceeded',
      }),
    ]);
  });
});

function createTree(layers: readonly PsdLayerNodeWire[]): PsdDocumentTreeWire {
  return {
    canvas: {
      width: 32,
      height: 32,
      dpi: 72,
      backgroundColor: '#ffffff',
    },
    layers,
  };
}

function createGroupLayer(name: string, children: readonly PsdLayerNodeWire[]): PsdLayerNodeWire {
  return {
    name,
    kind: 'group',
    visible: true,
    opacity: 1,
    blendMode: 'pass',
    clippingMask: false,
    left: 0,
    top: 0,
    width: 32,
    height: 32,
    children,
  };
}

function createRasterLayer(name: string, width: number, height: number): PsdLayerNodeWire {
  return {
    name,
    kind: 'raster',
    visible: true,
    opacity: 1,
    blendMode: 'norm',
    clippingMask: false,
    left: 0,
    top: 0,
    width,
    height,
    pixels: { kind: 'encoded', dataBase64: 'AQ==', mimeType: 'image/png' },
  };
}
