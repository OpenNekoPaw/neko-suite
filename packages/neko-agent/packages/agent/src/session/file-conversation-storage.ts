/**
 * FileConversationStorage - File-based persistence for conversation records.
 *
 * Stores all conversations for a given workDir in a single JSON file at:
 *   ~/.neko/conversations/<workDir-hash>.json
 *
 * Mirrors the FileTaskStorage pattern: lazy initialization, debounced writes,
 * in-memory cache for fast reads.
 */

import type { ConversationRecord, ConversationIndex } from './conversation-record';
import { getLogger } from '../utils/logger';

const logger = getLogger('FileConversationStorage');

/** Maximum number of conversations retained per workDir (oldest pruned first) */
const MAX_RECORDS = 100;

/** Debounce interval for writes in ms */
const SAVE_DEBOUNCE_MS = 1000;

export interface FileConversationStorageOptions {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
  filePath: string;
}

/**
 * Persistent conversation storage backed by a JSON file.
 */
export class FileConversationStorage {
  private cache: Map<string, ConversationRecord> = new Map();
  private readonly options: FileConversationStorageOptions;
  private initialized = false;
  private dirty = false;
  private saveTimer?: ReturnType<typeof setTimeout>;

  constructor(options: FileConversationStorageOptions) {
    this.options = options;
  }

  async save(record: ConversationRecord): Promise<void> {
    await this.ensureInitialized();
    this.cache.set(record.id, { ...record });
    this.pruneIfNeeded();
    this.scheduleSave();
  }

  async load(id: string): Promise<ConversationRecord | undefined> {
    await this.ensureInitialized();
    const record = this.cache.get(id);
    return record ? { ...record } : undefined;
  }

  /** Returns all records sorted by updatedAt descending (newest first) */
  async list(): Promise<ConversationRecord[]> {
    await this.ensureInitialized();
    return Array.from(this.cache.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async delete(id: string): Promise<void> {
    await this.ensureInitialized();
    if (this.cache.delete(id)) {
      this.scheduleSave();
    }
  }

  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
    }
    if (!this.dirty && this.initialized) return;
    const index: ConversationIndex = {
      records: Array.from(this.cache.values()),
    };
    await this.options.writeFile(this.options.filePath, JSON.stringify(index, null, 2));
    this.dirty = false;
  }

  async dispose(): Promise<void> {
    await this.flush();
  }

  private pruneIfNeeded(): void {
    if (this.cache.size <= MAX_RECORDS) return;
    // Remove oldest records until within limit
    const sorted = Array.from(this.cache.values()).sort((a, b) => a.updatedAt - b.updatedAt);
    const toRemove = sorted.slice(0, this.cache.size - MAX_RECORDS);
    for (const r of toRemove) {
      this.cache.delete(r.id);
    }
  }

  private scheduleSave(): void {
    this.dirty = true;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      this.flush().catch((error) => {
        logger.error('Failed to save conversation storage file', { error });
      });
    }, SAVE_DEBOUNCE_MS);
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    try {
      const fileExists = await this.options.exists(this.options.filePath);
      if (fileExists) {
        const content = await this.options.readFile(this.options.filePath);
        const index = JSON.parse(content) as ConversationIndex;
        for (const record of index.records ?? []) {
          this.cache.set(record.id, record);
        }
      }
    } catch (error) {
      logger.warn('Failed to load conversation storage file', { error });
    }
    this.initialized = true;
  }
}

/**
 * Compute a short stable hash for a workDir path, used as the filename component.
 */
function hashWorkDir(workDir: string): string {
  // Lazy require to avoid issues in non-Node environments
  const crypto = require('crypto') as typeof import('crypto');
  return crypto.createHash('sha1').update(workDir).digest('hex').slice(0, 8);
}

/**
 * Create a FileConversationStorage for the given workDir.
 * File path: ~/.neko/conversations/<workDir-hash>.json
 */
export function createFileConversationStorage(workDir: string): FileConversationStorage {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const os = require('os') as typeof import('os');

  const hash = hashWorkDir(workDir);
  const filePath = path.join(os.homedir(), '.neko', 'conversations', `${hash}.json`);

  return new FileConversationStorage({
    filePath,
    readFile: (p) => fs.promises.readFile(p, 'utf-8'),
    writeFile: async (p, content) => {
      await fs.promises.mkdir(path.dirname(p), { recursive: true });
      await fs.promises.writeFile(p, content, 'utf-8');
    },
    exists: async (p) => {
      try {
        await fs.promises.access(p);
        return true;
      } catch {
        return false;
      }
    },
  });
}
