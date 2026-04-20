/**
 * WorkflowRun — per-run record of a creation-flow execution.
 *
 * See: docs/architecture/dual-flow-architecture.md §3.3, §9.2 (data model)
 *      plan v2 "R9 遥测爆炸" mitigation (activation summary per round)
 *
 * One WorkflowRun corresponds to a single traversal of the outer ring's
 * `execution` phase (Orchestration → Proposal → Review → **Execution** →
 * Status). The inner ReAct loop inside `execution` produces rounds whose
 * activation decisions are stored here for audit + telemetry.
 *
 * Distinct from:
 * - `WorkflowLitePlan` (agent-types/workflow-plan.ts): the *pre-dispatch*
 *   plan shown to the user before Apply. Legacy, focused on UI.
 * - `Plan` (agent-types/plan.ts): the generic plan/step abstraction used
 *   by step-review workflows. Legacy.
 *
 * This type exists because the v2 ADR ring-topology model treats each Run
 * as "the record of a single inner-loop traversal", not as "the plan".
 */

import type { FlowTransitionEvent } from './flow';
import type { Primitive, PrimitiveActivationDecision, PrimitiveSkipReason } from './primitive';
import type { TodoList } from './todo-list';

// =============================================================================
// Status
// =============================================================================

export type WorkflowRunStatus =
  /** Created but not yet entered execution. */
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
// Per-round summary (for R9 telemetry compaction)
// =============================================================================

/**
 * One ReAct round inside a WorkflowRun. Each round is summarised here
 * rather than being written as N primitive-level events, per plan v2 R9.
 */
export interface WorkflowRunRoundSummary {
  /** 0-based round index within this Run. */
  round: number;
  /** Primitives activated this round (DAG-ordered). */
  activatedPrimitives: readonly Primitive[];
  /** Primitives considered and skipped, with reason codes. */
  skippedPrimitives: readonly {
    primitive: Primitive;
    reason: PrimitiveSkipReason;
  }[];
  /** Wall-clock when the activation decision was made. */
  decidedAt: number;
  /** Optional free-form hint from the prior observe that shaped this round. */
  lastObserveHint?: string;
}

export function roundSummaryFromDecision(
  decision: PrimitiveActivationDecision,
  lastObserveHint?: string,
): WorkflowRunRoundSummary {
  return {
    round: decision.round,
    activatedPrimitives: decision.activated,
    skippedPrimitives: decision.skipped,
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
  /** Associated TODO list for the inner loop, when one is active. */
  todos?: TodoList;
  /**
   * Flow transition events recorded during this Run. Populated when the
   * Run outlives at least one creation ↔ execution transition.
   */
  transitions: readonly FlowTransitionEvent[];
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
