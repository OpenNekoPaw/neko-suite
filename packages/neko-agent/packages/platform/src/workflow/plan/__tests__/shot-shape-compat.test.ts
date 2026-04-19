/**
 * Shot shape compatibility — compile-time guard rail.
 *
 * `Shot` lives in platform/matching/types.ts (runtime).
 * `NkplanShot` lives in neko-types/nkplan/types.ts (persistence).
 *
 * They are hand-mirrored because neko-types cannot import from the
 * platform package (wrong layer direction).  When they drift, the
 * "in-memory works but disk / validator rejects it" bug is silent
 * unless we notice through a real fork round-trip.
 *
 * This file is compiled by vitest but deliberately has NO runtime
 * assertions — its job is to force a TypeScript error when one side
 * changes without the other.  If both types remain structurally
 * assignable, the file compiles and the single test passes.
 *
 * Expand the assertions when Shot gains / renames fields.
 */

import { describe, expect, it } from 'vitest';
import type { NkplanEntityRef, NkplanShot } from '@neko/shared/nkplan';
import type { EntityRef, Shot } from '../../matching/types';

// =============================================================================
// Structural assignability — these assignments are compile-time checks.
// A drift (e.g. Shot gains a required field NkplanShot doesn't have)
// fails to typecheck, breaking `pnpm test` before anyone can write a
// divergent plan to disk.
// =============================================================================

const _nkplanShotIsShot: Shot = undefined as unknown as NkplanShot;
const _shotIsNkplanShot: NkplanShot = undefined as unknown as Shot;
const _nkplanRefIsEntityRef: EntityRef = undefined as unknown as NkplanEntityRef;
const _entityRefIsNkplanRef: NkplanEntityRef = undefined as unknown as EntityRef;

// Satisfy the unused-variable lint — these exist purely for their
// right-hand-side types.
void _nkplanShotIsShot;
void _shotIsNkplanShot;
void _nkplanRefIsEntityRef;
void _entityRefIsNkplanRef;

describe('Shot ↔ NkplanShot compat', () => {
  it('types are structurally assignable in both directions', () => {
    // No-op runtime check — the real assertion happens at compile time
    // via the `const X: A = undefined as unknown as B` pattern above.
    // If that compiles, the types are structurally compatible.
    expect(true).toBe(true);
  });
});
