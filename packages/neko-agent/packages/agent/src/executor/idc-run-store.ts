/**
 * Sdd Run Store — in-memory aggregator for IdcRun records.
 *
 * See: agent-types/idc-run.ts
 *      docs/architecture/agent-unified-workflow.md §4
 *
 * Runtime companion to the IdcRun *type*. In-memory implementation is
 * enough for the current Agent loop; a shared-memory backed version can
 * replace it later without touching callers.
 *
 * Single-writer model: one active run at a time per store instance.
 * Creating a new run while one is active closes the previous one with
 * status='aborted' (runtime guard against stale state).
 */

import type {
  Draft,
  ExecutionPlan,
  StageActivationDecision,
  Task,
  IdcRun,
  IdcRunArtifactBinding,
  IdcRunArtifactKind,
  IdcRunRoundSummary,
  IdcRunStatus,
} from '@neko-agent/types';
import { roundSummaryFromDecision } from '@neko-agent/types';

// =============================================================================
// Types
// =============================================================================

export interface IIdcRunStore {
  /** Start a fresh run, aborting any in-flight run. Returns the new run id. */
  startRun(input: { runKind?: string; workflowId?: string; runId?: string }): string;
  /** Replace in-memory state from a persisted runtime snapshot. */
  restore(input: { active?: IdcRun | null; completed?: readonly IdcRun[] }): void;
  /** Append a round summary derived from the planner decision. */
  recordRound(decision: StageActivationDecision, lastObserveHint?: string): void;
  /** Upsert the latest persisted artifact binding for the current run. */
  bindArtifact(binding: IdcRunArtifactBinding): void;
  /** Attach / replace the active Draft artifact for the current run. */
  setDraft(draft: Draft, binding?: IdcRunArtifactBinding): void;
  /** Attach / replace the active ExecutionPlan artifact for the current run. */
  setPlan(plan: ExecutionPlan, binding?: IdcRunArtifactBinding): void;
  /** Attach / replace the active Task checklist for the current run. */
  setTask(task: Task, binding?: IdcRunArtifactBinding): void;
  /** Terminal transition for the active run. */
  endRun(status: Exclude<IdcRunStatus, 'pending' | 'running'>, error?: IdcRun['error']): void;
  /** Snapshot of the active run, or null if none. */
  getActive(): IdcRun | null;
  /** Snapshots of every past run recorded by this store. */
  listCompleted(): readonly IdcRun[];
}

export interface IdcRunStoreConfig {
  /** Clock injection for deterministic tests. Defaults to Date.now. */
  now?: () => number;
  /** Optional id generator; defaults to a monotonic counter. */
  nextId?: () => string;
}

let globalRunCounter = 0;

// =============================================================================
// Implementation
// =============================================================================

class IdcRunStore implements IIdcRunStore {
  private _active: IdcRun | null = null;
  private readonly _completed: IdcRun[] = [];
  private readonly _now: () => number;
  private readonly _nextId: () => string;

  constructor(config: IdcRunStoreConfig = {}) {
    this._now = config.now ?? (() => Date.now());
    this._nextId = config.nextId ?? (() => defaultRunId(this._now));
  }

  startRun(input: { runKind?: string; workflowId?: string; runId?: string }): string {
    // If a run is still active, close it as aborted. This is defensive —
    // callers should endRun() explicitly; reaching here means a bug.
    if (this._active && this._active.status === 'running') {
      this._closeActive('aborted');
    }

    const runKind = input.runKind ?? input.workflowId;
    if (!runKind || runKind.trim().length === 0) {
      throw new Error('IdcRunStore.startRun: runKind or workflowId is required');
    }

    const now = this._now();
    const id = input.runId ?? this._nextId();
    this._active = {
      id,
      runKind,
      workflowId: runKind,
      status: 'running',
      createdAt: now,
      startedAt: now,
      rounds: [],
    };
    return id;
  }

