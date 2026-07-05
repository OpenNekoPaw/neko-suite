import { describe, expect, it, vi } from 'vitest';
import type { Task } from '@neko-agent/types';
import { createTaskManagerCreationTaskProjection } from '../creation-task-projection';

describe('TaskManagerCreationTaskProjection', () => {
  it('projects Agent creation task items into creation projected tasks', async () => {
    const store = {
      upsertCreationProjectedTask: vi.fn().mockResolvedValue(undefined),
      clearCreationProjectedTasksForRun: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(true),
    };
    const projection = createTaskManagerCreationTaskProjection({ store });
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
      conversationId: 'conv-1',
      runId: 'run-1',
      runStartedAt: 101,
      task,
      artifact: {
        kind: 'task',
        artifactId: 'task-1',
        path: '/tmp/proj/neko/creations/cut-launch-teaser-draft-1/checklist.md',
        updatedAt: 20,
      },
    });

    expect(projectedIds).toEqual(['creation:run-1:a', 'creation:run-1:b', 'creation:run-1:c']);
    expect(store.upsertCreationProjectedTask).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: 'creation:run-1:a',
        status: 'pending',
        progress: 0,
      }),
    );
    expect(store.upsertCreationProjectedTask).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: 'creation:run-1:b',
        status: 'running',
        progress: 50,
        binding: expect.objectContaining({
          conversationId: 'conv-1',
          runStartedAt: 101,
          artifact: {
            kind: 'task',
            artifactId: 'task-1',
            path: '/tmp/proj/neko/creations/cut-launch-teaser-draft-1/checklist.md',
            updatedAt: 20,
          },
        }),
        activeForm: 'Rendering preview',
        content: 'Render preview',
      }),
    );
    expect(store.upsertCreationProjectedTask).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        id: 'creation:run-1:c',
        status: 'completed',
        progress: 100,
      }),
    );
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('removes stale projected tasks when the checklist shrinks', async () => {
    const store = {
      upsertCreationProjectedTask: vi.fn().mockResolvedValue(undefined),
      clearCreationProjectedTasksForRun: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(true),
    };
    const projection = createTaskManagerCreationTaskProjection({ store });

    await projection.syncTask({
      conversationId: 'conv-1',
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
      conversationId: 'conv-1',
      runId: 'run-2',
      runStartedAt: 201,
      task: {
        id: 'task-2',
        createdAt: 1,
        updatedAt: 3,
        items: [{ id: 'b', content: 'Second', status: 'completed' }],
      },
    });

    expect(store.delete).toHaveBeenCalledWith('creation:run-2:a');
    expect(store.upsertCreationProjectedTask).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'creation:run-2:b',
        status: 'completed',
      }),
    );
  });

  it('clears persisted creation projected tasks by legacy trace run even without in-memory projection state', async () => {
    const store = {
      upsertCreationProjectedTask: vi.fn().mockResolvedValue(undefined),
      clearCreationProjectedTasksForRun: vi
        .fn()
        .mockResolvedValue(['creation:run-3:a', 'creation:run-3:b']),
      delete: vi.fn().mockResolvedValue(true),
    };
    const projection = createTaskManagerCreationTaskProjection({ store });

    await projection.clearRun('run-3', 301);

    expect(store.clearCreationProjectedTasksForRun).toHaveBeenCalledWith('run-3', 301);
    expect(store.delete).not.toHaveBeenCalled();
  });
});
