/**
 * TaskPool — Coordinator-owned task queue with dependency resolution.
 *
 * Every mutable worker assignment is bound to one complete ChildRunScope.
 * Local task and worker IDs are presentation handles only.
 */

import {
  formatChildRunScope,
  formatRunScope,
  validateChildRunScope,
  validateConversationRunScope,
  type ChildRunScope,
  type ConversationRunScope,
} from '@neko-agent/types';
import type { SubAgentResult } from '../types';
import type { TaskItem, TaskStatus, TaskNotification, TaskPoolProgress } from './types';

export class TaskPool {
  private readonly tasks = new Map<string, TaskItem>();
  private readonly ownerScope: ConversationRunScope;

  constructor(
    ownerScope: ConversationRunScope,
    private readonly parentRunId: string,
  ) {
    const validated = validateConversationRunScope(ownerScope);
    if (!validated.ok) throw new Error(validated.diagnostic.message);
    if (parentRunId.trim().length === 0) {
      throw new Error('TaskPool requires a non-empty parentRunId.');
    }
    this.ownerScope = validated.scope;
  }

  get size(): number {
    return this.tasks.size;
  }

  add(task: TaskItem): void {
    if (this.tasks.has(task.id)) throw new Error(`Task already exists: ${task.id}`);
    if (task.status !== 'pending') {
      throw new Error(`New TaskPool task must be pending: ${task.id}`);
    }
    if (task.workerScope || task.result) {
      throw new Error(`New TaskPool task must not carry runtime ownership or result: ${task.id}`);
    }
    this.tasks.set(task.id, { ...task });
  }

  addAll(tasks: TaskItem[]): void {
    for (const task of tasks) this.add(task);
  }

  getNextReady(): TaskItem | undefined {
    return this.getReady().sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
  }

  claim(taskId: string, workerScope: ChildRunScope): TaskItem {
    const task = this.requireTask(taskId);
    if (task.status !== 'pending' || !this.areDependenciesMet(task)) {
      throw new Error(`Task is not ready to claim: ${taskId} (status: ${task.status})`);
    }
    const scope = this.requireOwnedWorkerScope(workerScope);
    const scopeKey = formatChildRunScope(scope);
    for (const existing of this.tasks.values()) {
      if (existing.workerScope && formatChildRunScope(existing.workerScope) === scopeKey) {
        throw new Error(`TaskPool worker scope already assigned: ${scopeKey}`);
      }
    }
    task.status = 'claimed';
    task.workerScope = scope;
    return task;
  }

  markRunning(taskId: string, workerScope: ChildRunScope): void {
    const task = this.requireTask(taskId);
    this.requireAssignedWorker(task, workerScope);
    if (task.status !== 'claimed') {
      throw new Error(
        `Cannot mark non-claimed task as running: ${taskId} (status: ${task.status})`,
      );
    }
    task.status = 'running';
  }

  complete(taskId: string, result: SubAgentResult): TaskNotification {
    const task = this.requireTask(taskId);
    const workerScope = this.requireAssignedWorker(task, result.scope);
    if (task.status !== 'running') {
      throw new Error(`Cannot complete non-running task: ${taskId} (status: ${task.status})`);
    }

    task.status = 'completed';
    task.result = result;
    return {
      taskId,
      workerScope,
      status: 'completed',
      result: { response: result.response ?? '' },
      duration: result.duration ?? 0,
      timestamp: Date.now(),
    };
  }

  fail(taskId: string, workerScope: ChildRunScope, error: string, duration = 0): TaskNotification {
    const task = this.requireTask(taskId);
    const scope = this.requireAssignedWorker(task, workerScope);
    if (task.status !== 'claimed' && task.status !== 'running') {
      throw new Error(`Cannot fail inactive task: ${taskId} (status: ${task.status})`);
    }

    task.status = 'failed';
    task.result = undefined;
    return {
      taskId,
      workerScope: scope,
      status: 'failed',
      error,
      duration,
      timestamp: Date.now(),
    };
  }

  getReady(): TaskItem[] {
    const result: TaskItem[] = [];
    for (const task of this.tasks.values()) {
      if (task.status === 'pending' && this.areDependenciesMet(task)) result.push(task);
    }
    return result;
  }

  get(taskId: string): TaskItem | undefined {
    return this.tasks.get(taskId);
  }

  getAll(): TaskItem[] {
    return Array.from(this.tasks.values());
  }

  getByStatus(status: TaskStatus): TaskItem[] {
    return Array.from(this.tasks.values()).filter((task) => task.status === status);
  }

  getProgress(): TaskPoolProgress {
    let pending = 0;
    let running = 0;
    let completed = 0;
    let failed = 0;
    for (const task of this.tasks.values()) {
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
    return { total: this.tasks.size, pending, running, completed, failed };
  }

  isAllDone(): boolean {
    for (const task of this.tasks.values()) {
      if (task.status !== 'completed' && task.status !== 'failed') return false;
    }
    return this.tasks.size > 0;
  }

  reset(): void {
    for (const task of this.tasks.values()) {
      task.status = 'pending';
      task.workerScope = undefined;
      task.result = undefined;
    }
  }

  private requireTask(taskId: string): TaskItem {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    return task;
  }

  private requireOwnedWorkerScope(scope: ChildRunScope): ChildRunScope {
    const validated = validateChildRunScope(scope);
    if (!validated.ok) throw new Error(validated.diagnostic.message);
    const worker = validated.scope;
    if (
      worker.childKind !== 'subagent' ||
      worker.conversationId !== this.ownerScope.conversationId ||
      worker.runId !== this.ownerScope.runId ||
      worker.parentRunId !== this.parentRunId
    ) {
      throw new Error(
        `TaskPool worker owner mismatch: expected ${formatRunScope(this.ownerScope)}/${this.parentRunId}/subagent, received ${formatChildRunScope(worker)}.`,
      );
    }
    return worker;
  }

  private requireAssignedWorker(task: TaskItem, actualScope: ChildRunScope): ChildRunScope {
    const actual = this.requireOwnedWorkerScope(actualScope);
    const assigned = task.workerScope;
    if (!assigned) throw new Error(`Task has no assigned worker scope: ${task.id}`);
    if (formatChildRunScope(assigned) !== formatChildRunScope(actual)) {
      throw new Error(
        `Task worker scope mismatch for ${task.id}: expected ${formatChildRunScope(assigned)}, received ${formatChildRunScope(actual)}.`,
      );
    }
    return assigned;
  }

  private areDependenciesMet(task: TaskItem): boolean {
    for (const dependencyId of task.dependencies ?? []) {
      const dependency = this.tasks.get(dependencyId);
      if (!dependency || dependency.status !== 'completed') return false;
    }
    return true;
  }
}

export function createTaskPool(ownerScope: ConversationRunScope, parentRunId: string): TaskPool {
  return new TaskPool(ownerScope, parentRunId);
}
