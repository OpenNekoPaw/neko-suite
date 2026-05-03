/**
 * TaskHandler unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskHandler } from '../taskHandler';

function createMockWebview() {
  return { postMessage: vi.fn().mockResolvedValue(true) };
}

function createMockTaskManager() {
  return {
    list: vi.fn().mockResolvedValue([]),
    cancel: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    submit: vi.fn().mockResolvedValue('retry-task-1'),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockPlatform() {
  return {
    media: {
      cancelTask: vi.fn().mockResolvedValue(true),
      deleteTask: vi.fn().mockResolvedValue(undefined),
      getTask: vi.fn().mockResolvedValue(null),
    },
  };
}

describe('TaskHandler', () => {
  const conversationId = 'conv-1';
  let handler: TaskHandler;
  let webview: ReturnType<typeof createMockWebview>;
  let taskManager: ReturnType<typeof createMockTaskManager>;
  let platform: ReturnType<typeof createMockPlatform>;

  beforeEach(() => {
    vi.clearAllMocks();
    webview = createMockWebview();
    taskManager = createMockTaskManager();
    platform = createMockPlatform();
  });

  describe('sendTasks', () => {
    it('should send empty tasks when taskManager is unavailable', async () => {
      handler = new TaskHandler({});
      await handler.sendTasks(webview as any, conversationId);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'tasksUpdated',
        conversationId,
        workItems: [],
      });
    });

    it('should send mapped task views when tasks exist', async () => {
      const mockTask = {
        id: 'task-1',
        type: 'image_generation',
        status: 'completed',
        progress: 100,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        input: {
          payload: { prompt: 'Generate a cat image', providerId: 'openai', conversationId },
        },
        output: null,
        error: undefined,
      };
      taskManager.list.mockResolvedValue([mockTask]);

      handler = new TaskHandler({ taskManager: taskManager as any });
      await handler.sendTasks(webview as any, conversationId);

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'tasksUpdated',
          conversationId,
          workItems: expect.arrayContaining([
            expect.objectContaining({
              id: 'task-1',
              kind: 'tool-background-task',
              task: expect.objectContaining({
                type: 'image',
                name: 'Generate a cat image',
              }),
            }),
          ]),
        }),
      );
    });

    it('should truncate long prompt names to 50 chars', async () => {
      const longPrompt = 'A'.repeat(60);
      const mockTask = {
        id: 'task-2',
        type: 'text_generation',
        status: 'running',
        progress: 50,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        input: { payload: { prompt: longPrompt, conversationId } },
        output: null,
        error: undefined,
      };
      taskManager.list.mockResolvedValue([mockTask]);

      handler = new TaskHandler({ taskManager: taskManager as any });
      await handler.sendTasks(webview as any, conversationId);

      const call = webview.postMessage.mock.calls[0]?.[0] as Record<string, unknown>;
      const workItems = call?.workItems as Array<{ task: { name: string } }>;
      expect(workItems?.[0]?.task.name).toHaveLength(50);
      expect(workItems?.[0]?.task.name).toMatch(/\.\.\.$/);
    });

    it('should format task type as display name when no prompt', async () => {
      const mockTask = {
        id: 'task-3',
        type: 'image_generation',
        status: 'pending',
        progress: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        input: { payload: { conversationId } },
        output: null,
        error: undefined,
      };
      taskManager.list.mockResolvedValue([mockTask]);

      handler = new TaskHandler({ taskManager: taskManager as any });
      await handler.sendTasks(webview as any, conversationId);

      const call = webview.postMessage.mock.calls[0]?.[0] as Record<string, unknown>;
      const workItems = call?.workItems as Array<{ task: { name: string } }>;
      expect(workItems?.[0]?.task.name).toBe('Image Generation');
    });

    it('should fall back to payload.content when payload.name is absent', async () => {
      const mockTask = {
        id: 'task-content',
        type: 'workflow',
        status: 'completed',
        progress: 100,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        input: { payload: { content: 'IDC task label', conversationId } },
        output: null,
        error: undefined,
      };
      taskManager.list.mockResolvedValue([mockTask]);

      handler = new TaskHandler({ taskManager: taskManager as any });
      await handler.sendTasks(webview as any, conversationId);

      const call = webview.postMessage.mock.calls[0]?.[0] as Record<string, unknown>;
      const workItems = call?.workItems as Array<{ task: { name: string } }>;
      expect(workItems?.[0]?.task.name).toBe('IDC task label');
    });
  });

  describe('handleCancelTask', () => {
    it('should do nothing when taskManager is unavailable', async () => {
      handler = new TaskHandler({});
      await handler.handleCancelTask(webview as any, 'task-1', conversationId);
      expect(webview.postMessage).not.toHaveBeenCalled();
    });

    it('should cancel task and refresh list', async () => {
      taskManager.get.mockResolvedValue({
        id: 'task-1',
        input: { payload: { conversationId } },
      });
      handler = new TaskHandler({ taskManager: taskManager as any });
      await handler.handleCancelTask(webview as any, 'task-1', conversationId);

      expect(taskManager.cancel).toHaveBeenCalledWith('task-1');
      expect(taskManager.list).toHaveBeenCalled();
    });

    it('should cancel media task when taskManager storage does not contain it', async () => {
      const mediaTask = {
        id: 'media-1',
        type: 'text-to-image',
        status: 'running',
        progress: 20,
        request: { prompt: 'cat', metadata: { conversationId } },
      };
      taskManager.get.mockResolvedValue(null);
      platform.media.getTask.mockResolvedValueOnce(mediaTask).mockResolvedValueOnce({
        ...mediaTask,
        status: 'cancelled',
      });

      handler = new TaskHandler({ taskManager: taskManager as any, platform: platform as any });
      await handler.handleCancelTask(webview as any, 'media-1', conversationId);

      expect(taskManager.cancel).not.toHaveBeenCalled();
      expect(platform.media.cancelTask).toHaveBeenCalledWith('media-1');
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'mediaTaskProgress',
          conversationId,
        }),
      );
    });

    it('should refuse tasks from another conversation', async () => {
      taskManager.get.mockResolvedValue({
        id: 'task-1',
        input: { payload: { conversationId: 'conv-other' } },
      });
      handler = new TaskHandler({ taskManager: taskManager as any });

      await handler.handleCancelTask(webview as any, 'task-1', conversationId);

      expect(taskManager.cancel).not.toHaveBeenCalled();
      expect(webview.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('handleRemoveTask', () => {
    it('should delete from platform and notify webview', async () => {
      taskManager.get.mockResolvedValue({
        id: 'task-1',
        input: { payload: { conversationId } },
      });
      handler = new TaskHandler({ platform: platform as any, taskManager: taskManager as any });
      await handler.handleRemoveTask(webview as any, 'task-1', conversationId);

      expect(platform.media.deleteTask).toHaveBeenCalledWith('task-1');
      expect(taskManager.delete).toHaveBeenCalledWith('task-1');
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'taskRemoved',
        conversationId,
        taskId: 'task-1',
      });
    });

    it('should ignore removal when task storage is unavailable', async () => {
      handler = new TaskHandler({});
      await handler.handleRemoveTask(webview as any, 'task-1', conversationId);

      expect(webview.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('handleRetryTask', () => {
    it('should retry failed task-manager tasks and refresh list', async () => {
      const taskInput = { type: 'image_generation', payload: { conversationId } };
      taskManager.get.mockResolvedValue({
        id: 'task-1',
        type: 'image_generation',
        status: 'failed',
        progress: 100,
        createdAt: 1000,
        updatedAt: 2000,
        input: taskInput,
        output: null,
        error: 'failed',
      });

      handler = new TaskHandler({ taskManager: taskManager as any });
      await handler.handleRetryTask(webview as any, 'task-1', conversationId);

      expect(taskManager.submit).toHaveBeenCalledWith(taskInput);
      expect(taskManager.list).toHaveBeenCalled();
    });

    it('should send an agent-projected failed update when retry submit fails', async () => {
      taskManager.get.mockResolvedValue({
        id: 'task-1',
        type: 'image_generation',
        status: 'failed',
        progress: 100,
        createdAt: 1000,
        updatedAt: 2000,
        input: {
          type: 'image_generation',
          payload: { prompt: 'Generate a cat image', conversationId },
        },
        output: null,
        error: 'failed',
      });
      taskManager.submit.mockRejectedValue(new Error('quota exceeded'));

      handler = new TaskHandler({ taskManager: taskManager as any });
      await handler.handleRetryTask(webview as any, 'task-1', conversationId);

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'taskUpdated',
          conversationId,
          workItem: expect.objectContaining({
            id: 'task-1',
            kind: 'tool-background-task',
            status: 'failed',
            error: 'Retry failed: quota exceeded',
          }),
        }),
      );
    });
  });

  describe('handleClearCompletedTasks', () => {
    it('should send empty tasks when taskManager is unavailable', async () => {
      handler = new TaskHandler({});
      await handler.handleClearCompletedTasks(webview as any, conversationId);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'tasksUpdated',
        conversationId,
        workItems: [],
      });
    });

    it('should delete completed, failed, and cancelled tasks', async () => {
      const completedTask = { id: 'c1', input: { payload: { conversationId } } };
      const failedTask = { id: 'f1', input: { payload: { conversationId } } };
      const cancelledTask = { id: 'x1', input: { payload: { conversationId } } };

      taskManager.list
        .mockResolvedValueOnce([completedTask]) // completed
        .mockResolvedValueOnce([failedTask]) // failed
        .mockResolvedValueOnce([cancelledTask]) // cancelled
        .mockResolvedValue([]); // refresh

      handler = new TaskHandler({ taskManager: taskManager as any, platform: platform as any });
      await handler.handleClearCompletedTasks(webview as any, conversationId);

      expect(taskManager.delete).toHaveBeenCalledWith('c1');
      expect(taskManager.delete).toHaveBeenCalledWith('f1');
      expect(taskManager.delete).toHaveBeenCalledWith('x1');
      expect(platform.media.deleteTask).toHaveBeenCalledTimes(3);
    });
  });
});
