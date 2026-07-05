/**
 * Task Recovery Storage - Lightweight persistence for external task recovery
 *
 * Only stores essential info needed to resume polling after restart.
 * Does NOT store full task state - that's handled by external platforms.
 */

import type { ITaskRecoveryStorage, TaskRecoveryInfo } from '@neko/shared';
import { isTaskType } from '@neko/shared';
import { getLogger } from '../utils/logger';
import {
  assertJsonFileRevisionCurrent,
  createJsonFileWriteMetadata,
  createJsonFileWriterId,
  parseJsonFileWriteMetadata,
} from '../workspace/json-file-write-guard';

const logger = getLogger('TaskRecoveryStorage');

/**
 * In-memory recovery storage (default implementation)
 * Used when no persistent storage is available
 */
export class MemoryTaskRecoveryStorage implements ITaskRecoveryStorage {
  private infos: Map<string, TaskRecoveryInfo> = new Map();

  async save(info: TaskRecoveryInfo): Promise<void> {
    this.infos.set(info.taskId, { ...info });
  }

  async load(taskId: string): Promise<TaskRecoveryInfo | undefined> {
    const info = this.infos.get(taskId);
    return info ? { ...info } : undefined;
  }

  async loadAll(): Promise<TaskRecoveryInfo[]> {
    return Array.from(this.infos.values()).map((info) => ({ ...info }));
  }

  async delete(taskId: string): Promise<void> {
    this.infos.delete(taskId);
  }

  async clear(): Promise<void> {
    this.infos.clear();
  }
}

export interface StateTaskRecoveryStorageAdapter {
  load(key: string): readonly TaskRecoveryInfo[] | PromiseLike<readonly TaskRecoveryInfo[]>;
  save(key: string, infos: readonly TaskRecoveryInfo[]): void | PromiseLike<void>;
}

export interface StateTaskRecoveryStorageOptions {
  storageKey: string;
  adapter: StateTaskRecoveryStorageAdapter;
}

export class StateTaskRecoveryStorage implements ITaskRecoveryStorage {
  constructor(private readonly options: StateTaskRecoveryStorageOptions) {}

  async save(info: TaskRecoveryInfo): Promise<void> {
    const infos = await this.loadAll();
    const index = infos.findIndex((item) => item.taskId === info.taskId);
    if (index >= 0) {
      infos[index] = { ...info };
    } else {
      infos.push({ ...info });
    }
    await this.writeAll(infos);
  }

  async load(taskId: string): Promise<TaskRecoveryInfo | undefined> {
    const infos = await this.loadAll();
    const info = infos.find((item) => item.taskId === taskId);
    return info ? { ...info } : undefined;
  }

  async loadAll(): Promise<TaskRecoveryInfo[]> {
    try {
      const infos = await this.options.adapter.load(this.options.storageKey);
      const parsed = parseTaskRecoveryInfoArray(infos);
      return parsed ? parsed.map((info) => ({ ...info })) : [];
    } catch (error) {
      logger.warn('Failed to load state recovery storage', { error });
      return [];
    }
  }

  async delete(taskId: string): Promise<void> {
    const infos = await this.loadAll();
    await this.writeAll(infos.filter((info) => info.taskId !== taskId));
  }

  async clear(): Promise<void> {
    await this.writeAll([]);
  }

  async flush(): Promise<void> {
    // State-backed storage writes eagerly through the adapter.
  }

  private async writeAll(infos: readonly TaskRecoveryInfo[]): Promise<void> {
    await this.options.adapter.save(
      this.options.storageKey,
      infos.map((info) => ({ ...info })),
    );
  }
}

export function createStateTaskRecoveryStorage(
  options: StateTaskRecoveryStorageOptions,
): StateTaskRecoveryStorage {
  return new StateTaskRecoveryStorage(options);
}

/**
 * File-based recovery storage options
 */
export interface FileTaskRecoveryStorageOptions {
  /** Read file content */
  readFile: (path: string) => Promise<string>;
  /** Write file content */
  writeFile: (path: string, content: string) => Promise<void>;
  /** Check if file exists */
  exists: (path: string) => Promise<boolean>;
  /** Delete file */
  deleteFile: (path: string) => Promise<void>;
  /** Storage file path */
  filePath: string;
  /** Writer identity used for local stale-write diagnostics. */
  writerId?: string;
  /** Clock injection for write metadata. */
  now?: () => number;
}

/**
 * File-based recovery storage
 * Persists recovery info to a JSON file for restart recovery
 */
export class FileTaskRecoveryStorage implements ITaskRecoveryStorage {
  private cache: Map<string, TaskRecoveryInfo> = new Map();
  private options: FileTaskRecoveryStorageOptions;
  private readonly writerId: string;
  private readonly now: () => number;
  private initialized = false;
  private dirty = false;
  private loadedRevision = 0;
  private saveTimer?: ReturnType<typeof setTimeout>;

