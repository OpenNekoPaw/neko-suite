/**
 * TaskManager Persistence Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TaskManager } from '../task-manager';
import { MemoryTaskStorage } from '../task-storage';
import type { ITaskStorage, SerializableTask, TaskExecutor } from '@uniedit/shared';

describe('TaskManager Persistence', () => {
  let manager: TaskManager;
  let storage: MemoryTaskStorage;

  beforeEach(() => {
    storage = new MemoryTaskStorage();
    manager = new TaskManager({
      storage,
      cleanupIntervalMs: 0, // Disable auto-cleanup for tests
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    manager.dispose();
    vi.useRealTimers();
  });

  describe('persistence on submit', () => {
    it('should persist task on submit', async () => {
      const executor: TaskExecutor = vi.fn().mockImplementation(
        () => new Promise(() => {})
      );
      manager.registerExecutor('custom', executor);

      const taskId = await manager.submit({
        type: 'custom',
        payload: { test: true },
      });

      const persisted = await storage.load(taskId);
      expect(persisted).toBeDefined();
      // Task may be pending or running depending on timing
      expect(['pending', 'running']).toContain(persisted?.status);
      expect(persisted?.input.payload).toEqual({ test: true });
    });

    it('should persist task status updates', async () => {
      const executor: TaskExecutor = vi.fn().mockResolvedValue({ data: 'done' });
      manager.registerExecutor('custom', executor);

      const taskId = await manager.submit({
        type: 'custom',
        payload: {},
      });

      // Wait for execution
      await vi.advanceTimersByTimeAsync(0);

      const persisted = await storage.load(taskId);
      expect(persisted?.status).toBe('completed');
      expect(persisted?.progress).toBe(100);
    });

    it('should persist failure status', async () => {
      const executor: TaskExecutor = vi.fn().mockRejectedValue(new Error('Test error'));
      manager.registerExecutor('custom', executor);

      const taskId = await manager.submit({
        type: 'custom',
        payload: {},
      });

      await vi.advanceTimersByTimeAsync(0);

      const persisted = await storage.load(taskId);
      expect(persisted?.status).toBe('failed');
      expect(persisted?.error).toBe('Test error');
    });

    it('should persist cancelled status', async () => {
      const executor: TaskExecutor = vi.fn().mockImplementation(
        () => new Promise(() => {})
      );
      manager.registerExecutor('custom', executor);

      const taskId = await manager.submit({
        type: 'custom',
        payload: {},
      });

      await manager.cancel(taskId);

      const persisted = await storage.load(taskId);
      expect(persisted?.status).toBe('cancelled');
    });
  });

  describe('initialize', () => {
    it('should load tasks from storage on initialize', async () => {
      // Pre-populate storage
      await storage.save({
        id: 'task_1000_1',
        type: 'custom',
        status: 'completed',
        input: { type: 'custom', payload: {} },
        progress: 100,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await manager.initialize();

      const task = await manager.get('task_1000_1');
      expect(task).toBeDefined();
      expect(task?.status).toBe('completed');
    });

    it('should restore task counter to avoid ID collisions', async () => {
      await storage.save({
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

      const newTaskId = await manager.submit({
        type: 'custom',
        payload: {},
      });

      // New task ID should have counter > 999
      const match = newTaskId.match(/task_\d+_(\d+)/);
      expect(match).toBeTruthy();
      expect(parseInt(match![1], 10)).toBeGreaterThan(999);
    });
  });

  describe('resumePendingTasks', () => {
    it('should resume pending tasks', async () => {
      const executor: TaskExecutor = vi.fn().mockResolvedValue({ data: 'resumed' });
      manager.registerExecutor('custom', executor);

      // Pre-populate with pending task
      await storage.save({
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

      expect(resumed).toEqual(['pending_task']);
      expect(executor).toHaveBeenCalled();
    });

    it('should mark running tasks as pending before resuming', async () => {
      const executor: TaskExecutor = vi.fn().mockResolvedValue({ data: 'resumed' });
      manager.registerExecutor('custom', executor);

      await storage.save({
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

      expect(resumed).toEqual(['running_task']);

      // Check that retryCount was incremented
      const persisted = await storage.load('running_task');
      expect(persisted?.retryCount).toBe(1);
    });

    it('should not resume completed tasks', async () => {
      const executor: TaskExecutor = vi.fn().mockResolvedValue({});
      manager.registerExecutor('custom', executor);

      await storage.save({
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
  });

  describe('cleanupOldTasks', () => {
    it('should cleanup old completed tasks', async () => {
      vi.useRealTimers();

      const oldTime = Date.now() - 10 * 24 * 60 * 60 * 1000; // 10 days ago

      await storage.save({
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

      const task = await manager2.get('old_task');
      expect(task).toBeUndefined();

      manager2.dispose();
    });

    it('should remove from both storage and memory', async () => {
      vi.useRealTimers();

      const oldTime = Date.now() - 10 * 24 * 60 * 60 * 1000;

      await storage.save({
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
      const storedTask = await storage.load('old_task');
      expect(storedTask).toBeUndefined();

      // Check memory
      const memTask = await manager2.get('old_task');
      expect(memTask).toBeUndefined();

      manager2.dispose();
    });
  });

  describe('dispose', () => {
    it('should clear cleanup timer', () => {
      const manager2 = new TaskManager({
        storage,
        cleanupIntervalMs: 1000,
      });

      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      manager2.dispose();

      expect(clearIntervalSpy).toHaveBeenCalled();
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

    await manager.submit({ type: 'custom', payload: {} });

    expect(customStorage.save).toHaveBeenCalled();
    manager.dispose();
  });
});
