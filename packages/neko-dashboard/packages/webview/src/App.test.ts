import { describe, expect, it } from 'vitest';
import type { DashboardTask } from '@neko/shared';
import { applyTaskChange } from './taskState';

const baseTask: DashboardTask = {
  taskId: 'neko-agent:task-1',
  source: 'neko-agent',
  sourceTaskId: 'task-1',
  kind: 'generate-image',
  title: 'Generate image',
  status: 'running',
  progress: 10,
  actions: ['cancel'],
  startedAt: 1,
};

describe('dashboard task reducer helpers', () => {
  it('adds a new task', () => {
    expect(applyTaskChange([], baseTask, 'added')).toEqual([baseTask]);
  });

  it('updates an existing task without duplication', () => {
    const updated = { ...baseTask, progress: 80 };
    const result = applyTaskChange([baseTask], updated, 'updated');

    expect(result).toHaveLength(1);
    expect(result[0]?.progress).toBe(80);
  });

  it('removes an existing task', () => {
    expect(applyTaskChange([baseTask], baseTask, 'removed')).toEqual([]);
  });
});
