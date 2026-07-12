/**
 * Stage Guardian — non-blocking inspector alongside StageTracker.
 *
 * See: docs/architecture/agent-unified-workflow.md §5.4, §6.5
 *
 * Observer-only: listens to StageTracker events + an optional tick to
 * catch conditions the tracker itself cannot report. Emits structured
 * issues so higher layers (UI banners, telemetry, Approval engine) can
 * decide how to react. Never blocks a stage transition — the tracker's
 * job is state, the guardian's job is "does this state smell right?".
 *
 * Checks shipped in this PR:
 *   - `stage-out-of-order`  — entering Apply without first visiting
 *     Draft / Plan at least once. Matches ADR §3.2 rule 1
 *     (high-risk ops force Draft) from the run-level side.
 *   - `stage-timeout`       — current stage has been active longer than
 *     the configured budget. Fires once per stage-entry.
 *
 * Deferred to later PRs:
 *   - `approval-skipped`    — needs ApprovalEngine hooks (§6.1, not yet
 *     rewired to the IDC vocabulary).
 *   - `stage-not-entered`   — needs creation activity ↔ tracker reconciliation.
 */

import type { IdcStage } from '@neko-agent/types';
import type { StageTracker } from './stage-tracker';

// =============================================================================
// Types
// =============================================================================

interface StageGuardianIssueBase {
  /** Stage the issue was observed on. */
  readonly stage: IdcStage;
  /** ms epoch when the issue was raised. */
  readonly at: number;
}

export type StageGuardianIssue = StageGuardianIssueBase &
  (
    | {
        readonly code: 'stage-out-of-order';
        readonly detail?: never;
      }
    | {
        readonly code: 'stage-timeout';
        readonly detail: Readonly<{
          readonly elapsedMs: number;
          readonly budgetMs: number;
        }>;
      }
    | {
        /**
         * Apply was committed without a preceding approval decision for the subject.
         * The guardian reports the observation without inferring why the gate was bypassed.
         */
        readonly code: 'approval-skipped';
        readonly detail: Readonly<{
          readonly subject: string;
        }>;
      }
  );

export type StageGuardianIssueCode = StageGuardianIssue['code'];

export type StageGuardianListener = (issue: StageGuardianIssue) => void;

export interface StageGuardianConfig {
  /** Clock injection for deterministic tests. */
  now?: () => number;
  /**
   * Max ms a single stage may remain active before `stage-timeout` fires.
   * Omit / 0 / negative = timeout check disabled.
   */
  stageTimeoutMs?: number;
  /**
   * Whether to enforce the "Implement must be preceded by at least one
   * earlier stage" rule. Defaults to true. Turn off for tests / CLI runs
   * that intentionally dispatch Implement as the entry point.
   */
  enforceOrderedEntry?: boolean;
  /**
   * Whether to check `noteApply()` against previously-seen `noteApproval()`
   * calls and raise `approval-skipped` when an Apply's subject has no
   * prior approval record. Defaults to true when approval wiring is
   * available. Turn off only for specialized call sites that intentionally
   * bypass the ApprovalEngine.
   */
  enforceApprovalGate?: boolean;
}

// =============================================================================
// Implementation
// =============================================================================

export interface IStageGuardian {
  /** Subscribe to raised issues. Returns unsubscribe fn. */
  onIssue(listener: StageGuardianListener): () => void;
  /**
   * Drive the timeout check from the outside (no internal timer — the
   * caller decides when to sweep, typically from ReActLoopRunner's
   * afterAct hook). Noop when stageTimeoutMs is not configured.
   */
  tick(): void;
  /**
   * Record an approval decision for `subject`. Subsequent `noteApply()`
   * calls for the same subject count as gated. Caller is typically a
   * listener on ApprovalEngine.onDecision (any resolution — accept,
   * reject, escalate — counts; what matters is the gate *fired*).
   */
  noteApproval(subject: string): void;
  /**
   * Record an Apply for `subject` and check that we saw an approval
   * decision for it first. Raises `approval-skipped` when not, provided
   * `enforceApprovalGate` is on. Caller is typically a listener on the
   * `execution.apply.committed` channel.
   */
  noteApply(subject: string): void;
  /**
   * Replace the guardian's stage bookkeeping from a restored runtime
   * snapshot. Does not emit issues; callers rehydrate first, then continue.
   */
  restore(state: {
    current: IdcStage | null;
    enteredAt?: number;
    visitedStages?: readonly IdcStage[];
  }): void;
  /** Snapshot of issues raised since construction (capped to 64 most recent). */
  getHistory(): readonly StageGuardianIssue[];
  /** Drop listeners + tracker subscription. Idempotent. */
  dispose(): void;
}

