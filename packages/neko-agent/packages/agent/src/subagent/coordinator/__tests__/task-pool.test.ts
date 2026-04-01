/**
 * TaskPool Tests — task queue with dependency resolution
 */

import { describe, it, expect } from 'vitest';
import { createTaskPool } from '../task-pool';
import type { TaskItem } from '../types';

// =============================================================================
// Helpers
// =============================================================================

function makeTask(overrides: Partial<TaskItem> = {}): TaskItem {
  return {
    id: overrides.id ?? `task-${Date.now()}`,
    description: 'Test task',
    prompt: 'Do something',
    agentType: 'general',
    status: 'pending',
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('TaskPool', () => {
  it('should start empty', () => {
    const pool = createTaskPool();
    expect(pool.size).toBe(0);
    expect(pool.getAll()).toEqual([]);
    expect(pool.isAllDone()).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // add / addAll
  // ---------------------------------------------------------------------------

  describe('add', () => {
    it('should add a task', () => {
      const pool = createTaskPool();
      pool.add(makeTask({ id: 'task-1' }));
      expect(pool.size).toBe(1);
      expect(pool.get('task-1')).toBeDefined();
    });

    it('should throw on duplicate ID', () => {
      const pool = createTaskPool();
      pool.add(makeTask({ id: 'dup' }));
      expect(() => pool.add(makeTask({ id: 'dup' }))).toThrow('Task already exists: dup');
    });

    it('should add multiple tasks with addAll', () => {
      const pool = createTaskPool();
      pool.addAll([makeTask({ id: 'a' }), makeTask({ id: 'b' }), makeTask({ id: 'c' })]);
      expect(pool.size).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // claim
  // ---------------------------------------------------------------------------

  describe('claim', () => {
    it('should claim a pending task', () => {
      const pool = createTaskPool();
      pool.add(makeTask({ id: 'task-1' }));

      const claimed = pool.claim('agent-1');
      expect(claimed).toBeDefined();
      expect(claimed!.id).toBe('task-1');
      expect(claimed!.status).toBe('claimed');
      expect(claimed!.claimedBy).toBe('agent-1');
    });

    it('should return undefined when no ready tasks', () => {
      const pool = createTaskPool();
      expect(pool.claim('agent-1')).toBeUndefined();
    });

    it('should not claim already-claimed tasks', () => {
      const pool = createTaskPool();
      pool.add(makeTask({ id: 'task-1' }));

      pool.claim('agent-1');
      expect(pool.claim('agent-2')).toBeUndefined();
    });

    it('should claim highest-priority task first', () => {
      const pool = createTaskPool();
      pool.add(makeTask({ id: 'low', priority: 1 }));
      pool.add(makeTask({ id: 'high', priority: 10 }));
      pool.add(makeTask({ id: 'mid', priority: 5 }));

      const claimed = pool.claim('agent-1');
      expect(claimed!.id).toBe('high');
    });

    it('should not claim task with unmet dependencies', () => {
      const pool = createTaskPool();
      pool.add(makeTask({ id: 'dep' }));
      pool.add(makeTask({ id: 'child', dependencies: ['dep'] }));

      // Only dep should be claimable
      const claimed = pool.claim('agent-1');
      expect(claimed!.id).toBe('dep');

      // child still not ready
      expect(pool.claim('agent-2')).toBeUndefined();
    });

    it('should claim task after dependency completes', () => {
      const pool = createTaskPool();
      pool.add(makeTask({ id: 'dep' }));
      pool.add(makeTask({ id: 'child', dependencies: ['dep'] }));

      const dep = pool.claim('agent-1');
      pool.markRunning(dep!.id);
      pool.complete(dep!.id, { id: 'dep', status: 'completed', response: 'done' });

      // Now child is ready
      const child = pool.claim('agent-2');
      expect(child).toBeDefined();
      expect(child!.id).toBe('child');
    });
  });

  // ---------------------------------------------------------------------------
  // markRunning / complete / fail
  // ---------------------------------------------------------------------------

  describe('markRunning', () => {
    it('should transition claimed to running', () => {
      const pool = createTaskPool();
      pool.add(makeTask({ id: 'task-1' }));
      pool.claim('agent-1');
      pool.markRunning('task-1');
      expect(pool.get('task-1')!.status).toBe('running');
    });

    it('should throw for non-claimed task', () => {
      const pool = createTaskPool();
      pool.add(makeTask({ id: 'task-1' }));
      expect(() => pool.markRunning('task-1')).toThrow('Cannot mark non-claimed task');
    });

    it('should throw for unknown task', () => {
      const pool = createTaskPool();
      expect(() => pool.markRunning('unknown')).toThrow('Task not found');
    });
  });

  describe('complete', () => {
    it('should complete a task and return notification', () => {
      const pool = createTaskPool();
      pool.add(makeTask({ id: 'task-1' }));
      pool.claim('agent-1');

      const notification = pool.complete('task-1', {
        id: 'task-1',
        status: 'completed',
        response: 'Done!',
        duration: 1000,
      });

      expect(notification.taskId).toBe('task-1');
      expect(notification.status).toBe('completed');
      expect(notification.result?.response).toBe('Done!');
      expect(pool.get('task-1')!.status).toBe('completed');
    });

    it('should throw for unknown task', () => {
      const pool = createTaskPool();
      expect(() => pool.complete('unknown', { id: 'x', status: 'completed' })).toThrow(
        'Task not found',
      );
    });
  });

  describe('fail', () => {
    it('should fail a task and return notification', () => {
      const pool = createTaskPool();
      pool.add(makeTask({ id: 'task-1' }));
      pool.claim('agent-1');

      const notification = pool.fail('task-1', 'Something went wrong', 500);

      expect(notification.taskId).toBe('task-1');
      expect(notification.status).toBe('failed');
      expect(notification.error).toBe('Something went wrong');
      expect(pool.get('task-1')!.status).toBe('failed');
    });
  });

  // ---------------------------------------------------------------------------
  // getReady / getByStatus / getProgress
  // ---------------------------------------------------------------------------

  describe('getReady', () => {
    it('should return pending tasks with no dependencies', () => {
      const pool = createTaskPool();
      pool.add(makeTask({ id: 'a' }));
      pool.add(makeTask({ id: 'b' }));
      expect(pool.getReady()).toHaveLength(2);
    });

    it('should exclude tasks with unmet dependencies', () => {
      const pool = createTaskPool();
      pool.add(makeTask({ id: 'a' }));
      pool.add(makeTask({ id: 'b', dependencies: ['a'] }));
      pool.add(makeTask({ id: 'c', dependencies: ['a', 'b'] }));

      expect(pool.getReady()).toHaveLength(1);
      expect(pool.getReady()[0]!.id).toBe('a');
    });

    it('should return empty for all-running pool', () => {
      const pool = createTaskPool();
      pool.add(makeTask({ id: 'a' }));
      pool.claim('agent-1');
      expect(pool.getReady()).toHaveLength(0);
    });
  });

  describe('getByStatus', () => {
    it('should filter by status', () => {
      const pool = createTaskPool();
      pool.add(makeTask({ id: 'a' }));
      pool.add(makeTask({ id: 'b' }));
      pool.claim('agent-1'); // claims 'a' or 'b'

      expect(pool.getByStatus('pending')).toHaveLength(1);
      expect(pool.getByStatus('claimed')).toHaveLength(1);
      expect(pool.getByStatus('completed')).toHaveLength(0);
    });
  });

  describe('getProgress', () => {
    it('should return correct progress', () => {
      const pool = createTaskPool();
      pool.add(makeTask({ id: 'a' }));
      pool.add(makeTask({ id: 'b' }));
      pool.add(makeTask({ id: 'c' }));

      pool.claim('agent-1'); // claims one (a by default since no priority)
      pool.complete('a', { id: 'a', status: 'completed', response: 'ok' });

      const progress = pool.getProgress();
      expect(progress.total).toBe(3);
      expect(progress.completed).toBe(1);
      expect(progress.pending).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // isAllDone / reset
  // ---------------------------------------------------------------------------

  describe('isAllDone', () => {
    it('should return true when all tasks are terminal', () => {
      const pool = createTaskPool();
      pool.add(makeTask({ id: 'a' }));
      pool.add(makeTask({ id: 'b' }));

      pool.claim('agent-1');
      pool.complete('a', { id: 'a', status: 'completed' });

      pool.claim('agent-2');
      pool.fail('b', 'error');

      expect(pool.isAllDone()).toBe(true);
    });

    it('should return false when tasks remain', () => {
      const pool = createTaskPool();
      pool.add(makeTask({ id: 'a' }));
      pool.add(makeTask({ id: 'b' }));

      pool.claim('agent-1');
      pool.complete('a', { id: 'a', status: 'completed' });

      expect(pool.isAllDone()).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset all tasks to pending', () => {
      const pool = createTaskPool();
      pool.add(makeTask({ id: 'a' }));
      pool.claim('agent-1');
      pool.complete('a', { id: 'a', status: 'completed' });

      pool.reset();

      expect(pool.get('a')!.status).toBe('pending');
      expect(pool.get('a')!.claimedBy).toBeUndefined();
      expect(pool.get('a')!.result).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Dependency chain
  // ---------------------------------------------------------------------------

  describe('dependency chain', () => {
    it('should resolve a linear dependency chain', () => {
      const pool = createTaskPool();
      pool.add(makeTask({ id: 'step-1' }));
      pool.add(makeTask({ id: 'step-2', dependencies: ['step-1'] }));
      pool.add(makeTask({ id: 'step-3', dependencies: ['step-2'] }));

      // Only step-1 ready
      expect(pool.getReady().map((t) => t.id)).toEqual(['step-1']);

      // Complete step-1 → step-2 unlocks
      pool.claim('agent-1');
      pool.markRunning('step-1');
      pool.complete('step-1', { id: 'step-1', status: 'completed' });
      expect(pool.getReady().map((t) => t.id)).toEqual(['step-2']);

      // Complete step-2 → step-3 unlocks
      pool.claim('agent-2');
      pool.markRunning('step-2');
      pool.complete('step-2', { id: 'step-2', status: 'completed' });
      expect(pool.getReady().map((t) => t.id)).toEqual(['step-3']);
    });

    it('should handle diamond dependency', () => {
      const pool = createTaskPool();
      //   A
      //  / \
      // B   C
      //  \ /
      //   D
      pool.add(makeTask({ id: 'A' }));
      pool.add(makeTask({ id: 'B', dependencies: ['A'] }));
      pool.add(makeTask({ id: 'C', dependencies: ['A'] }));
      pool.add(makeTask({ id: 'D', dependencies: ['B', 'C'] }));

      expect(pool.getReady().map((t) => t.id)).toEqual(['A']);

      // Complete A → B and C unlock
      pool.claim('a1');
      pool.complete('A', { id: 'A', status: 'completed' });
      const ready = pool
        .getReady()
        .map((t) => t.id)
        .sort();
      expect(ready).toEqual(['B', 'C']);

      // Complete B → D still blocked by C
      pool.claim('a2');
      pool.complete('B', { id: 'B', status: 'completed' });
      expect(pool.getReady().map((t) => t.id)).toEqual(['C']);

      // Complete C → D unlocks
      pool.claim('a3');
      pool.complete('C', { id: 'C', status: 'completed' });
      expect(pool.getReady().map((t) => t.id)).toEqual(['D']);
    });
  });
});
