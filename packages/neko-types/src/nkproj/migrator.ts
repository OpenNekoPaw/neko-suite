// =============================================================================
// NKPROJ Format SDK — Migrator
//
// v1.0 baseline — the migration chain is empty today.  This file ships the
// scaffold so future schema changes can append entries without touching
// the codec.
// =============================================================================

import type { NkProj, NkprojMigrationResult, NkprojVersion } from './types';
import { CURRENT_NKPROJ_VERSION } from './types';
import { detectVersion } from './validator';

interface MigrationStep {
  readonly from: NkprojVersion;
  readonly to: NkprojVersion;
  readonly description: string;
  apply(input: unknown): { data: unknown; warnings: string[] };
}

/**
 * Migration chain.  Append in chronological order; `migrateNkproj`
 * walks until `to === CURRENT_NKPROJ_VERSION`.
 */
const MIGRATIONS: readonly MigrationStep[] = [];

export function migrateNkproj(data: unknown): NkprojMigrationResult {
  const detected = detectVersion(data) ?? CURRENT_NKPROJ_VERSION;
  const warnings: string[] = [];
  const applied: string[] = [];
  let current: unknown = data;
  let currentVersion: NkprojVersion = detected;

  while (currentVersion !== CURRENT_NKPROJ_VERSION) {
    const step = MIGRATIONS.find((m) => m.from === currentVersion);
    if (!step) {
      warnings.push(`No migration path from ${currentVersion} to ${CURRENT_NKPROJ_VERSION}`);
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

export { detectVersion as detectNkprojVersion };

function ensureCurrentVersion(data: unknown): NkProj {
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    return {
      ...(data as NkProj),
      version: CURRENT_NKPROJ_VERSION,
    };
  }
  return {
    version: CURRENT_NKPROJ_VERSION,
    id: '',
    createdAt: 0,
    updatedAt: 0,
    name: '',
    artifacts: [],
  };
}
