/**
 * SddRun — per-run record of an SDD-stage execution.
 *
 * See: docs/architecture/agent-unified-workflow.md §4 (three SDD stages)
 *
 * One SddRun corresponds to a single end-to-end traversal of the
 * Draft → Plan → Apply DAG. The inner ReAct loop during Apply produces
 * rounds whose stage-activation decisions are stored here for audit +
 * telemetry.
 *
 * Distinct from:
 * - `Plan` (plan.ts): the generic plan/step abstraction used by
 *   plan-mode review UI. A Plan is a markdown-parsed artifact, not a
 *   run-lifecycle record.
 */

import type { SddStage, StageActivationDecision, StageSkipReason } from './stage';
import type { Task } from './task';

// =============================================================================
// Status
// =============================================================================

export type SddRunStatus =
  /** Created but not yet entered Apply. */
  | 'pending'
  /** Running — at least one ReAct round has begun. */
  | 'running'
  /** All rounds complete, no unhandled errors. */
  | 'completed'
  /** Aborted by the user or by an autoheal escalation. */
  | 'aborted'
  /** Terminated due to an error (autoheal exhausted or unrecoverable). */
  | 'failed';

// =============================================================================
// Per-round summary (telemetry compaction)
// =============================================================================

/**
 * One ReAct round inside an SddRun. Each round is summarised here
 * rather than emitted as N stage-level events.
 */
export interface SddRunRoundSummary {
  /** 0-based round index within this Run. */
  round: number;
  /** Stages activated this round (DAG-ordered: draft → plan → apply). */
  activatedStages: readonly SddStage[];
  /** Stages considered and skipped, with reason codes. */
  skippedStages: readonly {
    stage: SddStage;
    reason: StageSkipReason;
  }[];
  /** Wall-clock when the activation decision was made. */
  decidedAt: number;
  /** Optional free-form hint from the prior observe that shaped this round. */
  lastObserveHint?: string;
}

export function roundSummaryFromDecision(
  decision: StageActivationDecision,
  lastObserveHint?: string,
): SddRunRoundSummary {
  return {
    round: decision.round,
    activatedStages: decision.activated,
    skippedStages: decision.skipped,
    decidedAt: decision.decidedAt,
    lastObserveHint,
  };
}

// =============================================================================
// Run
// =============================================================================

export interface SddRun {
  /** Stable run identifier. */
  id: string;
  /** Workflow ID (registry key) this Run belongs to. */
  workflowId: string;
  /** Current status. */
  status: SddRunStatus;
  /** ms epoch — when the Run was created. */
  createdAt: number;
  /** ms epoch — when the Run transitioned out of `pending`, else undefined. */
  startedAt?: number;
  /** ms epoch — terminal transition timestamp, else undefined. */
  endedAt?: number;
  /**
   * Ordered ReAct round summaries. Appended as rounds complete.
   * Empty while `status === 'pending'`.
   */
  rounds: readonly SddRunRoundSummary[];
  /** Associated user-visible Task checklist for the Apply stage, when one is active. */
  task?: Task;
  /**
   * Optional terminal error when `status === 'failed'`. Structured so
   * telemetry aggregators can bucket without parsing free-text.
   */
  error?: {
    code: string;
    message: string;
    cause?: unknown;
  };
}
