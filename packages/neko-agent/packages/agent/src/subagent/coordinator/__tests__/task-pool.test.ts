/**
 * TaskPool Tests — task queue with dependency resolution
 */

import { describe, it, expect } from 'vitest';
import { createTaskPool, type TaskPool } from '../task-pool';
import type { TaskItem } from '../types';
import type { ChildRunScope, ConversationRunScope } from '@neko-agent/types';
import type { SubAgentResult } from '../../types';

// =============================================================================
// Helpers
// =============================================================================

const RUN_SCOPE = { conversationId: 'conv-1', runId: 'run-1' } as const;
const PARENT_RUN_ID = 'parent-1';

function createTestPool(
  runScope: ConversationRunScope = RUN_SCOPE,
  parentRunId = PARENT_RUN_ID,
): TaskPool {
  return createTaskPool(runScope, parentRunId);
}

function workerScope(
  childRunId: string,
  conversationId: string = RUN_SCOPE.conversationId,
  runId: string = RUN_SCOPE.runId,
  parentRunId: string = PARENT_RUN_ID,
): ChildRunScope {
  return { conversationId, runId, parentRunId, childRunId, childKind: 'subagent' };
}

function claimNext(pool: TaskPool, childRunId: string): TaskItem | undefined {
  const task = pool.getNextReady();
  return task ? pool.claim(task.id, workerScope(childRunId)) : undefined;
}

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

function assignedWorkerScope(pool: TaskPool, taskId: string): ChildRunScope {
  const scope = pool.get(taskId)?.workerScope;
  if (!scope) throw new Error(`Missing assigned worker in test: ${taskId}`);
  return scope;
}

function subAgentResult(
  scope: ChildRunScope,
  overrides: Partial<SubAgentResult> = {},
): SubAgentResult {
  return {
    scope,
    id: scope.childRunId,
    status: 'completed',
    ...overrides,
  };
}

function completeTask(pool: TaskPool, taskId: string, overrides: Partial<SubAgentResult> = {}) {
  const scope = assignedWorkerScope(pool, taskId);
  if (pool.get(taskId)?.status === 'claimed') pool.markRunning(taskId, scope);
  return pool.complete(taskId, subAgentResult(scope, overrides));
}

function failTask(pool: TaskPool, taskId: string, error: string, duration = 0) {
  return pool.fail(taskId, assignedWorkerScope(pool, taskId), error, duration);
}

// =============================================================================
// Tests
// =============================================================================

