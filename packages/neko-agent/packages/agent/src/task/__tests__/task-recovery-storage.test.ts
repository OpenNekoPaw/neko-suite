/**
 * Task Recovery Storage Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MemoryTaskRecoveryStorage,
  FileTaskRecoveryStorage,
  createFileRecoveryStorage,
  createStateTaskRecoveryStorage,
} from '../task-recovery-storage';
import type { TaskRecoveryInfo, TaskRunScope } from '@neko/shared';

function taskScope(childRunId: string): TaskRunScope {
  return {
    conversationId: 'conv-recovery',
    runId: 'run-recovery',
    parentRunId: 'run-recovery',
    childRunId,
    childKind: 'task',
  };
}

describe('MemoryTaskRecoveryStorage', () => {
  let storage: MemoryTaskRecoveryStorage;

  const createInfo = (overrides: Partial<TaskRecoveryInfo> = {}): TaskRecoveryInfo => {
    const taskId = overrides.taskId ?? `task_${Date.now()}_1`;
    return {
      taskId,
      externalTaskId: 'ext_123',
      providerId: 'runway',
      taskType: 'video_generation',
      payload: { prompt: 'test' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides,
      scope: overrides.scope ?? taskScope(taskId),
    };
  };

  beforeEach(() => {
    storage = new MemoryTaskRecoveryStorage();
  });

  describe('save and load', () => {
    it('should save and load recovery info', async () => {
      const info = createInfo({ taskId: 'task_1' });
      await storage.save(info);

      const loaded = await storage.load(taskScope('task_1'));
      expect(loaded).toEqual(info);
    });

    it('should return undefined for non-existent info', async () => {
      const loaded = await storage.load(taskScope('non-existent'));
      expect(loaded).toBeUndefined();
    });

    it('should update existing info', async () => {
      const info = createInfo({ taskId: 'task_1' });
      await storage.save(info);

      const updated = { ...info, updatedAt: Date.now() + 1000 };
      await storage.save(updated);

      const loaded = await storage.load(taskScope('task_1'));
      expect(loaded?.updatedAt).toBe(updated.updatedAt);
    });

    it('should return a copy, not the original reference', async () => {
      const info = createInfo({ taskId: 'task_1' });
      await storage.save(info);

      const loaded = await storage.load(taskScope('task_1'));
      loaded!.externalTaskId = 'modified';

      const reloaded = await storage.load(taskScope('task_1'));
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
      await storage.delete(taskScope('task_1'));

      const loaded = await storage.load(taskScope('task_1'));
      expect(loaded).toBeUndefined();
    });

    it('should not throw when deleting non-existent info', async () => {
      await expect(storage.delete(taskScope('non-existent'))).resolves.toBeUndefined();
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

  const createInfo = (overrides: Partial<TaskRecoveryInfo> = {}): TaskRecoveryInfo => {
    const taskId = overrides.taskId ?? `task_${Date.now()}_1`;
    return {
      taskId,
      externalTaskId: 'ext_123',
      providerId: 'runway',
      taskType: 'video_generation',
      payload: { prompt: 'test' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides,
      scope: overrides.scope ?? taskScope(taskId),
    };
  };

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

      const loaded = await storage.load(taskScope('existing'));
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

    it('should reject recovery files with invalid record shapes', async () => {
      fileExists = true;
      fileContent = JSON.stringify([
        createInfo({ taskId: 'valid' }),
        {
          taskId: 'invalid',
          externalTaskId: 123,
          providerId: 'runway',
          taskType: 'video_generation',
          payload: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]);

      const all = await storage.loadAll();
      expect(all).toEqual([]);
    });
  });

  describe('save and load', () => {
    it('should save and load recovery info', async () => {
      const info = createInfo({ taskId: 'task_1' });
      await storage.save(info);

      const loaded = await storage.load(taskScope('task_1'));
      expect(loaded).toEqual(info);
    });

    it('should schedule file write after save', async () => {
      await storage.save(createInfo({ taskId: 'task_1' }));

      expect(mockFs.writeFile).not.toHaveBeenCalled();

      // Advance timer to trigger debounced save
      await vi.advanceTimersByTimeAsync(1000);

      expect(mockFs.writeFile).toHaveBeenCalledWith('/test/recovery.json', expect.any(String));
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

  it('rejects stale whole-file writers before overwriting another recovery partition', async () => {
    const filePath = '/test/recovery.json';
    const files = new Map<string, string>();
    const fsOps = {
      readFile: async (path: string) => {
        const content = files.get(path);
        if (content === undefined) {
          throw new Error(`File not found: ${path}`);
        }
        return content;
      },
      writeFile: async (path: string, content: string) => {
        files.set(path, content);
      },
      exists: async (path: string) => files.has(path),
      deleteFile: async (path: string) => {
        files.delete(path);
      },
    };
    const firstWriter = new FileTaskRecoveryStorage({
      filePath,
      ...fsOps,
      writerId: 'recovery-writer-a',
      now: () => 1000,
    });
    const secondWriter = new FileTaskRecoveryStorage({
      filePath,
      ...fsOps,
      writerId: 'recovery-writer-b',
      now: () => 2000,
    });

    await firstWriter.save(createInfo({ taskId: 'task-a' }));
    await secondWriter.save(createInfo({ taskId: 'task-b' }));
    await firstWriter.flush();

    await expect(secondWriter.flush()).rejects.toMatchObject({
      code: 'stale-json-file-write',
      details: {
        filePath,
        ownerId: 'recovery-writer-b',
        loadedRevision: 0,
        currentRevision: 1,
        currentOwnerId: 'recovery-writer-a',
      },
    });

    const persisted = JSON.parse(files.get(filePath) ?? '{}') as {
      writeMetadata?: { ownerId: string; revision: number };
      recovery?: TaskRecoveryInfo[];
    };
    expect(persisted.writeMetadata).toEqual(
      expect.objectContaining({ ownerId: 'recovery-writer-a', revision: 1 }),
    );
    expect(persisted.recovery?.map((info) => info.taskId)).toEqual(['task-a']);
  });

  describe('delete', () => {
    it('should delete recovery info and schedule save', async () => {
      await storage.save(createInfo({ taskId: 'task_1' }));
      await vi.advanceTimersByTimeAsync(1000);
      mockFs.writeFile.mockClear();

      await storage.delete(taskScope('task_1'));
      await vi.advanceTimersByTimeAsync(1000);

      const loaded = await storage.load(taskScope('task_1'));
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

describe('StateTaskRecoveryStorage', () => {
  const createInfo = (overrides: Partial<TaskRecoveryInfo> = {}): TaskRecoveryInfo => {
    const taskId = overrides.taskId ?? 'task_1';
    return {
      taskId,
      externalTaskId: 'ext_123',
      providerId: 'runway',
      taskType: 'video_generation',
      payload: { prompt: 'test' },
      createdAt: 1,
      updatedAt: 2,
      ...overrides,
      scope: overrides.scope ?? taskScope(taskId),
    };
  };

  it('persists recovery info through a state adapter', async () => {
    const state = new Map<string, TaskRecoveryInfo[]>();
    const storage = createStateTaskRecoveryStorage({
      storageKey: 'neko.agent.taskRecovery',
      adapter: {
        load: (key) => state.get(key) ?? [],
        save: (key, infos) => state.set(key, [...infos]),
      },
    });

    await storage.save(createInfo({ taskId: 'task_1' }));
    await storage.save(createInfo({ taskId: 'task_2', externalTaskId: 'ext_456' }));

    expect(await storage.load(taskScope('task_1'))).toEqual(
      expect.objectContaining({ taskId: 'task_1', externalTaskId: 'ext_123' }),
    );
    expect(await storage.loadAll()).toHaveLength(2);

    const restored = createStateTaskRecoveryStorage({
      storageKey: 'neko.agent.taskRecovery',
      adapter: {
        load: (key) => state.get(key) ?? [],
        save: (key, infos) => state.set(key, [...infos]),
      },
    });

    expect(await restored.load(taskScope('task_2'))).toEqual(
      expect.objectContaining({ taskId: 'task_2', externalTaskId: 'ext_456' }),
    );
  });

  it('degrades corrupt state adapter loads to empty recovery info', async () => {
    const storage = createStateTaskRecoveryStorage({
      storageKey: 'neko.agent.taskRecovery',
      adapter: {
        load: () => {
          throw new Error('corrupt state');
        },
        save: vi.fn(),
      },
    });

    await expect(storage.loadAll()).resolves.toEqual([]);
  });
});
