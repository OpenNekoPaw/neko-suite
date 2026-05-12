import { describe, expect, it } from 'vitest';
import { validateNka } from '../validator';
import { CURRENT_NKA_VERSION } from '../codec';

function createProject(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: CURRENT_NKA_VERSION,
    name: 'Validation Fixture',
    sampleRate: 48000,
    channels: 2,
    tracks: [],
    masterEffectsChain: [],
    markers: [],
    ...overrides,
  };
}

describe('validateNka', () => {
  it('promotes warnings into visible errors in strict mode', () => {
    const result = validateNka(createProject({ sampleRate: 22050 }), { strict: true });

    expect(result.valid).toBe(false);
    expect(result.warnings).toHaveLength(0);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'sampleRate',
        message: 'uncommon sample rate (expected 44100, 48000, or 96000)',
        severity: 'error',
      }),
    );
  });

  it('validates optional bpm and masterVolume ranges when present', () => {
    const result = validateNka(createProject({ bpm: 12, masterVolume: 3 }));

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'bpm',
        message: 'must be between 20 and 300',
      }),
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'masterVolume',
        message: 'must be between 0 and 2',
      }),
    );
  });

  it('validates track mix volume and pan ranges', () => {
    const result = validateNka(
      createProject({
        trackMix: {
          voice: {
            volume: 3,
            pan: 2,
            solo: false,
            effectChain: [],
          },
        },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'trackMix.voice.volume',
        message: 'must be between 0 and 2',
      }),
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'trackMix.voice.pan',
        message: 'must be between -1 and 1',
      }),
    );
  });
});
