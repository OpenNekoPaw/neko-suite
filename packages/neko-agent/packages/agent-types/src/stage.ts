/**
 * SDD Stage Types — Speckit-aligned four-stage workflow
 *
 * See: docs/architecture/agent-unified-workflow.md §4 (L2 Flow Layer)
 *
 * Replaces the dual-flow ten-primitive pool (primitive.ts, deprecated).
 * Mapping:
 *   orchestration + proposal  → Specify
 *   review                    → Plan approval gate
 *   execution                 → Implement
 *   status                    → folded into Implement event stream
 *
 * Approval points (per user decision, 2026-04-21):
 *   - End of Specify: user approves Proposal (channel: 'proposal-review')
 *   - Inside Implement: high-risk Operations (reversible=false / cost>threshold)
 *     trigger the 'permission' channel
 *   - Plan / Tasks stages have no default approval
 *
 * Dependency DAG:
 *   Specify → Plan → Tasks → Implement
 *
 * Implement is the only always-mandatory stage; the rest can be skipped per
 * mode × entry rules (AutoMode may start directly at Implement for atomic
 * instructions; PlanMode always starts at Specify).
 */

// =============================================================================
// Stage union
// =============================================================================

/**
 * The four SDD stages (Speckit-aligned, agent-unified-workflow.md §4.1).
 *
 * - specify:   Business-declarative (What). AI produces a Proposal, user approves.
 * - plan:      Technical-imperative (How). AI compiles ExecutionPlan from Proposal.
 * - tasks:     TodoList derivation. AI produces a task checklist via TodoWrite.
 * - implement: Step loop (think → act → observe). Tool calls + event streaming.
 */
export type SddStage = 'specify' | 'plan' | 'tasks' | 'implement';

// =============================================================================
// Task shape — reused from primitive pool, identical semantics
// =============================================================================

/**
 * Classification of the upcoming work. Drives the stage-planner's skip logic.
 *
 * Kept structurally compatible with the legacy `TaskShape` in primitive.ts so
 * the same ActivationClassifier output can feed both planners during the
 * migration window.
 */
export type StageTaskShape =
  /** Read-only / low-risk tool call (no approval needed). */
  | 'single-read'
  /** Single atomic write. */
  | 'single-write'
  /** Multi-step work requiring planning. */
  | 'multi-step'
  /** Pure think — no tool call. Still produces an Implement log entry. */
  | 'pure-think'
  /** Retry after autoheal — reuse prior Plan + Tasks. */
  | 'retry'
  /** User explicitly wants planning only (stop before Implement). */
  | 'plan-only'
  /** Direct clarification / param tweak — goes straight to Implement. */
  | 'clarification';

// =============================================================================
// Activation decision
// =============================================================================

/**
 * Reason a stage was considered and skipped. Narrow union so downstream
 * telemetry can aggregate without parsing free text.
 */
export type StageSkipReason =
  /** Not applicable to this task shape (§3.2 entry rules). */
  | 'task-shape'
  /** L2 mode forbids this stage in this context. */
  | 'mode'
  /** Entry rule short-circuited to a later stage (e.g. atomic instruction → implement). */
  | 'entry-rule'
  /** Retry round reuses prior Specify/Plan/Tasks. */
  | 'retry-reuse'
  /** User explicitly suppressed (e.g. plan-only stops before Implement). */
  | 'user-suppressed';

/**
 * Result of the stage-planner for one ReAct round.
 *
 * Mirrors `PrimitiveActivationDecision` so WorkflowRunRoundSummary can carry
 * either during the PR2 migration window.
 */
export interface StageActivationDecision {
  /** Task shape used to drive the decision. */
  taskShape: StageTaskShape;
  /** Stages to execute this round, in DAG order. */
  activated: readonly SddStage[];
  /** Stages evaluated and rejected, with reasons. */
  skipped: readonly { stage: SddStage; reason: StageSkipReason }[];
  /** Wall-clock timestamp the decision was made. */
  decidedAt: number;
  /** Round index within the current run (0-based). */
  round: number;
}

// =============================================================================
// Helper — stage set
// =============================================================================

/**
 * Ordered, deduplicated set of stages. Order matters: must respect the
 * Specify → Plan → Tasks → Implement DAG. Use the stage-registry's sort
 * helpers in the agent package to construct valid sets.
 */
export type StageSet = readonly SddStage[];
