/**
 * Task Storage Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryTaskStorage } from '../task-storage';
import type { SerializableTask } from '@neko/shared';

describe('MemoryTaskStorage', () => {
  let storage: MemoryTaskStorage;

  const createTask = (overrides: Partial<SerializableTask> = {}): SerializableTask => ({
    id: `task_${Date.now()}_1`,
    type: 'custom',
    status: 'pending',
    input: { type: 'custom', payload: {} },
    progress: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  });

  beforeEach(() => {
    storage = new MemoryTaskStorage();
  });

  describe('save and load', () => {
    it('should save and load a task', async () => {
      const task = createTask({ id: 'task_1' });
      await storage.save(task);

      const loaded = await storage.load('task_1');
      expect(loaded).toEqual(task);
    });

    it('should return undefined for non-existent task', async () => {
      const loaded = await storage.load('non-existent');
      expect(loaded).toBeUndefined();
    });

    it('should update existing task', async () => {
      const task = createTask({ id: 'task_1', status: 'pending' });
      await storage.save(task);

      const updated = { ...task, status: 'completed' as const, progress: 100 };
      await storage.save(updated);

      const loaded = await storage.load('task_1');
      expect(loaded?.status).toBe('completed');
      expect(loaded?.progress).toBe(100);
    });

    it('should return a copy, not the original reference', async () => {
      const task = createTask({ id: 'task_1' });
      await storage.save(task);

      const loaded = await storage.load('task_1');
      loaded!.status = 'failed';

      const reloaded = await storage.load('task_1');
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
      await storage.delete('task_1');

      const loaded = await storage.load('task_1');
      expect(loaded).toBeUndefined();
    });

    it('should not throw when deleting non-existent task', async () => {
      await expect(storage.delete('non-existent')).resolves.toBeUndefined();
    });
  });

  describe('cleanup', () => {
    it('should cleanup old completed tasks', async () => {
      const oldTime = Date.now() - 10 * 24 * 60 * 60 * 1000; // 10 days ago
      const recentTime = Date.now() - 1 * 24 * 60 * 60 * 1000; // 1 day ago

      await storage.save(createTask({
        id: 'old_completed',
        status: 'completed',
        updatedAt: oldTime,
      }));
      await storage.save(createTask({
        id: 'old_failed',
        status: 'failed',
        updatedAt: oldTime,
      }));
      await storage.save(createTask({
        id: 'old_cancelled',
        status: 'cancelled',
        updatedAt: oldTime,
      }));
      await storage.save(createTask({
        id: 'old_pending',
        status: 'pending',
        updatedAt: oldTime,
      }));
      await storage.save(createTask({
        id: 'recent_completed',
        status: 'completed',
        updatedAt: recentTime,
      }));

      const cleaned = await storage.cleanup(7 * 24 * 60 * 60 * 1000); // 7 days
      expect(cleaned).toBe(3); // old_completed, old_failed, old_cancelled

      const remaining = await storage.loadAll();
      expect(remaining.length).toBe(2);
      expect(remaining.map((t) => t.id).sort()).toEqual(['old_pending', 'recent_completed']);
    });

    it('should not cleanup running tasks', async () => {
      const oldTime = Date.now() - 10 * 24 * 60 * 60 * 1000;

      await storage.save(createTask({
        id: 'old_running',
        status: 'running',
        updatedAt: oldTime,
      }));

      const cleaned = await storage.cleanup(7 * 24 * 60 * 60 * 1000);
      expect(cleaned).toBe(0);

      const loaded = await storage.load('old_running');
      expect(loaded).toBeDefined();
    });

    it('should return 0 when nothing to cleanup', async () => {
      await storage.save(createTask({
        id: 'recent',
        status: 'completed',
        updatedAt: Date.now(),
      }));

      const cleaned = await storage.cleanup(7 * 24 * 60 * 60 * 1000);
      expect(cleaned).toBe(0);
    });
  });
});
