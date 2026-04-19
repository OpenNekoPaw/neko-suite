/**
 * PlanForker — derive a new plan from an existing one (with parentPlanId lineage).
 *
 * Fork use-cases (see docs/architecture/plan-mode.md §8):
 *   - User completed a run, wants to re-run with a different global style
 *   - User aborted mid-review and wants to start over with pre-filled bindings
 *   - User wants to branch a plan to experiment without touching the original
 *
 * A fork inherits route + stages + shots + constraints from its parent but
 * starts with a fresh id / createdAt / statusHistory and status='pending'.
 * Pipeline-specific fields (pipelineId, errorMessage) are dropped.
 *
 * This helper is pure — callers (WorkflowPlanHandler / PlanStore) persist the
 * result. Deliberately free of any dep on `@neko/shared/nkplan` so the Lite
 * plan and persistent plan can both fork via the same surface.
 */

import type { PersistentPlan, PlanStatus, PlanStatusEvent } from './persistence-types';

export interface ForkOptions {
  /** id generator for the forked plan (defaults to `${source.id}_fork_<rand>`) */
  generateId?: (source: PersistentPlan) => string;
  /** Monotonic timestamp (ms); defaults to Date.now() */
  now?: number;
  /** Optional reason recorded in the fork's initial status history */
  reason?: string;
  /** Optional actor recorded in the fork's initial status history */
  by?: string;
  /**
   * When true, strip user-edit state so the fork starts from the original
   * matching output. Defaults to false — the fork inherits the latest edits.
   */
  resetToOriginal?: boolean;
}

/**
 * Create a forked plan.
 *
 * - id: new; createdAt/updatedAt: fresh; statusHistory: single pending entry
 * - parentPlanId: set to source.id
 * - route/stages/shots/constraints/notes: copied by reference (immutable)
 * - pipelineId / errorMessage: stripped
 */
export function forkPlan(source: PersistentPlan, options: ForkOptions = {}): PersistentPlan {
  const now = options.now ?? Date.now();
  const id = (options.generateId ?? defaultForkIdGen)(source);
  const initialEvent: PlanStatusEvent = {
    status: 'pending' satisfies PlanStatus,
    at: now,
    ...(options.reason !== undefined && { reason: options.reason }),
    ...(options.by !== undefined && { by: options.by }),
  };

  const shots =
    options.resetToOriginal && source.shots ? stripUserEdits(source.shots) : source.shots;

  const fork: PersistentPlan = {
    version: source.version,
    id,
    createdAt: now,
    updatedAt: now,
    status: 'pending',
    statusHistory: [initialEvent],
    parentPlanId: source.id,
    route: source.route,
    stages: source.stages,
    ...(shots !== undefined && { shots }),
    ...(source.constraints !== undefined && { constraints: source.constraints }),
    // Preserve the reference chain so Phase 5 continuity anchors survive
    // the fork.  Without this, a forked plan re-runs without any
    // prior-shot context, defeating the point of forking instead of
    // re-routing.
    ...(source.referenceChain !== undefined &&
      source.referenceChain.length > 0 && { referenceChain: source.referenceChain }),
    ...(source.notes !== undefined && { notes: source.notes }),
    ...(source.project !== undefined && { project: source.project }),
    ...(source.stageParams !== undefined && { stageParams: source.stageParams }),
    // Preserve the input snapshot so the fork is self-sufficient: approve
    // dispatches into a real pipeline with correct ctx.source /
    // sourceFormat, and override can re-run router.decide against the
    // original input.  Synthesising an input from route.reason (the
    // pre-Phase-2.5 behaviour) breaks fountain / file-based inputs.
    ...(source.input !== undefined && { input: source.input }),
    // Preserve the Shot[] matching input so forks can re-run
    // ConsistencyChecker against the original data.  Without this the
    // fork's edit-binding goes through the fail-safe branch and
    // silently preserves stale violations.
    ...(source.matchingShots !== undefined &&
      source.matchingShots.length > 0 && { matchingShots: source.matchingShots }),
  };
  return fork;
}

// =============================================================================
// Helpers
// =============================================================================

function defaultForkIdGen(source: PersistentPlan): string {
  const r = Math.random().toString(36).slice(2, 8);
  return `${source.id}_fork_${r}`;
}

/**
 * Clear per-shot `userConfirmed` flags so continuity matching is free to
 * re-choose bindings on the fork's first pass.
 */
function stripUserEdits(shots: PersistentPlan['shots']): PersistentPlan['shots'] {
  if (!shots) return shots;
  return shots.map((s) => {
    if (!s.userConfirmed) return s;
    const { userConfirmed: _drop, ...rest } = s;
    return rest;
  });
}
