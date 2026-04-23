/**
 * Task — Plan-stage artifact (user-visible checklist projection).
 *
 * See: docs/architecture/agent-unified-workflow.md §4.1
 *
 * Renamed from `TodoList` (2026-04-22, ADR §4 revision). The Plan stage
 * now owns both the ExecutionPlan (agent-internal tool-call list) and
 * the Task checklist (user-facing progress view); they used to be
 * separate `plan` and `tasks` stages.
 *
 * Downshifted from cli-tui component state to agent-types so agent,
 * extension, webview, and cli-tui can all consume the same shape.
 *
 * Design rules:
 * - `status` uses snake_case to match the agent/LLM tool convention
 *   ('in_progress'). A separate `TaskStatusCamel` type is exported for
 *   UI code that prefers camelCase; the two are bridged by helpers
 *   below rather than divergent interfaces.
 * - `id` is required at this layer — the planner produces Tasks
 *   that the executor tracks across rounds, and identity must survive
 *   status transitions. UIs without id support can fall back to array
 *   index, but agent-side state must carry one.
 * - Failure carries an optional error message so autoheal can surface
 *   a reason without re-reading logs.
 */

// =============================================================================
// Status
// =============================================================================

/** Canonical task item status (snake_case, tool-surface convention). */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

/** UI-friendly camelCase alias for rendering layers. */
export type TaskStatusCamel = 'pending' | 'inProgress' | 'completed' | 'failed';

/**
 * Bridge helper — snake → camel. Keep here so both layers import the
 * mapping from the same source.
 */
export function toTaskStatusCamel(status: TaskStatus): TaskStatusCamel {
  return status === 'in_progress' ? 'inProgress' : status;
}

/** Bridge helper — camel → snake. */
export function toTaskStatusSnake(status: TaskStatusCamel): TaskStatus {
  return status === 'inProgress' ? 'in_progress' : status;
}

// =============================================================================
// Item
// =============================================================================

export interface TaskItem {
  /** Stable identifier across status transitions. */
  id: string;
  /** Human-readable description of the unit of work. */
  content: string;
  /** Active-voice phrasing used while the item is in progress. */
  activeForm?: string;
  /** Current status. */
  status: TaskStatus;
  /** When set + status === 'failed', the reason the item failed. */
  error?: string;
}

// =============================================================================
// Task (user-visible checklist)
// =============================================================================

export interface Task {
  /** Stable id for the task list (usually IdcRun.id or a sub-scope of it). */
  id: string;
  /** Ordered items. Order is semantic — earliest first. */
  items: readonly TaskItem[];
  /** When the list was created (ms epoch). */
  createdAt: number;
  /** When the list was last mutated. */
  updatedAt: number;
}
