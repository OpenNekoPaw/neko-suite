/**
 * Flow Switcher — Owns the current FlowKind and emits transitions.
 *
 * See: docs/architecture/dual-flow-architecture.md §6.3
 *
 * Responsibility: single source of truth for whether the agent is currently
 * operating in the creation ring or the execution ring. Emits transition
 * events; listeners are responsible for applying the corresponding Skill
 * via SkillService + SkillInjectionCoordinator.
 *
 * This module is intentionally stateless w.r.t. Skills — it does not reach
 * into injection tracks. That separation keeps FlowSwitcher pure and testable
 * in isolation from the Skill system.
 */

import type {
  FlowContext,
  FlowKind,
  FlowTransitionEvent,
  FlowTransitionReason,
} from '@neko-agent/types';
import { DEFAULT_FLOW_CONTEXT } from '@neko-agent/types';

// =============================================================================
// Types
// =============================================================================

export type FlowTransitionListener = (event: FlowTransitionEvent) => void;

export interface FlowSwitcherConfig {
  /** Clock injection for deterministic tests. Defaults to Date.now. */
  now?: () => number;
  /** Initial flow kind (default: 'creation'). */
  initialKind?: FlowKind;
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * The canonical mapping of semantic triggers to destination flows.
 *
 * Transitions are *idempotent by destination*: requesting a transition to the
 * current kind is a no-op (no event emitted).
 */
export class FlowSwitcher {
  private _context: FlowContext;
  private readonly _now: () => number;
  private readonly _listeners = new Set<FlowTransitionListener>();

  constructor(config: FlowSwitcherConfig = {}) {
    this._now = config.now ?? (() => Date.now());
    const initialKind = config.initialKind ?? DEFAULT_FLOW_CONTEXT.kind;
    this._context = {
      kind: initialKind,
      enteredAt: this._now(),
      reason: 'session-start',
    };
  }

  // ---------------------------------------------------------------------------
  // State queries
  // ---------------------------------------------------------------------------

  /** Current flow context (readonly snapshot). */
  get context(): Readonly<FlowContext> {
    return this._context;
  }

  /** Current flow kind. */
  get kind(): FlowKind {
    return this._context.kind;
  }

  // ---------------------------------------------------------------------------
  // Transitions
  // ---------------------------------------------------------------------------

  /**
   * Transition to a target flow. If already in the target flow, no-op (no
   * listener invocation). Returns true iff a transition actually occurred.
   */
  transitionTo(target: FlowKind, reason: FlowTransitionReason): boolean {
    if (this._context.kind === target) {
      return false;
    }
    const event: FlowTransitionEvent = {
      from: this._context.kind,
      to: target,
      reason,
      at: this._now(),
    };
    this._context = {
      kind: target,
      enteredAt: event.at,
      reason,
    };
    this._emit(event);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Semantic triggers (sugar over transitionTo)
  // ---------------------------------------------------------------------------

  /** User confirmed Plan → move to execution (Apply). */
  onApplyTriggered(): boolean {
    return this.transitionTo('execution', 'apply-triggered');
  }

  /** All Steps complete → move back to creation for Status summary. */
  onRunCompleted(): boolean {
    return this.transitionTo('creation', 'run-completed');
  }

  /** Execution hit a macro-level structural issue → back to creation. */
  onMacroCorrectionRequired(): boolean {
    return this.transitionTo('creation', 'macro-correction-required');
  }

  /** Explicit user request to change flow. */
  onUserRequested(target: FlowKind): boolean {
    return this.transitionTo(target, 'user-requested');
  }

  // ---------------------------------------------------------------------------
  // Event subscription
  // ---------------------------------------------------------------------------

  /** Subscribe to transition events. Returns an unsubscribe function. */
  onTransition(listener: FlowTransitionListener): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  /** For teardown. */
  dispose(): void {
    this._listeners.clear();
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _emit(event: FlowTransitionEvent): void {
    for (const listener of this._listeners) {
      try {
        listener(event);
      } catch {
        // Listeners must not block transitions. Failures are swallowed; the
        // caller is responsible for its own error handling.
      }
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createFlowSwitcher(config?: FlowSwitcherConfig): FlowSwitcher {
  return new FlowSwitcher(config);
}

// =============================================================================
// Skill name constants (for listener wiring)
// =============================================================================

/** Builtin skill name for the creation-flow persona. */
export const CREATION_FLOW_SKILL_NAME = 'flow-creation';
/** Builtin skill name for the execution-flow persona. */
export const EXECUTION_FLOW_SKILL_NAME = 'flow-execution';

/** Map a FlowKind to its canonical persona Skill name. */
export function skillNameForFlow(kind: FlowKind): string {
  return kind === 'creation' ? CREATION_FLOW_SKILL_NAME : EXECUTION_FLOW_SKILL_NAME;
}
