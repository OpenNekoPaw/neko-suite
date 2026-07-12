/**
 * TaskManager Persistence Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TaskManager } from '../task-manager';
import { MemoryTaskStorage } from '../task-storage';
import { MemoryTaskRecoveryStorage } from '../task-recovery-storage';
import { toSerializableCreationProjectedTask } from '../creation-projected-task';
import type {
  ConversationRunScope,
  ITaskStorage,
  SerializableTask,
  TaskExecutor,
  TaskRunOwnerScope,
  TaskRunScope,
} from '@neko/shared';

const OWNER: TaskRunOwnerScope = {
  conversationId: 'conv-persistence',
  runId: 'run-persistence',
  parentRunId: 'run-persistence',
};

function taskScope(childRunId: string, owner: TaskRunOwnerScope = OWNER): TaskRunScope {
  return {
    ...owner,
    childRunId,
    childKind: 'task',
  };
}

const RESTORE_RUN: ConversationRunScope = {
  conversationId: 'conv-restore',
  runId: 'run-restore',
};

const RESTORE_OWNER: TaskRunOwnerScope = {
  ...RESTORE_RUN,
  parentRunId: RESTORE_RUN.runId,
};

const LEGACY_OWNER: TaskRunOwnerScope = {
  conversationId: 'conv-legacy',
  runId: 'run-legacy',
  parentRunId: 'run-legacy',
};

describe('TaskManager Persistence', () => {
  let manager: TaskManager;
  let storage: MemoryTaskStorage;
  let recoveryStorage: MemoryTaskRecoveryStorage;

  beforeEach(() => {
    storage = new MemoryTaskStorage();
    recoveryStorage = new MemoryTaskRecoveryStorage();
    manager = new TaskManager({
      storage,
      recoveryStorage,
      cleanupIntervalMs: 0, // Disable auto-cleanup for tests
    });
    vi.useFakeTimers();
  });

  afterEach(async () => {
    await manager.dispose();
    vi.useRealTimers();
  });

  describe('persistence on submit', () => {
    it('should persist task on submit', async () => {
      const executor: TaskExecutor = vi.fn().mockImplementation(() => new Promise(() => {}));
      manager.registerExecutor('custom', executor);

      const taskId = await manager.submit(
        {
          type: 'custom',
          payload: { test: true },
        },
        OWNER,
      );

      const persisted = await storage.load(taskId);
      expect(persisted).toBeDefined();
      // Task may be pending or running depending on timing
      expect(['pending', 'running']).toContain(persisted?.status);
      expect(persisted?.input.payload).toEqual({ test: true });
    });

    it('should persist task status updates', async () => {
      const executor: TaskExecutor = vi.fn().mockResolvedValue({ data: 'done' });
      manager.registerExecutor('custom', executor);

      const taskId = await manager.submit(
        {
          type: 'custom',
          payload: {},
        },
        OWNER,
      );

      // Wait for execution
      await vi.advanceTimersByTimeAsync(0);

      const persisted = await storage.load(taskId);
      expect(persisted?.status).toBe('completed');
      expect(persisted?.progress).toBe(100);
    });

    it('should persist failure status', async () => {
      const executor: TaskExecutor = vi.fn().mockRejectedValue(new Error('Test error'));
      manager.registerExecutor('custom', executor);

      const taskId = await manager.submit(
        {
          type: 'custom',
          payload: {},
        },
        OWNER,
      );

      await vi.advanceTimersByTimeAsync(0);

      const persisted = await storage.load(taskId);
      expect(persisted?.status).toBe('failed');
      expect(persisted?.error).toBe('Test error');
    });

    it('should persist cancelled status', async () => {
      const executor: TaskExecutor = vi.fn().mockImplementation(() => new Promise(() => {}));
      manager.registerExecutor('custom', executor);

      const taskId = await manager.submit(
        {
          type: 'custom',
          payload: {},
        },
        OWNER,
      );

      await manager.cancel(taskId);

      const persisted = await storage.load(taskId);
      expect(persisted?.status).toBe('cancelled');
    });
  });

  describe('initialize', () => {
    it('should load tasks from storage on initialize', async () => {
      // Pre-populate storage
      await storage.save({
        scope: taskScope('task_1000_1'),
        id: 'task_1000_1',
        type: 'custom',
        status: 'completed',
        input: { type: 'custom', payload: {} },
        progress: 100,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await manager.initialize();

      const task = await manager.get(taskScope('task_1000_1'));
      expect(task).toBeDefined();
      expect(task?.status).toBe('completed');
    });

    it('should restore task counter to avoid ID collisions', async () => {
      await storage.save({
        scope: taskScope('task_1000_999'),
        id: 'task_1000_999',
        type: 'custom',
        status: 'completed',
        input: { type: 'custom', payload: {} },
        progress: 100,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const executor: TaskExecutor = vi.fn().mockResolvedValue({});
      manager.registerExecutor('custom', executor);

      await manager.initialize();

      const newTaskScope = await manager.submit(
        {
          type: 'custom',
          payload: {},
        },
        OWNER,
      );

      // New task ID should have counter > 999
      const match = newTaskScope.childRunId.match(/task_\d+_(\d+)/);
      expect(match).toBeTruthy();
      expect(parseInt(match![1], 10)).toBeGreaterThan(999);
    });
  });

  describe('persisted workflow cleanup', () => {
    it('should clear staged-creation projected tasks for a run directly from storage even before initialize', async () => {
      await storage.save(
        toSerializableCreationProjectedTask({
          id: 'creation:run-restore:item-1',
          status: 'completed',
          progress: 100,
          createdAt: 10,
          updatedAt: 20,
          content: 'Recovered task',
          binding: {
            source: 'creation',
            conversationId: 'conv-restore',
            runId: 'run-restore',
            runStartedAt: 111,
            checklistId: 'task-restore',
            itemId: 'item-1',
          },
        }),
      );
      await storage.save(
        toSerializableCreationProjectedTask({
          id: 'creation:run-restore:item-2',
          status: 'completed',
          progress: 100,
          createdAt: 11,
          updatedAt: 21,
          content: 'Recovered task retry',
          binding: {
            source: 'creation',
            conversationId: 'conv-restore',
            runId: 'run-restore',
            runStartedAt: 222,
            checklistId: 'task-restore-2',
            itemId: 'item-2',
          },
        }),
      );
      await storage.save({
        scope: taskScope('task_other'),
        id: 'task_other',
        type: 'custom',
        status: 'completed',
        input: { type: 'custom', payload: {} },
        progress: 100,
        createdAt: 1,
        updatedAt: 2,
      });

      const deletedIds = await manager.clearCreationProjectedTasksForRun(RESTORE_RUN, 111);

      expect(deletedIds).toEqual(['creation:run-restore:item-1']);
      expect(
        await storage.load(taskScope('creation:run-restore:item-1', RESTORE_OWNER)),
      ).toBeUndefined();
      expect(await storage.load(taskScope('creation:run-restore:item-2', RESTORE_OWNER))).toEqual(
        expect.objectContaining({ id: 'creation:run-restore:item-2' }),
      );
      expect(await storage.load(taskScope('task_other'))).toEqual(
        expect.objectContaining({ id: 'task_other' }),
      );
    });

    it('ignores corrupted legacy IDC payload bindings during provenance cleanup', async () => {
      await storage.save(
        toSerializableCreationProjectedTask({
          id: 'creation:run-restore:item-1',
          status: 'completed',
          progress: 100,
          createdAt: 10,
          updatedAt: 20,
          content: 'Recovered task',
          binding: {
            source: 'creation',
            conversationId: 'conv-restore',
            runId: 'run-restore',
            runStartedAt: 111,
            checklistId: 'task-restore',
            itemId: 'item-1',
          },
        }),
      );
      await storage.save({
        scope: taskScope('creation:run-restore:item-corrupt'),
        id: 'creation:run-restore:item-corrupt',
        type: 'workflow',
        status: 'running',
        input: {
          type: 'workflow',
          payload: {
            source: 'creation',
            runId: 123,
            checklistId: 'task-corrupt',
          },
        },
        progress: 25,
        createdAt: 12,
        updatedAt: 22,
      } as SerializableTask);
      await storage.save(
        toSerializableCreationProjectedTask({
          id: 'creation:run-restore:item-2',
          status: 'completed',
          progress: 100,
          createdAt: 11,
          updatedAt: 21,
          content: 'Recovered task retry',
          binding: {
            source: 'creation',
            conversationId: 'conv-restore',
            runId: 'run-restore',
            runStartedAt: 222,
            checklistId: 'task-restore-2',
            itemId: 'item-2',
          },
        }),
      );

      const deletedIds = await manager.clearCreationProjectedTasksForRun(RESTORE_RUN, 111);

      expect(deletedIds).toEqual(['creation:run-restore:item-1']);
      expect(
        await storage.load(taskScope('creation:run-restore:item-1', RESTORE_OWNER)),
      ).toBeUndefined();
      expect(await storage.load(taskScope('creation:run-restore:item-corrupt'))).toEqual(
        expect.objectContaining({ id: 'creation:run-restore:item-corrupt' }),
      );
      expect(await storage.load(taskScope('creation:run-restore:item-2', RESTORE_OWNER))).toEqual(
        expect.objectContaining({ id: 'creation:run-restore:item-2' }),
      );
    });

    it('clears legacy idc-prefixed projected tasks from pre-migration storage', async () => {
      await storage.save({
        scope: taskScope('idc:run-legacy:item-1', LEGACY_OWNER),
        id: 'idc:run-legacy:item-1',
        type: 'workflow',
        status: 'completed',
        input: {
          type: 'workflow',
          payload: {
            source: 'idc',
            name: 'Legacy task',
            legacyTrace: {
              runId: 'run-legacy',
              runStartedAt: 333,
            },
            checklistId: 'task-legacy',
            itemId: 'item-1',
          },
        },
        progress: 100,
        createdAt: 10,
        updatedAt: 20,
      });

      const deletedIds = await manager.clearCreationProjectedTasksForRun(
        { conversationId: 'conv-legacy', runId: 'run-legacy' },
        333,
      );

      expect(deletedIds).toEqual(['idc:run-legacy:item-1']);
      expect(await storage.load(taskScope('idc:run-legacy:item-1', LEGACY_OWNER))).toBeUndefined();
    });
  });

  describe('resumePendingTasks', () => {
    it('should resume pending tasks', async () => {
      const executor: TaskExecutor = vi.fn().mockResolvedValue({ data: 'resumed' });
      manager.registerExecutor('custom', executor);

      // Pre-populate with pending task
      await storage.save({
        scope: taskScope('pending_task'),
        id: 'pending_task',
        type: 'custom',
        status: 'pending',
        input: { type: 'custom', payload: { resumeTest: true } },
        progress: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await manager.initialize();
      const resumed = await manager.resumePendingTasks();

      // Allow async executeTask to complete
      await vi.runAllTimersAsync();

      expect(resumed).toEqual([taskScope('pending_task')]);
      expect(executor).toHaveBeenCalled();
    });

    it('should mark running tasks as pending before resuming', async () => {
      const executor: TaskExecutor = vi.fn().mockResolvedValue({ data: 'resumed' });
      manager.registerExecutor('custom', executor);

      await storage.save({
        scope: taskScope('running_task'),
        id: 'running_task',
        type: 'custom',
        status: 'running',
        input: { type: 'custom', payload: {} },
        progress: 50,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await manager.initialize();
      const resumed = await manager.resumePendingTasks();

      expect(resumed).toEqual([taskScope('running_task')]);

      // Check that retryCount was incremented
      const persisted = await storage.load(taskScope('running_task'));
      expect(persisted?.retryCount).toBe(1);
    });

    it('should not resume completed tasks', async () => {
      const executor: TaskExecutor = vi.fn().mockResolvedValue({});
      manager.registerExecutor('custom', executor);

      await storage.save({
        scope: taskScope('completed_task'),
        id: 'completed_task',
        type: 'custom',
        status: 'completed',
        input: { type: 'custom', payload: {} },
        progress: 100,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await manager.initialize();
      const resumed = await manager.resumePendingTasks();

      expect(resumed).toEqual([]);
      expect(executor).not.toHaveBeenCalled();
    });

    it('should preserve snapshot-only workflow tasks without replaying their executor', async () => {
      const executor: TaskExecutor = vi.fn().mockResolvedValue({ data: 'duplicated mutation' });
      manager.registerExecutor('workflow', executor);

      await storage.save({
        scope: taskScope('media_production_workflow'),
        id: 'media_production_workflow',
        type: 'workflow',
        status: 'running',
        input: {
          type: 'workflow',
          payload: {
            kind: 'media-production-workflow',
            workflowRunId: 'workflow-1',
          },
          lifecycle: { recoverPolicy: 'snapshot-only' },
        },
        progress: 50,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lifecycle: {
          runMode: 'background',
          costPhase: 'idle',
          interruptPolicy: 'detach-and-continue',
          recoverPolicy: 'snapshot-only',
        },
      });

      await manager.initialize();
      const resumed = await manager.resumePendingTasks();
      await vi.runAllTimersAsync();

      expect(resumed).toEqual([taskScope('media_production_workflow')]);
      expect(executor).not.toHaveBeenCalled();
      expect(await storage.load(taskScope('media_production_workflow'))).toEqual(
        expect.objectContaining({ status: 'pending', retryCount: 1 }),
      );
    });

    it('should not re-execute tasks that have external recovery info and resume-polling policy', async () => {
      const executor: TaskExecutor = vi.fn().mockResolvedValue({ data: 'duplicated' });
      manager.registerExecutor('custom', executor);

      await storage.save({
        scope: taskScope('external_wait_task'),
        id: 'external_wait_task',
        type: 'custom',
        status: 'running',
        input: {
          type: 'custom',
          payload: { prompt: 'recover external task' },
          lifecycle: {
            recoverPolicy: 'resume-polling',
          },
        },
        progress: 50,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lifecycle: {
          runMode: 'background',
          costPhase: 'external-wait',
          interruptPolicy: 'detach-and-continue',
          recoverPolicy: 'resume-polling',
        },
      });
      await recoveryStorage.save({
        scope: taskScope('external_wait_task'),
        taskId: 'external_wait_task',
        externalTaskId: 'provider-task-1',
        providerId: 'provider-1',
        taskType: 'custom',
        payload: { prompt: 'recover external task' },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await manager.initialize();
      const resumed = await manager.resumePendingTasks();

      expect(resumed).toEqual([taskScope('external_wait_task')]);
      expect(executor).not.toHaveBeenCalled();
    });
  });

  describe('cleanupOldTasks', () => {
    it('should cleanup old completed tasks', async () => {
      vi.useRealTimers();

      const oldTime = Date.now() - 10 * 24 * 60 * 60 * 1000; // 10 days ago

      await storage.save({
        scope: taskScope('old_task'),
        id: 'old_task',
        type: 'custom',
        status: 'completed',
        input: { type: 'custom', payload: {} },
        progress: 100,
        createdAt: oldTime,
        updatedAt: oldTime,
      });

      const manager2 = new TaskManager({
        storage,
        cleanupIntervalMs: 0,
        retentionPeriodMs: 7 * 24 * 60 * 60 * 1000,
      });

      await manager2.initialize();
      const cleaned = await manager2.cleanupOldTasks();

      expect(cleaned).toBe(1);

      const task = await manager2.get(taskScope('old_task'));
      expect(task).toBeUndefined();

      await manager2.dispose();
    });

    it('should remove from both storage and memory', async () => {
      vi.useRealTimers();

      const oldTime = Date.now() - 10 * 24 * 60 * 60 * 1000;

      await storage.save({
        scope: taskScope('old_task'),
        id: 'old_task',
        type: 'custom',
        status: 'failed',
        input: { type: 'custom', payload: {} },
        progress: 0,
        createdAt: oldTime,
        updatedAt: oldTime,
      });

      const manager2 = new TaskManager({
        storage,
        cleanupIntervalMs: 0,
        retentionPeriodMs: 7 * 24 * 60 * 60 * 1000,
      });

      await manager2.initialize();
      await manager2.cleanupOldTasks();

      // Check storage
      const storedTask = await storage.load(taskScope('old_task'));
      expect(storedTask).toBeUndefined();

      // Check memory
      const memTask = await manager2.get(taskScope('old_task'));
      expect(memTask).toBeUndefined();

      await manager2.dispose();
    });
  });

  describe('dispose', () => {
    it('should clear cleanup timer', async () => {
      const manager2 = new TaskManager({
        storage,
        cleanupIntervalMs: 1000,
      });

      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      await manager2.dispose();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it('should abort running tasks and snapshot them as pending', async () => {
      const abortListener = vi.fn();
      const executor: TaskExecutor = vi.fn().mockImplementation(
        (_input, _onProgress, context) =>
          new Promise(() => {
            context?.signal.addEventListener('abort', abortListener);
          }),
      );
      manager.registerExecutor('custom', executor);

      const taskId = await manager.submit(
        {
          type: 'custom',
          payload: {},
        },
        OWNER,
      );
      await vi.advanceTimersByTimeAsync(0);

      expect((await manager.get(taskId))?.status).toBe('running');

      await manager.dispose();

      const persisted = await storage.load(taskId);
      expect(abortListener).toHaveBeenCalledTimes(1);
      expect(persisted?.status).toBe('pending');
    });

    it('should not notify progress callbacks for dispose snapshots', async () => {
      const progress = vi.fn();
      const executor: TaskExecutor = vi.fn().mockImplementation(() => new Promise(() => {}));
      manager.registerExecutor('custom', executor);

      const taskId = await manager.submit(
        {
          type: 'custom',
          payload: {},
        },
        OWNER,
      );
      const unsubscribe = manager.onProgress(taskId, progress);

      await vi.advanceTimersByTimeAsync(0);
      progress.mockClear();

      await manager.dispose();

      expect(progress).not.toHaveBeenCalled();
      unsubscribe();
    });

    it('should reject completion waiters during dispose snapshots', async () => {
      const executor: TaskExecutor = vi.fn().mockImplementation(() => new Promise(() => {}));
      manager.registerExecutor('custom', executor);

      const taskId = await manager.submit(
        {
          type: 'custom',
          payload: {},
        },
        OWNER,
      );
      await vi.advanceTimersByTimeAsync(0);

      const waiter = manager.waitForCompletion(taskId, 5000);
      await manager.dispose();

      await expect(waiter).rejects.toThrow('Task manager disposed before completion');
    });
  });
});

describe('TaskManager with custom storage', () => {
  it('should use provided storage implementation', async () => {
    const customStorage: ITaskStorage = {
      save: vi.fn().mockResolvedValue(undefined),
      load: vi.fn().mockResolvedValue(undefined),
      loadPending: vi.fn().mockResolvedValue([]),
      loadAll: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined),
      cleanup: vi.fn().mockResolvedValue(0),
    };

    const manager = new TaskManager({
      storage: customStorage,
      cleanupIntervalMs: 0,
    });

    const executor: TaskExecutor = vi.fn().mockResolvedValue({});
    manager.registerExecutor('custom', executor);

    await manager.submit({ type: 'custom', payload: {} }, OWNER);

    expect(customStorage.save).toHaveBeenCalled();
    await manager.dispose();
  });
});
