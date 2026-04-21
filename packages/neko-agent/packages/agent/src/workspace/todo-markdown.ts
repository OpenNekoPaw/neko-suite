/**
 * TodoList markdown serialiser.
 *
 * See: docs/architecture/agent-unified-workflow.md §7.3 (AI → Markdown),
 *      §7.4 (`.neko/todos/<runId>.nktodo.md`).
 *
 * Canonical shape the TodoWrite tool emits:
 *
 *   ---
 *   id: <list id>
 *   createdAt: <ISO 8601>
 *   updatedAt: <ISO 8601>
 *   ---
 *
 *   # TODO
 *
 *   - [ ] <content>                      (pending)
 *   - [~] <activeForm ?? content>        (in progress)
 *   - [x] <content>                      (completed)
 *   - [!] <content>                      (failed)
 *         _error: <error>_
 *
 * The TodoWrite tool is the single writer; it serialises the caller's
 * full TodoList snapshot each time, mirroring Claude Code's
 * TodoWrite-everything-at-once contract. Consumers don't diff — they
 * just read the latest file.
 */

import type { TodoList, TodoItem, TodoStatus } from '@neko-agent/types';

// =============================================================================
// Status rendering
// =============================================================================

const STATUS_CHECKBOX: Record<TodoStatus, string> = {
  pending: '[ ]',
  in_progress: '[~]',
  completed: '[x]',
  failed: '[!]',
};

function renderItem(item: TodoItem): string {
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
 * Render a full TodoList as the canonical `.nktodo.md` contents.
 *
 * Timestamps are serialised with `toISOString()` so diffs across runs
 * stay stable and human-readable. The caller supplies the list's
 * existing createdAt so repeated writes don't clobber it.
 */
export function serializeTodoList(list: TodoList): string {
  const header = [
    '---',
    `id: ${list.id}`,
    `createdAt: ${new Date(list.createdAt).toISOString()}`,
    `updatedAt: ${new Date(list.updatedAt).toISOString()}`,
    '---',
    '',
    '# TODO',
    '',
  ].join('\n');

  if (list.items.length === 0) {
    return `${header}_No items._\n`;
  }
  return `${header}${list.items.map(renderItem).join('\n')}\n`;
}
