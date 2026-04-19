// =============================================================================
// NKPROJ Format SDK — Codec
//
// Pure-function load/save that combines validator + migrator.
//
// Layer: @neko/shared/nkproj  (zero VSCode deps; used by extension + tests)
// =============================================================================

import type { NkProj, NkprojLoadResult, NkprojSaveOptions } from './types';
import { CURRENT_NKPROJ_VERSION } from './types';
import { migrateNkproj } from './migrator';
import { detectVersion, validateNkproj, validateNkprojStruct } from './validator';

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

/**
 * Parse a `.nkproj` JSON string → validated + possibly migrated `NkProj`.
 *
 * Pipeline:
 *   1. JSON.parse (SyntaxError → error result)
 *   2. Validate structure
 *   3. If version != current, run migrator, then re-validate
 *   4. Return NkprojLoadResult
 */
export function loadNkproj(json: string): NkprojLoadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch (err) {
    const message = err instanceof SyntaxError ? err.message : 'Invalid JSON';
    return {
      proj: createEmptyProj(),
      validation: {
        valid: false,
        errors: [{ field: '', message: `JSON parse error: ${message}`, severity: 'error' }],
        warnings: [],
      },
    };
  }

  const initialValidation = validateNkproj(parsed);
  // Treat root / id / artifacts missing as critical — the project is
  // unusable without them.
  const hasCritical = initialValidation.errors.some(
    (e) => e.field === '' || e.field === 'id' || e.field === 'artifacts',
  );
  if (!initialValidation.valid && hasCritical) {
    return { proj: createEmptyProj(), validation: initialValidation };
  }

  const detected = detectVersion(parsed);
  if (detected !== CURRENT_NKPROJ_VERSION) {
    const migration = migrateNkproj(parsed);
    const post = validateNkproj(migration.data as unknown);
    return { proj: migration.data, validation: post, migration };
  }

  return { proj: parsed as NkProj, validation: initialValidation };
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

export function saveNkproj(proj: NkProj, options: NkprojSaveOptions = {}): string {
  const { validate = true, indent = 2 } = options;
  if (validate) {
    const result = validateNkprojStruct(proj);
    if (!result.valid) {
      const msgs = result.errors.map((e) => `${e.field}: ${e.message}`).join('; ');
      throw new Error(`NKPROJ validation failed: ${msgs}`);
    }
  }
  return JSON.stringify(proj, null, indent);
}

// ---------------------------------------------------------------------------
// Guards / helpers
// ---------------------------------------------------------------------------

export function isValidNkproj(data: unknown): data is NkProj {
  return validateNkproj(data).valid;
}

function createEmptyProj(): NkProj {
  return {
    version: CURRENT_NKPROJ_VERSION,
    id: '',
    createdAt: 0,
    updatedAt: 0,
    name: '',
    artifacts: [],
  };
}
