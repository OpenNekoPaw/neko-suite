/**
 * Flow Types — Dual-flow architecture primitives
 *
 * See: docs/architecture/dual-flow-architecture.md
 *
 * - Creation Flow (outer ring): Orchestration → Proposal → Review → Execution → Status
 *   Business semantics, user-facing, creative decisions.
 * - Execution Flow (inner ring): Plan → TODO → Approve → Apply → Step
 *   Technical semantics, tool operations, resource management.
 *
 * Both flows are *primitive pools* per ADR §3.2/§3.3 — the ordering above is
 * the dependency DAG, not a mandatory pipeline. The activation planner
 * (agent/src/skill/activation/) decides which primitives run each round.
 */
import type { PrimitiveActivationDecision } from './primitive';

/**
 * Flow kind — which ring the agent is currently operating in.
 */
export type FlowKind = 'creation' | 'execution';

/**
 * Why the flow transitioned (for audit + telemetry).
 */
export type FlowTransitionReason =
  /** User confirmed Plan → triggered Apply (creation → execution) */
  | 'apply-triggered'
  /** All Steps completed → return to creation for Status summary */
  | 'run-completed'
  /** Execution hit a macro issue requiring redesign (execution → creation) */
  | 'macro-correction-required'
  /** User explicitly requested flow change */
  | 'user-requested'
  /** Initial state on session start */
  | 'session-start';

/**
 * Flow context — read by executor before think/act to shape persona and tooling.
 */
export interface FlowContext {
  /** Current flow ring */
  kind: FlowKind;
  /** When the current flow was entered */
  enteredAt: number;
  /** Why the current flow was entered */
  reason: FlowTransitionReason;
  /**
   * Last activation decision (if any). Populated after the first ReAct round.
   * Optional to preserve backward compatibility with pre-P1.5 call sites.
   */
  lastActivationDecision?: PrimitiveActivationDecision;
}

/**
 * Flow transition event — emitted by FlowSwitcher on kind change.
 */
export interface FlowTransitionEvent {
  from: FlowKind;
  to: FlowKind;
  reason: FlowTransitionReason;
  at: number;
}

/**
 * Default flow context for a fresh session.
 */
export const DEFAULT_FLOW_CONTEXT: FlowContext = {
  kind: 'creation',
  enteredAt: 0,
  reason: 'session-start',
};
