/**
 * MemoryWrite Tool
 *
 * Allows the Agent to persist facts, decisions, and preferences to the
 * project-level memory file (`.neko/memory.md`).  The file is organised as
 * H2 Markdown sections; each call targets one named section.
 *
 * Does NOT require user confirmation — writes are non-destructive upserts.
 */

import type { ToolResult, ToolCategory } from '@neko/shared';
import { BuiltinTool } from '@neko/shared';
import type { IProjectMemoryManager } from '@neko/shared';

export class MemoryWriteTool extends BuiltinTool {
  readonly name = 'MemoryWrite';
  readonly description =
    'Persist a fact, decision, or preference to the project memory file (.neko/memory.md) so it is available in future sessions. ' +
    'Use `upsert` to create or update a named section; use `remove` to delete one. ' +
    'Good sections: "User Preferences", "Project Architecture", "Recent Decisions", "Key Conventions".';

  readonly parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['upsert', 'remove'],
        description: '`upsert` creates or replaces the section; `remove` deletes it.',
      },
      key: {
        type: 'string',
        description:
          'Section heading (e.g. "User Preferences"). Used as the ## heading in memory.md.',
      },
      content: {
        type: 'string',
        description:
          'Markdown body for the section. Required when action is `upsert`. ' +
          'Use bullet points for lists of facts.',
      },
    },
    required: ['action', 'key'],
  };

  readonly category: ToolCategory = 'system';
  override readonly requiresConfirmation = false;

  constructor(private readonly _memory: IProjectMemoryManager) {
    super();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error ?? 'Invalid arguments');
    }

    const action = args.action as 'upsert' | 'remove';
    const key = args.key as string;

    if (!key.trim()) {
      return this.error('`key` must not be empty');
    }

    try {
      if (action === 'upsert') {
        const content = args.content as string | undefined;
        if (content === undefined || content === null) {
          return this.error('`content` is required for action `upsert`');
        }
        await this._memory.upsertEntry(key, content);
        return this.success({
          action: 'upsert',
          key,
          message: `Section "${key}" saved to project memory.`,
        });
      } else {
        await this._memory.removeEntry(key);
        return this.success({
          action: 'remove',
          key,
          message: `Section "${key}" removed from project memory.`,
        });
      }
    } catch (err) {
      return this.error(
        `Failed to write project memory: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
