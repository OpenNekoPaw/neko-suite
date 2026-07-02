/**
 * Stage Tracker — owns the current built-in creation stage and emits enter/exit events.
 *
 * See: docs/architecture/agent-unified-workflow.md §4 (built-in creation stages), §6.5
 *      (L0 StageTracker infrastructure)
 *
 * Replaces FlowSwitcher. Whereas FlowSwitcher modelled a two-ring cycle
 * (creation ↔ execution) driven by semantic triggers (onApplyTriggered etc.),
 * StageTracker tracks position inside a linear three-stage DAG:
 *
 *   draft → plan → apply
 *
 * Per ReAct round the planner decides which stages activate; the runner
 * tells the tracker which stage the round actually entered. Listeners
 * (e.g. StagePersonaBinding) subscribe to `stage.entered` events to swap
 * persona Skills.
 *
 * Transitions are idempotent by destination: re-entering the current stage
 * is a no-op. No event is emitted when the tracker hasn't moved.
 *
 * Stage rename 2026-04-22: specify → draft, implement → apply, tasks
 * merged into plan (ADR §4 revision).
 */

import type { IdcStage } from '@neko-agent/types';

// =============================================================================
// Types
// =============================================================================

export interface StageEnteredEvent {
  /** Stage the tracker just moved into. */
  stage: IdcStage;
  /** Stage the tracker was in before, or null on first enter. */
  previous: IdcStage | null;
  /** ms epoch. */
  at: number;
}

export interface StageExitedEvent {
  /** Stage the tracker just left. */
  stage: IdcStage;
  /** Stage it moved to. */
  next: IdcStage;
  /** ms epoch. */
  at: number;
}

export type StageEnteredListener = (event: StageEnteredEvent) => void;
export type StageExitedListener = (event: StageExitedEvent) => void;

export interface StageTrackerConfig {
  /** Clock injection for deterministic tests. Defaults to Date.now. */
  now?: () => number;
  /** Initial stage (optional — tracker stays uninitialised until first enter). */
  initialStage?: IdcStage;
}

export interface StageTrackerRestoreState {
  /** Current stage, or null when the tracker was idle at snapshot time. */
  current: IdcStage | null;
  /** ms epoch when the current stage was entered. */
  enteredAt?: number;
}

// =============================================================================
// Implementation
// =============================================================================

export class StageTracker {
  private _current: IdcStage | null;
  private _enteredAt: number;
  private readonly _now: () => number;
  private readonly _enteredListeners = new Set<StageEnteredListener>();
  private readonly _exitedListeners = new Set<StageExitedListener>();

  constructor(config: StageTrackerConfig = {}) {
    this._now = config.now ?? (() => Date.now());
    this._current = config.initialStage ?? null;
    this._enteredAt = this._current ? this._now() : 0;
  }

  // ---------------------------------------------------------------------------
  // State queries
  // ---------------------------------------------------------------------------

  /** Current stage, or null before the first enter(). */
  get current(): IdcStage | null {
    return this._current;
  }

  /** ms epoch when the current stage was entered. */
  get enteredAt(): number {
    return this._enteredAt;
  }

  // ---------------------------------------------------------------------------
  // Transitions
  // ---------------------------------------------------------------------------

  /**
   * Move the tracker into a stage. Idempotent: entering the current stage
   * is a no-op. Returns true iff the stage actually changed.
   */
  enter(stage: IdcStage): boolean {
    if (this._current === stage) return false;
    const previous = this._current;
    const at = this._now();

    if (previous !== null) {
      this._emitExited({ stage: previous, next: stage, at });
    }
    this._current = stage;
    this._enteredAt = at;
    this._emitEntered({ stage, previous, at });
    return true;
  }

  /**
   * Replace tracker state from a persisted snapshot without re-emitting
   * entered/exited events. Callers restoring a session can then resync their
   * dependent listeners explicitly.
   */
  restore(state: StageTrackerRestoreState): void {
    this._current = state.current;
    this._enteredAt = state.current ? (state.enteredAt ?? this._now()) : 0;
  }

  // ---------------------------------------------------------------------------
  // Event subscription
  // ---------------------------------------------------------------------------

  /** Subscribe to stage.entered events. Returns an unsubscribe function. */
  onEntered(listener: StageEnteredListener): () => void {
    this._enteredListeners.add(listener);
    return () => {
      this._enteredListeners.delete(listener);
    };
  }

  /** Subscribe to stage.exited events. Returns an unsubscribe function. */
  onExited(listener: StageExitedListener): () => void {
    this._exitedListeners.add(listener);
    return () => {
      this._exitedListeners.delete(listener);
    };
  }

  /** Clear all listeners. */
  dispose(): void {
    this._enteredListeners.clear();
    this._exitedListeners.clear();
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _emitEntered(event: StageEnteredEvent): void {
    for (const listener of this._enteredListeners) {
      try {
        listener(event);
      } catch {
        // Listeners must not block transitions. Swallow to match FlowSwitcher
        // semantics; upstream code is responsible for its own error handling.
      }
    }
  }

  private _emitExited(event: StageExitedEvent): void {
    for (const listener of this._exitedListeners) {
      try {
        listener(event);
      } catch {
        // See _emitEntered.
      }
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createStageTracker(config?: StageTrackerConfig): StageTracker {
  return new StageTracker(config);
}
