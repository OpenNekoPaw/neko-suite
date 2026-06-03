import { describe, expect, it } from 'vitest';
import {
  createViewportStreamSize,
  nextViewportStreamQualityPreset,
  normalizeViewportStreamQualityPreset,
} from './viewportStreamQuality';

describe('viewport stream quality policy', () => {
  it('keeps the quarter preset at or above the 1440p editing floor', () => {
    expect(createViewportStreamSize({ width: 1421, height: 1210 }, 2, 'quarter')).toEqual({
      width: 1696,
      height: 1440,
      pixelRatio: 2,
    });
  });

  it('uses half of the larger viewport-or-4k pixel budget for the middle preset', () => {
    expect(createViewportStreamSize({ width: 1421, height: 1210 }, 2, 'half')).toEqual({
      width: 2208,
      height: 1888,
      pixelRatio: 2,
    });
  });

  it('matches native viewport pixels while ensuring at least a 4k pixel budget', () => {
    expect(createViewportStreamSize({ width: 1421, height: 1210 }, 2, 'native')).toEqual({
      width: 3136,
      height: 2672,
      pixelRatio: 2,
    });
  });

  it('normalizes legacy values and cycles explicit user presets', () => {
    expect(normalizeViewportStreamQualityPreset('sharp')).toBe('quarter');
    expect(normalizeViewportStreamQualityPreset('ultra')).toBe('half');
    expect(normalizeViewportStreamQualityPreset('invalid')).toBe('quarter');
    expect(nextViewportStreamQualityPreset('quarter')).toBe('half');
    expect(nextViewportStreamQualityPreset('half')).toBe('native');
    expect(nextViewportStreamQualityPreset('native')).toBe('quarter');
  });
});
