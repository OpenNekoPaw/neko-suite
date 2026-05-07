import { describe, expect, it } from 'vitest';
import type { TrackingData } from '@neko/shared';
import {
  headRotationToPuppetAngles,
  mapTrackingToPuppetParams,
  mapVmcToPuppetParams,
} from './puppetMapping';

describe('puppet live mapping', () => {
  it('filters unavailable puppet parameters', () => {
    const result = mapVmcToPuppetParams(
      {
        jawOpen: 0.8,
        cheekPuff: 0.5,
      },
      new Set(['ParamMouthOpenY']),
    );

    expect(result).toEqual({ ParamMouthOpenY: 0.8 });
  });

  it('inverts ARKit blink values for Live2D eye openness', () => {
    const result = mapVmcToPuppetParams(
      {
        eyeBlinkLeft: 0.9,
        eyeBlinkRight: 0.25,
      },
      new Set(['ParamEyeLOpen', 'ParamEyeROpen']),
    );

    expect(result.ParamEyeLOpen).toBeCloseTo(0.1, 5);
    expect(result.ParamEyeROpen).toBeCloseTo(0.75, 5);
  });

  it('averages mouth smile sides into ParamMouthForm', () => {
    const result = mapVmcToPuppetParams(
      {
        mouthSmileLeft: 0.25,
        mouthSmileRight: 0.75,
      },
      new Set(['ParamMouthForm']),
    );

    expect(result).toEqual({ ParamMouthForm: 0.5 });
  });

  it('clamps head and body angles to Live2D parameter ranges', () => {
    const result = headRotationToPuppetAngles(
      [0, Math.SQRT1_2, 0, Math.SQRT1_2],
      new Set(['ParamAngleX', 'ParamBodyAngleX']),
    );

    expect(result.ParamAngleX).toBe(30);
    expect(result.ParamBodyAngleX).toBe(10);
  });

  it('combines blend shape and head rotation tracking data', () => {
    const tracking: TrackingData = {
      source: 'vmc',
      timestamp: 1,
      blendShapes: { jawOpen: 0.6 },
      headRotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
    };

    const result = mapTrackingToPuppetParams(tracking, new Set(['ParamMouthOpenY', 'ParamAngleX']));

    expect(result).toEqual({
      ParamMouthOpenY: 0.6,
      ParamAngleX: 30,
    });
  });
});
