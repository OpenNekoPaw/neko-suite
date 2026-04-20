/**
 * TodoList — L1 primitive for the execution-flow inner ring.
 *
 * See: docs/architecture/dual-flow-architecture.md §3.3, §4.2
 *
 * Downshifted from cli-tui component state to agent-types so agent,
 * extension, webview, and cli-tui can all consume the same shape.
 * Existing local definitions (cli-tui/types/state.ts, cli-tui/core/
 * formatter.ts) stay in place until their call sites migrate.
 *
 * Design rules:
 * - `status` uses snake_case to match the agent/LLM tool convention
 *   ('in_progress'). A separate `TodoStatusCamel` type is exported for
 *   UI code that prefers camelCase; the two are bridged by helpers
 *   below rather than divergent interfaces.
 * - `id` is required at this layer — the planner produces TodoLists
 *   that the executor tracks across rounds, and identity must survive
 *   status transitions. UIs without id support can fall back to array
 *   index, but agent-side state must carry one.
 * - Failure carries an optional error message so autoheal can surface
 *   a reason without re-reading logs.
 */

// =============================================================================
// Status
// =============================================================================

/** Canonical todo status (snake_case, tool-surface convention). */
export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

/** UI-friendly camelCase alias for rendering layers. */
export type TodoStatusCamel = 'pending' | 'inProgress' | 'completed' | 'failed';

/**
 * Bridge helper — snake → camel. Keep here so both layers import the
 * mapping from the same source.
 */
export function toTodoStatusCamel(status: TodoStatus): TodoStatusCamel {
  return status === 'in_progress' ? 'inProgress' : status;
}

/** Bridge helper — camel → snake. */
export function toTodoStatusSnake(status: TodoStatusCamel): TodoStatus {
  return status === 'inProgress' ? 'in_progress' : status;
}

// =============================================================================
// Item
// =============================================================================

export interface TodoItem {
  /** Stable identifier across status transitions. */
  id: string;
  /** Human-readable description of the unit of work. */
  content: string;
  /** Active-voice phrasing used while the item is in progress. */
  activeForm?: string;
  /** Current status. */
  status: TodoStatus;
  /** When set + status === 'failed', the reason the item failed. */
  error?: string;
}

// =============================================================================
// List
// =============================================================================

export interface TodoList {
  /** Stable id for the list (usually WorkflowRun.id or a sub-scope of it). */
  id: string;
  /** Ordered items. Order is semantic — earliest first. */
  items: readonly TodoItem[];
  /** When the list was created (ms epoch). */
  createdAt: number;
  /** When the list was last mutated. */
  updatedAt: number;
}
