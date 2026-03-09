/**
 * Task Recovery Storage - Lightweight persistence for external task recovery
 *
 * Only stores essential info needed to resume polling after restart.
 * Does NOT store full task state - that's handled by external platforms.
 */

import type { ITaskRecoveryStorage, TaskRecoveryInfo } from '@neko/shared';
import { getLogger } from '../utils/logger';

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
}

/**
 * File-based recovery storage
 * Persists recovery info to a JSON file for restart recovery
 */
export class FileTaskRecoveryStorage implements ITaskRecoveryStorage {
  private cache: Map<string, TaskRecoveryInfo> = new Map();
  private options: FileTaskRecoveryStorageOptions;
  private initialized = false;
  private dirty = false;
  private saveTimer?: ReturnType<typeof setTimeout>;

  constructor(options: FileTaskRecoveryStorageOptions) {
    this.options = options;
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

    const data = Array.from(this.cache.values());
    const content = JSON.stringify(data, null, 2);
    await this.options.writeFile(this.options.filePath, content);
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
        const data = JSON.parse(content) as TaskRecoveryInfo[];
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
