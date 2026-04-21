/**
 * Workflow Run Store — in-memory aggregator for WorkflowRun records.
 *
 * See: agent-types/workflow-run.ts
 *      plan v2 R9 (compacted telemetry: one round summary per round)
 *
 * This is the runtime companion to the WorkflowRun *type*. P5 will ship
 * a shared-memory backed implementation; this in-memory version is
 * enough for P1.6 so the ReAct loop can record rounds and surface the
 * result via AgentSession queries.
 *
 * Single-writer model: one active run at a time per store instance.
 * Creating a new run while one is active closes the previous one with
 * status='aborted' (runtime guard against stale state).
 */

import type {
  StageActivationDecision,
  TodoList,
  WorkflowRun,
  WorkflowRunRoundSummary,
  WorkflowRunStatus,
} from '@neko-agent/types';
import { roundSummaryFromDecision } from '@neko-agent/types';
import type { FlowTransitionEvent } from '../skill/flow-switcher';

// =============================================================================
// Types
// =============================================================================

export interface IWorkflowRunStore {
  /** Start a fresh run, aborting any in-flight run. Returns the new run id. */
  startRun(input: { workflowId: string; runId?: string }): string;
  /** Append a round summary derived from the planner decision. */
  recordRound(decision: StageActivationDecision, lastObserveHint?: string): void;
  /** Record a flow transition on the active run (if any). */
  recordTransition(event: FlowTransitionEvent): void;
  /** Attach / replace the active todos reference for the current run. */
  setTodos(todos: TodoList): void;
  /** Terminal transition for the active run. */
  endRun(
    status: Exclude<WorkflowRunStatus, 'pending' | 'running'>,
    error?: WorkflowRun['error'],
  ): void;
  /** Snapshot of the active run, or null if none. */
  getActive(): WorkflowRun | null;
  /** Snapshots of every past run recorded by this store. */
  listCompleted(): readonly WorkflowRun[];
}

export interface WorkflowRunStoreConfig {
  /** Clock injection for deterministic tests. Defaults to Date.now. */
  now?: () => number;
  /** Optional id generator; defaults to a monotonic counter. */
  nextId?: () => string;
}

// =============================================================================
// Implementation
// =============================================================================

class WorkflowRunStore implements IWorkflowRunStore {
  private _active: WorkflowRun | null = null;
  private readonly _completed: WorkflowRun[] = [];
  private readonly _now: () => number;
  private readonly _nextId: () => string;
  private _counter = 0;

  constructor(config: WorkflowRunStoreConfig = {}) {
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
      transitions: [],
    };
    return id;
  }

  recordRound(decision: StageActivationDecision, lastObserveHint?: string): void {
    if (!this._active) return;
    const summary: WorkflowRunRoundSummary = roundSummaryFromDecision(decision, lastObserveHint);
    this._active = {
      ...this._active,
      rounds: [...this._active.rounds, summary],
    };
  }

  recordTransition(event: FlowTransitionEvent): void {
    if (!this._active) return;
    this._active = {
      ...this._active,
      transitions: [...this._active.transitions, event],
    };
  }

  setTodos(todos: TodoList): void {
    if (!this._active) return;
    this._active = { ...this._active, todos };
  }

  endRun(
    status: Exclude<WorkflowRunStatus, 'pending' | 'running'>,
    error?: WorkflowRun['error'],
  ): void {
    this._closeActive(status, error);
  }

  getActive(): WorkflowRun | null {
    return this._active;
  }

  listCompleted(): readonly WorkflowRun[] {
    return this._completed;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _closeActive(
    status: Exclude<WorkflowRunStatus, 'pending' | 'running'>,
    error?: WorkflowRun['error'],
  ): void {
    if (!this._active) return;
    const closed: WorkflowRun = {
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

export function createWorkflowRunStore(config?: WorkflowRunStoreConfig): IWorkflowRunStore {
  return new WorkflowRunStore(config);
}
