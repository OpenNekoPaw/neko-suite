/**
 * Task Recovery Storage Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MemoryTaskRecoveryStorage,
  FileTaskRecoveryStorage,
  createFileRecoveryStorage,
} from '../task-recovery-storage';
import type { TaskRecoveryInfo } from '@neko/shared';

describe('MemoryTaskRecoveryStorage', () => {
  let storage: MemoryTaskRecoveryStorage;

  const createInfo = (overrides: Partial<TaskRecoveryInfo> = {}): TaskRecoveryInfo => ({
    taskId: `task_${Date.now()}_1`,
    externalTaskId: 'ext_123',
    providerId: 'runway',
    taskType: 'video_generation',
    payload: { prompt: 'test' },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  });

  beforeEach(() => {
    storage = new MemoryTaskRecoveryStorage();
  });

  describe('save and load', () => {
    it('should save and load recovery info', async () => {
      const info = createInfo({ taskId: 'task_1' });
      await storage.save(info);

      const loaded = await storage.load('task_1');
      expect(loaded).toEqual(info);
    });

    it('should return undefined for non-existent info', async () => {
      const loaded = await storage.load('non-existent');
      expect(loaded).toBeUndefined();
    });

    it('should update existing info', async () => {
      const info = createInfo({ taskId: 'task_1' });
      await storage.save(info);

      const updated = { ...info, updatedAt: Date.now() + 1000 };
      await storage.save(updated);

      const loaded = await storage.load('task_1');
      expect(loaded?.updatedAt).toBe(updated.updatedAt);
    });

    it('should return a copy, not the original reference', async () => {
      const info = createInfo({ taskId: 'task_1' });
      await storage.save(info);

      const loaded = await storage.load('task_1');
      loaded!.externalTaskId = 'modified';

      const reloaded = await storage.load('task_1');
      expect(reloaded?.externalTaskId).toBe('ext_123');
    });
  });

  describe('loadAll', () => {
    it('should load all recovery infos', async () => {
      await storage.save(createInfo({ taskId: 'task_1' }));
      await storage.save(createInfo({ taskId: 'task_2' }));
      await storage.save(createInfo({ taskId: 'task_3' }));

      const all = await storage.loadAll();
      expect(all.length).toBe(3);
    });

    it('should return empty array when no infos', async () => {
      const all = await storage.loadAll();
      expect(all).toEqual([]);
    });

    it('should return copies of all infos', async () => {
      await storage.save(createInfo({ taskId: 'task_1' }));

      const all = await storage.loadAll();
      all[0].externalTaskId = 'modified';

      const reloaded = await storage.loadAll();
      expect(reloaded[0].externalTaskId).toBe('ext_123');
    });
  });

  describe('delete', () => {
    it('should delete recovery info', async () => {
      await storage.save(createInfo({ taskId: 'task_1' }));
      await storage.delete('task_1');

      const loaded = await storage.load('task_1');
      expect(loaded).toBeUndefined();
    });

    it('should not throw when deleting non-existent info', async () => {
      await expect(storage.delete('non-existent')).resolves.toBeUndefined();
    });
  });

  describe('clear', () => {
    it('should clear all recovery infos', async () => {
      await storage.save(createInfo({ taskId: 'task_1' }));
      await storage.save(createInfo({ taskId: 'task_2' }));
      await storage.clear();

      const all = await storage.loadAll();
      expect(all).toEqual([]);
    });
  });
});

describe('FileTaskRecoveryStorage', () => {
  let storage: FileTaskRecoveryStorage;
  let fileContent: string;
  let fileExists: boolean;

  const mockFs = {
    readFile: vi.fn(async () => fileContent),
    writeFile: vi.fn(async (_path: string, content: string) => {
      fileContent = content;
      fileExists = true;
    }),
    exists: vi.fn(async () => fileExists),
    deleteFile: vi.fn(async () => {
      fileContent = '';
      fileExists = false;
    }),
  };

  const createInfo = (overrides: Partial<TaskRecoveryInfo> = {}): TaskRecoveryInfo => ({
    taskId: `task_${Date.now()}_1`,
    externalTaskId: 'ext_123',
    providerId: 'runway',
    taskType: 'video_generation',
    payload: { prompt: 'test' },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  });

  beforeEach(() => {
    vi.useFakeTimers();
    fileContent = '[]';
    fileExists = false;
    vi.clearAllMocks();

    storage = createFileRecoveryStorage('/test/recovery.json', mockFs);
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should load existing file on first access', async () => {
      fileExists = true;
      fileContent = JSON.stringify([createInfo({ taskId: 'existing' })]);

      const loaded = await storage.load('existing');
      expect(loaded?.taskId).toBe('existing');
      expect(mockFs.readFile).toHaveBeenCalledWith('/test/recovery.json');
    });

    it('should handle missing file gracefully', async () => {
      fileExists = false;

      const all = await storage.loadAll();
      expect(all).toEqual([]);
    });

    it('should handle corrupted file gracefully', async () => {
      fileExists = true;
      fileContent = 'not valid json';

      const all = await storage.loadAll();
      expect(all).toEqual([]);
    });
  });

  describe('save and load', () => {
    it('should save and load recovery info', async () => {
      const info = createInfo({ taskId: 'task_1' });
      await storage.save(info);

      const loaded = await storage.load('task_1');
      expect(loaded).toEqual(info);
    });

    it('should schedule file write after save', async () => {
      await storage.save(createInfo({ taskId: 'task_1' }));

      expect(mockFs.writeFile).not.toHaveBeenCalled();

      // Advance timer to trigger debounced save
      await vi.advanceTimersByTimeAsync(1000);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/test/recovery.json',
        expect.any(String)
      );
    });

    it('should debounce multiple saves', async () => {
      await storage.save(createInfo({ taskId: 'task_1' }));
      await storage.save(createInfo({ taskId: 'task_2' }));
      await storage.save(createInfo({ taskId: 'task_3' }));

      await vi.advanceTimersByTimeAsync(1000);

      expect(mockFs.writeFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('flush', () => {
    it('should immediately write to file', async () => {
      await storage.save(createInfo({ taskId: 'task_1' }));
      await storage.flush();

      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should cancel pending debounced save', async () => {
      await storage.save(createInfo({ taskId: 'task_1' }));
      await storage.flush();

      // Clear mock to check no more calls
      mockFs.writeFile.mockClear();

      // Advance past debounce timer
      await vi.advanceTimersByTimeAsync(2000);

      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should delete recovery info and schedule save', async () => {
      await storage.save(createInfo({ taskId: 'task_1' }));
      await vi.advanceTimersByTimeAsync(1000);
      mockFs.writeFile.mockClear();

      await storage.delete('task_1');
      await vi.advanceTimersByTimeAsync(1000);

      const loaded = await storage.load('task_1');
      expect(loaded).toBeUndefined();
      expect(mockFs.writeFile).toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('should clear all and immediately write', async () => {
      await storage.save(createInfo({ taskId: 'task_1' }));
      await vi.advanceTimersByTimeAsync(1000);
      mockFs.writeFile.mockClear();

      await storage.clear();

      expect(mockFs.writeFile).toHaveBeenCalled();

      const all = await storage.loadAll();
      expect(all).toEqual([]);
    });
  });

  describe('dispose', () => {
    it('should flush pending changes', async () => {
      await storage.save(createInfo({ taskId: 'task_1' }));

      expect(mockFs.writeFile).not.toHaveBeenCalled();

      await storage.dispose();

      expect(mockFs.writeFile).toHaveBeenCalled();
    });
  });
});
