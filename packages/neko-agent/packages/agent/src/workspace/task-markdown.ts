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
import {
  getFrontmatterString,
  parseMarkdownArtifact,
  parseRequiredTimestamp,
} from './artifact-markdown-parser';

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

export function parseTask(markdown: string): Task {
  const parsed = parseMarkdownArtifact(markdown);
  const id = getFrontmatterString(parsed.frontmatter, 'id');
  if (!id) {
    throw new Error('Task markdown is missing required "id" frontmatter');
  }

  return {
    id,
    createdAt: parseRequiredTimestamp(
      getFrontmatterString(parsed.frontmatter, 'createdAt'),
      'createdAt',
    ),
    updatedAt: parseRequiredTimestamp(
      getFrontmatterString(parsed.frontmatter, 'updatedAt'),
      'updatedAt',
    ),
    items: parseTaskItems(id, parsed.body),
  };
}

function parseTaskItems(taskId: string, body: string): readonly TaskItem[] {
  const marker = /^# Tasks\r?\n/m.exec(body);
  if (!marker || marker.index === undefined) {
    return [];
  }

  const lines = body
    .slice(marker.index + marker[0].length)
    .trim()
    .split(/\r?\n/);
  if (lines.length === 1 && lines[0] === '_No items._') {
    return [];
  }

  const items: TaskItem[] = [];
  let itemIndex = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line?.match(/^- \[( |~|x|!)\] (.+)$/);
    if (!match) {
      continue;
    }

    itemIndex += 1;
    const label = (match[2] ?? '').trim();
    const status = parseTaskStatusMarker(match[1] ?? ' ');
    const item: TaskItem = {
      id: `${taskId}.item.${itemIndex}`,
      content: label,
      status,
      ...(status === 'in_progress' ? { activeForm: label } : {}),
    };

    const errorMatch = lines[index + 1]?.match(/^\s+_error:\s+(.+)_$/);
    if (errorMatch) {
      item.error = (errorMatch[1] ?? '').trim();
      index += 1;
    }

    items.push(item);
  }

  return items;
}

function parseTaskStatusMarker(marker: string): TaskStatus {
  switch (marker) {
    case ' ':
      return 'pending';
    case '~':
      return 'in_progress';
    case 'x':
      return 'completed';
    case '!':
      return 'failed';
    default:
      throw new Error(`Task markdown has invalid status marker: ${marker}`);
  }
}
