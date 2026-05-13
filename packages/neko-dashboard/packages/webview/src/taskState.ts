import type { DashboardTask } from '@neko/shared';

export function applyTaskChange(
  tasks: readonly DashboardTask[],
  task: DashboardTask,
  eventType: 'added' | 'updated' | 'removed',
): DashboardTask[] {
  if (eventType === 'removed') {
    return tasks.filter((existing) => existing.taskId !== task.taskId);
  }

  const index = tasks.findIndex((existing) => existing.taskId === task.taskId);
  if (index === -1) {
    return [task, ...tasks];
  }

  return tasks.map((existing) => (existing.taskId === task.taskId ? task : existing));
}
