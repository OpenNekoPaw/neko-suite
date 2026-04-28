import { describe, expect, it } from 'vitest';
import {
  extractRegionSnapshot,
  findChangedPixelBounds,
  restoreRegionSnapshotToPixels,
} from './region-snapshot';

describe('region snapshot utilities', () => {
  it('finds the minimal changed pixel bounds', () => {
    const before = new Uint8Array(4 * 4 * 4);
    const after = new Uint8Array(before);
    after[(2 * 4 + 1) * 4] = 255;
    after[(3 * 4 + 3) * 4 + 3] = 255;

    expect(findChangedPixelBounds(before, after, 4, 4)).toEqual({
      x: 1,
      y: 2,
      width: 3,
      height: 2,
    });
  });

  it('extracts and restores a clamped region', () => {
    const pixels = new Uint8Array(3 * 3 * 4);
    pixels[(1 * 3 + 1) * 4] = 10;
    pixels[(1 * 3 + 1) * 4 + 1] = 20;
    pixels[(1 * 3 + 1) * 4 + 2] = 30;
    pixels[(1 * 3 + 1) * 4 + 3] = 40;

    const snapshot = extractRegionSnapshot('layer-1', pixels, 3, 3, {
      x: 1,
      y: 1,
      width: 3,
      height: 3,
    });
    expect(snapshot).toMatchObject({
      layerId: 'layer-1',
      x: 1,
      y: 1,
      width: 2,
      height: 2,
    });

    const target = new Uint8Array(3 * 3 * 4);
    restoreRegionSnapshotToPixels(target, 3, 3, snapshot!);

    const restoredIndex = (1 * 3 + 1) * 4;
    expect(Array.from(target.slice(restoredIndex, restoredIndex + 4))).toEqual([10, 20, 30, 40]);
  });
});
