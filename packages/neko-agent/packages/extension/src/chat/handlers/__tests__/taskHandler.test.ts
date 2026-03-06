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
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockPlatform() {
  return {
    media: {
      deleteTask: vi.fn().mockResolvedValue(undefined),
      getTask: vi.fn().mockResolvedValue(null),
    },
  };
}

describe('TaskHandler', () => {
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
      await handler.sendTasks(webview as any);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'tasksUpdated',
        tasks: [],
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
        input: { payload: { prompt: 'Generate a cat image', providerId: 'openai' } },
        output: null,
        error: undefined,
      };
      taskManager.list.mockResolvedValue([mockTask]);

      handler = new TaskHandler({ taskManager: taskManager as any });
      await handler.sendTasks(webview as any);

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'tasksUpdated',
          tasks: expect.arrayContaining([
            expect.objectContaining({
              id: 'task-1',
              type: 'image_generation',
              name: 'Generate a cat image',
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
        input: { payload: { prompt: longPrompt } },
        output: null,
        error: undefined,
      };
      taskManager.list.mockResolvedValue([mockTask]);

      handler = new TaskHandler({ taskManager: taskManager as any });
      await handler.sendTasks(webview as any);

      const call = webview.postMessage.mock.calls[0]?.[0] as Record<string, unknown>;
      const tasks = call?.tasks as Array<{ name: string }>;
      expect(tasks?.[0]?.name).toHaveLength(50);
      expect(tasks?.[0]?.name).toMatch(/\.\.\.$/);
    });

    it('should format task type as display name when no prompt', async () => {
      const mockTask = {
        id: 'task-3',
        type: 'image_generation',
        status: 'pending',
        progress: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        input: { payload: {} },
        output: null,
        error: undefined,
      };
      taskManager.list.mockResolvedValue([mockTask]);

      handler = new TaskHandler({ taskManager: taskManager as any });
      await handler.sendTasks(webview as any);

      const call = webview.postMessage.mock.calls[0]?.[0] as Record<string, unknown>;
      const tasks = call?.tasks as Array<{ name: string }>;
      expect(tasks?.[0]?.name).toBe('Image Generation');
    });
  });

  describe('handleCancelTask', () => {
    it('should do nothing when taskManager is unavailable', async () => {
      handler = new TaskHandler({});
      await handler.handleCancelTask(webview as any, 'task-1');
      expect(webview.postMessage).not.toHaveBeenCalled();
    });

    it('should cancel task and refresh list', async () => {
      handler = new TaskHandler({ taskManager: taskManager as any });
      await handler.handleCancelTask(webview as any, 'task-1');

      expect(taskManager.cancel).toHaveBeenCalledWith('task-1');
      expect(taskManager.list).toHaveBeenCalled();
    });
  });

  describe('handleRemoveTask', () => {
    it('should delete from platform and notify webview', async () => {
      handler = new TaskHandler({ platform: platform as any });
      await handler.handleRemoveTask(webview as any, 'task-1');

      expect(platform.media.deleteTask).toHaveBeenCalledWith('task-1');
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'taskRemoved',
        taskId: 'task-1',
      });
    });

    it('should notify webview even without platform', async () => {
      handler = new TaskHandler({});
      await handler.handleRemoveTask(webview as any, 'task-1');

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'taskRemoved',
        taskId: 'task-1',
      });
    });
  });

  describe('handleClearCompletedTasks', () => {
    it('should send empty tasks when taskManager is unavailable', async () => {
      handler = new TaskHandler({});
      await handler.handleClearCompletedTasks(webview as any);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'tasksUpdated',
        tasks: [],
      });
    });

    it('should delete completed, failed, and cancelled tasks', async () => {
      const completedTask = { id: 'c1' };
      const failedTask = { id: 'f1' };
      const cancelledTask = { id: 'x1' };

      taskManager.list
        .mockResolvedValueOnce([completedTask]) // completed
        .mockResolvedValueOnce([failedTask]) // failed
        .mockResolvedValueOnce([cancelledTask]) // cancelled
        .mockResolvedValue([]); // refresh

      handler = new TaskHandler({ taskManager: taskManager as any, platform: platform as any });
      await handler.handleClearCompletedTasks(webview as any);

      expect(taskManager.delete).toHaveBeenCalledWith('c1');
      expect(taskManager.delete).toHaveBeenCalledWith('f1');
      expect(taskManager.delete).toHaveBeenCalledWith('x1');
      expect(platform.media.deleteTask).toHaveBeenCalledTimes(3);
    });
  });
});
