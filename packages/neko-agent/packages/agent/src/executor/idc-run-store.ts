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
  StageActivationDecision,
  Task,
  IdcRun,
  IdcRunRoundSummary,
  IdcRunStatus,
} from '@neko-agent/types';
import { roundSummaryFromDecision } from '@neko-agent/types';

// =============================================================================
// Types
// =============================================================================

export interface IIdcRunStore {
  /** Start a fresh run, aborting any in-flight run. Returns the new run id. */
  startRun(input: { workflowId: string; runId?: string }): string;
  /** Append a round summary derived from the planner decision. */
  recordRound(decision: StageActivationDecision, lastObserveHint?: string): void;
  /** Attach / replace the active Task checklist for the current run. */
  setTask(task: Task): void;
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

  startRun(input: { workflowId: string; runId?: string }): string {
    // If a run is still active, close it as aborted. This is defensive —
    // callers should endRun() explicitly; reaching here means a bug.
    if (this._active && this._active.status === 'running') {
      this._closeActive('aborted');
    }

    const now = this._now();
    const id = input.runId ?? this._nextId();
    this._active = {
      id,
      workflowId: input.workflowId,
      status: 'running',
      createdAt: now,
      startedAt: now,
      rounds: [],
    };
    return id;
  }

  recordRound(decision: StageActivationDecision, lastObserveHint?: string): void {
    if (!this._active) return;
    const summary: IdcRunRoundSummary = roundSummaryFromDecision(decision, lastObserveHint);
    this._active = {
      ...this._active,
      rounds: [...this._active.rounds, summary],
    };
  }

  setTask(task: Task): void {
    if (!this._active) return;
    this._active = { ...this._active, task };
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

// =============================================================================
// Factory
// =============================================================================

export function createIdcRunStore(config?: IdcRunStoreConfig): IIdcRunStore {
  return new IdcRunStore(config);
}
