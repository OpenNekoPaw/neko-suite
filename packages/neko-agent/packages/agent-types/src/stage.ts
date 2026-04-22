/**
 * SDD Stage Types — three-stage creative workflow
 *
 * See: docs/architecture/agent-unified-workflow.md §4 (L2 Flow Layer)
 *
 * Replaces the earlier four-stage layout (specify / plan / tasks / implement).
 * The `tasks` step was merged into `plan` because both shared the same persona,
 * tool set, and guardians (ADR §4 revision, 2026-04-22). The new naming
 * (`draft / plan / apply`) borrows the Terraform plan/apply idiom and avoids
 * the visual-design ambiguity of `design`.
 *
 * Stage mapping (old → new):
 *   specify                → draft
 *   plan + tasks (merged)  → plan
 *   implement              → apply
 *
 * Approval points:
 *   - End of Draft: user approves Draft (channel: 'draft-review')
 *   - Inside Apply: high-risk Operations (reversible=false / cost>threshold)
 *     trigger the 'permission' channel
 *   - Plan stage has no default approval
 *
 * Dependency DAG:
 *   Draft → Plan → Apply
 *
 * Apply is the only always-mandatory stage; the rest can be skipped per
 * mode × entry rules (AutoMode may start directly at Apply for atomic
 * instructions; PlanMode always starts at Draft).
 */

// =============================================================================
// Paradigm
// =============================================================================

/**
 * Declarative vs imperative paradigms — a SDD artifact's fundamental nature.
 *
 * See: docs/architecture/agent-unified-workflow.md §4.2
 *
 * - declarative (What): Draft. Business goal, user-facing approval object.
 *   Produced by the Draft stage. The user approves *this*; they do not
 *   approve the Plan.
 * - imperative (How): ExecutionPlan + Task. Technical tool-call list and its
 *   user-visible checklist projection the agent compiles from the Draft. The
 *   agent may recompile them during retries without re-asking the user.
 *
 * Different failure semantics: a Draft failing means the direction is wrong
 * (user intervention). A Plan failing is a technical issue (autoheal).
 */
export type Paradigm =
  /** Draft-stage artifacts and upstream business decisions. */
  | 'declarative'
  /** Plan / Apply-stage tool calls and technical decisions. */
  | 'imperative';

// =============================================================================
// Stage union
// =============================================================================

/**
 * The three SDD stages (agent-unified-workflow.md §4.1).
 *
 * - draft: Business-declarative (What). AI produces a Draft, user approves.
 * - plan:  Technical-imperative (How). AI compiles an ExecutionPlan and its
 *          user-visible Task checklist from the Draft.
 * - apply: Step loop (think → act → observe). Tool calls + event streaming.
 */
export type SddStage = 'draft' | 'plan' | 'apply';

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
  /** Pure think — no tool call. Still produces an Apply log entry. */
  | 'pure-think'
  /** Retry after autoheal — reuse prior Draft + Plan. */
  | 'retry'
  /** User explicitly wants planning only (stop before Apply). */
  | 'plan-only'
  /** Direct clarification / param tweak — goes straight to Apply. */
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
  /** Entry rule short-circuited to a later stage (e.g. atomic instruction → apply). */
  | 'entry-rule'
  /** Retry round reuses prior Draft/Plan. */
  | 'retry-reuse'
  /** User explicitly suppressed (e.g. plan-only stops before Apply). */
  | 'user-suppressed';

/**
 * Result of the stage-planner for one ReAct round. Consumed by
 * SddRunRoundSummary for per-round telemetry compaction.
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
 * Draft → Plan → Apply DAG. Use the stage-registry's sort helpers in the
 * agent package to construct valid sets.
 */
export type StageSet = readonly SddStage[];
