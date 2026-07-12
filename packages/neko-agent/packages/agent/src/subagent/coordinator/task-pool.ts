/**
 * TaskPool — Shared task queue with dependency resolution
 *
 * Pure state container managing task lifecycle:
 * pending → claimed → running → completed | failed
 *
 * Features:
 * - Priority-based claim (higher priority first)
 * - Dependency resolution (task starts only when deps complete)
 * - Progress tracking
 */

import type { SubAgentResult } from '../types';
import type { TaskItem, TaskStatus, TaskNotification, TaskPoolProgress } from './types';

// =============================================================================
// TaskPool
// =============================================================================

export class TaskPool {
  private _tasks = new Map<string, TaskItem>();

  /** Number of tasks */
  get size(): number {
    return this._tasks.size;
  }

  /**
   * Add a task to the pool.
   * Throws if a task with the same ID already exists.
   */
  add(task: TaskItem): void {
    if (this._tasks.has(task.id)) {
      throw new Error(`Task already exists: ${task.id}`);
    }
    this._tasks.set(task.id, { ...task });
  }

  /**
   * Add multiple tasks at once.
   */
  addAll(tasks: TaskItem[]): void {
    for (const task of tasks) {
      this.add(task);
    }
  }

  /**
   * Claim the highest-priority ready task for a SubAgent.
   * Returns undefined if no tasks are available.
   *
   * A task is "ready" when:
   * 1. Status is 'pending'
   * 2. All dependencies are 'completed'
   */
  claim(agentId: string): TaskItem | undefined {
    const ready = this.getReady();
    if (ready.length === 0) return undefined;

    // Sort by priority descending (higher = first)
    ready.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    const task = ready[0]!;
    task.status = 'claimed';
    task.claimedBy = agentId;
    return task;
  }

  /**
   * Mark a claimed task as running.
   */
  markRunning(taskId: string): void {
    const task = this._tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (task.status !== 'claimed') {
      throw new Error(
        `Cannot mark non-claimed task as running: ${taskId} (status: ${task.status})`,
      );
    }
    task.status = 'running';
  }

  /**
   * Complete a task with result. Returns a TaskNotification.
   */
  complete(taskId: string, result: SubAgentResult): TaskNotification {
    const task = this._tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    task.status = 'completed';
    task.result = result;

    return {
      taskId,
      subAgentId: task.claimedBy ?? '',
      status: 'completed',
      result: {
        response: result.response ?? '',
      },
      duration: result.duration ?? 0,
      timestamp: Date.now(),
    };
  }

  /**
   * Fail a task with error. Returns a TaskNotification.
   */
  fail(taskId: string, error: string, duration = 0): TaskNotification {
    const task = this._tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    task.status = 'failed';
    task.result = undefined;

    return {
      taskId,
      subAgentId: task.claimedBy ?? '',
      status: 'failed',
      error,
      duration,
      timestamp: Date.now(),
    };
  }

  /**
   * Get tasks that are ready to be claimed (pending + dependencies met).
   */
  getReady(): TaskItem[] {
    const result: TaskItem[] = [];
    for (const task of this._tasks.values()) {
      if (task.status !== 'pending') continue;
      if (this.areDependenciesMet(task)) {
        result.push(task);
      }
    }
    return result;
  }

  /**
   * Get task by ID.
   */
  get(taskId: string): TaskItem | undefined {
    return this._tasks.get(taskId);
  }

  /**
   * Get all tasks.
   */
  getAll(): TaskItem[] {
    return Array.from(this._tasks.values());
  }

  /**
   * Get tasks by status.
   */
  getByStatus(status: TaskStatus): TaskItem[] {
    return Array.from(this._tasks.values()).filter((t) => t.status === status);
  }

  /**
   * Get current progress snapshot.
   */
  getProgress(): TaskPoolProgress {
    let pending = 0;
    let running = 0;
    let completed = 0;
    let failed = 0;

    for (const task of this._tasks.values()) {
      switch (task.status) {
        case 'pending':
          pending++;
          break;
        case 'claimed':
        case 'running':
          running++;
          break;
        case 'completed':
          completed++;
          break;
        case 'failed':
          failed++;
          break;
      }
    }

    return { total: this._tasks.size, pending, running, completed, failed };
  }

  /**
   * Check if all tasks are terminal (completed or failed).
   */
  isAllDone(): boolean {
    for (const task of this._tasks.values()) {
      if (task.status !== 'completed' && task.status !== 'failed') {
        return false;
      }
    }
    return this._tasks.size > 0;
  }

  /**
   * Reset all tasks to pending.
   */
  reset(): void {
    for (const task of this._tasks.values()) {
      task.status = 'pending';
      task.claimedBy = undefined;
      task.result = undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /**
   * Check if all dependencies of a task are completed.
   */
  private areDependenciesMet(task: TaskItem): boolean {
    if (!task.dependencies || task.dependencies.length === 0) {
      return true;
    }

    for (const depId of task.dependencies) {
      const dep = this._tasks.get(depId);
      if (!dep || dep.status !== 'completed') {
        return false;
      }
    }
    return true;
  }
}

// =============================================================================
// Factory
// =============================================================================

/** Create a new TaskPool instance */
export function createTaskPool(): TaskPool {
  return new TaskPool();
}
