/**
 * Task Storage Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  FileTaskStorage,
  FileTaskStorageLoadError,
  MemoryTaskStorage,
  StateTaskStorage,
  WorkspaceVisibleAgentTaskStorage,
  getWorkspaceVisibleAgentTaskRecordsFilePath,
} from '../task-storage';
import type { SerializableTask, TaskRunScope } from '@neko/shared';

function taskScope(childRunId: string): TaskRunScope {
  return {
    conversationId: 'conv-storage',
    runId: 'run-storage',
    parentRunId: 'run-storage',
    childRunId,
    childKind: 'task',
  };
}

function createTask(overrides: Partial<SerializableTask> = {}): SerializableTask {
  const id = overrides.id ?? `task_${Date.now()}_1`;
  return {
    id,
    type: 'custom',
    status: 'pending',
    input: { type: 'custom', payload: {} },
    progress: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
    scope: overrides.scope ?? taskScope(id),
  };
}

describe('MemoryTaskStorage', () => {
  let storage: MemoryTaskStorage;

  beforeEach(() => {
    storage = new MemoryTaskStorage();
  });

  describe('save and load', () => {
    it('should save and load a task', async () => {
      const task = createTask({ id: 'task_1' });
      await storage.save(task);

      const loaded = await storage.load(taskScope('task_1'));
      expect(loaded).toEqual(task);
    });

    it('should return undefined for non-existent task', async () => {
      const loaded = await storage.load(taskScope('non-existent'));
      expect(loaded).toBeUndefined();
    });

    it('should update existing task', async () => {
      const task = createTask({ id: 'task_1', status: 'pending' });
      await storage.save(task);

      const updated = { ...task, status: 'completed' as const, progress: 100 };
      await storage.save(updated);

      const loaded = await storage.load(taskScope('task_1'));
      expect(loaded?.status).toBe('completed');
      expect(loaded?.progress).toBe(100);
    });

    it('should return a copy, not the original reference', async () => {
      const task = createTask({ id: 'task_1' });
      await storage.save(task);

      const loaded = await storage.load(taskScope('task_1'));
      loaded!.status = 'failed';

      const reloaded = await storage.load(taskScope('task_1'));
      expect(reloaded?.status).toBe('pending');
    });
  });

  describe('loadPending', () => {
    it('should load only pending and running tasks', async () => {
      await storage.save(createTask({ id: 'task_1', status: 'pending' }));
      await storage.save(createTask({ id: 'task_2', status: 'running' }));
      await storage.save(createTask({ id: 'task_3', status: 'completed' }));
      await storage.save(createTask({ id: 'task_4', status: 'failed' }));
      await storage.save(createTask({ id: 'task_5', status: 'cancelled' }));

      const pending = await storage.loadPending();
      expect(pending.length).toBe(2);
      expect(pending.map((t) => t.id).sort()).toEqual(['task_1', 'task_2']);
    });

    it('should return empty array when no pending tasks', async () => {
      await storage.save(createTask({ id: 'task_1', status: 'completed' }));

      const pending = await storage.loadPending();
      expect(pending).toEqual([]);
    });
  });

  describe('loadAll', () => {
    it('should load all tasks', async () => {
      await storage.save(createTask({ id: 'task_1' }));
      await storage.save(createTask({ id: 'task_2' }));
      await storage.save(createTask({ id: 'task_3' }));

      const all = await storage.loadAll();
      expect(all.length).toBe(3);
    });

    it('should return empty array when no tasks', async () => {
      const all = await storage.loadAll();
      expect(all).toEqual([]);
    });
  });

  describe('delete', () => {
    it('should delete a task', async () => {
      await storage.save(createTask({ id: 'task_1' }));
      await storage.delete(taskScope('task_1'));

      const loaded = await storage.load(taskScope('task_1'));
      expect(loaded).toBeUndefined();
    });

    it('should not throw when deleting non-existent task', async () => {
      await expect(storage.delete(taskScope('non-existent'))).resolves.toBeUndefined();
    });
  });

  describe('cleanup', () => {
    it('should cleanup old completed tasks', async () => {
      const oldTime = Date.now() - 10 * 24 * 60 * 60 * 1000; // 10 days ago
      const recentTime = Date.now() - 1 * 24 * 60 * 60 * 1000; // 1 day ago

      await storage.save(
        createTask({
          id: 'old_completed',
          status: 'completed',
          updatedAt: oldTime,
        }),
      );
      await storage.save(
        createTask({
          id: 'old_failed',
          status: 'failed',
          updatedAt: oldTime,
        }),
      );
      await storage.save(
        createTask({
          id: 'old_cancelled',
          status: 'cancelled',
          updatedAt: oldTime,
        }),
      );
      await storage.save(
        createTask({
          id: 'old_pending',
          status: 'pending',
          updatedAt: oldTime,
        }),
      );
      await storage.save(
        createTask({
          id: 'recent_completed',
          status: 'completed',
          updatedAt: recentTime,
        }),
      );

      const cleaned = await storage.cleanup(7 * 24 * 60 * 60 * 1000); // 7 days
      expect(cleaned).toBe(3); // old_completed, old_failed, old_cancelled

      const remaining = await storage.loadAll();
      expect(remaining.length).toBe(2);
      expect(remaining.map((t) => t.id).sort()).toEqual(['old_pending', 'recent_completed']);
    });

    it('should not cleanup running tasks', async () => {
      const oldTime = Date.now() - 10 * 24 * 60 * 60 * 1000;

      await storage.save(
        createTask({
          id: 'old_running',
          status: 'running',
          updatedAt: oldTime,
        }),
      );

      const cleaned = await storage.cleanup(7 * 24 * 60 * 60 * 1000);
      expect(cleaned).toBe(0);

      const loaded = await storage.load(taskScope('old_running'));
      expect(loaded).toBeDefined();
    });

    it('should return 0 when nothing to cleanup', async () => {
      await storage.save(
        createTask({
          id: 'recent',
          status: 'completed',
          updatedAt: Date.now(),
        }),
      );

      const cleaned = await storage.cleanup(7 * 24 * 60 * 60 * 1000);
      expect(cleaned).toBe(0);
    });
  });
});

describe('StateTaskStorage', () => {
  it('persists task storage rules through an injected key-value adapter', async () => {
    const persisted = new Map<string, SerializableTask[]>();
    const storage = new StateTaskStorage({
      storageKey: 'tasks',
      adapter: {
        load: (key) => persisted.get(key) ?? [],
        save: (key, tasks) => {
          persisted.set(
            key,
            tasks.map((task) => ({ ...task })),
          );
        },
      },
    });

    await storage.save(createTask({ id: 'pending', status: 'pending' }));
    await storage.save(createTask({ id: 'running', status: 'running' }));
    await storage.save(createTask({ id: 'completed', status: 'completed' }));
    await storage.save(createTask({ id: 'pending', status: 'completed', progress: 100 }));

    expect((await storage.load(taskScope('pending')))?.progress).toBe(100);
    expect((await storage.loadPending()).map((task) => task.id)).toEqual(['running']);

    await storage.delete(taskScope('running'));
    expect((await storage.loadAll()).map((task) => task.id).sort()).toEqual([
      'completed',
      'pending',
    ]);
  });

  it('uses agent cleanup policy while keeping the host storage as an adapter', async () => {
    const now = Date.now();
    const persisted = new Map<string, SerializableTask[]>([
      [
        'tasks',
        [
          createTask({
            id: 'old-completed',
            status: 'completed',
            updatedAt: now - 10 * 24 * 60 * 60 * 1000,
          }),
          createTask({
            id: 'running',
            status: 'running',
            updatedAt: now - 10 * 24 * 60 * 60 * 1000,
          }),
        ],
      ],
    ]);
    const storage = new StateTaskStorage({
      storageKey: 'tasks',
      adapter: {
        load: (key) => persisted.get(key) ?? [],
        save: (key, tasks) => {
          persisted.set(
            key,
            tasks.map((task) => ({ ...task })),
          );
        },
      },
    });

    await expect(storage.cleanup(7 * 24 * 60 * 60 * 1000)).resolves.toBe(1);
    expect((await storage.loadAll()).map((task) => task.id)).toEqual(['running']);
  });
});

describe('FileTaskStorage', () => {
  it('fails visibly when an existing task storage file is malformed', async () => {
    const filePath = '/tmp/tasks.json';
    const files = new Map<string, string>([[filePath, '{not-json']]);
    const storage = new FileTaskStorage({
      filePath,
      ...createMemoryFileTaskStorageFs(files),
      writerId: 'task-writer-a',
    });

    await expect(storage.loadAll()).rejects.toBeInstanceOf(FileTaskStorageLoadError);
    await expect(storage.loadAll()).rejects.toMatchObject({
      code: 'agent-task-storage-load-failed',
      filePath,
    });
  });

  it('rejects stale whole-file writers before overwriting another task partition', async () => {
    const filePath = '/tmp/tasks.json';
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
    };
    const firstWriter = new FileTaskStorage({
      filePath,
      ...fsOps,
      writerId: 'task-writer-a',
      now: () => 1000,
    });
    const secondWriter = new FileTaskStorage({
      filePath,
      ...fsOps,
      writerId: 'task-writer-b',
      now: () => 2000,
    });

    await firstWriter.save(createTask({ id: 'task-a' }));
    await secondWriter.save(createTask({ id: 'task-b' }));
    await firstWriter.flush();

    await expect(secondWriter.flush()).rejects.toMatchObject({
      code: 'stale-json-file-write',
      details: {
        filePath,
        ownerId: 'task-writer-b',
        loadedRevision: 0,
        currentRevision: 1,
        currentOwnerId: 'task-writer-a',
      },
    });

    const persisted = JSON.parse(files.get(filePath) ?? '{}') as {
      writeMetadata?: { ownerId: string; revision: number };
      tasks?: SerializableTask[];
    };
    expect(persisted.writeMetadata).toEqual(
      expect.objectContaining({ ownerId: 'task-writer-a', revision: 1 }),
    );
    expect(persisted.tasks?.map((task) => task.id)).toEqual(['task-a']);
  });
});

describe('WorkspaceVisibleAgentTaskStorage', () => {
  it('projects workspace-visible task records from the shared workspace task file', async () => {
    const filePath = '/workspace/.neko/tasks.json';
    const files = new Map<string, string>();
    const fsOps = createMemoryFileTaskStorageFs(files);
    const extensionStorage = new WorkspaceVisibleAgentTaskStorage({
      workspaceRoot: '/workspace',
      filePath,
      ...fsOps,
      writerId: 'extension-task-storage',
      now: () => 1000,
    });
    const tuiStorage = new WorkspaceVisibleAgentTaskStorage({
      workspaceRoot: '/workspace',
      filePath,
      ...fsOps,
      writerId: 'tui-task-storage',
      now: () => 2000,
    });

    await extensionStorage.save(createTask({ id: 'workspace-task', status: 'running' }));
    await extensionStorage.flush();

    await expect(tuiStorage.loadAllRecords()).resolves.toEqual([
      expect.objectContaining({
        scope: 'workspace-visible',
        workspaceRoot: '/workspace',
        task: expect.objectContaining({ id: 'workspace-task' }),
      }),
    ]);
    expect(getWorkspaceVisibleAgentTaskRecordsFilePath('/workspace')).toBe(
      '/workspace/.neko/tasks.json',
    );
  });

  it('rejects stale cross-surface writes to the workspace task plane', async () => {
    const filePath = '/workspace/.neko/tasks.json';
    const files = new Map<string, string>();
    const fsOps = createMemoryFileTaskStorageFs(files);
    const extensionStorage = new WorkspaceVisibleAgentTaskStorage({
      workspaceRoot: '/workspace',
      filePath,
      ...fsOps,
      writerId: 'extension-task-storage',
      now: () => 1000,
    });
    const tuiStorage = new WorkspaceVisibleAgentTaskStorage({
      workspaceRoot: '/workspace',
      filePath,
      ...fsOps,
      writerId: 'tui-task-storage',
      now: () => 2000,
    });

    await extensionStorage.save(createTask({ id: 'extension-task' }));
    await tuiStorage.loadAll();
    await extensionStorage.flush();
    await tuiStorage.save(createTask({ id: 'tui-task' }));

    await expect(tuiStorage.flush()).rejects.toMatchObject({
      code: 'stale-json-file-write',
      details: {
        filePath,
        ownerId: 'tui-task-storage',
        loadedRevision: 0,
        currentRevision: 1,
        currentOwnerId: 'extension-task-storage',
      },
    });
  });
});

function createMemoryFileTaskStorageFs(files: Map<string, string>): {
  readonly readFile: (path: string) => Promise<string>;
  readonly writeFile: (path: string, content: string) => Promise<void>;
  readonly exists: (path: string) => Promise<boolean>;
} {
  return {
    readFile: async (path) => {
      const content = files.get(path);
      if (content === undefined) {
        throw new Error(`File not found: ${path}`);
      }
      return content;
    },
    writeFile: async (path, content) => {
      files.set(path, content);
    },
    exists: async (path) => files.has(path),
  };
}
