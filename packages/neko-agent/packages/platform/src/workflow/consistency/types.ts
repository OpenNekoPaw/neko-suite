/**
 * ConsistencyChecker Types — see docs/architecture/creative-consistency.md
 *
 * Layer: Horizontal subsystem (consumed by Plan layer's PlanBuilder).
 *
 * Phase 2 scope:
 *   - character_lock        (same entity must use same asset within a scope)
 *   - time_progression      (scene time advances monotonically)
 *
 * Phase 5+:
 *   - costume_continuity, style_lock, prop_consistency
 */

import type { NkplanConstraint, NkplanConstraintKind } from '@neko/shared/nkplan';
import type { BindingSlot } from '../asset-library/types';
import type { Shot, ShotBindings } from '../matching/types';

// =============================================================================
// Re-exports of the persistent constraint wire type
// =============================================================================

export type ConstraintKind = NkplanConstraintKind;
export type Constraint = NkplanConstraint;

// =============================================================================
// Violation
// =============================================================================

export type ViolationSeverity = 'error' | 'warning' | 'info';

export interface Violation {
  readonly id: string;
  readonly kind: ConstraintKind;
  readonly severity: ViolationSeverity;
  readonly constraintId: string;
  readonly shotIds: readonly string[];
  readonly entity: string;
  readonly slot?: BindingSlot;
  readonly message: string;
  /** Machine-actionable suggestions shown in the Plan matrix UI. */
  readonly suggestions?: readonly ViolationFix[];
}

export type ViolationFix =
  | {
      readonly kind: 'replace-binding';
      readonly shotId: string;
      readonly slot: BindingSlot;
      readonly assetId: string;
    }
  | { readonly kind: 'add-scene-break'; readonly beforeShot: string }
  | { readonly kind: 'accept-as-intentional'; readonly note: string };

// =============================================================================
// Rule interface
// =============================================================================

/**
 * Context handed to each rule. The shot list and per-shot bindings are
 * passed together so rules can cross-reference shots by index or scene group.
 *
 * Phase 2 rules do NOT call AssetLibrary directly — all the state they need
 * lives in shots + bindings. This keeps them pure and testable.
 */
export interface CheckContext {
  readonly shots: readonly Shot[];
  readonly bindings: readonly ShotBindings[];
  /** Pre-authored constraints (from user or earlier runs). Phase 2: optional. */
  readonly constraints?: readonly Constraint[];
}

export interface ConsistencyRule {
  readonly kind: ConstraintKind;
  check(ctx: CheckContext): { constraints: Constraint[]; violations: Violation[] };
}

// =============================================================================
// Checker facade contract
// =============================================================================

export interface ConsistencyCheckResult {
  readonly constraints: Constraint[];
  readonly violations: Violation[];
}

export interface ConsistencyChecker {
  check(ctx: CheckContext): ConsistencyCheckResult;
}
