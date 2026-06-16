import { describe, expect, it } from 'vitest';
import {
  createViewportStreamSize,
  nextViewportStreamQualityPreset,
  normalizeViewportStreamQualityPreset,
} from './viewportStreamQuality';

describe('viewport stream quality policy', () => {
  it('keeps the performance preset above the jagged quarter-pixel floor', () => {
    expect(createViewportStreamSize({ width: 1421, height: 1210 }, 2, 'quarter')).toEqual({
      width: 2352,
      height: 2000,
      pixelRatio: 2,
    });
  });

  it('uses a full 4k-class pixel budget for the default clear editing preset', () => {
    expect(createViewportStreamSize({ width: 1421, height: 1210 }, 2, 'half')).toEqual({
      width: 3136,
      height: 2672,
      pixelRatio: 2,
    });
  });

  it('raises inspect quality above clear while keeping an explicit pixel budget cap', () => {
    expect(createViewportStreamSize({ width: 1421, height: 1210 }, 2, 'native')).toEqual({
      width: 3504,
      height: 2976,
      pixelRatio: 2,
    });
  });

  it('caps oversized workbench streams without changing the viewport aspect ratio', () => {
    expect(createViewportStreamSize({ width: 3000, height: 1800 }, 2, 'native')).toEqual({
      width: 4096,
      height: 2464,
      pixelRatio: 2,
    });
  });

  it('normalizes legacy values and cycles explicit user presets', () => {
    expect(normalizeViewportStreamQualityPreset('responsive')).toBe('quarter');
    expect(normalizeViewportStreamQualityPreset('sharp')).toBe('half');
    expect(normalizeViewportStreamQualityPreset('ultra')).toBe('native');
    expect(normalizeViewportStreamQualityPreset('invalid')).toBe('half');
    expect(nextViewportStreamQualityPreset('quarter')).toBe('half');
    expect(nextViewportStreamQualityPreset('half')).toBe('native');
    expect(nextViewportStreamQualityPreset('native')).toBe('quarter');
  });
});
