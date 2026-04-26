/**
 * Autoheal Types — shape of failures, attempts, and outcomes.
 *
 * See: docs/architecture/agent-unified-workflow.md §11.6
 *      plan v2 P3 (autoheal = ReAct "skip mode" pattern)
 *
 * The chain models **technical failures** (tool errors, timeouts,
 * quality-gate fails) — not user-level "this result is bad" feedback.
 * Each attempt corresponds to one level of the chain:
 *   L1 retry      — same tool, same args, at most N times
 *   L2 degrade    — same tool, relaxed knob (lower quality, smaller)
 *   L3 substitute — alternate tool or model with similar capability
 *   L4 subagent   — RecoverySubagent takes over for structured recovery
 *   L5 escalate   — user is asked, chain exits
 */

// =============================================================================
// Levels
// =============================================================================

export type AutohealLevel = 1 | 2 | 3 | 4 | 5;

export const AUTOHEAL_LEVELS: readonly AutohealLevel[] = [1, 2, 3, 4, 5] as const;

export const AUTOHEAL_LEVEL_LABEL: Readonly<Record<AutohealLevel, string>> = {
  1: 'retry',
  2: 'degrade',
  3: 'substitute',
  4: 'subagent',
  5: 'escalate',
};

// =============================================================================
// Failure + context
// =============================================================================

/** What failed. Narrow enough to build structured telemetry + route policies. */
export interface AutohealFailure {
  /** Tool or operation kind that produced the error. */
  subject: string;
  /** Stable error code. Strategy packs may route on this. */
  errorCode: string;
  /** Human-readable message for logs. */
  message: string;
  /** Attempt number (0-based) on the CURRENT level. */
  attempt: number;
  /** Original error object if available. */
  cause?: unknown;
}

/** Additional context the chain may need per attempt. */
export interface AutohealContext {
  /** The primitive round this failure happened in. */
  round: number;
  /** Workflow run id, when the runner is wired. */
  runId?: string;
  /**
   * Free-form metadata a policy may inspect — e.g. tool args, user intent,
   * domain hint. Keep opaque to keep types stable.
   */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Attempts + outcomes
// =============================================================================

/**
 * Discriminated outcome from one level. The chain runner uses the
 * `resolution` field to decide whether to retry (next level), succeed
 * (stop), or exit (escalate to user).
 */
export type AutohealOutcome =
  /** The level fixed the failure — stop the chain, try again from this level's plan. */
  | { resolution: 'healed'; level: AutohealLevel; note: string }
  /** The level could not fix it — move to the next level. */
  | { resolution: 'pass'; level: AutohealLevel; note?: string }
  /**
   * The level aborted the chain — e.g. user declined L5 prompt. Callers
   * should surface this to the caller that initiated work.
   */
  | {
      resolution: 'aborted';
      level: AutohealLevel;
      reason: 'user-decline' | 'retry-exhausted' | 'unsubstitutable' | 'policy';
    };

// =============================================================================
// Policy
// =============================================================================

/**
 * Per-level policy knob. Strategy packs (P4) slot in concrete values.
 * Defaults are applied when a field is missing.
 */
export interface AutohealPolicy {
  /** Maximum L1 retries before passing to L2. Default 2. */
  maxRetries?: number;
  /** Skip L2 degrade altogether (e.g. tool doesn't have a quality knob). */
  skipDegrade?: boolean;
  /** Skip L3 substitute (no alternate tool available). */
  skipSubstitute?: boolean;
  /** Skip L4 subagent (no RecoverySubagent available yet). */
  skipSubagent?: boolean;
}

export const DEFAULT_AUTOHEAL_POLICY: Required<AutohealPolicy> = {
  maxRetries: 2,
  skipDegrade: false,
  skipSubstitute: false,
  skipSubagent: false,
};
