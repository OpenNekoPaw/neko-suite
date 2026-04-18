// =============================================================================
// NKPLAN Format SDK — Migrator
//
// Phase 2 ships with a single format version ('1.0'), so the migrator is
// primarily a scaffold: it establishes the migration chain pattern so future
// schema changes can add entries without touching the codec.
//
// See docs/architecture/plan-mode.md §5 for the NkPlan schema.
// =============================================================================

import type { NkPlan, NkplanMigrationResult, NkplanVersion } from './types';
import { CURRENT_NKPLAN_VERSION } from './types';
import { detectVersion } from './validator';

// ---------------------------------------------------------------------------
// Migration step contract
// ---------------------------------------------------------------------------

interface MigrationStep {
  readonly from: NkplanVersion;
  readonly to: NkplanVersion;
  readonly description: string;
  apply(input: unknown): { data: unknown; warnings: string[] };
}

/**
 * Migration chain. Steps should be appended in chronological order; `migrateNkplan`
 * walks them until `to === CURRENT_NKPLAN_VERSION`.
 *
 * Today: no historical versions, so the chain is empty.
 */
const MIGRATIONS: readonly MigrationStep[] = [];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function migrateNkplan(data: unknown): NkplanMigrationResult {
  const detected = detectVersion(data) ?? CURRENT_NKPLAN_VERSION;
  const warnings: string[] = [];
  const applied: string[] = [];
  let current: unknown = data;
  let currentVersion: NkplanVersion = detected;

  while (currentVersion !== CURRENT_NKPLAN_VERSION) {
    const step = MIGRATIONS.find((m) => m.from === currentVersion);
    if (!step) {
      warnings.push(`No migration path from ${currentVersion} to ${CURRENT_NKPLAN_VERSION}`);
      break;
    }
    const result = step.apply(current);
    current = result.data;
    warnings.push(...result.warnings);
    applied.push(step.description);
    currentVersion = step.to;
  }

  return {
    data: ensureCurrentVersion(current),
    fromVersion: detected,
    toVersion: currentVersion,
    appliedMigrations: applied,
    warnings,
  };
}

export { detectVersion as detectNkplanVersion };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Stamp the payload with the current version so callers can safely treat the
 * result as NkPlan regardless of input shape. Best-effort — validation is the
 * authoritative gate.
 */
function ensureCurrentVersion(data: unknown): NkPlan {
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    return {
      ...(data as NkPlan),
      version: CURRENT_NKPLAN_VERSION,
    };
  }
  // Return a best-effort empty shell — caller's validator will reject it.
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
