// =============================================================================
// NKA Format SDK — Validator
//
// Pure-function, zero-dependency validator for NKA audio project data.
// Produces field-path-based errors and warnings.
// =============================================================================

import type { ValidationResult, ValidationError } from '../config/config-adapter';
import { isEngineAudioEffectType, isKnownAudioEffectType } from '../types/audioMix';

// =============================================================================
// Type Guards (internal helpers)
// =============================================================================

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && !Number.isNaN(v);
}

function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

// =============================================================================
// Allowed values (reuse NKV track types for audio tracks)
// =============================================================================

const ALLOWED_TRACK_TYPES = new Set([
  'video',
  'audio',
  'text',
  'effect',
  'subtitle',
  'shape',
  'scene3d',
  'puppet',
  'media',
]);

const ALLOWED_ELEMENT_TYPES = new Set([
  'media',
  'audio',
  'text',
  'shape',
  'subtitle',
  'scene3d',
  'puppet',
]);

// =============================================================================
// Validate options
// =============================================================================

export interface NkaValidateOptions {
  /** When true, treat warnings as errors */
  strict?: boolean;
  /** When true, skip element-level validation within tracks */
  skipElements?: boolean;
}

// =============================================================================
// Internal validators
// =============================================================================

function validateRoot(
  data: Record<string, unknown>,
  errors: ValidationError[],
  warnings: ValidationError[],
): void {
  // version — required string
  if (!isString(data['version'])) {
    errors.push({ field: 'version', message: 'must be a string', severity: 'error' });
  }

  // name — required string
  if (!isString(data['name'])) {
    errors.push({ field: 'name', message: 'must be a string', severity: 'error' });
  }

  // sampleRate — required positive number
  if (!isNumber(data['sampleRate']) || data['sampleRate'] <= 0) {
    errors.push({ field: 'sampleRate', message: 'must be a positive number', severity: 'error' });
  } else if (
    data['sampleRate'] !== 44100 &&
    data['sampleRate'] !== 48000 &&
    data['sampleRate'] !== 96000
  ) {
    warnings.push({
      field: 'sampleRate',
      message: 'uncommon sample rate (expected 44100, 48000, or 96000)',
      severity: 'warning',
    });
  }

  // channels — required positive integer
  if (!isNumber(data['channels']) || data['channels'] <= 0 || !Number.isInteger(data['channels'])) {
    errors.push({ field: 'channels', message: 'must be a positive integer', severity: 'error' });
  }

  // tracks — required array
  if (!isArray(data['tracks'])) {
    errors.push({ field: 'tracks', message: 'must be an array', severity: 'error' });
  }

  // masterEffectsChain — required array
  if (!isArray(data['masterEffectsChain'])) {
    errors.push({ field: 'masterEffectsChain', message: 'must be an array', severity: 'error' });
  }

  // markers — required array
  if (!isArray(data['markers'])) {
    errors.push({ field: 'markers', message: 'must be an array', severity: 'error' });
  }

  if (data['bpm'] !== undefined) {
    if (!isNumber(data['bpm'])) {
      errors.push({ field: 'bpm', message: 'must be a number', severity: 'error' });
    } else if (data['bpm'] < 20 || data['bpm'] > 300) {
      errors.push({ field: 'bpm', message: 'must be between 20 and 300', severity: 'error' });
    }
  }

  if (data['masterVolume'] !== undefined) {
    if (!isNumber(data['masterVolume'])) {
      errors.push({ field: 'masterVolume', message: 'must be a number', severity: 'error' });
    } else if (data['masterVolume'] < 0 || data['masterVolume'] > 2) {
      errors.push({
        field: 'masterVolume',
        message: 'must be between 0 and 2',
        severity: 'error',
      });
    }
  }
}

