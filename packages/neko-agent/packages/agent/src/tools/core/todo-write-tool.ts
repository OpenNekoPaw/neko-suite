/**
 * TodoWrite Tool — persists the agent's working TodoList to
 * `.neko/todos/<runId>.nktodo.md`.
 *
 * See: docs/architecture/agent-unified-workflow.md §5 (Tasks stage
 * produces a TodoList), §7.4 (`.neko/todos/` layout), §11.1 (AI writes
 * the full list each call — no diffing at the tool layer).
 *
 * Contract:
 *   - The tool replaces the full file each call. LLMs are expected to
 *     pass the complete item list, not deltas. This mirrors Claude
 *     Code's TodoWrite convention and keeps the file readable at rest.
 *   - `createdAt` is preserved across writes when the file already
 *     exists (parsed from the frontmatter). `updatedAt` is stamped on
 *     each write.
 *   - Writes are gated by `getRunId()` — the caller-supplied closure
 *     returns the active SddRun's id. No run → the tool rejects.
 *     Keeps todos scoped per run so concurrent runs don't stomp.
 */

import * as fs from 'node:fs/promises';
import type { ToolResult, ToolCategory } from '@neko/shared';
import { BuiltinTool } from '@neko/shared';
import type { TodoItem, TodoList, TodoStatus } from '@neko-agent/types';
import type { INekoPaths } from '../../workspace';
import { serializeTodoList } from '../../workspace';

const VALID_STATUS: ReadonlySet<TodoStatus> = new Set([
  'pending',
  'in_progress',
  'completed',
  'failed',
]);

export interface TodoWriteToolOptions {
  /** Resolves `.neko/todos/<runId>.nktodo.md` paths. */
  paths: INekoPaths;
  /**
   * Returns the active run id the todo list belongs to. Typically a
   * closure over AgentSession's SddRunStore. `null` = no active run;
   * the tool rejects rather than writing into an ambiguous scope.
   */
  getRunId: () => string | null;
  /** Clock injection for deterministic tests. Defaults to Date.now. */
  now?: () => number;
}

export class TodoWriteTool extends BuiltinTool {
  private readonly _paths: INekoPaths;
  private readonly _getRunId: () => string | null;
  private readonly _now: () => number;

  constructor(options: TodoWriteToolOptions) {
    super();
    this._paths = options.paths;
    this._getRunId = options.getRunId;
    this._now = options.now ?? (() => Date.now());
  }

  readonly name = 'TodoWrite';
  readonly description =
    'Write the full todo list for the current run to ' +
    '`.neko/todos/<runId>.nktodo.md`. Replace the entire list each call; ' +
    'pass every item with its latest status. Use status = pending, ' +
    'in_progress, completed, or failed. Provide activeForm for items in ' +
    'progress (the verb-form phrasing used during execution).';
  readonly parameters = {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        description: 'Full list of todos (ordered — earliest first).',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Stable identifier across status transitions.',
            },
            content: {
              type: 'string',
              description: 'Human-readable description of the unit of work.',
            },
            activeForm: {
              type: 'string',
              description: 'Active-voice phrasing used while status = in_progress.',
            },
            status: {
              type: 'string',
              enum: ['pending', 'in_progress', 'completed', 'failed'],
              description: 'Current status.',
            },
            error: {
              type: 'string',
              description: 'Optional failure reason; only set when status = failed.',
            },
          },
          required: ['id', 'content', 'status'],
        },
      },
    },
    required: ['todos'],
  };
  readonly category: ToolCategory = 'file';
  override readonly isConcurrencySafe = false; // Writes to a single file.

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error ?? 'Invalid arguments');
    }

    const runId = this._getRunId();
    if (!runId) {
      return this.error('TodoWrite: no active SddRun — start a run before writing todos');
    }

    const rawTodos = args.todos as unknown;
    if (!Array.isArray(rawTodos)) {
      return this.error('TodoWrite: "todos" must be an array');
    }

    const items: TodoItem[] = [];
    for (let i = 0; i < rawTodos.length; i++) {
      const parsed = this._parseItem(rawTodos[i], i);
      if (typeof parsed === 'string') return this.error(parsed);
      items.push(parsed);
    }

    const filePath = this._paths.file('todos', runId);
    const now = this._now();
    const createdAt = await this._readCreatedAt(filePath, now);

    const list: TodoList = {
      id: runId,
      items,
      createdAt,
      updatedAt: now,
    };
    const markdown = serializeTodoList(list);

    try {
      await fs.mkdir(this._paths.dir('todos'), { recursive: true });
      await fs.writeFile(filePath, markdown, 'utf-8');
      return this.success({
        path: filePath,
        runId,
        itemCount: items.length,
        bytesWritten: Buffer.byteLength(markdown, 'utf-8'),
      });
    } catch (err) {
      return this.error(
        `TodoWrite: failed to write ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /**
   * Attempt to preserve the existing `createdAt` across rewrites. First
   * call for a run seeds it with `now`. Parse failures silently fall
   * back to `now` — we'd rather have a valid stamp than abort on an
   * externally-edited frontmatter.
   */
  private async _readCreatedAt(filePath: string, fallbackNow: number): Promise<number> {
    try {
      const existing = await fs.readFile(filePath, 'utf-8');
      const match = /^createdAt:\s*(.+)$/m.exec(existing);
      if (match?.[1]) {
        const parsed = Date.parse(match[1].trim());
        if (!Number.isNaN(parsed)) return parsed;
      }
    } catch {
      // ENOENT or parse error — first write for this run.
    }
    return fallbackNow;
  }

  private _parseItem(raw: unknown, index: number): TodoItem | string {
    if (typeof raw !== 'object' || raw === null) {
      return `TodoWrite: todos[${index}] must be an object`;
    }
    const rec = raw as Record<string, unknown>;
    const id = rec.id;
    const content = rec.content;
    const status = rec.status;
    if (typeof id !== 'string' || id.length === 0) {
      return `TodoWrite: todos[${index}].id must be a non-empty string`;
    }
    if (typeof content !== 'string' || content.length === 0) {
      return `TodoWrite: todos[${index}].content must be a non-empty string`;
    }
    if (typeof status !== 'string' || !VALID_STATUS.has(status as TodoStatus)) {
      return `TodoWrite: todos[${index}].status must be one of pending|in_progress|completed|failed`;
    }
    const item: TodoItem = { id, content, status: status as TodoStatus };
    if (typeof rec.activeForm === 'string') item.activeForm = rec.activeForm;
    if (typeof rec.error === 'string') item.error = rec.error;
    return item;
  }
}
