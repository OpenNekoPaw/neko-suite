/**
 * Task markdown serialiser.
 *
 * See: docs/architecture/agent-unified-workflow.md §7.3 (AI → Markdown),
 *      §7.4 (`.neko/tasks/task-<runId>.md`).
 *
 * Canonical shape for the Task artifact file:
 *
 *   ---
 *   id: <task id>
 *   kind: task
 *   createdAt: <ISO 8601>
 *   updatedAt: <ISO 8601>
 *   ---
 *
 *   # Tasks
 *
 *   - [ ] <content>                      (pending)
 *   - [~] <activeForm ?? content>        (in progress)
 *   - [x] <content>                      (completed)
 *   - [!] <content>                      (failed)
 *         _error: <error>_
 *
 * Emits the full Task snapshot each call, mirroring Claude Code's
 * TodoWrite-everything-at-once contract. Consumers don't diff — they
 * just read the latest file.
 *
 * Renamed from todo-markdown.ts (2026-04-22, ADR §4 revision). Phase B
 * (2026-04-22) removed the dedicated TaskWriteTool that drove this helper
 * — kept as a reusable library for future UI rendering + round-trip tests.
 */

import type { Task, TaskItem, TaskStatus } from '@neko-agent/types';

// =============================================================================
// Status rendering
// =============================================================================

const STATUS_CHECKBOX: Record<TaskStatus, string> = {
  pending: '[ ]',
  in_progress: '[~]',
  completed: '[x]',
  failed: '[!]',
};

function renderItem(item: TaskItem): string {
  const label = item.status === 'in_progress' ? (item.activeForm ?? item.content) : item.content;
  const line = `- ${STATUS_CHECKBOX[item.status]} ${escapeInline(label)}`;
  if (item.status === 'failed' && item.error) {
    return `${line}\n      _error: ${escapeInline(item.error)}_`;
  }
  return line;
}

/**
 * Strip leading / trailing whitespace and neutralise single-line
 * content that would break the markdown (newlines). Tolerant — we
 * don't escape markdown metacharacters; the AI is expected to write
 * reasonable content. Only hard line breaks would corrupt the list.
 */
function escapeInline(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// =============================================================================
// Serialiser
// =============================================================================

/**
 * Render a full Task checklist as the canonical `task-<runId>.md` contents.
 *
 * Timestamps are serialised with `toISOString()` so diffs across runs
 * stay stable and human-readable. The caller supplies the task's
 * existing createdAt so repeated writes don't clobber it.
 */
export function serializeTask(task: Task): string {
  const header = [
    '---',
    `id: ${task.id}`,
    'kind: task',
    `createdAt: ${new Date(task.createdAt).toISOString()}`,
    `updatedAt: ${new Date(task.updatedAt).toISOString()}`,
    '---',
    '',
    '# Tasks',
    '',
  ].join('\n');

  if (task.items.length === 0) {
    return `${header}_No items._\n`;
  }
  return `${header}${task.items.map(renderItem).join('\n')}\n`;
}
