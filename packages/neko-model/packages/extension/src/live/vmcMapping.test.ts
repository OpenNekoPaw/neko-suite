import { describe, expect, it } from 'vitest';
import type { TrackingData } from '@neko/shared';
import { mapTrackingToVrmExpressions, mapVmcToVrmExpressions } from './vmcMapping';

describe('model live VMC mapping', () => {
  it('clamps ARKit input values before deriving VRM expressions', () => {
    const result = mapVmcToVrmExpressions({
      jawOpen: 2,
      mouthFunnel: -1,
      eyeBlinkLeft: 1.5,
      eyeBlinkRight: -0.5,
    });

    expect(result.aa).toBe(0.8);
    expect(result.oh).toBe(0.5);
    expect(result.blinkLeft).toBe(1);
    expect(result.blinkRight).toBe(0);
    expect(result.blink).toBe(0);
  });

  it('maps jawOpen and mouth smile to representative VRM visemes and emotions', () => {
    const result = mapVmcToVrmExpressions({
      jawOpen: 0.5,
      mouthSmileLeft: 0.25,
      mouthSmileRight: 0.75,
      cheekSquintLeft: 0.2,
      cheekSquintRight: 0.4,
    });

    expect(result.aa).toBeCloseTo(0.4, 5);
    expect(result.surprised).toBeCloseTo(0.25, 5);
    expect(result.happy).toBeCloseTo(0.66, 5);
  });

  it('maps eye gaze and blink values', () => {
    const result = mapVmcToVrmExpressions({
      eyeBlinkLeft: 0.6,
      eyeBlinkRight: 0.8,
      eyeLookOutLeft: 0.4,
      eyeLookInRight: 0.6,
      eyeLookUpLeft: 0.2,
      eyeLookUpRight: 0.8,
    });

    expect(result.blink).toBe(0.6);
    expect(result.lookLeft).toBe(0.5);
    expect(result.lookUp).toBe(0.5);
  });

  it('accepts source-neutral tracking data', () => {
    const tracking: TrackingData = {
      source: 'vmc',
      timestamp: 1,
      blendShapes: { jawOpen: 0.5, mouthFunnel: 0.5 },
    };

    expect(mapTrackingToVrmExpressions(tracking)).toMatchObject({
      aa: 0.4,
      oh: 0.4,
    });
  });
});
