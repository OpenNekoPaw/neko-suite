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
    route: lite.route,
    stages: lite.stages,
    ...(lite.shots !== undefined && { shots: lite.shots }),
    ...(lite.notes !== undefined && lite.notes.length > 0 && { notes: lite.notes }),
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
    route: plan.route,
    stages: plan.stages,
    ...(plan.shots !== undefined && { shots: plan.shots }),
    ...(plan.notes !== undefined && plan.notes.length > 0 && { notes: plan.notes }),
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
