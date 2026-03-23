/**
 * Core Tools Factory
 *
 * Creates the set of core file/system tools (L1 layer).
 * These are always available to the agent alongside meta tools.
 */

import type { Tool, IProjectMemoryManager } from '@neko/shared';
import { ReadTool } from './read-tool';
import { WriteTool } from './write-tool';
import { BashTool, type BashToolOptions } from './bash-tool';
import { ListDirectoryTool } from './list-directory-tool';
import { GrepTool } from './grep-tool';
import { MemoryWriteTool } from './memory-write-tool';

export interface CoreToolsOptions {
  /** Default working directory for Bash/Grep */
  defaultCwd?: string;
  /** Bash command timeout in ms (default 120000) */
  bashTimeout?: number;
  /** Project memory manager — enables MemoryWrite tool when provided */
  projectMemoryManager?: IProjectMemoryManager;
}

/**
 * Create all core file/system tools
 *
 * Returns: Read, Write, Bash, ListDirectory, Grep
 */
export function createCoreTools(options?: CoreToolsOptions): Tool[] {
  const bashOpts: BashToolOptions = {
    defaultCwd: options?.defaultCwd,
    timeout: options?.bashTimeout,
  };

  const tools: Tool[] = [
    new ReadTool(),
    new WriteTool(),
    new BashTool(bashOpts),
    new ListDirectoryTool(),
    new GrepTool({ defaultCwd: options?.defaultCwd }),
  ];

  if (options?.projectMemoryManager) {
    tools.push(new MemoryWriteTool(options.projectMemoryManager));
  }

  return tools;
}