function validateTrack(
  track: unknown,
  path: string,
  errors: ValidationError[],
  warnings: ValidationError[],
  options: NkaValidateOptions,
): void {
  if (!isRecord(track)) {
    errors.push({ field: path, message: 'must be an object', severity: 'error' });
    return;
  }

  // id — required string
  if (!isString(track['id'])) {
    errors.push({ field: `${path}.id`, message: 'must be a string', severity: 'error' });
  }

  // name — required string
  if (!isString(track['name'])) {
    errors.push({ field: `${path}.name`, message: 'must be a string', severity: 'error' });
  }

  // type — required, must be in allowed set
  if (!isString(track['type'])) {
    errors.push({ field: `${path}.type`, message: 'must be a string', severity: 'error' });
  } else if (!ALLOWED_TRACK_TYPES.has(track['type'])) {
    errors.push({
      field: `${path}.type`,
      message: `invalid track type: "${track['type']}"`,
      severity: 'error',
    });
  }

  // elements — required array
  if (!isArray(track['elements'])) {
    errors.push({ field: `${path}.elements`, message: 'must be an array', severity: 'error' });
  } else if (!options.skipElements) {
    const elements = track['elements'];
    for (let i = 0; i < elements.length; i++) {
      validateElement(elements[i], `${path}.elements[${i}]`, errors, warnings);
    }
  }

  // boolean fields — warn if missing, error if wrong type
  const boolFields = ['muted', 'locked', 'hidden', 'isMain'] as const;
  for (const field of boolFields) {
    const val = track[field];
    if (val === undefined) {
      warnings.push({
        field: `${path}.${field}`,
        message: 'missing optional boolean field',
        severity: 'warning',
      });
    } else if (!isBoolean(val)) {
      errors.push({ field: `${path}.${field}`, message: 'must be a boolean', severity: 'error' });
    }
  }
}

function validateElement(
  element: unknown,
  path: string,
  errors: ValidationError[],
  warnings: ValidationError[],
): void {
  if (!isRecord(element)) {
    errors.push({ field: path, message: 'must be an object', severity: 'error' });
    return;
  }

  // Base fields
  if (!isString(element['id'])) {
    errors.push({ field: `${path}.id`, message: 'must be a string', severity: 'error' });
  }
  if (!isString(element['name'])) {
    errors.push({ field: `${path}.name`, message: 'must be a string', severity: 'error' });
  }
  if (!isString(element['type'])) {
    errors.push({ field: `${path}.type`, message: 'must be a string', severity: 'error' });
  } else if (!ALLOWED_ELEMENT_TYPES.has(element['type'])) {
    errors.push({
      field: `${path}.type`,
      message: `invalid element type: "${element['type']}"`,
      severity: 'error',
    });
  }

  // Numeric fields
  const numericFields = ['duration', 'startTime', 'trimStart', 'trimEnd', 'opacity'] as const;
  for (const field of numericFields) {
    const val = element[field];
    if (val === undefined) {
      warnings.push({
        field: `${path}.${field}`,
        message: 'missing optional numeric field',
        severity: 'warning',
      });
    } else if (!isNumber(val)) {
      errors.push({ field: `${path}.${field}`, message: 'must be a number', severity: 'error' });
    }
  }

  // Boolean fields
  const boolFields = ['muted', 'hidden', 'locked'] as const;
  for (const field of boolFields) {
    const val = element[field];
    if (val !== undefined && !isBoolean(val)) {
      errors.push({ field: `${path}.${field}`, message: 'must be a boolean', severity: 'error' });
    }
  }
}

function validateEffect(effect: unknown, path: string, errors: ValidationError[]): void {
  if (!isRecord(effect)) {
    errors.push({ field: path, message: 'must be an object', severity: 'error' });
    return;
  }

  // id — required string
  if (!isString(effect['id'])) {
    errors.push({ field: `${path}.id`, message: 'must be a string', severity: 'error' });
  }

  // type — required string
  if (!isString(effect['type'])) {
    errors.push({ field: `${path}.type`, message: 'must be a string', severity: 'error' });
  } else if (!isKnownAudioEffectType(effect['type'])) {
    errors.push({
      field: `${path}.type`,
      message: `invalid audio effect type: "${effect['type']}"`,
      severity: 'error',
    });
  }

  // name — required string
  if (!isString(effect['name'])) {
    errors.push({ field: `${path}.name`, message: 'must be a string', severity: 'error' });
  }

  // enabled — required boolean
  if (!isBoolean(effect['enabled'])) {
    errors.push({ field: `${path}.enabled`, message: 'must be a boolean', severity: 'error' });
  }

  // params — required object
  if (!isRecord(effect['params'])) {
    errors.push({ field: `${path}.params`, message: 'must be an object', severity: 'error' });
  }
}

function validateMixEffect(effect: unknown, path: string, errors: ValidationError[]): void {
  if (!isRecord(effect)) {
    errors.push({ field: path, message: 'must be an object', severity: 'error' });
    return;
  }

  if (!isString(effect['id'])) {
    errors.push({ field: `${path}.id`, message: 'must be a string', severity: 'error' });
  }

  if (!isString(effect['effectType'])) {
    errors.push({ field: `${path}.effectType`, message: 'must be a string', severity: 'error' });
  } else if (!isEngineAudioEffectType(effect['effectType'])) {
    errors.push({
      field: `${path}.effectType`,
      message: `invalid renderable effect type: "${effect['effectType']}"`,
      severity: 'error',
    });
  }

  if (!isBoolean(effect['enabled'])) {
    errors.push({ field: `${path}.enabled`, message: 'must be a boolean', severity: 'error' });
  }

  if (!isRecord(effect['params'])) {
    errors.push({ field: `${path}.params`, message: 'must be an object', severity: 'error' });
  }
}

