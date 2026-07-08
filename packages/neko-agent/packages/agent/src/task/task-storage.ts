/**
 * Task Storage - Persistence layer for tasks
 */

import type { ITaskStorage, SerializableTask } from '@neko/shared';
import { getLogger } from '../utils/logger';
import {
  buildTaskStorageCleanupPlan,
  createWorkspaceVisibleAgentTaskRecord,
  filterRecoverableTasks,
  type WorkspaceVisibleAgentTaskRecord,
} from './task-storage-policy';
import {
  assertJsonFileRevisionCurrent,
  createJsonFileWriteMetadata,
  createJsonFileWriterId,
  parseJsonFileWriteMetadata,
} from '../workspace/json-file-write-guard';

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

export interface WorkspaceVisibleAgentTaskStorageOptions extends FileTaskStorageOptions {
  readonly workspaceRoot: string;
}

export class WorkspaceVisibleAgentTaskStorage implements ITaskStorage {
  readonly workspaceRoot: string;
  readonly filePath: string;

  private readonly storage: FileTaskStorage;

  constructor(options: WorkspaceVisibleAgentTaskStorageOptions) {
    const workspaceRoot = options.workspaceRoot.trim();
    if (!workspaceRoot) {
      throw new Error('Workspace-visible Agent task storage requires a workspace root');
    }
    this.workspaceRoot = workspaceRoot;
    this.filePath = options.filePath;
    this.storage = new FileTaskStorage(options);
  }

  async save(task: SerializableTask): Promise<void> {
    await this.storage.save(task);
  }

  async saveRecord(record: WorkspaceVisibleAgentTaskRecord): Promise<void> {
    if (record.workspaceRoot !== this.workspaceRoot) {
      throw new Error('Workspace-visible Agent task record belongs to a different workspace');
    }
    await this.save(record.task);
  }

  async load(id: string): Promise<SerializableTask | undefined> {
    return this.storage.load(id);
  }

  async loadRecord(id: string): Promise<WorkspaceVisibleAgentTaskRecord | undefined> {
    const task = await this.load(id);
    return task
      ? createWorkspaceVisibleAgentTaskRecord({ workspaceRoot: this.workspaceRoot, task })
      : undefined;
  }

  async loadPending(): Promise<SerializableTask[]> {
    return this.storage.loadPending();
  }

  async loadAll(): Promise<SerializableTask[]> {
    return this.storage.loadAll();
  }

  async loadAllRecords(): Promise<WorkspaceVisibleAgentTaskRecord[]> {
    const tasks = await this.loadAll();
    return tasks.map((task) =>
      createWorkspaceVisibleAgentTaskRecord({ workspaceRoot: this.workspaceRoot, task }),
    );
  }

  async delete(id: string): Promise<void> {
    await this.storage.delete(id);
  }

  async cleanup(olderThanMs: number): Promise<number> {
    return this.storage.cleanup(olderThanMs);
  }

  async flush(): Promise<void> {
    await this.storage.flush();
  }

  async dispose(): Promise<void> {
    await this.storage.dispose();
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
  /** Writer identity used for local stale-write diagnostics. */
  writerId?: string;
  /** Clock injection for write metadata. */
  now?: () => number;
}

export class FileTaskStorageLoadError extends Error {
  override name = 'FileTaskStorageLoadError';
  readonly code = 'agent-task-storage-load-failed';
  readonly filePath: string;
  override readonly cause: unknown;

  constructor(filePath: string, cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause);
    super(`Failed to load Agent task storage file: ${filePath}: ${message}`);
    this.filePath = filePath;
    this.cause = cause;
  }
}

/**
 * File-based task storage for CLI/TUI environments.
 * Persists tasks to a JSON file with debounced writes.
 */
export class FileTaskStorage implements ITaskStorage {
  private cache: Map<string, SerializableTask> = new Map();
  private readonly options: FileTaskStorageOptions;
  private readonly writerId: string;
  private readonly now: () => number;
  private initialized = false;
  private dirty = false;
  private loadedRevision = 0;
  private saveTimer?: ReturnType<typeof setTimeout>;

  constructor(options: FileTaskStorageOptions) {
    this.options = options;
    this.writerId = options.writerId ?? createJsonFileWriterId('task-storage');
    this.now = options.now ?? (() => Date.now());
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
    await assertJsonFileRevisionCurrent({
      filePath: this.options.filePath,
      ownerId: this.writerId,
      loadedRevision: this.loadedRevision,
      fsOps: this.options,
    });
    const writeMetadata = createJsonFileWriteMetadata(this.writerId, this.loadedRevision, this.now);
    const data = {
      version: 1,
      writeMetadata,
      tasks: Array.from(this.cache.values()),
    };
    await this.options.writeFile(this.options.filePath, JSON.stringify(data, null, 2));
    this.loadedRevision = writeMetadata.revision;
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
        const { tasks, revision } = parseFileTaskStorageContent(content);
        this.loadedRevision = revision;
        for (const task of tasks) {
          this.cache.set(task.id, task);
        }
      }
    } catch (error) {
      throw new FileTaskStorageLoadError(this.options.filePath, error);
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

function parseFileTaskStorageContent(content: string): {
  readonly tasks: readonly SerializableTask[];
  readonly revision: number;
} {
  const parsed = JSON.parse(content) as unknown;
  if (Array.isArray(parsed)) {
    return { tasks: parsed as SerializableTask[], revision: 0 };
  }
  if (isRecord(parsed) && Array.isArray(parsed['tasks'])) {
    return {
      tasks: parsed['tasks'] as SerializableTask[],
      revision: parseJsonFileWriteMetadata(parsed)?.revision ?? 0,
    };
  }
  throw new Error('Task storage file does not contain a task array');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

export function getWorkspaceVisibleAgentTaskRecordsFilePath(workspaceRoot: string): string {
  const path = require('path') as typeof import('path');
  const root = workspaceRoot.trim();
  if (!root) {
    throw new Error('Workspace-visible Agent task records require a workspace root');
  }
  return path.join(root, '.neko', 'tasks.json');
}

export function createFileWorkspaceVisibleAgentTaskStorage(options: {
  readonly workspaceRoot: string;
  readonly filePath?: string;
  readonly writerId?: string;
  readonly now?: () => number;
}): WorkspaceVisibleAgentTaskStorage {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const filePath =
    options.filePath ?? getWorkspaceVisibleAgentTaskRecordsFilePath(options.workspaceRoot);

  return new WorkspaceVisibleAgentTaskStorage({
    workspaceRoot: options.workspaceRoot,
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
    ...(options.writerId ? { writerId: options.writerId } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
}
