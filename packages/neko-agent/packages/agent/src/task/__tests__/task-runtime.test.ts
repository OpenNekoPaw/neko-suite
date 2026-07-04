import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import type { AgentMediaTaskView } from '@neko-agent/types';
import type { Task, TaskStatus } from '@neko/shared';
import {
  runCancelTaskRuntime,
  runClearCompletedTasksRuntime,
  runRemoveTaskRuntime,
  runRetryTaskRuntime,
  runSendTasksRuntime,
  runViewTaskResultRuntime,
  type TaskRuntimeEffects,
  type TaskRuntimeMediaGateway,
  type TaskRuntimeTaskManager,
} from '../task-runtime';

describe('task runtime', () => {
  let taskManager: MockTaskManager;
  let media: MockMediaGateway;
  let postMessage: MockPostMessage;
  let openTaskResult: MockOpenTaskResult;
  let onRejectedAction: MockRejectedAction;
  let onRetryFailed: MockRetryFailed;
  let effects: TaskRuntimeEffects;

  beforeEach(() => {
    taskManager = createTaskManager();
    media = createMediaGateway();
    postMessage = vi.fn<MockPostMessage>();
    openTaskResult = vi.fn<MockOpenTaskResult>();
    onRejectedAction = vi.fn<MockRejectedAction>();
    onRetryFailed = vi.fn<MockRetryFailed>();
    effects = {
      postMessage,
      openTaskResult,
      onRejectedAction,
      onRetryFailed,
    };
  });

  it('sends conversation-scoped task views', async () => {
    taskManager.list.mockResolvedValue([
      createTask({ id: 'task-1', payload: { conversationId: 'conv-1', prompt: 'Generate cat' } }),
      createTask({ id: 'task-2', payload: { conversationId: 'conv-2', prompt: 'Other task' } }),
    ]);

    const result = await runSendTasksRuntime(
      { conversationId: 'conv-1' },
      { taskManager },
      effects,
    );

    expect(result).toEqual({ kind: 'tasks-sent', conversationId: 'conv-1', taskIds: ['task-1'] });
    expect(postMessage).toHaveBeenCalledWith({
      type: 'tasksUpdated',
      conversationId: 'conv-1',
      workItems: [
        expect.objectContaining({
          id: 'task-1',
          kind: 'tool-background-task',
          task: expect.objectContaining({
            type: 'image',
            name: 'Generate cat',
          }),
        }),
      ],
    });
  });

  it('cancels media tasks when task-manager storage has no task', async () => {
    taskManager.get.mockResolvedValue(undefined);
    media.getCandidate.mockResolvedValue({ id: 'media-1', conversationId: 'conv-1' });
    media.cancelTask.mockResolvedValue(createMediaTaskView({ id: 'media-1', status: 'cancelled' }));

    const result = await runCancelTaskRuntime(
      { taskId: 'media-1', conversationId: 'conv-1' },
      { taskManager, media },
      effects,
    );

    expect(result.kind).toBe('cancelled-media');
    expect(taskManager.cancel).not.toHaveBeenCalled();
    expect(media.cancelTask).toHaveBeenCalledWith('media-1');
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'mediaTaskProgress',
        conversationId: 'conv-1',
        workItem: expect.objectContaining({
          id: 'media-1',
          kind: 'media-task',
          status: 'cancelled',
        }),
      }),
    );
  });

  it('projects retry failures through the shared task schema', async () => {
    const task = createTask({
      id: 'task-1',
      status: 'failed',
      payload: { conversationId: 'conv-1', prompt: 'Generate cat' },
    });
    taskManager.get.mockResolvedValue(task);
    taskManager.submit.mockRejectedValue(new Error('quota exceeded'));

    const result = await runRetryTaskRuntime(
      { taskId: 'task-1', conversationId: 'conv-1' },
      { taskManager },
      effects,
    );

    expect(result.kind).toBe('retry-failed');
    expect(onRetryFailed).toHaveBeenCalledWith({
      taskId: 'task-1',
      conversationId: 'conv-1',
      error: expect.any(Error),
    });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'taskUpdated',
        conversationId: 'conv-1',
        workItem: expect.objectContaining({
          id: 'task-1',
          kind: 'tool-background-task',
          status: 'failed',
          error: 'Retry failed: quota exceeded',
        }),
      }),
    );
  });

  it('removes task-manager and media records for the owning conversation', async () => {
    taskManager.get.mockResolvedValue(
      createTask({ id: 'task-1', payload: { conversationId: 'conv-1' } }),
    );

    const result = await runRemoveTaskRuntime(
      { taskId: 'task-1', conversationId: 'conv-1' },
      { taskManager, media },
      effects,
    );

    expect(result.kind).toBe('removed');
    expect(taskManager.delete).toHaveBeenCalledWith('task-1');
    expect(media.deleteTask).toHaveBeenCalledWith('task-1');
    expect(postMessage).toHaveBeenCalledWith({
      type: 'taskRemoved',
      conversationId: 'conv-1',
      taskId: 'task-1',
    });
  });

  it('does not open provider result URLs through the VSCode view action', async () => {
    taskManager.get.mockResolvedValue(
      createTask({
        id: 'task-1',
        payload: { conversationId: 'conv-1' },
        output: { data: { url: 'https://example.test/output.png' } },
      }),
    );

    const result = await runViewTaskResultRuntime(
      { taskId: 'task-1', conversationId: 'conv-1' },
      { taskManager },
      effects,
    );

    expect(result.kind).toBe('noop');
    expect(openTaskResult).not.toHaveBeenCalled();
  });

  it('opens displayed result refs when persisted storage has only provider URLs', async () => {
    taskManager.get.mockResolvedValue(
      createTask({
        id: 'task-1',
        payload: { conversationId: 'conv-1' },
        output: { data: { url: 'https://example.test/output.png' } },
      }),
    );

    const result = await runViewTaskResultRuntime(
      { taskId: 'task-1', conversationId: 'conv-1', resultRef: 'generated-assets/asset-1.png' },
      { taskManager },
      effects,
    );

    expect(result.kind).toBe('opened-result');
    expect(openTaskResult).toHaveBeenCalledWith({
      kind: 'open-external',
      url: 'generated-assets/asset-1.png',
    });
  });

  it('clears completed, failed, and cancelled tasks for one conversation then refreshes', async () => {
    taskManager.list.mockImplementation((status?: TaskStatus) => {
      if (status === 'completed') {
        return Promise.resolve([
          createTask({ id: 'done-1', payload: { conversationId: 'conv-1' } }),
        ]);
      }
      if (status === 'failed') {
        return Promise.resolve([
          createTask({ id: 'failed-1', status: 'failed', payload: { conversationId: 'conv-1' } }),
          createTask({ id: 'failed-2', status: 'failed', payload: { conversationId: 'conv-2' } }),
        ]);
      }
      if (status === 'cancelled') {
        return Promise.resolve([
          createTask({
            id: 'cancelled-1',
            status: 'cancelled',
            payload: { conversationId: 'conv-1' },
          }),
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await runClearCompletedTasksRuntime(
      { conversationId: 'conv-1' },
      { taskManager, media },
      effects,
    );

    expect(result).toEqual({
      kind: 'cleared-completed',
      conversationId: 'conv-1',
      taskIds: ['done-1', 'failed-1', 'cancelled-1'],
    });
    expect(taskManager.delete).toHaveBeenCalledWith('done-1');
    expect(taskManager.delete).toHaveBeenCalledWith('failed-1');
    expect(taskManager.delete).toHaveBeenCalledWith('cancelled-1');
    expect(taskManager.delete).not.toHaveBeenCalledWith('failed-2');
    expect(postMessage).toHaveBeenCalledWith({
      type: 'tasksUpdated',
      conversationId: 'conv-1',
      workItems: [],
    });
  });
});

type MockTaskManager = Mocked<TaskRuntimeTaskManager>;
type MockMediaGateway = Mocked<TaskRuntimeMediaGateway>;
type MockPostMessage = TaskRuntimeEffects['postMessage'];
type MockOpenTaskResult = NonNullable<TaskRuntimeEffects['openTaskResult']>;
type MockRejectedAction = NonNullable<TaskRuntimeEffects['onRejectedAction']>;
type MockRetryFailed = NonNullable<TaskRuntimeEffects['onRetryFailed']>;

function createTaskManager(): MockTaskManager & TaskRuntimeTaskManager {
  return {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(true),
    submit: vi.fn().mockResolvedValue('retry-task-1'),
    delete: vi.fn().mockResolvedValue(true),
  };
}

function createMediaGateway(): MockMediaGateway & TaskRuntimeMediaGateway {
  return {
    getCandidate: vi.fn().mockResolvedValue(undefined),
    cancelTask: vi.fn().mockResolvedValue(undefined),
    deleteTask: vi.fn().mockResolvedValue(undefined),
  };
}

function createTask(overrides: Partial<Task> & { payload?: Record<string, unknown> } = {}): Task {
  const payload = overrides.payload ?? { conversationId: 'conv-1' };
  const input = overrides.input ?? {
    type: overrides.type ?? 'image_generation',
    payload,
  };

  return {
    id: overrides.id ?? 'task-1',
    type: overrides.type ?? input.type,
    status: overrides.status ?? 'completed',
    input,
    output: overrides.output,
    progress: overrides.progress ?? 100,
    createdAt: overrides.createdAt ?? 1000,
    updatedAt: overrides.updatedAt ?? 2000,
    error: overrides.error,
  };
}

function createMediaTaskView(
  overrides: Partial<AgentMediaTaskView> & { id: string },
): AgentMediaTaskView {
  return {
    id: overrides.id,
    type: overrides.type ?? 'image',
    status: overrides.status ?? 'running',
    progress: overrides.progress ?? 0,
    providerId: overrides.providerId ?? 'provider',
    modelId: overrides.modelId ?? 'model',
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z',
    request: overrides.request ?? { prompt: 'Generate cat' },
    outputs: overrides.outputs,
    result: overrides.result,
    error: overrides.error,
  };
}
