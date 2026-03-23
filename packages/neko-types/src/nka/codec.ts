// =============================================================================
// NKA Format SDK — Codec
//
// High-level API for loading and saving .nka audio project files.
// All functions are pure — no side effects.
// =============================================================================

import type { AudioProjectData } from '../types/audioProject';
import type { ValidationResult } from '../config/config-adapter';
import { validateNka } from './validator';

/** Current NKA format version */
export const CURRENT_NKA_VERSION = '1.0';

/** Result of loading an NKA file */
export interface NkaLoadResult {
  /** Parsed audio project data */
  data: AudioProjectData;
  /** Validation result */
  validation: ValidationResult;
}

/** Options for saving an NKA file */
export interface NkaSaveOptions {
  /** Whether to validate before saving (default: true) */
  validate?: boolean;
  /** JSON indentation (default: 2) */
  indent?: number;
}

/**
 * Load and validate an NKA audio project from a JSON string.
 *
 * Pipeline:
 * 1. JSON.parse (catch SyntaxError -> error result)
 * 2. Validate structure
 * 3. Return NkaLoadResult
 */
export function loadNka(json: string): NkaLoadResult {
  // Step 1: Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch (err) {
    const message = err instanceof SyntaxError ? err.message : 'Invalid JSON';
    return {
      data: createEmptyAudioProject(),
      validation: {
        valid: false,
        errors: [{ field: '', message: `JSON parse error: ${message}`, severity: 'error' }],
        warnings: [],
      },
    };
  }

  // Step 2: Validate
  const validation = validateNka(parsed);

  if (!validation.valid && validation.errors.length > 0) {
    const hasCriticalErrors = validation.errors.some(
      (e) =>
        e.field === '' ||
        e.field === 'tracks' ||
        e.field === 'masterEffectsChain' ||
        e.field === 'markers',
    );
    if (hasCriticalErrors) {
      return {
        data: createEmptyAudioProject(),
        validation,
      };
    }
  }

  // Step 3: Return result
  return {
    data: parsed as AudioProjectData,
    validation,
  };
}

/**
 * Serialize an AudioProjectData to JSON string.
 *
 * Optionally validates before saving. Throws if validation fails and validate=true.
 */
export function saveNka(data: AudioProjectData, options: NkaSaveOptions = {}): string {
  const { validate = true, indent = 2 } = options;

  if (validate) {
    const result = validateNka(data as unknown);
    if (!result.valid) {
      const errorMessages = result.errors.map((e) => `${e.field}: ${e.message}`).join('; ');
      throw new Error(`NKA validation failed: ${errorMessages}`);
    }
  }

  return JSON.stringify(data, null, indent);
}

/**
 * Type guard: check whether unknown data is a valid AudioProjectData.
 */
export function isValidNka(data: unknown): data is AudioProjectData {
  const result = validateNka(data);
  return result.valid;
}

// =============================================================================
// Internal helper
// =============================================================================

function createEmptyAudioProject(): AudioProjectData {
  return {
    version: CURRENT_NKA_VERSION,
    name: '',
    sampleRate: 48000,
    channels: 2,
    tracks: [],
    masterEffectsChain: [],
    markers: [],
  };
}
