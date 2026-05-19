import { describe, expect, it } from 'vitest';
import { BLEND_FRAG, STROKE_FRAG } from './shaders';

describe('stroke shaders', () => {
  it('exposes texture stamp pattern masking in the stroke fragment shader', () => {
    expect(STROKE_FRAG).toContain('u_stampPattern');
    expect(STROKE_FRAG).toContain('u_hasStampTexture');
    expect(STROKE_FRAG).toContain('u_stampTexture');
    expect(STROKE_FRAG).toContain('stampPatternMask');
    expect(STROKE_FRAG).toContain('u_stampPattern == 1');
    expect(STROKE_FRAG).toContain('u_stampPattern == 2');
    expect(STROKE_FRAG).toContain('u_stampPattern == 3');
  });
});

describe('blend shader', () => {
  it('composites layer color by effective source alpha', () => {
    expect(BLEND_FRAG).toContain('float sourceAlpha = clamp(u_opacity * blend.a, 0.0, 1.0);');
    expect(BLEND_FRAG).toContain('float outAlpha = sourceAlpha + base.a * (1.0 - sourceAlpha);');
    expect(BLEND_FRAG).toContain(
      'blendedRgb * sourceAlpha + base.rgb * base.a * (1.0 - sourceAlpha)',
    );
  });
});
