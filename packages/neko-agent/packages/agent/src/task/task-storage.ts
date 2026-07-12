/**
 * Task Storage - Persistence layer for tasks
 */

import {
  formatTaskRunScope,
  type ITaskStorage,
  type SerializableTask,
  type TaskRunScope,
} from '@neko/shared';
import * as nodeFs from 'node:fs';
import * as nodePath from 'node:path';
import { getLogger } from '../utils/logger';
import { requirePersistedTaskRunScope } from '../runtime/persisted-child-run-ownership';
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
    this.tasks.set(formatTaskRunScope(task.scope), { ...task });
  }

  async load(scope: TaskRunScope): Promise<SerializableTask | undefined> {
    const task = this.tasks.get(formatTaskRunScope(scope));
    return task ? { ...task } : undefined;
  }

  async loadPending(): Promise<SerializableTask[]> {
    return filterRecoverableTasks(Array.from(this.tasks.values()));
  }

  async loadAll(): Promise<SerializableTask[]> {
    return Array.from(this.tasks.values()).map((t) => ({ ...t }));
  }

  async delete(scope: TaskRunScope): Promise<void> {
    this.tasks.delete(formatTaskRunScope(scope));
  }

  async cleanup(olderThanMs: number): Promise<number> {
    const plan = buildTaskStorageCleanupPlan({
      tasks: Array.from(this.tasks.values()),
      olderThanMs,
    });

    for (const task of plan.removed) {
      this.tasks.delete(formatTaskRunScope(task.scope));
    }

    return plan.removed.length;
  }
}

