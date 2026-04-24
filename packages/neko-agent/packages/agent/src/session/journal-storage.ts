/**
 * JournalStorage — JSONL journal file management
 *
 * Manages the journal directory, creates writers/readers,
 * and handles cleanup of expired journals.
 */

import { JournalWriter } from './journal-writer';
import type { JournalFsOps } from './journal-writer';
import { JournalReader } from './journal-reader';
import type { JournalReaderFsOps } from './journal-reader';
import * as path from 'path';

// =============================================================================
// Types
// =============================================================================

/** Combined file system operations for JournalStorage */
export interface JournalStorageFsOps extends JournalFsOps, JournalReaderFsOps {
  readdir: (path: string) => Promise<string[]>;
  stat: (path: string) => Promise<{ mtimeMs: number }>;
  unlink: (path: string) => Promise<void>;
}

// =============================================================================
// JournalStorage
// =============================================================================

export class JournalStorage {
  constructor(
    private readonly _baseDir: string,
    private readonly _fsOps: JournalStorageFsOps,
  ) {}

  /** Get journal file path for a conversation */
  getJournalPath(conversationId: string): string {
    return path.join(this._baseDir, `${conversationId}.jsonl`);
  }

  /** Get sidechain journal path for a SubAgent */
  getSubAgentJournalPath(conversationId: string, subAgentId: string): string {
    return path.join(this._baseDir, `${conversationId}_sub_${subAgentId}.jsonl`);
  }

  /** List all conversation IDs with journals */
  async listJournals(): Promise<string[]> {
    try {
      const files = await this._fsOps.readdir(this._baseDir);
      return files
        .filter((f) => f.endsWith('.jsonl') && !f.includes('_sub_'))
        .map((f) => f.replace('.jsonl', ''));
    } catch {
      return [];
    }
  }

  /** Delete a journal and its sidechains */
  async deleteJournal(conversationId: string): Promise<void> {
    try {
      const files = await this._fsOps.readdir(this._baseDir);
      const toDelete = files.filter(
        (f) => f === `${conversationId}.jsonl` || f.startsWith(`${conversationId}_sub_`),
      );
      for (const f of toDelete) {
        await this._fsOps.unlink(path.join(this._baseDir, f));
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  /** Clean up journals older than given duration. Returns number deleted. */
  async cleanup(olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    let deleted = 0;

    try {
      const files = await this._fsOps.readdir(this._baseDir);
      for (const f of files) {
        if (!f.endsWith('.jsonl')) continue;
        const fullPath = path.join(this._baseDir, f);
        const stat = await this._fsOps.stat(fullPath);
        if (stat.mtimeMs < cutoff) {
          await this._fsOps.unlink(fullPath);
          deleted++;
        }
      }
    } catch {
      // Ignore cleanup errors
    }

    return deleted;
  }

  /** Create a JournalWriter for a conversation */
  createWriter(conversationId: string): JournalWriter {
    return new JournalWriter({
      filePath: this.getJournalPath(conversationId),
      fsOps: this._fsOps,
    });
  }

  /** Create a JournalReader for a conversation */
  createReader(conversationId: string): JournalReader {
    return new JournalReader({
      filePath: this.getJournalPath(conversationId),
      fsOps: this._fsOps,
    });
  }
}

// =============================================================================
// Factory
// =============================================================================

/** Create a JournalStorage with default base directory */
export function createJournalStorage(fsOps: JournalStorageFsOps, baseDir?: string): JournalStorage {
  const dir = baseDir ?? path.join(process.env['HOME'] ?? '~', '.neko', 'journals');
  return new JournalStorage(dir, fsOps);
}

/**
 * Create a JournalStorage backed by Node.js fs/promises.
 */
export function createNodeJournalStorage(baseDir?: string): JournalStorage {
  const fs = require('node:fs/promises') as typeof import('node:fs/promises');
  return createJournalStorage(
    {
      appendFile: (p, data) => fs.appendFile(p, data),
      mkdir: (p, opts) => fs.mkdir(p, opts).then(() => undefined),
      readFile: (p) => fs.readFile(p, 'utf-8'),
      exists: async (p) => {
        try {
          await fs.access(p);
          return true;
        } catch {
          return false;
        }
      },
      readdir: (p) => fs.readdir(p),
      stat: (p) => fs.stat(p),
      unlink: (p) => fs.unlink(p),
    },
    baseDir,
  );
}
