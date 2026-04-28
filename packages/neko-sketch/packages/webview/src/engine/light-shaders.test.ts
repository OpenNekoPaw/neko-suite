import { describe, expect, it } from 'vitest';
import {
  LIGHT_DIRECTIONAL_FRAG,
  LIGHT_DIRECTIONAL_NORMAL_FRAG,
  LIGHT_SPOT_FRAG,
  LIGHT_SPOT_NORMAL_FRAG,
} from './light-shaders';

describe('light shaders', () => {
  it('defines directional light shaders with direction and normal-map uniforms', () => {
    expect(LIGHT_DIRECTIONAL_FRAG).toContain('u_intensity');
    expect(LIGHT_DIRECTIONAL_NORMAL_FRAG).toContain('u_direction');
    expect(LIGHT_DIRECTIONAL_NORMAL_FRAG).toContain('u_normalMap');
  });

  it('defines spot light shaders with cone controls', () => {
    for (const source of [LIGHT_SPOT_FRAG, LIGHT_SPOT_NORMAL_FRAG]) {
      expect(source).toContain('u_coneAngle');
      expect(source).toContain('u_coneSoftness');
      expect(source).toContain('spotMask');
    }
  });
});
