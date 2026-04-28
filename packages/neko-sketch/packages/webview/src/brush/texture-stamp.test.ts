import { describe, expect, it } from 'vitest';
import {
  TEXTURE_STAMP_PATTERNS,
  coerceTextureStampPattern,
  getTextureStampPatternIndex,
  getTextureStampPatternLabelKey,
  normalizeTextureStampAssetAlpha,
} from './texture-stamp';

describe('texture stamp patterns', () => {
  it('keeps the shader pattern indices explicit and stable', () => {
    expect(TEXTURE_STAMP_PATTERNS).toEqual(['grain', 'crosshatch', 'bristle']);
    expect(getTextureStampPatternIndex('grain')).toBe(1);
    expect(getTextureStampPatternIndex('crosshatch')).toBe(2);
    expect(getTextureStampPatternIndex('bristle')).toBe(3);
  });

  it('falls back unknown persisted values to grain', () => {
    expect(coerceTextureStampPattern('missing')).toBe('grain');
    expect(getTextureStampPatternIndex(undefined)).toBe(1);
  });

  it('provides i18n keys for every built-in pattern', () => {
    for (const pattern of TEXTURE_STAMP_PATTERNS) {
      expect(getTextureStampPatternLabelKey(pattern)).toBe(`sketch.brush.stampPattern.${pattern}`);
    }
  });

  it('keeps transparent PNG stamps driven by source alpha', () => {
    const normalized = normalizeTextureStampAssetAlpha(
      new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 0]),
    );

    expect(Array.from(normalized)).toEqual([255, 255, 255, 255, 255, 255, 255, 0]);
  });

  it('uses luminance as alpha for opaque grayscale masks', () => {
    const normalized = normalizeTextureStampAssetAlpha(
      new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]),
    );

    expect(Array.from(normalized)).toEqual([255, 255, 255, 255, 255, 255, 255, 0]);
  });
});
