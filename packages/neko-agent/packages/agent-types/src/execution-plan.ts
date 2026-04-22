/**
 * ExecutionPlan — Plan-stage artifact (ADR §4.2, §5, §7.5).
 *
 * The imperative "how" of SDD. Compiled by the AI from an approved
 * Draft at the Plan stage; executed by the Apply stage as an
 * ordered tool-call list. Persisted as `.neko/plans/plan-<runId>.md`.
 *
 * Distinct from `Plan` in plan.ts — that type is the parsed shape of
 * plan-mode markdown (think / user-review UI artifact). ExecutionPlan
 * is the SDD-stage artifact:
 *   Draft (What, declarative) → ExecutionPlan (How, imperative) →
 *   Task (user-visible checklist projection) → actual tool calls
 *
 * Each step is a canonical representation of a single tool call. The
 * AI writes the artifact; the runner reads it back to know what to
 * execute next. Parameters are kept as a string blob rather than a
 * typed union so the schema stays portable across tool families.
 */

// =============================================================================
// Status
// =============================================================================

/**
 *   draft        — AI is still compiling
 *   ready        — compiled; Implement can start dispatching
 *   in_progress  — runner has begun; some steps may be complete
 *   completed    — all steps succeeded
 *   failed       — one or more steps escalated past autoheal L5
 *   aborted      — user or policy cancelled mid-run
 */
export type ExecutionPlanStatus =
  | 'draft'
  | 'ready'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'aborted';

// =============================================================================
// Step
// =============================================================================

/** Status of a single step within an ExecutionPlan. */
export type ExecutionPlanStepStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface ExecutionPlanStep {
  /** Stable id (typically `<plan-id>.step.<n>`). */
  id: string;
  /** Canonical tool name (matches Tool.name in the registry). */
  tool: string;
  /** Short rationale rendered next to the step in review UIs. */
  rationale: string;
  /**
   * Tool arguments as a single markdown code fence body (JSON or
   * YAML). Left as a string so the schema doesn't force a shape onto
   * every tool family.
   */
  args: string;
  /** Current step status; defaults to 'pending' when omitted. */
  status?: ExecutionPlanStepStatus;
  /** When the step failed, the reason surfaced by the runner / autoheal. */
  error?: string;
}

// =============================================================================
// Plan
// =============================================================================

export interface ExecutionPlan {
  /** Stable id, typically derived from the Draft id. */
  id: string;
  /** Id of the Draft this plan was compiled from (ADR §4.2 lineage). */
  draftId: string;
  /** Human-readable title. */
  title: string;
  /** Lifecycle status. */
  status: ExecutionPlanStatus;
  /** ms epoch — when compilation started. */
  createdAt: number;
  /** ms epoch — last mutation. */
  updatedAt: number;
  /** Ordered tool-call sequence. First-to-last = dispatch order. */
  steps: readonly ExecutionPlanStep[];
  /** Optional free-form note (guardrails, policy reminders, ...). */
  notes?: string;
}
