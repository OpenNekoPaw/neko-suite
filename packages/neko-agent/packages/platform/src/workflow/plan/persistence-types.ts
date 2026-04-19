/**
 * Bridge types between the in-memory LitePlan and the persistent NkPlan.
 *
 * Kept separate from `plan/types.ts` so the in-memory LitePlan stays minimal
 * for Phase 1.5 consumers, while persistence (Phase 2) adds lifecycle fields.
 */

import type { NkPlan, NkplanStatus, NkplanStatusEvent } from '@neko/shared/nkplan';
import type { LitePlan } from './types';

export type PersistentPlan = NkPlan;

export type PlanStatus = NkplanStatus;

export type PlanStatusEvent = NkplanStatusEvent;

// =============================================================================
// Lite ↔ persistent conversion
// =============================================================================

/**
 * Upgrade an in-memory LitePlan into a persistent NkPlan.
 * `createdAt` / `updatedAt` are pulled from the lite plan when present; the
 * initial `statusHistory` entry is synthesised from the current status.
 */
export function toNkPlan(lite: LitePlan, opts: { now?: number } = {}): PersistentPlan {
  const now = opts.now ?? Date.now();
  const status: PlanStatus = toPersistentStatus(lite.status);
  return {
    version: '1.0',
    id: lite.id,
    createdAt: lite.createdAt ?? now,
    updatedAt: now,
    status,
    statusHistory: [{ status, at: lite.createdAt ?? now }],
    ...(lite.parentPlanId !== undefined && { parentPlanId: lite.parentPlanId }),
    route: lite.route,
    stages: lite.stages,
    ...(lite.shots !== undefined && { shots: lite.shots }),
    ...(lite.referenceChain !== undefined &&
      lite.referenceChain.length > 0 && { referenceChain: lite.referenceChain }),
    ...(lite.notes !== undefined && lite.notes.length > 0 && { notes: lite.notes }),
    // Phase 2.5+ — persist the RawInput snapshot so fork/approve can
    // dispatch without re-plumbing it through the caller.
    ...(lite.input !== undefined && { input: lite.input }),
    // Phase 3.5+ — persist the Shot[] matching input so forks/reloaded
    // plans can re-run ConsistencyChecker without a session side-table.
    ...(lite.matchingShots !== undefined &&
      lite.matchingShots.length > 0 && { matchingShots: lite.matchingShots }),
  };
}

/**
 * Down-cast a persistent NkPlan to the in-memory LitePlan shape (loses
 * history / pipelineId / errorMessage / constraints).
 */
export function toLitePlan(plan: PersistentPlan): LitePlan {
  const status = fromPersistentStatus(plan.status);
  return {
    id: plan.id,
    createdAt: plan.createdAt,
    status,
    ...(plan.parentPlanId !== undefined && { parentPlanId: plan.parentPlanId }),
    route: plan.route,
    stages: plan.stages,
    ...(plan.shots !== undefined && { shots: plan.shots }),
    ...(plan.referenceChain !== undefined &&
      plan.referenceChain.length > 0 && { referenceChain: plan.referenceChain }),
    ...(plan.notes !== undefined && plan.notes.length > 0 && { notes: plan.notes }),
    // Phase 2.5+ — round-trip input so forks reloaded from disk can
    // still dispatch without re-plumbing the original RawInput.
    ...(plan.input !== undefined && { input: plan.input }),
    // Phase 3.5+ — round-trip matchingShots so ConsistencyChecker can
    // re-run on edits against the original input.
    ...(plan.matchingShots !== undefined &&
      plan.matchingShots.length > 0 && { matchingShots: plan.matchingShots }),
  } as LitePlan;
}

function toPersistentStatus(lite: LitePlan['status']): PlanStatus {
  switch (lite) {
    case 'pending':
    case 'approved':
    case 'edited':
    case 'aborted':
      return lite;
  }
}

function fromPersistentStatus(status: PlanStatus): LitePlan['status'] {
  switch (status) {
    case 'pending':
    case 'approved':
    case 'edited':
    case 'aborted':
      return status;
    case 'executing':
    case 'paused':
      // LitePlan predates the executing/paused states; collapse to 'approved'
      return 'approved';
    case 'completed':
    case 'failed':
      // Terminal states not in LitePlan — map to 'aborted' for back-compat.
      return 'aborted';
  }
}