describe('TaskPool', () => {
  it('should start empty', () => {
    const pool = createTestPool();
    expect(pool.size).toBe(0);
    expect(pool.getAll()).toEqual([]);
    expect(pool.isAllDone()).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // add / addAll
  // ---------------------------------------------------------------------------

  describe('add', () => {
    it('should add a task', () => {
      const pool = createTestPool();
      pool.add(makeTask({ id: 'task-1' }));
      expect(pool.size).toBe(1);
      expect(pool.get('task-1')).toBeDefined();
    });

    it('should throw on duplicate ID', () => {
      const pool = createTestPool();
      pool.add(makeTask({ id: 'dup' }));
      expect(() => pool.add(makeTask({ id: 'dup' }))).toThrow('Task already exists: dup');
    });

    it('should add multiple tasks with addAll', () => {
      const pool = createTestPool();
      pool.addAll([makeTask({ id: 'a' }), makeTask({ id: 'b' }), makeTask({ id: 'c' })]);
      expect(pool.size).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // claim
  // ---------------------------------------------------------------------------

  describe('claim', () => {
    it('should claim a pending task', () => {
      const pool = createTestPool();
      pool.add(makeTask({ id: 'task-1' }));

      const claimed = claimNext(pool, 'agent-1');
      expect(claimed).toBeDefined();
      expect(claimed!.id).toBe('task-1');
      expect(claimed!.status).toBe('claimed');
      expect(claimed!.workerScope).toEqual(workerScope('agent-1'));
    });

    it('should return undefined when no ready tasks', () => {
      const pool = createTestPool();
      expect(claimNext(pool, 'agent-1')).toBeUndefined();
    });

    it('should not claim already-claimed tasks', () => {
      const pool = createTestPool();
      pool.add(makeTask({ id: 'task-1' }));

      claimNext(pool, 'agent-1');
      expect(claimNext(pool, 'agent-2')).toBeUndefined();
    });

    it('should claim highest-priority task first', () => {
      const pool = createTestPool();
      pool.add(makeTask({ id: 'low', priority: 1 }));
      pool.add(makeTask({ id: 'high', priority: 10 }));
      pool.add(makeTask({ id: 'mid', priority: 5 }));

      const claimed = claimNext(pool, 'agent-1');
      expect(claimed!.id).toBe('high');
    });

    it('should not claim task with unmet dependencies', () => {
      const pool = createTestPool();
      pool.add(makeTask({ id: 'dep' }));
      pool.add(makeTask({ id: 'child', dependencies: ['dep'] }));

      // Only dep should be claimable
      const claimed = claimNext(pool, 'agent-1');
      expect(claimed!.id).toBe('dep');

      // child still not ready
      expect(claimNext(pool, 'agent-2')).toBeUndefined();
    });

    it('should claim task after dependency completes', () => {
      const pool = createTestPool();
      pool.add(makeTask({ id: 'dep' }));
      pool.add(makeTask({ id: 'child', dependencies: ['dep'] }));

      const dep = claimNext(pool, 'agent-1');
      completeTask(pool, dep!.id, { response: 'done' });

      // Now child is ready
      const child = claimNext(pool, 'agent-2');
      expect(child).toBeDefined();
      expect(child!.id).toBe('child');
    });
  });

  // ---------------------------------------------------------------------------
  // markRunning / complete / fail
  // ---------------------------------------------------------------------------

  describe('markRunning', () => {
    it('should transition claimed to running', () => {
      const pool = createTestPool();
      pool.add(makeTask({ id: 'task-1' }));
      claimNext(pool, 'agent-1');
      pool.markRunning('task-1', assignedWorkerScope(pool, 'task-1'));
      expect(pool.get('task-1')!.status).toBe('running');
    });

    it('should throw for non-claimed task', () => {
      const pool = createTestPool();
      pool.add(makeTask({ id: 'task-1' }));
      expect(() => pool.markRunning('task-1', workerScope('agent-1'))).toThrow(
        'Task has no assigned worker scope',
      );
    });

    it('should throw for unknown task', () => {
      const pool = createTestPool();
      expect(() => pool.markRunning('unknown', workerScope('agent-1'))).toThrow('Task not found');
    });
  });

  describe('complete', () => {
    it('should complete a task and return notification', () => {
      const pool = createTestPool();
      pool.add(makeTask({ id: 'task-1' }));
      claimNext(pool, 'agent-1');

      const notification = completeTask(pool, 'task-1', { response: 'Done!', duration: 1000 });

      expect(notification.taskId).toBe('task-1');
      expect(notification.workerScope).toEqual(workerScope('agent-1'));
      expect(notification.status).toBe('completed');
      expect(notification.result?.response).toBe('Done!');
      expect(pool.get('task-1')!.status).toBe('completed');
    });

    it('should throw for unknown task', () => {
      const pool = createTestPool();
      expect(() => pool.complete('unknown', subAgentResult(workerScope('x')))).toThrow(
        'Task not found',
      );
    });
  });

  describe('fail', () => {
    it('should fail a task and return notification', () => {
      const pool = createTestPool();
      pool.add(makeTask({ id: 'task-1' }));
      claimNext(pool, 'agent-1');

      const notification = failTask(pool, 'task-1', 'Something went wrong', 500);

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
      const pool = createTestPool();
      pool.add(makeTask({ id: 'a' }));
      pool.add(makeTask({ id: 'b' }));
      expect(pool.getReady()).toHaveLength(2);
    });

    it('should exclude tasks with unmet dependencies', () => {
      const pool = createTestPool();
      pool.add(makeTask({ id: 'a' }));
      pool.add(makeTask({ id: 'b', dependencies: ['a'] }));
      pool.add(makeTask({ id: 'c', dependencies: ['a', 'b'] }));

      expect(pool.getReady()).toHaveLength(1);
      expect(pool.getReady()[0]!.id).toBe('a');
    });

    it('should return empty for all-running pool', () => {
      const pool = createTestPool();
      pool.add(makeTask({ id: 'a' }));
      claimNext(pool, 'agent-1');
      expect(pool.getReady()).toHaveLength(0);
    });
  });

  describe('getByStatus', () => {
    it('should filter by status', () => {
      const pool = createTestPool();
      pool.add(makeTask({ id: 'a' }));
      pool.add(makeTask({ id: 'b' }));
      claimNext(pool, 'agent-1'); // claims 'a' or 'b'

      expect(pool.getByStatus('pending')).toHaveLength(1);
      expect(pool.getByStatus('claimed')).toHaveLength(1);
      expect(pool.getByStatus('completed')).toHaveLength(0);
    });
  });

  describe('getProgress', () => {
    it('should return correct progress', () => {
      const pool = createTestPool();
      pool.add(makeTask({ id: 'a' }));
      pool.add(makeTask({ id: 'b' }));
      pool.add(makeTask({ id: 'c' }));

      claimNext(pool, 'agent-1'); // claims one (a by default since no priority)
      completeTask(pool, 'a', { response: 'ok' });

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
      const pool = createTestPool();
      pool.add(makeTask({ id: 'a' }));
      pool.add(makeTask({ id: 'b' }));

      claimNext(pool, 'agent-1');
      completeTask(pool, 'a');

      claimNext(pool, 'agent-2');
      failTask(pool, 'b', 'error');

      expect(pool.isAllDone()).toBe(true);
    });

    it('should return false when tasks remain', () => {
      const pool = createTestPool();
      pool.add(makeTask({ id: 'a' }));
      pool.add(makeTask({ id: 'b' }));

      claimNext(pool, 'agent-1');
      completeTask(pool, 'a');

      expect(pool.isAllDone()).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset all tasks to pending', () => {
      const pool = createTestPool();
      pool.add(makeTask({ id: 'a' }));
      claimNext(pool, 'agent-1');
      completeTask(pool, 'a');

      pool.reset();

      expect(pool.get('a')!.status).toBe('pending');
      expect(pool.get('a')!.workerScope).toBeUndefined();
      expect(pool.get('a')!.result).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Dependency chain
  // ---------------------------------------------------------------------------

  describe('dependency chain', () => {
    it('should resolve a linear dependency chain', () => {
      const pool = createTestPool();
      pool.add(makeTask({ id: 'step-1' }));
      pool.add(makeTask({ id: 'step-2', dependencies: ['step-1'] }));
      pool.add(makeTask({ id: 'step-3', dependencies: ['step-2'] }));

      // Only step-1 ready
      expect(pool.getReady().map((t) => t.id)).toEqual(['step-1']);

      // Complete step-1 → step-2 unlocks
      claimNext(pool, 'agent-1');
      completeTask(pool, 'step-1');
      expect(pool.getReady().map((t) => t.id)).toEqual(['step-2']);

      // Complete step-2 → step-3 unlocks
      claimNext(pool, 'agent-2');
      completeTask(pool, 'step-2');
      expect(pool.getReady().map((t) => t.id)).toEqual(['step-3']);
    });

    it('should handle diamond dependency', () => {
      const pool = createTestPool();
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
      claimNext(pool, 'a1');
      completeTask(pool, 'A');
      const ready = pool
        .getReady()
        .map((t) => t.id)
        .sort();
      expect(ready).toEqual(['B', 'C']);

      // Complete B → D still blocked by C
      claimNext(pool, 'a2');
      completeTask(pool, 'B');
      expect(pool.getReady().map((t) => t.id)).toEqual(['C']);

      // Complete C → D unlocks
      claimNext(pool, 'a3');
      completeTask(pool, 'C');
      expect(pool.getReady().map((t) => t.id)).toEqual(['D']);
    });
  });
  describe('runtime ownership isolation', () => {
    it('allows equal task and worker IDs in different conversation runs', () => {
      const poolA = createTestPool({ conversationId: 'conv-a', runId: 'run-a' });
      const poolB = createTestPool({ conversationId: 'conv-b', runId: 'run-b' });
      poolA.add(makeTask({ id: 'same-task' }));
      poolB.add(makeTask({ id: 'same-task' }));

      const scopeA = workerScope('same-worker', 'conv-a', 'run-a');
      const scopeB = workerScope('same-worker', 'conv-b', 'run-b');
      poolA.claim('same-task', scopeA);
      poolB.claim('same-task', scopeB);
      poolA.markRunning('same-task', scopeA);
      poolA.complete('same-task', subAgentResult(scopeA));

      expect(poolA.get('same-task')?.status).toBe('completed');
      expect(poolB.get('same-task')?.status).toBe('claimed');
      expect(poolB.get('same-task')?.workerScope).toEqual(scopeB);
    });

    it('rejects workers owned by another conversation run', () => {
      const pool = createTestPool();
      pool.add(makeTask({ id: 'task-1' }));

      expect(() =>
        pool.claim('task-1', workerScope('worker-1', 'conv-other', 'run-other')),
      ).toThrow('TaskPool worker owner mismatch');
      expect(pool.get('task-1')?.status).toBe('pending');
    });

    it('rejects assigning one complete worker scope to multiple local tasks', () => {
      const pool = createTestPool();
      pool.add(makeTask({ id: 'task-1' }));
      pool.add(makeTask({ id: 'task-2' }));
      const scope = workerScope('worker-1');
      pool.claim('task-1', scope);

      expect(() => pool.claim('task-2', scope)).toThrow('TaskPool worker scope already assigned');
      expect(pool.get('task-2')?.status).toBe('pending');
    });

    it('rejects a result from a different scoped worker', () => {
      const pool = createTestPool();
      pool.add(makeTask({ id: 'task-1' }));
      const assigned = workerScope('worker-1');
      pool.claim('task-1', assigned);
      pool.markRunning('task-1', assigned);

      expect(() => pool.complete('task-1', subAgentResult(workerScope('worker-other')))).toThrow(
        'Task worker scope mismatch',
      );
      expect(pool.get('task-1')?.status).toBe('running');
    });
  });
});
