/**
 * PlanEditor — pure functions that apply user edits to a LitePlan.
 *
 * Phase 2 matrix editing scope:
 *   - editBinding: override one shot's primary binding for a slot with
 *     one of its alternatives (or a free-form BindingCandidate).
 *   - applyToAll: propagate a binding to every other shot that currently
 *     references the same entity on the same slot.
 *
 * Both helpers re-run the provided ConsistencyChecker so violations stay
 * accurate after the mutation. They do NOT persist — the caller (handler)
 * owns I/O.
 *
 * See docs/architecture/plan-mode.md §7 and creative-consistency.md §6.
 */

import type { ConsistencyChecker } from '../consistency/types';
import type { BindingSlot } from '../asset-library/types';
import type { BindingCandidate, Shot, ShotBindings } from '../matching/types';
import type { LitePlan, ShotBindingSummary } from './types';

// =============================================================================
// Edit descriptors
// =============================================================================

export interface EditBindingInput {
  shotId: string;
  slot: BindingSlot;
  /**
   * New asset for this slot. Can reference an existing alternative (by
   * assetId) or be a free-form candidate (e.g. a user-picked asset from
   * the AssetLibrary browser).
   */
  candidate: BindingCandidate;
  /** Mark this shot as user-confirmed so continuity respects it */
  userConfirm?: boolean;
}

export interface ApplyToAllInput {
  /** Entity to propagate the binding for (e.g. 'alice') */
  entityId: string;
  slot: BindingSlot;
  candidate: BindingCandidate;
}

export interface ToggleCheckpointInput {
  stageId: string;
  /** When omitted, the current value is inverted; set explicitly to force. */
  value?: boolean;
}

// =============================================================================
// Context needed to re-run the consistency check after an edit
// =============================================================================

export interface EditContext {
  /** The in-memory shot list used when the plan was first built. */
  shots: readonly Shot[];
  /** Checker to re-run after the edit; omit to skip violation re-computation. */
  consistencyChecker?: ConsistencyChecker;
}

// =============================================================================
// editBinding
// =============================================================================

export function editBinding(plan: LitePlan, input: EditBindingInput, ctx: EditContext): LitePlan {
  if (!plan.shots) return plan;
  const nextShots = plan.shots.map((s) => {
    if (s.shotId !== input.shotId) return s;
    return applyCandidate(s, input.slot, input.candidate);
  });
  return rerunConsistency({ ...plan, shots: nextShots }, ctx);
}

// =============================================================================
// applyToAll
// =============================================================================

export function applyToAll(plan: LitePlan, input: ApplyToAllInput, ctx: EditContext): LitePlan {
  if (!plan.shots) return plan;
  const nextShots = plan.shots.map((s) => {
    const existing = s.primary[input.slot];
    if (!existing || existing.entityId !== input.entityId) return s;
    return applyCandidate(s, input.slot, input.candidate);
  });
  return rerunConsistency({ ...plan, shots: nextShots }, ctx);
}

// =============================================================================
// toggleStageCheckpoint
// =============================================================================

/**
 * Toggle the `userCheckpoint` flag on a stage. Does NOT re-run the consistency
 * checker (checkpoints don't affect bindings). Returns the plan unchanged when
 * the stage id is unknown or the stage is skipped.
 */
export function toggleStageCheckpoint(plan: LitePlan, input: ToggleCheckpointInput): LitePlan {
  const nextStages = plan.stages.map((s) => {
    if (s.id !== input.stageId) return s;
    if (s.skipped) return s;
    const nextValue = input.value ?? !s.userCheckpoint;
    if ((s.userCheckpoint === true) === nextValue) return s;
    const { userCheckpoint: _drop, ...rest } = s;
    return nextValue ? { ...rest, userCheckpoint: true } : rest;
  });
  return { ...plan, stages: nextStages };
}

// =============================================================================
// Internals
// =============================================================================

function applyCandidate(
  summary: ShotBindingSummary,
  slot: BindingSlot,
  candidate: BindingCandidate,
): ShotBindingSummary {
  // Move the previous primary (if any) into alternatives so the user can
  // flip back; de-dupe alternatives by (provenance, assetId).
  const previous = summary.primary[slot];
  const existingAlts = summary.alternatives[slot] ?? [];
  const seen = new Set<string>([key(candidate)]);
  const nextAlts: BindingCandidate[] = [];
  if (previous && !seen.has(key(previous))) {
    nextAlts.push(previous);
    seen.add(key(previous));
  }
  for (const alt of existingAlts) {
    if (seen.has(key(alt))) continue;
    nextAlts.push(alt);
    seen.add(key(alt));
  }

  const nextPrimary = { ...summary.primary, [slot]: candidate };
  const nextAlternatives = { ...summary.alternatives, [slot]: nextAlts };
  const nextUnmatched = summary.unmatched.filter((s) => s !== slot);
  return {
    shotId: summary.shotId,
    primary: nextPrimary,
    alternatives: nextAlternatives,
    unmatched: nextUnmatched,
  };
}

function key(c: BindingCandidate): string {
  return `${c.provenance}:${c.assetId}`;
}

function rerunConsistency(plan: LitePlan, ctx: EditContext): LitePlan {
  if (!ctx.consistencyChecker || !plan.shots) return plan;
  const bindings = plan.shots.map((s) => summaryToShotBindings(s));
  const { constraints, violations } = ctx.consistencyChecker.check({
    shots: ctx.shots,
    bindings,
  });

  // Strip empty arrays so optional fields round-trip cleanly
  return {
    id: plan.id,
    createdAt: plan.createdAt,
    status: plan.status,
    route: plan.route,
    stages: plan.stages,
    ...(plan.shots !== undefined && { shots: plan.shots }),
    ...(plan.notes !== undefined && plan.notes.length > 0 && { notes: plan.notes }),
    ...(constraints.length > 0 && { constraints }),
    ...(violations.length > 0 && { violations }),
  };
}

function summaryToShotBindings(s: ShotBindingSummary): ShotBindings {
  return {
    shotId: s.shotId,
    primary: s.primary,
    alternatives: s.alternatives,
    unmatched: s.unmatched,
  };
}