const HISTORY_CAP = 64;

class StageGuardian implements IStageGuardian {
  private readonly _tracker: StageTracker;
  private readonly _now: () => number;
  private readonly _stageTimeoutMs: number;
  private readonly _enforceOrderedEntry: boolean;
  private readonly _enforceApprovalGate: boolean;
  private readonly _visited: Set<IdcStage> = new Set();
  private readonly _approvedSubjects: Set<string> = new Set();
  private readonly _listeners = new Set<StageGuardianListener>();
  private readonly _history: StageGuardianIssue[] = [];
  /** Stage currently under timeout watch (null when tracker is idle). */
  private _watchStage: IdcStage | null = null;
  private _watchEnteredAt = 0;
  private _watchTimeoutReported = false;
  private _unsubscribe: (() => void) | null = null;
  private _disposed = false;

  constructor(tracker: StageTracker, config: StageGuardianConfig = {}) {
    this._tracker = tracker;
    this._now = config.now ?? (() => Date.now());
    this._stageTimeoutMs = config.stageTimeoutMs ?? 0;
    this._enforceOrderedEntry = config.enforceOrderedEntry ?? true;
    this._enforceApprovalGate = config.enforceApprovalGate ?? true;

    // Seed with the tracker's current stage so guardians built mid-run
    // don't re-flag a legitimately-Implement run as out-of-order.
    this.restore({
      current: this._tracker.current,
      enteredAt: this._tracker.enteredAt,
      ...(this._tracker.current ? { visitedStages: [this._tracker.current] } : {}),
    });

    this._unsubscribe = this._tracker.onEntered((event) => {
      this._onEntered(event.stage, event.at);
    });
  }

  onIssue(listener: StageGuardianListener): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  tick(): void {
    if (this._disposed) return;
    if (this._stageTimeoutMs <= 0) return;
    if (this._watchStage === null) return;
    if (this._watchTimeoutReported) return;

    const elapsed = this._now() - this._watchEnteredAt;
    if (elapsed < this._stageTimeoutMs) return;

    this._watchTimeoutReported = true;
    this._raise({
      code: 'stage-timeout',
      stage: this._watchStage,
      at: this._now(),
      detail: { elapsedMs: elapsed, budgetMs: this._stageTimeoutMs },
    });
  }

  noteApproval(subject: string): void {
    if (this._disposed) return;
    this._approvedSubjects.add(subject);
  }

  noteApply(subject: string): void {
    if (this._disposed) return;
    if (!this._enforceApprovalGate) return;
    // Known subject → the gate fired first; clear it so a follow-up
    // apply of the same subject requires a fresh approval. This is a
    // small per-call ratchet; one approval buys one apply.
    if (this._approvedSubjects.has(subject)) {
      this._approvedSubjects.delete(subject);
      return;
    }
    this._raise({
      code: 'approval-skipped',
      stage: this._watchStage ?? 'apply',
      at: this._now(),
      detail: { subject },
    });
  }

  restore(state: {
    current: IdcStage | null;
    enteredAt?: number;
    visitedStages?: readonly IdcStage[];
  }): void {
    if (this._disposed) return;

    this._visited.clear();
    for (const stage of state.visitedStages ?? []) {
      this._visited.add(stage);
    }
    if (state.current) {
      this._visited.add(state.current);
    }

    this._watchStage = state.current;
    this._watchEnteredAt = state.current ? (state.enteredAt ?? this._now()) : 0;
    this._watchTimeoutReported = false;
  }

  getHistory(): readonly StageGuardianIssue[] {
    return this._history;
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    this._approvedSubjects.clear();
    this._listeners.clear();
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _onEntered(stage: IdcStage, at: number): void {
    if (this._enforceOrderedEntry && stage === 'apply' && this._visited.size === 0) {
      this._raise({
        code: 'stage-out-of-order',
        stage,
        at,
      });
    }

    this._visited.add(stage);
    this._watchStage = stage;
    this._watchEnteredAt = at;
    this._watchTimeoutReported = false;
  }

  private _raise(issue: StageGuardianIssue): void {
    this._history.push(issue);
    if (this._history.length > HISTORY_CAP) {
      // Drop the oldest to stay bounded.
      this._history.splice(0, this._history.length - HISTORY_CAP);
    }

    for (const listener of this._listeners) {
      try {
        listener(issue);
      } catch {
        // Listeners must not break guardian state; swallow.
      }
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createStageGuardian(
  tracker: StageTracker,
  config?: StageGuardianConfig,
): IStageGuardian {
  return new StageGuardian(tracker, config);
}
