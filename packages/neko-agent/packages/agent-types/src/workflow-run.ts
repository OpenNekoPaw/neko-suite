/**
 * WorkflowRun — per-run record of an SDD-stage execution.
 *
 * See: docs/architecture/agent-unified-workflow.md §4 (four SDD stages)
 *
 * One WorkflowRun corresponds to a single end-to-end traversal of the
 * Specify → Plan → Tasks → Implement DAG. The inner ReAct loop during
 * Implement produces rounds whose stage-activation decisions are stored
 * here for audit + telemetry.
 *
 * Distinct from:
 * - `WorkflowLitePlan` (workflow-plan.ts): the *pre-dispatch* plan shown
 *   to the user before Implement. Legacy, UI-focused.
 * - `Plan` (plan.ts): the generic plan/step abstraction used by
 *   step-review workflows. Legacy.
 */

import type { SddStage, StageActivationDecision, StageSkipReason } from './stage';
import type { TodoList } from './todo-list';

// =============================================================================
// Status
// =============================================================================

export type WorkflowRunStatus =
  /** Created but not yet entered Implement. */
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
 * One ReAct round inside a WorkflowRun. Each round is summarised here
 * rather than emitted as N stage-level events.
 */
export interface WorkflowRunRoundSummary {
  /** 0-based round index within this Run. */
  round: number;
  /** Stages activated this round (DAG-ordered: specify → plan → tasks → implement). */
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
): WorkflowRunRoundSummary {
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

export interface WorkflowRun {
  /** Stable run identifier. */
  id: string;
  /** Workflow ID (registry key) this Run belongs to. */
  workflowId: string;
  /** Current status. */
  status: WorkflowRunStatus;
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
  rounds: readonly WorkflowRunRoundSummary[];
  /** Associated TODO list for the Implement stage, when one is active. */
  todos?: TodoList;
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
