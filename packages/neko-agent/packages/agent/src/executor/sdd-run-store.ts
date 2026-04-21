/**
 * Sdd Run Store — in-memory aggregator for SddRun records.
 *
 * See: agent-types/sdd-run.ts
 *      docs/architecture/agent-unified-workflow.md §4
 *
 * Runtime companion to the SddRun *type*. In-memory implementation is
 * enough for the current Agent loop; a shared-memory backed version can
 * replace it later without touching callers.
 *
 * Single-writer model: one active run at a time per store instance.
 * Creating a new run while one is active closes the previous one with
 * status='aborted' (runtime guard against stale state).
 */

import type {
  StageActivationDecision,
  TodoList,
  SddRun,
  SddRunRoundSummary,
  SddRunStatus,
} from '@neko-agent/types';
import { roundSummaryFromDecision } from '@neko-agent/types';

// =============================================================================
// Types
// =============================================================================

export interface ISddRunStore {
  /** Start a fresh run, aborting any in-flight run. Returns the new run id. */
  startRun(input: { workflowId: string; runId?: string }): string;
  /** Append a round summary derived from the planner decision. */
  recordRound(decision: StageActivationDecision, lastObserveHint?: string): void;
  /** Attach / replace the active todos reference for the current run. */
  setTodos(todos: TodoList): void;
  /** Terminal transition for the active run. */
  endRun(status: Exclude<SddRunStatus, 'pending' | 'running'>, error?: SddRun['error']): void;
  /** Snapshot of the active run, or null if none. */
  getActive(): SddRun | null;
  /** Snapshots of every past run recorded by this store. */
  listCompleted(): readonly SddRun[];
}

export interface SddRunStoreConfig {
  /** Clock injection for deterministic tests. Defaults to Date.now. */
  now?: () => number;
  /** Optional id generator; defaults to a monotonic counter. */
  nextId?: () => string;
}

// =============================================================================
// Implementation
// =============================================================================

class SddRunStore implements ISddRunStore {
  private _active: SddRun | null = null;
  private readonly _completed: SddRun[] = [];
  private readonly _now: () => number;
  private readonly _nextId: () => string;
  private _counter = 0;

  constructor(config: SddRunStoreConfig = {}) {
    this._now = config.now ?? (() => Date.now());
    this._nextId = config.nextId ?? (() => `run-${++this._counter}`);
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
    const summary: SddRunRoundSummary = roundSummaryFromDecision(decision, lastObserveHint);
    this._active = {
      ...this._active,
      rounds: [...this._active.rounds, summary],
    };
  }

  setTodos(todos: TodoList): void {
    if (!this._active) return;
    this._active = { ...this._active, todos };
  }

  endRun(status: Exclude<SddRunStatus, 'pending' | 'running'>, error?: SddRun['error']): void {
    this._closeActive(status, error);
  }

  getActive(): SddRun | null {
    return this._active;
  }

  listCompleted(): readonly SddRun[] {
    return this._completed;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _closeActive(
    status: Exclude<SddRunStatus, 'pending' | 'running'>,
    error?: SddRun['error'],
  ): void {
    if (!this._active) return;
    const closed: SddRun = {
      ...this._active,
      status,
      endedAt: this._now(),
      ...(error ? { error } : {}),
    };
    this._completed.push(closed);
    this._active = null;
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createSddRunStore(config?: SddRunStoreConfig): ISddRunStore {
  return new SddRunStore(config);
}
