/**
 * NKA Format SDK — Codec Tests
 */

import { describe, it, expect } from 'vitest';
import { loadNka, saveNka, isValidNka } from '../codec';
import type { AudioProjectData } from '../../types/audioProject';

// =============================================================================
// Fixtures
// =============================================================================

const VALID_AUDIO_PROJECT: AudioProjectData = {
  version: '1.0',
  name: 'Test Audio Project',
  sampleRate: 48000,
  channels: 2,
  tracks: [
    {
      id: 'track-1',
      name: 'Main Audio',
      type: 'audio',
      elements: [],
      muted: false,
      locked: false,
      hidden: false,
      isMain: true,
    },
  ],
  masterEffectsChain: [
    {
      id: 'effect-1',
      type: 'compressor',
      name: 'Master Compressor',
      enabled: true,
      params: { threshold: -20, ratio: 4 },
    },
  ],
  markers: [
    {
      id: 'marker-1',
      time: 5.0,
      label: 'Chorus Start',
    },
  ],
};

// =============================================================================
// loadNka
// =============================================================================

describe('loadNka', () => {
  it('should load valid JSON and return a valid result', () => {
    const json = JSON.stringify(VALID_AUDIO_PROJECT);
    const result = loadNka(json);

    expect(result.validation.valid).toBe(true);
    expect(result.data.name).toBe('Test Audio Project');
    expect(result.data.sampleRate).toBe(48000);
  });

  it('should return error result for invalid JSON', () => {
    const result = loadNka('{ broken json!!!');

    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('JSON parse error'),
      }),
    );
  });

  it('should return error result for empty string', () => {
    const result = loadNka('');

    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors.length).toBeGreaterThan(0);
  });

  it('should return error result for non-object data', () => {
    const result = loadNka('"just a string"');

    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors).toContainEqual(
      expect.objectContaining({
        message: 'data must be an object',
      }),
    );
  });

  it('should return validation errors for missing required fields', () => {
    const result = loadNka(JSON.stringify({ version: '1.0' }));

    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors.some((e) => e.field === 'name')).toBe(true);
    expect(result.validation.errors.some((e) => e.field === 'tracks')).toBe(true);
  });

  it('should validate effect structure in masterEffectsChain', () => {
    const data = {
      ...VALID_AUDIO_PROJECT,
      masterEffectsChain: [{ id: 'e1' }], // missing required fields
    };
    const result = loadNka(JSON.stringify(data));

    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors.some((e) => e.field.startsWith('masterEffectsChain[0]'))).toBe(
      true,
    );
  });

  it('should validate marker structure', () => {
    const data = {
      ...VALID_AUDIO_PROJECT,
      markers: [{ id: 'm1', time: -1, label: 'Bad' }], // negative time
    };
    const result = loadNka(JSON.stringify(data));

    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors.some((e) => e.field === 'markers[0].time')).toBe(true);
  });
});

// =============================================================================
// saveNka
// =============================================================================

describe('saveNka', () => {
  it('should produce valid JSON with default indent of 2', () => {
    const json = saveNka(VALID_AUDIO_PROJECT);
    const parsed = JSON.parse(json) as unknown;

    expect(parsed).toEqual(VALID_AUDIO_PROJECT);
    // Check indent: second line should start with 2 spaces
    const lines = json.split('\n');
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[1]).toMatch(/^ {2}"/);
  });

  it('should respect custom indent option', () => {
    const json = saveNka(VALID_AUDIO_PROJECT, { indent: 4 });
    const lines = json.split('\n');
    expect(lines[1]).toMatch(/^ {4}"/);
  });

  it('should skip validation when validate=false', () => {
    // Invalid audio project data (missing required fields)
    const invalidProject = { version: '1.0' } as unknown as AudioProjectData;

    // With validation enabled, should throw
    expect(() => saveNka(invalidProject)).toThrow();

    // With validation disabled, should succeed
    const json = saveNka(invalidProject, { validate: false });
    expect(json).toBe(JSON.stringify(invalidProject, null, 2));
  });

  it('should throw on validation failure with error details', () => {
    const invalidProject = { version: '1.0' } as unknown as AudioProjectData;

    expect(() => saveNka(invalidProject)).toThrow('NKA validation failed');
  });
});

// =============================================================================
// Roundtrip
// =============================================================================

describe('loadNka + saveNka roundtrip', () => {
  it('should produce valid JSON that can be loaded back', () => {
    const json1 = saveNka(VALID_AUDIO_PROJECT);
    const loaded = loadNka(json1);

    expect(loaded.validation.valid).toBe(true);

    const json2 = saveNka(loaded.data);
    expect(JSON.parse(json1)).toEqual(JSON.parse(json2));
  });
});

// =============================================================================
// isValidNka
// =============================================================================

describe('isValidNka', () => {
  it('should return true for valid audio project data', () => {
    expect(isValidNka(VALID_AUDIO_PROJECT)).toBe(true);
  });

  it('should return false for invalid data', () => {
    expect(isValidNka({ broken: true })).toBe(false);
  });

  it('should return false for non-object data', () => {
    expect(isValidNka(null)).toBe(false);
    expect(isValidNka('string')).toBe(false);
  });
});
