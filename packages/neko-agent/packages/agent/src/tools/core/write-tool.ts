/**
 * Write Tool - Write content to a file
 *
 * Auto-creates parent directories. Supports append mode.
 * Requires confirmation before execution.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ToolResult, ToolCategory } from '@neko/shared';
import { BuiltinTool } from '@neko/shared';

export interface WriteToolOptions {
  /** Default working directory; relative paths are resolved against this */
  defaultCwd?: string;
}

export class WriteTool extends BuiltinTool {
  private readonly defaultCwd?: string;

  constructor(options?: WriteToolOptions) {
    super();
    this.defaultCwd = options?.defaultCwd;
  }

  readonly name = 'Write';
  readonly description =
    'Write content to a file. Creates parent directories if needed. Use append mode to add to existing files.';
  readonly parameters = {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description:
          'Path to the file to write. Relative paths are resolved against the workspace root.',
      },
      content: {
        type: 'string',
        description: 'Content to write to the file',
      },
      append: {
        type: 'boolean',
        description: 'Append to file instead of overwriting. Default false.',
      },
    },
    required: ['file_path', 'content'],
  };
  readonly category: ToolCategory = 'file';
  override readonly requiresConfirmation = true;
  override readonly isDestructive = true;

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error ?? 'Invalid arguments');
    }

    const filePath = args.file_path as string;
    const content = args.content as string;
    const append = (args.append as boolean | undefined) ?? false;

    try {
      const resolved = path.resolve(this.defaultCwd ?? '.', filePath);

      // Prevent writing outside the workspace root
      if (this.defaultCwd) {
        const workspace = path.resolve(this.defaultCwd);
        if (!resolved.startsWith(workspace + path.sep) && resolved !== workspace) {
          return this.error(
            `Path is outside the workspace root: ${resolved}\nWorkspace: ${workspace}`,
          );
        }
      }

      // Ensure parent directory exists
      await fs.mkdir(path.dirname(resolved), { recursive: true });

      if (append) {
        await fs.appendFile(resolved, content, 'utf-8');
      } else {
        await fs.writeFile(resolved, content, 'utf-8');
      }

      const stat = await fs.stat(resolved);
      return this.success({
        path: resolved,
        mode: append ? 'append' : 'write',
        bytesWritten: Buffer.byteLength(content, 'utf-8'),
        totalSize: stat.size,
      });
    } catch (err) {
      return this.error(
        `Failed to write file: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