function validateTrackMix(data: Record<string, unknown>, errors: ValidationError[]): void {
  const trackMix = data['trackMix'];
  if (trackMix === undefined) {
    return;
  }

  if (!isRecord(trackMix)) {
    errors.push({ field: 'trackMix', message: 'must be an object', severity: 'error' });
    return;
  }

  for (const [trackId, state] of Object.entries(trackMix)) {
    const statePath = `trackMix.${trackId}`;
    if (!isRecord(state)) {
      errors.push({ field: statePath, message: 'must be an object', severity: 'error' });
      continue;
    }

    if (!isNumber(state['volume'])) {
      errors.push({ field: `${statePath}.volume`, message: 'must be a number', severity: 'error' });
    } else if (state['volume'] < 0 || state['volume'] > 2) {
      errors.push({
        field: `${statePath}.volume`,
        message: 'must be between 0 and 2',
        severity: 'error',
      });
    }

    if (!isNumber(state['pan'])) {
      errors.push({ field: `${statePath}.pan`, message: 'must be a number', severity: 'error' });
    } else if (state['pan'] < -1 || state['pan'] > 1) {
      errors.push({
        field: `${statePath}.pan`,
        message: 'must be between -1 and 1',
        severity: 'error',
      });
    }

    if (!isBoolean(state['solo'])) {
      errors.push({ field: `${statePath}.solo`, message: 'must be a boolean', severity: 'error' });
    }

    if (!isArray(state['effectChain'])) {
      errors.push({
        field: `${statePath}.effectChain`,
        message: 'must be an array',
        severity: 'error',
      });
      continue;
    }

    for (let i = 0; i < state['effectChain'].length; i++) {
      validateMixEffect(state['effectChain'][i], `${statePath}.effectChain[${i}]`, errors);
    }
  }
}

function validateMarker(marker: unknown, path: string, errors: ValidationError[]): void {
  if (!isRecord(marker)) {
    errors.push({ field: path, message: 'must be an object', severity: 'error' });
    return;
  }

  // id — required string
  if (!isString(marker['id'])) {
    errors.push({ field: `${path}.id`, message: 'must be a string', severity: 'error' });
  }

  // time — required non-negative number
  if (!isNumber(marker['time'])) {
    errors.push({ field: `${path}.time`, message: 'must be a number', severity: 'error' });
  } else if (marker['time'] < 0) {
    errors.push({ field: `${path}.time`, message: 'must be >= 0', severity: 'error' });
  }

  // label — required string
  if (!isString(marker['label'])) {
    errors.push({ field: `${path}.label`, message: 'must be a string', severity: 'error' });
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Validate raw unknown data as NKA format.
 *
 * Use this when loading from JSON.parse() result before casting to AudioProjectData.
 */
export function validateNka(data: unknown, options: NkaValidateOptions = {}): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!isRecord(data)) {
    return {
      valid: false,
      errors: [{ field: '', message: 'data must be an object', severity: 'error' }],
      warnings: [],
    };
  }

  validateRoot(data, errors, warnings);

  // Validate tracks if root tracks is an array
  const tracks = data['tracks'];
  if (isArray(tracks)) {
    for (let i = 0; i < tracks.length; i++) {
      validateTrack(tracks[i], `tracks[${i}]`, errors, warnings, options);
    }
  }

  // Validate masterEffectsChain if root masterEffectsChain is an array
  const effects = data['masterEffectsChain'];
  if (isArray(effects)) {
    for (let i = 0; i < effects.length; i++) {
      validateEffect(effects[i], `masterEffectsChain[${i}]`, errors);
    }
  }

  // Validate markers if root markers is an array
  const markers = data['markers'];
  if (isArray(markers)) {
    for (let i = 0; i < markers.length; i++) {
      validateMarker(markers[i], `markers[${i}]`, errors);
    }
  }

  validateTrackMix(data, errors);

  const promotedWarnings: ValidationError[] = options.strict
    ? warnings.map((warning) => ({ ...warning, severity: 'error' as const }))
    : [];
  const effectiveErrors = options.strict ? [...errors, ...promotedWarnings] : errors;

  return {
    valid: effectiveErrors.length === 0,
    errors: effectiveErrors,
    warnings: options.strict ? [] : warnings,
  };
}
