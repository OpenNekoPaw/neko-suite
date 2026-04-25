import { describe, expect, it, vi } from 'vitest';
import type { Task } from '@neko-agent/types';
import { createTaskManagerIdcTaskProjection } from '../idc-task-projection';

describe('TaskManagerIdcTaskProjection', () => {
  it('projects IDC task items into IDC projected tasks', async () => {
    const store = {
      upsertIdcProjectedTask: vi.fn().mockResolvedValue(undefined),
      clearIdcProjectedTasksForRun: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(true),
    };
    const projection = createTaskManagerIdcTaskProjection({ store });
    const task: Task = {
      id: 'task-1',
      createdAt: 10,
      updatedAt: 20,
      items: [
        { id: 'a', content: 'Draft outline', status: 'pending' },
        {
          id: 'b',
          content: 'Render preview',
          status: 'in_progress',
          activeForm: 'Rendering preview',
        },
        { id: 'c', content: 'Export final', status: 'completed' },
      ],
    };

    const projectedIds = await projection.syncTask({
      runId: 'run-1',
      runStartedAt: 101,
      task,
      artifact: {
        kind: 'task',
        artifactId: 'task-1',
        path: '/tmp/proj/.neko/tasks/task-run-1.md',
        updatedAt: 20,
      },
    });

    expect(projectedIds).toEqual(['idc:run-1:a', 'idc:run-1:b', 'idc:run-1:c']);
    expect(store.upsertIdcProjectedTask).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: 'idc:run-1:a',
        status: 'pending',
        progress: 0,
      }),
    );
    expect(store.upsertIdcProjectedTask).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: 'idc:run-1:b',
        status: 'running',
        progress: 50,
        binding: expect.objectContaining({
          runStartedAt: 101,
          artifact: {
            kind: 'task',
            artifactId: 'task-1',
            path: '/tmp/proj/.neko/tasks/task-run-1.md',
            updatedAt: 20,
          },
        }),
        activeForm: 'Rendering preview',
        content: 'Render preview',
      }),
    );
    expect(store.upsertIdcProjectedTask).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        id: 'idc:run-1:c',
        status: 'completed',
        progress: 100,
      }),
    );
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('removes stale projected tasks when the checklist shrinks', async () => {
    const store = {
      upsertIdcProjectedTask: vi.fn().mockResolvedValue(undefined),
      clearIdcProjectedTasksForRun: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(true),
    };
    const projection = createTaskManagerIdcTaskProjection({ store });

    await projection.syncTask({
      runId: 'run-2',
      runStartedAt: 201,
      task: {
        id: 'task-2',
        createdAt: 1,
        updatedAt: 2,
        items: [
          { id: 'a', content: 'First', status: 'pending' },
          { id: 'b', content: 'Second', status: 'pending' },
        ],
      },
    });

    await projection.syncTask({
      runId: 'run-2',
      runStartedAt: 201,
      task: {
        id: 'task-2',
        createdAt: 1,
        updatedAt: 3,
        items: [{ id: 'b', content: 'Second', status: 'completed' }],
      },
    });

    expect(store.delete).toHaveBeenCalledWith('idc:run-2:a');
    expect(store.upsertIdcProjectedTask).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'idc:run-2:b',
        status: 'completed',
      }),
    );
  });

  it('clears persisted IDC projected tasks by run even without in-memory projection state', async () => {
    const store = {
      upsertIdcProjectedTask: vi.fn().mockResolvedValue(undefined),
      clearIdcProjectedTasksForRun: vi.fn().mockResolvedValue(['idc:run-3:a', 'idc:run-3:b']),
      delete: vi.fn().mockResolvedValue(true),
    };
    const projection = createTaskManagerIdcTaskProjection({ store });

    await projection.clearRun('run-3', 301);

    expect(store.clearIdcProjectedTasksForRun).toHaveBeenCalledWith('run-3', 301);
    expect(store.delete).not.toHaveBeenCalled();
  });
});
