/**
 * Execution Events — SDD Implement-stage (execution-persona) event namespace.
 *
 * See: docs/architecture/agent-unified-workflow.md §4, §6.2
 *
 * Channels follow `execution.<phase>.<verb>` and are **technical-semantic**
 * (system-facing), not user-facing. Emitted while execution-persona is
 * active during Implement. A progress narrator renders them into
 * creation-flow milestones for end users.
 *
 * Notable compaction: one `execution.round.activation.decided` event per
 * round, not one per primitive — the payload carries the full
 * activated/skipped summary. Per-primitive detail lives on debug channels.
 */

import type { StageSkipReason, StageTaskShape } from './stage';
import type { SddRunRoundSummary } from './sdd-run';

// =============================================================================
// Channel names
// =============================================================================

export const EXECUTION_CHANNELS = {
  /** Inner-ring round's activation decision (compacted — one per round). */
  ROUND_ACTIVATION_DECIDED: 'execution.round.activation.decided',
  /** A Plan primitive produced a structured intent list. */
  PLAN_PRODUCED: 'execution.plan.produced',
  /** A TODO was added or updated. */
  TODO_UPDATED: 'execution.todo.updated',
  /** An Approve decision was recorded (manual or strategy-pack auto). */
  APPROVE_DECIDED: 'execution.approve.decided',
  /** An Apply was committed — resource boundary crossed. */
  APPLY_COMMITTED: 'execution.apply.committed',
  /** A Step completed (think-only or think+act). */
  STEP_COMPLETED: 'execution.step.completed',
  /** Autoheal L1 retry fired (same tool, same args). */
  AUTOHEAL_L1_RETRY: 'execution.autoheal.l1.retry',
  /** Autoheal L2 degradation applied (quality knob relaxed). */
  AUTOHEAL_L2_DEGRADE: 'execution.autoheal.l2.degrade',
  /** Autoheal L3 substitution applied (alternate tool/model). */
  AUTOHEAL_L3_SUBSTITUTE: 'execution.autoheal.l3.substitute',
  /** Autoheal L4 escalation to RecoverySubagent. */
  AUTOHEAL_L4_TRIGGERED: 'execution.autoheal.l4.triggered',
  /** Autoheal L5 — user was asked to intervene. */
  AUTOHEAL_L5_ESCALATED: 'execution.autoheal.l5.escalated',
  /** Quality gate evaluation finished. */
  QUALITY_EVALUATED: 'execution.quality.evaluated',
} as const;

export type ExecutionChannel = (typeof EXECUTION_CHANNELS)[keyof typeof EXECUTION_CHANNELS];

// =============================================================================
// Payloads
// =============================================================================

export interface ExecutionRoundActivationDecidedEvent {
  channel: typeof EXECUTION_CHANNELS.ROUND_ACTIVATION_DECIDED;
  runId: string;
  taskShape: StageTaskShape;
  summary: SddRunRoundSummary;
  at: number;
}

export interface ExecutionPlanProducedEvent {
  channel: typeof EXECUTION_CHANNELS.PLAN_PRODUCED;
  runId: string;
  /** Count of intent entries; the full plan is in workspace storage. */
  intentCount: number;
  at: number;
}

export interface ExecutionTodoUpdatedEvent {
  channel: typeof EXECUTION_CHANNELS.TODO_UPDATED;
  runId: string;
  todoId: string;
  /**
   * Snapshot of the list's counts by status. The full list is addressable
   * by todoId in the shared memory store (P5).
   */
  counts: {
    pending: number;
    in_progress: number;
    completed: number;
    failed: number;
  };
  at: number;
}

export interface ExecutionApproveDecidedEvent {
  channel: typeof EXECUTION_CHANNELS.APPROVE_DECIDED;
  runId: string;
  /** The primitive or tool whose authorization was decided. */
  subject: string;
  decision: 'accept' | 'reject' | 'auto-approved';
  at: number;
}

export interface ExecutionApplyCommittedEvent {
  channel: typeof EXECUTION_CHANNELS.APPLY_COMMITTED;
  runId: string;
  /** Tool name or operation kind that was committed. */
  kind: string;
  at: number;
}

export interface ExecutionStepCompletedEvent {
  channel: typeof EXECUTION_CHANNELS.STEP_COMPLETED;
  runId: string;
  round: number;
  /** Whether this Step produced an act (side-effect) or was think-only. */
  thinkOnly: boolean;
  at: number;
}

// -----------------------------------------------------------------------------
// Autoheal events
// -----------------------------------------------------------------------------

interface ExecutionAutohealEventBase {
  runId: string;
  /** What triggered the autoheal — e.g. tool name + error code. */
  trigger: {
    subject: string;
    errorCode: string;
  };
  at: number;
}

export interface ExecutionAutohealL1RetryEvent extends ExecutionAutohealEventBase {
  channel: typeof EXECUTION_CHANNELS.AUTOHEAL_L1_RETRY;
  attempt: number;
}

export interface ExecutionAutohealL2DegradeEvent extends ExecutionAutohealEventBase {
  channel: typeof EXECUTION_CHANNELS.AUTOHEAL_L2_DEGRADE;
  /** Human-readable degradation (e.g. "lowered quality to 'standard'"). */
  note: string;
}

export interface ExecutionAutohealL3SubstituteEvent extends ExecutionAutohealEventBase {
  channel: typeof EXECUTION_CHANNELS.AUTOHEAL_L3_SUBSTITUTE;
  fallback: string;
}

export interface ExecutionAutohealL4TriggeredEvent extends ExecutionAutohealEventBase {
  channel: typeof EXECUTION_CHANNELS.AUTOHEAL_L4_TRIGGERED;
  subagent: 'recovery' | 'diagnostic' | 'quality-check';
}

export interface ExecutionAutohealL5EscalatedEvent extends ExecutionAutohealEventBase {
  channel: typeof EXECUTION_CHANNELS.AUTOHEAL_L5_ESCALATED;
  /** Reason the lower levels failed. */
  reason: StageSkipReason | 'retry-exhausted' | 'unsubstitutable';
}

export type ExecutionAutohealEvent =
  | ExecutionAutohealL1RetryEvent
  | ExecutionAutohealL2DegradeEvent
  | ExecutionAutohealL3SubstituteEvent
  | ExecutionAutohealL4TriggeredEvent
  | ExecutionAutohealL5EscalatedEvent;

// -----------------------------------------------------------------------------
// Quality gate
// -----------------------------------------------------------------------------

export interface ExecutionQualityEvaluatedEvent {
  channel: typeof EXECUTION_CHANNELS.QUALITY_EVALUATED;
  runId: string;
  /** Overall verdict; the full ConsistencyReport is in the memory store. */
  verdict: 'pass' | 'warn' | 'fail';
  /**
   * Offending subjects (empty on pass). A subject is a tool name or
   * operation id — whatever identifies the failing unit to the autoheal
   * chain. Free-form string so this event stays stable as tool surface
   * evolves.
   */
  offenders?: readonly string[];
  at: number;
}

// =============================================================================
// Union
// =============================================================================

export type ExecutionEvent =
  | ExecutionRoundActivationDecidedEvent
  | ExecutionPlanProducedEvent
  | ExecutionTodoUpdatedEvent
  | ExecutionApproveDecidedEvent
  | ExecutionApplyCommittedEvent
  | ExecutionStepCompletedEvent
  | ExecutionAutohealEvent
  | ExecutionQualityEvaluatedEvent;
