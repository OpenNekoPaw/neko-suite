import type { SerializableTask, TaskStatus } from '@neko/shared';

export const DEFAULT_TASK_STORAGE_KEY = 'neko.agent.tasks';
export const DEFAULT_TASK_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
export const DEFAULT_TASK_RETENTION_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
export const RECOVERABLE_TASK_STATUSES: readonly TaskStatus[] = ['pending', 'running'];
export const CLEANUP_TASK_STATUSES: readonly TaskStatus[] = ['completed', 'failed', 'cancelled'];

export interface TaskStorageCleanupPlan {
  readonly retained: SerializableTask[];
  readonly removed: SerializableTask[];
}

export function isRecoverableTaskStatus(status: TaskStatus): boolean {
  return RECOVERABLE_TASK_STATUSES.includes(status);
}

export function isTaskCleanupStatus(status: TaskStatus): boolean {
  return CLEANUP_TASK_STATUSES.includes(status);
}

export function isRecoverableTask(task: Pick<SerializableTask, 'status'>): boolean {
  return isRecoverableTaskStatus(task.status);
}

export function isTaskCleanupCandidate(
  task: Pick<SerializableTask, 'status' | 'updatedAt'>,
  cutoffTimestamp: number,
): boolean {
  return isTaskCleanupStatus(task.status) && task.updatedAt < cutoffTimestamp;
}

export function filterRecoverableTasks(tasks: readonly SerializableTask[]): SerializableTask[] {
  return tasks.filter(isRecoverableTask).map((task) => ({ ...task }));
}

export function buildTaskStorageCleanupPlan(input: {
  readonly tasks: readonly SerializableTask[];
  readonly olderThanMs: number;
  readonly now?: () => number;
}): TaskStorageCleanupPlan {
  const cutoff = (input.now?.() ?? Date.now()) - input.olderThanMs;
  const retained: SerializableTask[] = [];
  const removed: SerializableTask[] = [];

  for (const task of input.tasks) {
    if (isTaskCleanupCandidate(task, cutoff)) {
      removed.push(task);
    } else {
      retained.push(task);
    }
  }

  return { retained, removed };
}