export interface StateTaskStorageAdapter {
  load(key: string): unknown | PromiseLike<unknown>;
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
    const key = formatTaskRunScope(task.scope);
    const index = tasks.findIndex((item) => formatTaskRunScope(item.scope) === key);
    if (index >= 0) {
      tasks[index] = { ...task };
    } else {
      tasks.push({ ...task });
    }
    await this.writeAll(tasks);
  }

  async load(scope: TaskRunScope): Promise<SerializableTask | undefined> {
    const tasks = await this.loadAll();
    const key = formatTaskRunScope(scope);
    const task = tasks.find((item) => formatTaskRunScope(item.scope) === key);
    return task ? { ...task } : undefined;
  }

  async loadPending(): Promise<SerializableTask[]> {
    return filterRecoverableTasks(await this.loadAll());
  }

  async loadAll(): Promise<SerializableTask[]> {
    const value = await this.options.adapter.load(this.options.storageKey);
    return parsePersistedTaskArray(value, `state:${this.options.storageKey}`).map((task) => ({
      ...task,
    }));
  }

  async delete(scope: TaskRunScope): Promise<void> {
    const key = formatTaskRunScope(scope);
    const tasks = await this.loadAll();
    await this.writeAll(tasks.filter((task) => formatTaskRunScope(task.scope) !== key));
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

  async load(scope: TaskRunScope): Promise<SerializableTask | undefined> {
    return this.storage.load(scope);
  }

  async loadRecord(scope: TaskRunScope): Promise<WorkspaceVisibleAgentTaskRecord | undefined> {
    const task = await this.load(scope);
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

  async delete(scope: TaskRunScope): Promise<void> {
    await this.storage.delete(scope);
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
    this.cache.set(formatTaskRunScope(task.scope), { ...task });
    this.scheduleSave();
  }

  async load(scope: TaskRunScope): Promise<SerializableTask | undefined> {
    await this.ensureInitialized();
    const task = this.cache.get(formatTaskRunScope(scope));
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

  async delete(scope: TaskRunScope): Promise<void> {
    await this.ensureInitialized();
    this.cache.delete(formatTaskRunScope(scope));
    this.scheduleSave();
  }

  async cleanup(olderThanMs: number): Promise<number> {
    await this.ensureInitialized();
    const plan = buildTaskStorageCleanupPlan({
      tasks: Array.from(this.cache.values()),
      olderThanMs,
    });

    for (const task of plan.removed) {
      this.cache.delete(formatTaskRunScope(task.scope));
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
        const { tasks, revision } = parseFileTaskStorageContent(
          content,
          `file:${this.options.filePath}`,
        );
        this.loadedRevision = revision;
        for (const task of tasks) {
          this.cache.set(formatTaskRunScope(task.scope), task);
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

function parseFileTaskStorageContent(
  content: string,
  source: string,
): {
  readonly tasks: readonly SerializableTask[];
  readonly revision: number;
} {
  const parsed = JSON.parse(content) as unknown;
  if (Array.isArray(parsed)) {
    return { tasks: parsePersistedTaskArray(parsed, source), revision: 0 };
  }
  if (isRecord(parsed) && Array.isArray(parsed['tasks'])) {
    return {
      tasks: parsePersistedTaskArray(parsed['tasks'], source),
      revision: parseJsonFileWriteMetadata(parsed)?.revision ?? 0,
    };
  }
  throw new Error('Task storage file does not contain a task array');
}

function parsePersistedTaskArray(value: unknown, source: string): SerializableTask[] {
  if (!Array.isArray(value)) {
    throw new Error(`${source} does not contain a task array`);
  }
  return value.map((item, recordIndex) => parsePersistedTask(item, source, recordIndex));
}

function parsePersistedTask(value: unknown, source: string, recordIndex: number): SerializableTask {
  const localId = isRecord(value) && typeof value['id'] === 'string' ? value['id'] : undefined;
  const scope = requirePersistedTaskRunScope({
    value: isRecord(value) ? value['scope'] : undefined,
    recordKind: 'task',
    source,
    recordIndex,
    ...(localId ? { localId } : {}),
  });
  if (!isSerializableTask(value)) {
    throw new Error(`${source}[${recordIndex}] does not contain a valid serializable task`);
  }
  return { ...value, scope };
}

function isSerializableTask(value: unknown): value is SerializableTask {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['type'] === 'string' &&
    typeof value['status'] === 'string' &&
    isRecord(value['input']) &&
    typeof value['progress'] === 'number' &&
    Number.isFinite(value['progress']) &&
    typeof value['createdAt'] === 'number' &&
    Number.isFinite(value['createdAt']) &&
    typeof value['updatedAt'] === 'number' &&
    Number.isFinite(value['updatedAt'])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Create a file-based task storage with Node.js fs operations
 */
export function createFileTaskStorage(filePath: string): FileTaskStorage {
  return new FileTaskStorage({
    filePath,
    readFile: (p) => nodeFs.promises.readFile(p, 'utf-8'),
    writeFile: async (p, content) => {
      await nodeFs.promises.mkdir(nodePath.dirname(p), { recursive: true });
      await nodeFs.promises.writeFile(p, content, 'utf-8');
    },
    exists: async (p) => {
      try {
        await nodeFs.promises.access(p);
        return true;
      } catch {
        return false;
      }
    },
  });
}

export function getWorkspaceVisibleAgentTaskRecordsFilePath(workspaceRoot: string): string {
  const root = workspaceRoot.trim();
  if (!root) {
    throw new Error('Workspace-visible Agent task records require a workspace root');
  }
  return nodePath.join(root, '.neko', 'tasks.json');
}

export function createFileWorkspaceVisibleAgentTaskStorage(options: {
  readonly workspaceRoot: string;
  readonly filePath?: string;
  readonly writerId?: string;
  readonly now?: () => number;
}): WorkspaceVisibleAgentTaskStorage {
  const filePath =
    options.filePath ?? getWorkspaceVisibleAgentTaskRecordsFilePath(options.workspaceRoot);

  return new WorkspaceVisibleAgentTaskStorage({
    workspaceRoot: options.workspaceRoot,
    filePath,
    readFile: (p) => nodeFs.promises.readFile(p, 'utf-8'),
    writeFile: async (p, content) => {
      await nodeFs.promises.mkdir(nodePath.dirname(p), { recursive: true });
      await nodeFs.promises.writeFile(p, content, 'utf-8');
    },
    exists: async (p) => {
      try {
        await nodeFs.promises.access(p);
        return true;
      } catch {
        return false;
      }
    },
    ...(options.writerId ? { writerId: options.writerId } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
}
