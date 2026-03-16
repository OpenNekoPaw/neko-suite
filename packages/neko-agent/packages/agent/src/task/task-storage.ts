/**
 * Task Storage - Persistence layer for tasks
 */

import type { ITaskStorage, SerializableTask } from '@neko/shared';
import { getLogger } from '../utils/logger';

const logger = getLogger('TaskStorage');

/**
 * In-memory task storage (default implementation)
 * Used when no persistent storage is available
 */
export class MemoryTaskStorage implements ITaskStorage {
  private tasks: Map<string, SerializableTask> = new Map();

  async save(task: SerializableTask): Promise<void> {
    this.tasks.set(task.id, { ...task });
  }

  async load(id: string): Promise<SerializableTask | undefined> {
    const task = this.tasks.get(id);
    return task ? { ...task } : undefined;
  }

  async loadPending(): Promise<SerializableTask[]> {
    return Array.from(this.tasks.values())
      .filter((t) => t.status === 'pending' || t.status === 'running')
      .map((t) => ({ ...t }));
  }

  async loadAll(): Promise<SerializableTask[]> {
    return Array.from(this.tasks.values()).map((t) => ({ ...t }));
  }

  async delete(id: string): Promise<void> {
    this.tasks.delete(id);
  }

  async cleanup(olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    let cleaned = 0;

    for (const [id, task] of this.tasks.entries()) {
      // Only cleanup completed, failed, or cancelled tasks
      if (
        (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') &&
        task.updatedAt < cutoff
      ) {
        this.tasks.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }
}

/**
 * File-based task storage options
 */
export interface FileTaskStorageOptions {
  /** Read file content */
  readFile: (path: string) => Promise<string>;
  /** Write file content */
  writeFile: (path: string, content: string) => Promise<void>;
  /** Check if file exists */
  exists: (path: string) => Promise<boolean>;
  /** Storage file path */
  filePath: string;
}

/**
 * File-based task storage for CLI/TUI environments.
 * Persists tasks to a JSON file with debounced writes.
 */
export class FileTaskStorage implements ITaskStorage {
  private cache: Map<string, SerializableTask> = new Map();
  private readonly options: FileTaskStorageOptions;
  private initialized = false;
  private dirty = false;
  private saveTimer?: ReturnType<typeof setTimeout>;

  constructor(options: FileTaskStorageOptions) {
    this.options = options;
  }

  async save(task: SerializableTask): Promise<void> {
    await this.ensureInitialized();
    this.cache.set(task.id, { ...task });
    this.scheduleSave();
  }

  async load(id: string): Promise<SerializableTask | undefined> {
    await this.ensureInitialized();
    const task = this.cache.get(id);
    return task ? { ...task } : undefined;
  }

  async loadPending(): Promise<SerializableTask[]> {
    await this.ensureInitialized();
    return Array.from(this.cache.values())
      .filter((t) => t.status === 'pending' || t.status === 'running')
      .map((t) => ({ ...t }));
  }

  async loadAll(): Promise<SerializableTask[]> {
    await this.ensureInitialized();
    return Array.from(this.cache.values()).map((t) => ({ ...t }));
  }

  async delete(id: string): Promise<void> {
    await this.ensureInitialized();
    this.cache.delete(id);
    this.scheduleSave();
  }

  async cleanup(olderThanMs: number): Promise<number> {
    await this.ensureInitialized();
    const cutoff = Date.now() - olderThanMs;
    let cleaned = 0;

    this.cache.forEach((task, id) => {
      if (
        (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') &&
        task.updatedAt < cutoff
      ) {
        this.cache.delete(id);
        cleaned++;
      }
    });

    if (cleaned > 0) {
      this.scheduleSave();
    }
    return cleaned;
  }

  /** Force save to disk immediately */
  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
    }
    if (!this.dirty && this.initialized) {
      return;
    }
    const data = Array.from(this.cache.values());
    await this.options.writeFile(this.options.filePath, JSON.stringify(data, null, 2));
    this.dirty = false;
  }

  /** Dispose and flush pending changes */
  async dispose(): Promise<void> {
    await this.flush();
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }
    try {
      const fileExists = await this.options.exists(this.options.filePath);
      if (fileExists) {
        const content = await this.options.readFile(this.options.filePath);
        const data = JSON.parse(content) as SerializableTask[];
        for (const task of data) {
          this.cache.set(task.id, task);
        }
      }
    } catch (error) {
      logger.warn('Failed to load task storage file', { error });
    }
    this.initialized = true;
  }

  private scheduleSave(): void {
    this.dirty = true;
    if (this.saveTimer) {
      return;
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      this.flush().catch((error) => {
        logger.error('Failed to save task storage file', { error });
      });
    }, 1000);
  }
}

/**
 * Create a file-based task storage with Node.js fs operations
 */
export function createFileTaskStorage(filePath: string): FileTaskStorage {
  // Lazy import to avoid issues in non-Node environments
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');

  return new FileTaskStorage({
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
