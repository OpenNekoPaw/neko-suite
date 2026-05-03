/**
 * ListDirectory Tool - List directory contents
 *
 * Returns file names, types, and sizes. Supports recursive listing.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ToolResult, ToolCategory, ToolParameters } from '@neko/shared';
import { BuiltinTool } from '@neko/shared';

const MAX_DEPTH = 3;
const MAX_ENTRIES = 500;

interface DirEntry {
  name: string;
  type: 'file' | 'directory' | 'symlink' | 'other';
  size?: number;
}

export class ListDirectoryTool extends BuiltinTool {
  readonly name = 'ListDirectory';
  readonly description = 'List contents of a directory. Returns file names, types, and sizes.';
  readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the directory',
      },
      recursive: {
        type: 'boolean',
        description: 'List recursively (max depth 3). Default false.',
      },
    },
    required: ['path'],
  };
  readonly category: ToolCategory = 'file';
  override readonly isConcurrencySafe = true;
  override readonly isReadOnly = true;

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error ?? 'Invalid arguments');
    }

    const dirPath = args.path as string;
    const recursive = (args.recursive as boolean | undefined) ?? false;

    try {
      const resolved = path.resolve(dirPath);
      const entries = await this.listDir(resolved, recursive ? MAX_DEPTH : 0, '');

      const truncated = entries.length > MAX_ENTRIES;
      const shown = truncated ? entries.slice(0, MAX_ENTRIES) : entries;

      // Format as text
      const lines = shown.map((e) => {
        const prefix = e.type === 'directory' ? '[DIR] ' : '      ';
        const size = e.size !== undefined ? ` (${formatSize(e.size)})` : '';
        return `${prefix}${e.name}${size}`;
      });

      return this.success({
        content: lines.join('\n'),
        totalEntries: entries.length,
        truncated,
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return this.error(`Directory not found: ${dirPath}`);
      }
      if ((err as NodeJS.ErrnoException).code === 'ENOTDIR') {
        return this.error(`Path is not a directory: ${dirPath}`);
      }
      return this.error(
        `Failed to list directory: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async listDir(dirPath: string, depth: number, prefix: string): Promise<DirEntry[]> {
    const dirents = await fs.readdir(dirPath, { withFileTypes: true });
    const results: DirEntry[] = [];

    for (const dirent of dirents) {
      // Skip hidden files at top level
      if (dirent.name.startsWith('.') && prefix === '') continue;

      const fullPath = path.join(dirPath, dirent.name);
      const displayName = prefix ? `${prefix}/${dirent.name}` : dirent.name;

      if (dirent.isDirectory()) {
        results.push({ name: displayName, type: 'directory' });
        if (depth > 0 && results.length < MAX_ENTRIES) {
          const children = await this.listDir(fullPath, depth - 1, displayName);
          results.push(...children);
        }
      } else if (dirent.isSymbolicLink()) {
        results.push({ name: displayName, type: 'symlink' });
      } else if (dirent.isFile()) {
        try {
          const stat = await fs.stat(fullPath);
          results.push({ name: displayName, type: 'file', size: stat.size });
        } catch {
          results.push({ name: displayName, type: 'file' });
        }
      } else {
        results.push({ name: displayName, type: 'other' });
      }

      if (results.length >= MAX_ENTRIES) break;
    }

    return results;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
