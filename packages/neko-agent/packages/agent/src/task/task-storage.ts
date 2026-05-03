/**
 * Task Storage - Persistence layer for tasks
 */

import type { ITaskStorage, SerializableTask } from '@neko/shared';
import { getLogger } from '../utils/logger';
import { buildTaskStorageCleanupPlan, filterRecoverableTasks } from './task-storage-policy';

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
    return filterRecoverableTasks(Array.from(this.tasks.values()));
  }

  async loadAll(): Promise<SerializableTask[]> {
    return Array.from(this.tasks.values()).map((t) => ({ ...t }));
  }

  async delete(id: string): Promise<void> {
    this.tasks.delete(id);
  }

  async cleanup(olderThanMs: number): Promise<number> {
    const plan = buildTaskStorageCleanupPlan({
      tasks: Array.from(this.tasks.values()),
      olderThanMs,
    });

    for (const task of plan.removed) {
      this.tasks.delete(task.id);
    }

    return plan.removed.length;
  }
}

export interface StateTaskStorageAdapter {
  load(key: string): readonly SerializableTask[] | PromiseLike<readonly SerializableTask[]>;
  save(key: string, tasks: readonly SerializableTask[]): void | PromiseLike<void>;
}

export interface StateTaskStorageOptions {
  storageKey: string;
  adapter: StateTaskStorageAdapter;
}

export class StateTaskStorage implements ITaskStorage {
  constructor(private readonly options: StateTaskStorageOptions) {}

  async save(task: SerializableTask): Promise<void> {
    const tasks = await this.loadAll();
    const index = tasks.findIndex((item) => item.id === task.id);
    if (index >= 0) {
      tasks[index] = { ...task };
    } else {
      tasks.push({ ...task });
    }
    await this.writeAll(tasks);
  }

  async load(id: string): Promise<SerializableTask | undefined> {
    const tasks = await this.loadAll();
    const task = tasks.find((item) => item.id === id);
    return task ? { ...task } : undefined;
  }

  async loadPending(): Promise<SerializableTask[]> {
    return filterRecoverableTasks(await this.loadAll());
  }

  async loadAll(): Promise<SerializableTask[]> {
    const tasks = await this.options.adapter.load(this.options.storageKey);
    return tasks.map((task) => ({ ...task }));
  }

  async delete(id: string): Promise<void> {
    const tasks = await this.loadAll();
    await this.writeAll(tasks.filter((task) => task.id !== id));
  }

  async cleanup(olderThanMs: number): Promise<number> {
    const plan = buildTaskStorageCleanupPlan({
      tasks: await this.loadAll(),
      olderThanMs,
    });
    await this.writeAll(plan.retained);
    return plan.removed.length;
  }

  private async writeAll(tasks: readonly SerializableTask[]): Promise<void> {
    await this.options.adapter.save(
      this.options.storageKey,
      tasks.map((task) => ({ ...task })),
    );
  }
}

export function createStateTaskStorage(options: StateTaskStorageOptions): StateTaskStorage {
  return new StateTaskStorage(options);
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
    return filterRecoverableTasks(Array.from(this.cache.values()));
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
    const plan = buildTaskStorageCleanupPlan({
      tasks: Array.from(this.cache.values()),
      olderThanMs,
    });

    for (const task of plan.removed) {
      this.cache.delete(task.id);
    }

    if (plan.removed.length > 0) {
      this.scheduleSave();
    }
    return plan.removed.length;
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
