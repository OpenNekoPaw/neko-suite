/**
 * Plan lifecycle state machine.
 *
 * Enforces the legal transitions documented in docs/architecture/plan-mode.md §6:
 *
 *   pending ──▶ approved ──▶ executing ──┬─▶ paused ──▶ executing
 *      │            │            │       ├─▶ completed
 *      │            │            │       ├─▶ failed
 *      │            │            │       └─▶ aborted
 *      │            └─▶ edited  ─▶ pending
 *      │            └─▶ aborted
 *      └──▶ edited  ─▶ pending
 *      └──▶ aborted
 *
 * Transitions append a {@link PlanStatusEvent} to the plan's history.
 *
 * All functions are pure — the caller (PlanStore) persists the returned plan.
 */

import type { PersistentPlan, PlanStatus, PlanStatusEvent } from './persistence-types';

// =============================================================================
// Transition table
// =============================================================================

type Next = ReadonlyArray<PlanStatus>;

const ALLOWED: Readonly<Record<PlanStatus, Next>> = {
  pending: ['approved', 'edited', 'aborted'],
  approved: ['executing', 'edited', 'aborted'],
  executing: ['paused', 'completed', 'failed', 'aborted'],
  paused: ['executing', 'aborted'],
  edited: ['pending', 'aborted'],
  // Terminal states — rarely transition, but keep a small escape hatch so a
  // user can fork/revise a completed plan (→ pending) without re-creation.
  completed: ['pending'],
  aborted: ['pending'],
  failed: ['pending', 'edited'],
};

// =============================================================================
// API
// =============================================================================

export class IllegalPlanTransitionError extends Error {
  constructor(from: PlanStatus, to: PlanStatus) {
    super(`Illegal plan transition: ${from} → ${to}`);
    this.name = 'IllegalPlanTransitionError';
  }
}

/** Returns true iff the transition is permitted. */
export function canTransition(from: PlanStatus, to: PlanStatus): boolean {
  if (from === to) return false;
  return ALLOWED[from].includes(to);
}

export interface TransitionOptions {
  /** Monotonic timestamp (ms). Falls back to Date.now(). */
  at?: number;
  /** Free-form reason, e.g. 'user-approve', 'pipeline-completed' */
  reason?: string;
  /** Who initiated the transition: 'user' | 'system' | agent id | … */
  by?: string;
  /** Optional pipeline id (usually set on approved → executing) */
  pipelineId?: string;
  /** Optional error message (set on executing → failed) */
  errorMessage?: string;
}

/**
 * Produce a new plan with the requested status applied. Throws if the
 * transition is not allowed.
 */
export function transition(
  plan: PersistentPlan,
  to: PlanStatus,
  options: TransitionOptions = {},
): PersistentPlan {
  if (!canTransition(plan.status, to)) {
    throw new IllegalPlanTransitionError(plan.status, to);
  }

  const at = options.at ?? Date.now();
  const event: PlanStatusEvent = {
    status: to,
    at,
    ...(options.reason !== undefined && { reason: options.reason }),
    ...(options.by !== undefined && { by: options.by }),
  };

  return {
    ...plan,
    status: to,
    updatedAt: at,
    statusHistory: [...plan.statusHistory, event],
    ...(options.pipelineId !== undefined && { pipelineId: options.pipelineId }),
    ...(options.errorMessage !== undefined && { errorMessage: options.errorMessage }),
  };
}

/**
 * Convenience: list the transitions available from the plan's current status.
 */
export function nextStatuses(plan: PersistentPlan): readonly PlanStatus[] {
  return ALLOWED[plan.status];
}

/** For unit tests */
export const __internal = { ALLOWED };
