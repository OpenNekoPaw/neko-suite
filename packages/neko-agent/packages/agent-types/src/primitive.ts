/**
 * Primitive Types — Dual-flow primitive pool
 *
 * See: docs/architecture/dual-flow-architecture.md §3.2, §3.3, §3.4, §4.2
 *
 * Both flows are *composable primitive pools*, not linear pipelines. Each
 * ReAct round activates a subset of primitives based on:
 *   - L2 mode (PlanMode / AskMode / AutoMode)
 *   - Task shape (single-step / multi-step / pure-think / retry)
 *   - Last observe result (for in-loop replanning)
 *
 * Dependency DAG (when activated):
 *   Plan → Approve → Apply → Step
 *   (Plan precedes Approve; Approve precedes Apply; Apply produces Step)
 *
 * Step is the only *always-mandatory* primitive — even think-only rounds
 * produce a Step log.
 */
import type { FlowKind } from './flow';

// =============================================================================
// Primitive union
// =============================================================================

/**
 * Creation-flow (outer-ring) primitives — user-facing business semantics.
 *
 * Only `execution` and `status` are default-mandatory; the rest are
 * skippable depending on mode + task shape (see ADR §3.2 table).
 */
export type CreationPrimitive = 'orchestration' | 'proposal' | 'review' | 'execution' | 'status';

/**
 * Execution-flow (inner-ring) primitives — system-facing technical semantics.
 *
 * Only `step` is always mandatory. `apply` is mandatory *unless* the round is
 * pure-think (no side-effect tool call). See ADR §3.3 table + §4.2.
 */
export type ExecutionPrimitive = 'plan' | 'todo' | 'approve' | 'apply' | 'step';

/**
 * Union of all 10 primitives across both flows.
 */
export type Primitive = CreationPrimitive | ExecutionPrimitive;

// =============================================================================
// Task shape
// =============================================================================

/**
 * Classification of the upcoming work, used by the activation planner to pick
 * which primitives to enable in the next ReAct round.
 *
 * Not all shapes are mutually exclusive at the task level, but each round
 * resolves to exactly one shape.
 */
export type TaskShape =
  /** Read-only / low-risk tool call (no Approve needed per strategy pack). */
  | 'single-read'
  /** Single atomic write (no Plan/TODO needed). */
  | 'single-write'
  /** Multi-step work requiring Plan + TODO. */
  | 'multi-step'
  /** Pure think (no tool call, no Apply). Still produces a Step. */
  | 'pure-think'
  /** Retry after autoheal — reuse existing Plan, skip TODO/Approve. */
  | 'retry'
  /** User explicitly wants planning only (no Apply). */
  | 'plan-only'
  /** Direct clarification/param tweak — only Status feedback. */
  | 'clarification';

// =============================================================================
// Activation decision
// =============================================================================

/**
 * Reason a primitive was skipped (for audit + telemetry).
 *
 * Kept as a narrow union so downstream aggregators can build summaries without
 * parsing free-text.
 */
export type PrimitiveSkipReason =
  /** Not applicable to this task shape. */
  | 'task-shape'
  /** L2 mode forbids this primitive in this context. */
  | 'mode'
  /** Strategy pack auto-approved (skipping Approve). */
  | 'auto-approved'
  /** Retry round reuses prior Plan/Approve. */
  | 'retry-reuse'
  /** User explicitly suppressed (e.g. plan-only stops before Apply). */
  | 'user-suppressed'
  /** Outer-ring original skip table (§3.2). */
  | 'outer-ring-skip';

/**
 * Result of the activation planner for one ReAct round.
 *
 * - `activated`: primitives to run this round, in DAG order.
 * - `skipped`: primitives explicitly *considered and skipped*, with reasons.
 *   (Not a general "everything not activated" set — only primitives the
 *   planner actively decided against. Enables debugging drift without
 *   polluting telemetry with every unused primitive.)
 */
export interface PrimitiveActivationDecision {
  /** Flow the decision was made within (outer / inner ring). */
  flow: FlowKind;
  /** Task shape used to drive the decision. */
  taskShape: TaskShape;
  /** Primitives to execute this round, in dependency order. */
  activated: readonly Primitive[];
  /** Primitives evaluated and rejected, with reasons. */
  skipped: readonly { primitive: Primitive; reason: PrimitiveSkipReason }[];
  /** Wall-clock timestamp the decision was made. */
  decidedAt: number;
  /** Round index within the current flow (0-based). */
  round: number;
}

// =============================================================================
// Helper — primitive set
// =============================================================================

/**
 * An ordered, deduplicated set of primitives. Order matters: primitives must
 * respect the dependency DAG (Plan before Approve before Apply before Step).
 *
 * Use the primitive-registry DAG helpers (in the agent package) to construct
 * valid sets — this module stays zero-dependency.
 */
export type PrimitiveSet = readonly Primitive[];
