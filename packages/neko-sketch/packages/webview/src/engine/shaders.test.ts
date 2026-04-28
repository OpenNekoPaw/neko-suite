import { describe, expect, it } from 'vitest';
import { STROKE_FRAG } from './shaders';

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