  constructor(options: FileTaskRecoveryStorageOptions) {
    this.options = options;
    this.writerId = options.writerId ?? createJsonFileWriterId('task-recovery');
    this.now = options.now ?? (() => Date.now());
  }

  async save(info: TaskRecoveryInfo): Promise<void> {
    await this.ensureInitialized();
    this.cache.set(info.taskId, { ...info });
    this.scheduleSave();
  }

  async load(taskId: string): Promise<TaskRecoveryInfo | undefined> {
    await this.ensureInitialized();
    const info = this.cache.get(taskId);
    return info ? { ...info } : undefined;
  }

  async loadAll(): Promise<TaskRecoveryInfo[]> {
    await this.ensureInitialized();
    return Array.from(this.cache.values()).map((info) => ({ ...info }));
  }

  async delete(taskId: string): Promise<void> {
    await this.ensureInitialized();
    this.cache.delete(taskId);
    this.scheduleSave();
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.dirty = true;
    await this.flush();
  }

  /**
   * Force save to disk immediately
   */
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
    const writeMetadata = createJsonFileWriteMetadata(
      this.writerId,
      this.loadedRevision,
      this.now,
    );
    const data = {
      version: 1,
      writeMetadata,
      recovery: Array.from(this.cache.values()),
    };
    const content = JSON.stringify(data, null, 2);
    await this.options.writeFile(this.options.filePath, content);
    this.loadedRevision = writeMetadata.revision;
    this.dirty = false;
  }

  /**
   * Dispose and flush pending changes
   */
  async dispose(): Promise<void> {
    await this.flush();
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      const exists = await this.options.exists(this.options.filePath);
      if (exists) {
        const content = await this.options.readFile(this.options.filePath);
        const parsed = parseTaskRecoveryStorageContent(content);
        this.loadedRevision = parsed.revision;
        const data = parseTaskRecoveryInfoArray(parsed.recovery);
        if (!data) {
          throw new Error('Recovery file does not contain valid task recovery records');
        }
        for (const info of data) {
          this.cache.set(info.taskId, info);
        }
      }
    } catch (error) {
      // If file doesn't exist or is corrupted, start fresh
      logger.warn('Failed to load recovery file', { error });
    }

    this.initialized = true;
  }

  private scheduleSave(): void {
    this.dirty = true;

    // Debounce saves to avoid excessive disk writes
    if (this.saveTimer) {
      return;
    }

    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      this.flush().catch((error) => {
        logger.error('Failed to save recovery file', { error });
      });
    }, 1000); // Save after 1 second of inactivity
  }
}

/**
 * Create a file-based recovery storage with VSCode-compatible file operations
 */
export function createFileRecoveryStorage(
  filePath: string,
  fs: {
    readFile: (path: string) => Promise<string>;
    writeFile: (path: string, content: string) => Promise<void>;
    exists: (path: string) => Promise<boolean>;
    deleteFile: (path: string) => Promise<void>;
  },
): FileTaskRecoveryStorage {
  return new FileTaskRecoveryStorage({
    filePath,
    ...fs,
  });
}

function parseTaskRecoveryInfoArray(value: unknown): TaskRecoveryInfo[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const infos: TaskRecoveryInfo[] = [];
  for (const item of value) {
    const info = parseTaskRecoveryInfo(item);
    if (!info) {
      return null;
    }
    infos.push(info);
  }
  return infos;
}

function parseTaskRecoveryStorageContent(content: string): {
  readonly recovery: unknown;
  readonly revision: number;
} {
  const parsed = JSON.parse(content) as unknown;
  if (Array.isArray(parsed)) {
    return { recovery: parsed, revision: 0 };
  }
  if (isRecord(parsed) && Array.isArray(parsed['recovery'])) {
    return {
      recovery: parsed['recovery'],
      revision: parseJsonFileWriteMetadata(parsed)?.revision ?? 0,
    };
  }
  throw new Error('Recovery file does not contain a recovery array');
}

function parseTaskRecoveryInfo(value: unknown): TaskRecoveryInfo | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.taskId !== 'string' ||
    typeof value.externalTaskId !== 'string' ||
    typeof value.providerId !== 'string' ||
    !isTaskType(value.taskType) ||
    !isRecord(value.payload) ||
    typeof value.createdAt !== 'number' ||
    !Number.isFinite(value.createdAt) ||
    typeof value.updatedAt !== 'number' ||
    !Number.isFinite(value.updatedAt)
  ) {
    return null;
  }
  return {
    taskId: value.taskId,
    externalTaskId: value.externalTaskId,
    providerId: value.providerId,
    taskType: value.taskType,
    payload: { ...value.payload },
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
