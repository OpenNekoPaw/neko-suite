import { describe, expect, it } from 'vitest';
import type { LayerData } from '../types';
import { exportLayerImageDataBase64, resolveLayerForImageExport } from './layer-export';

describe('layer export', () => {
  it('resolves requested nested layers before the active layer', () => {
    const layers = [
      makeLayer('active'),
      makeLayer('group', {
        type: 'group',
        children: [makeLayer('nested')],
      }),
    ];

    expect(resolveLayerForImageExport(layers, 'active', 'nested')?.id).toBe('nested');
  });

  it('falls back to the active layer when no explicit layer id is requested', () => {
    const layers = [makeLayer('layer-1'), makeLayer('layer-2')];

    expect(resolveLayerForImageExport(layers, 'layer-2')?.id).toBe('layer-2');
  });

  it('returns pending PNG data without requiring WebGL', () => {
    const layers = [makeLayer('layer-1', { pendingData: 'png-base64' })];

    expect(
      exportLayerImageDataBase64({
        layers,
        activeLayerId: 'layer-1',
        gl: null,
      }),
    ).toBe('png-base64');
  });

  it('returns null when the target layer cannot provide pixel data', () => {
    const layers = [makeLayer('empty')];

    expect(
      exportLayerImageDataBase64({
        layers,
        activeLayerId: 'empty',
        gl: null,
      }),
    ).toBeNull();
  });
});

function makeLayer(id: string, overrides: Partial<LayerData> = {}): LayerData {
  return {
    id,
    name: id,
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 16,
    height: 16,
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
