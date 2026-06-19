import { describe, expect, it } from 'vitest';
import type { LayerData } from '../../types';
import { mapSketchLayersToTreeViewItems } from './sharedSketchUiAdapter';

describe('sharedSketchUiAdapter', () => {
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
      {
        removeLabel: '移除图层',
        adjustmentBadgeLabel: '调整',
        adjustmentBadgeTitle: '调整图层',
        clippingMaskBadgeLabel: '剪贴',
        clippingMaskBadgeTitle: '剪贴蒙版',
        alphaLockBadgeLabel: '锁透',
        alphaLockBadgeTitle: '透明像素锁定',
      },
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
    expect(items[0]?.badges).toEqual([
      { id: 'adjustment', label: '调整', title: '调整图层' },
      { id: 'clipping-mask', label: '剪贴', title: '剪贴蒙版' },
      { id: 'alpha-lock', label: '锁透', title: '透明像素锁定' },
    ]);
    expect(items[0]?.actions?.[0]?.id).toBe('remove');
    expect(items[0]?.actions?.[0]?.label).toBe('移除图层');
    expect(items[1]?.visible).toBe(false);
  });
});

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
