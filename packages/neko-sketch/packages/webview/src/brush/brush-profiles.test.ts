import { describe, expect, it } from 'vitest';
import { BRUSH_PROFILES, getDefaultBrushSettings } from './brush-profiles';

describe('brush profiles', () => {
  it('defines texture stamp as a spacing-oriented brush profile', () => {
    expect(BRUSH_PROFILES.stamp).toMatchObject({
      type: 'stamp',
      label: 'Texture Stamp',
      defaultStampPattern: 'grain',
      accumulative: false,
    });
    expect(BRUSH_PROFILES.stamp.defaultSpacing).toBeGreaterThan(BRUSH_PROFILES.pen.defaultSpacing);
  });

  it('creates default texture stamp settings without losing the current color', () => {
    expect(getDefaultBrushSettings('stamp', '#336699')).toMatchObject({
      type: 'stamp',
      color: '#336699',
      size: 48,
      spacing: 0.65,
      stampPattern: 'grain',
    });
  });
});