  restore(input: { active?: IdcRun | null; completed?: readonly IdcRun[] }): void {
    this._active = input.active ? cloneRun(input.active) : null;
    this._completed.length = 0;
    for (const run of input.completed ?? []) {
      this._completed.push(cloneRun(run));
    }
  }

  recordRound(decision: StageActivationDecision, lastObserveHint?: string): void {
    if (!this._active) return;
    const summary: IdcRunRoundSummary = roundSummaryFromDecision(decision, lastObserveHint);
    this._active = {
      ...this._active,
      rounds: [...this._active.rounds, summary],
    };
  }

  bindArtifact(binding: IdcRunArtifactBinding): void {
    if (!this._active) return;
    const artifactBindings = upsertArtifactBinding(this._active.artifactBindings, binding);
    this._active = {
      ...this._active,
      ...(artifactBindings ? { artifactBindings } : {}),
    };
  }

  setDraft(draft: Draft, binding?: IdcRunArtifactBinding): void {
    if (!this._active) return;
    const artifactBindings = upsertArtifactBinding(
      this._active.artifactBindings,
      binding ? { ...binding, kind: 'draft' } : undefined,
    );
    this._active = {
      ...this._active,
      draft,
      ...(artifactBindings ? { artifactBindings } : {}),
    };
  }

  setPlan(plan: ExecutionPlan, binding?: IdcRunArtifactBinding): void {
    if (!this._active) return;
    const artifactBindings = upsertArtifactBinding(
      this._active.artifactBindings,
      binding ? { ...binding, kind: 'plan' } : undefined,
    );
    this._active = {
      ...this._active,
      plan,
      ...(artifactBindings ? { artifactBindings } : {}),
    };
  }

  setTask(task: Task, binding?: IdcRunArtifactBinding): void {
    if (!this._active) return;
    const artifactBindings = upsertArtifactBinding(
      this._active.artifactBindings,
      binding ? { ...binding, kind: 'task' } : undefined,
    );
    this._active = {
      ...this._active,
      task,
      ...(artifactBindings ? { artifactBindings } : {}),
    };
  }

  endRun(status: Exclude<IdcRunStatus, 'pending' | 'running'>, error?: IdcRun['error']): void {
    this._closeActive(status, error);
  }

  getActive(): IdcRun | null {
    return this._active;
  }

  listCompleted(): readonly IdcRun[] {
    return this._completed;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _closeActive(
    status: Exclude<IdcRunStatus, 'pending' | 'running'>,
    error?: IdcRun['error'],
  ): void {
    if (!this._active) return;
    const closed: IdcRun = {
      ...this._active,
      status,
      endedAt: this._now(),
      ...(error ? { error } : {}),
    };
    this._completed.push(closed);
    this._active = null;
  }
}

function defaultRunId(now: () => number): string {
  globalRunCounter += 1;
  return `run-${now()}-${globalRunCounter.toString(36)}`;
}

function cloneRun(run: IdcRun): IdcRun {
  return {
    ...run,
    rounds: [...run.rounds],
    ...(run.artifactBindings ? { artifactBindings: [...run.artifactBindings] } : {}),
  };
}

function upsertArtifactBinding(
  current: readonly IdcRunArtifactBinding[] | undefined,
  binding: IdcRunArtifactBinding | undefined,
): readonly IdcRunArtifactBinding[] | undefined {
  if (!binding) {
    return current;
  }

  const next = (current ?? []).filter((entry) => entry.kind !== binding.kind);
  next.push(binding);
  next.sort((left, right) => artifactKindOrder(left.kind) - artifactKindOrder(right.kind));
  return next;
}

function artifactKindOrder(kind: IdcRunArtifactKind): number {
  switch (kind) {
    case 'draft':
      return 0;
    case 'plan':
      return 1;
    case 'task':
      return 2;
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createIdcRunStore(config?: IdcRunStoreConfig): IIdcRunStore {
  return new IdcRunStore(config);
}
