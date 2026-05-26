import { describe, expect, it } from 'vitest';
import type { BrushSettings, LayerData, SymmetryConfig } from '../../types';
import {
  mapSketchBrushPropertyCommit,
  mapSketchBrushToProperties,
  mapSketchLayersToTreeViewItems,
} from './sharedSketchUiAdapter';

describe('sharedSketchUiAdapter', () => {
  it('maps brush controls to shared property definitions', () => {
    const result = mapSketchBrushToProperties({
      activeTool: 'brush',
      brushSettings: createBrushSettings(),
      symmetry: createSymmetryConfig(),
      textureStampAssets: [
        {
          id: 'asset-1',
          name: 'Paper',
          dataUrl: '',
          mimeType: 'image/png',
          width: 1,
          height: 1,
          createdAt: 1,
        },
      ],
      translate: (key, params) => `${key}${params ? JSON.stringify(params) : ''}`,
    });

    expect(result.groups).toEqual([
      {
        id: 'brush',
        label: 'sketch.panel.brush',
        propertyIds: [
          'brush.type',
          'brush.size',
          'brush.opacity',
          'brush.hardness',
          'symmetry.mode',
          'brush.color',
        ],
      },
    ]);
    expect(result.properties.find((property) => property.id === 'brush.size')).toMatchObject({
      kind: 'slider',
      min: 1,
      max: 500,
      value: 42,
    });
    expect(result.properties.find((property) => property.id === 'brush.color')).toMatchObject({
      kind: 'color',
      value: '#ff00ff',
    });
  });

  it('maps stamp-only controls and commit patches', () => {
    const result = mapSketchBrushToProperties({
      activeTool: 'brush',
      brushSettings: { ...createBrushSettings(), type: 'stamp', stampPattern: 'grain' },
      symmetry: createSymmetryConfig(),
      textureStampAssets: [],
      translate: (key) => key,
    });

    expect(result.groups[0]?.propertyIds).toContain('brush.stampTexture');
    expect(result.groups[0]?.propertyIds).toContain('brush.spacing');
    expect(mapSketchBrushPropertyCommit('brush.opacity', 25)).toEqual({ brushOpacity: 0.25 });
    expect(mapSketchBrushPropertyCommit('brush.stampTexture', 'builtin:bristle')).toEqual({
      brushSettings: { stampAssetId: null, stampPattern: 'bristle' },
    });
  });

  it('maps layers to TreeView items with badges and row actions', () => {
    const items = mapSketchLayersToTreeViewItems(
      [
        createLayer({ id: 'bottom', name: 'Bottom', visible: false }),
        createLayer({
          id: 'top',
          name: 'Top',
          locked: true,
          type: 'adjustment',
          clippingMask: true,
          alphaLock: true,
        }),
      ],
      'top',
    );

    expect(items.map((item) => item.id)).toEqual(['top', 'bottom']);
    expect(items[0]).toMatchObject({
      id: 'top',
      selected: true,
      visible: true,
      locked: true,
    });
    expect(items[0]?.badges?.map((badge) => badge.id)).toEqual([
      'adjustment',
      'clipping-mask',
      'alpha-lock',
    ]);
    expect(items[0]?.actions?.[0]?.id).toBe('remove');
    expect(items[1]?.visible).toBe(false);
  });
});

function createBrushSettings(): BrushSettings {
  return {
    type: 'pen',
    size: 42,
    opacity: 0.8,
    hardness: 0.5,
    spacing: 0.65,
    color: '#ff00ff',
    pressureSizeEnabled: false,
    pressureOpacityEnabled: false,
  };
}

function createSymmetryConfig(): SymmetryConfig {
  return { axisX: 0, axisY: 0, mode: 'none', radialCount: 4 };
}

function createLayer(overrides: Partial<LayerData>): LayerData {
  return {
    id: 'layer',
    name: 'Layer',
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 100,
    height: 100,
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
