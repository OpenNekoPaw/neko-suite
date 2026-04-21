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
 *   - `stage-out-of-order`  — entering Implement without first visiting
 *     Specify / Plan / Tasks at least once. Matches ADR §3.2 rule 1
 *     (high-risk ops force Specify) from the run-level side.
 *   - `stage-timeout`       — current stage has been active longer than
 *     the configured budget. Fires once per stage-entry.
 *
 * Deferred to later PRs:
 *   - `approval-skipped`    — needs ApprovalEngine hooks (§6.1, not yet
 *     rewired to the SDD vocabulary).
 *   - `stage-not-entered`   — needs SddRun ↔ tracker reconciliation.
 */

import type { SddStage } from '@neko-agent/types';
import { getLogger } from '../utils/logger';
import type { StageTracker } from './stage-tracker';

// =============================================================================
// Types
// =============================================================================

export type StageGuardianIssueCode = 'stage-out-of-order' | 'stage-timeout';

export interface StageGuardianIssue {
  code: StageGuardianIssueCode;
  /** Stage the issue was observed on. */
  stage: SddStage;
  /** Human-readable description (for logs / UI). */
  message: string;
  /** ms epoch when the issue was raised. */
  at: number;
  /** Extra context — issue-specific. */
  detail?: Record<string, unknown>;
}

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
  /** Snapshot of issues raised since construction (capped to 64 most recent). */
  getHistory(): readonly StageGuardianIssue[];
  /** Drop listeners + tracker subscription. Idempotent. */
  dispose(): void;
}

const logger = getLogger('StageGuardian');
const HISTORY_CAP = 64;

class StageGuardian implements IStageGuardian {
  private readonly _tracker: StageTracker;
  private readonly _now: () => number;
  private readonly _stageTimeoutMs: number;
  private readonly _enforceOrderedEntry: boolean;
  private readonly _visited: Set<SddStage> = new Set();
  private readonly _listeners = new Set<StageGuardianListener>();
  private readonly _history: StageGuardianIssue[] = [];
  /** Stage currently under timeout watch (null when tracker is idle). */
  private _watchStage: SddStage | null = null;
  private _watchEnteredAt = 0;
  private _watchTimeoutReported = false;
  private _unsubscribe: (() => void) | null = null;
  private _disposed = false;

  constructor(tracker: StageTracker, config: StageGuardianConfig = {}) {
    this._tracker = tracker;
    this._now = config.now ?? (() => Date.now());
    this._stageTimeoutMs = config.stageTimeoutMs ?? 0;
    this._enforceOrderedEntry = config.enforceOrderedEntry ?? true;

    // Seed with the tracker's current stage so guardians built mid-run
    // don't re-flag a legitimately-Implement run as out-of-order.
    if (this._tracker.current) {
      this._visited.add(this._tracker.current);
      this._watchStage = this._tracker.current;
      this._watchEnteredAt = this._tracker.enteredAt;
    }

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
      message: `Stage "${this._watchStage}" has been active for ${elapsed}ms (> ${this._stageTimeoutMs}ms budget)`,
      at: this._now(),
      detail: { elapsedMs: elapsed, budgetMs: this._stageTimeoutMs },
    });
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
    this._listeners.clear();
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _onEntered(stage: SddStage, at: number): void {
    if (this._enforceOrderedEntry && stage === 'implement' && this._visited.size === 0) {
      this._raise({
        code: 'stage-out-of-order',
        stage,
        message:
          'Entered Implement without visiting Specify / Plan / Tasks first — high-risk tool calls should traverse the earlier stages per ADR §3.2',
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

    logger.warn(`[${issue.code}] ${issue.message}`);

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
