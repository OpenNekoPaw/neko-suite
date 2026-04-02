/**
 * Global Memory Manager — Cross-project persistence
 *
 * Reuses FileProjectMemoryManager with `~/.neko/global-memory.md` path.
 * Provides cross-project fact storage (e.g. user preferences, tool configs).
 */

import * as nodePath from 'node:path';
import * as nodeOs from 'node:os';
import type { ProjectMemoryFileOps } from '@neko/shared';
import { FileProjectMemoryManager } from './project-memory-manager';

/**
 * Default global memory file path: `~/.neko/global-memory.md`
 */
export const DEFAULT_GLOBAL_MEMORY_PATH = nodePath.join(
  nodeOs.homedir(),
  '.neko',
  'global-memory.md',
);

/**
 * Create a global memory manager backed by `~/.neko/global-memory.md`.
 *
 * Reuses FileProjectMemoryManager — only the storage path differs.
 * Accepts optional fsOps for testability; falls back to Node.js fs.
 *
 * @param fsOps File operations (optional, uses Node.js fs by default)
 * @param homeDir Override home directory (for testing)
 */
export function createGlobalMemoryManager(
  fsOps?: ProjectMemoryFileOps,
  homeDir?: string,
): FileProjectMemoryManager {
  const filePath = homeDir
    ? nodePath.join(homeDir, '.neko', 'global-memory.md')
    : DEFAULT_GLOBAL_MEMORY_PATH;

  if (fsOps) {
    return new FileProjectMemoryManager(filePath, fsOps);
  }

  // Lazy import fs — same pattern as createFileProjectMemoryManager
  const fs = require('node:fs/promises') as typeof import('node:fs/promises');
  const defaultOps: ProjectMemoryFileOps = {
    readFile: (p) => fs.readFile(p, 'utf-8'),
    writeFile: (p, content) => fs.writeFile(p, content, 'utf-8'),
    exists: async (p) => {
      try {
        await fs.access(p);
        return true;
      } catch {
        return false;
      }
    },
    mkdir: (p) => fs.mkdir(p, { recursive: true }).then(() => undefined),
  };

  return new FileProjectMemoryManager(filePath, defaultOps);
}
