// =============================================================================
// NKPLAN Format SDK — Codec
//
// Pure-function load/save that combines validator + migrator.
//
// Layer: @neko/shared/nkplan  (zero VSCode deps; used by extension + tests)
// =============================================================================

import type { NkPlan, NkplanLoadResult, NkplanSaveOptions } from './types';
import { CURRENT_NKPLAN_VERSION } from './types';
import { migrateNkplan } from './migrator';
import { detectVersion, validateNkplan, validateNkplanStruct } from './validator';

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

/**
 * Parse a `.nkplan` JSON string → validated + possibly migrated `NkPlan`.
 *
 * Pipeline:
 *   1. JSON.parse (SyntaxError → error result)
 *   2. Validate structure
 *   3. If version != current, run migrator, then re-validate
 *   4. Return NkplanLoadResult
 */
export function loadNkplan(json: string): NkplanLoadResult {
  // 1) Parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch (err) {
    const message = err instanceof SyntaxError ? err.message : 'Invalid JSON';
    return {
      plan: createEmptyPlan(),
      validation: {
        valid: false,
        errors: [{ field: '', message: `JSON parse error: ${message}`, severity: 'error' }],
        warnings: [],
      },
    };
  }

  // 2) Validate
  const initialValidation = validateNkplan(parsed);
  const hasCritical = initialValidation.errors.some(
    (e) => e.field === '' || e.field === 'route' || e.field === 'stages',
  );
  if (!initialValidation.valid && hasCritical) {
    return { plan: createEmptyPlan(), validation: initialValidation };
  }

  // 3) Migrate if needed
  const detected = detectVersion(parsed);
  if (detected !== CURRENT_NKPLAN_VERSION) {
    const migration = migrateNkplan(parsed);
    const post = validateNkplan(migration.data as unknown);
    return { plan: migration.data, validation: post, migration };
  }

  return { plan: parsed as NkPlan, validation: initialValidation };
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

export function saveNkplan(plan: NkPlan, options: NkplanSaveOptions = {}): string {
  const { validate = true, indent = 2 } = options;
  if (validate) {
    const result = validateNkplanStruct(plan);
    if (!result.valid) {
      const msgs = result.errors.map((e) => `${e.field}: ${e.message}`).join('; ');
      throw new Error(`NKPLAN validation failed: ${msgs}`);
    }
  }
  return JSON.stringify(plan, null, indent);
}

// ---------------------------------------------------------------------------
// Guards / helpers
// ---------------------------------------------------------------------------

export function isValidNkplan(data: unknown): data is NkPlan {
  return validateNkplan(data).valid;
}

function createEmptyPlan(): NkPlan {
  return {
    version: CURRENT_NKPLAN_VERSION,
    id: '',
    createdAt: 0,
    updatedAt: 0,
    status: 'pending',
    statusHistory: [],
    route: {
      level: 'L0',
      flowId: 'flowB',
      entryExtension: 'agent',
      skipStages: [],
      reason: '',
      confidence: 0,
      provenance: 'rules',
    },
    stages: [],
  };
}
