import { describe, expect, it, vi } from 'vitest';
import {
  startAgentStreamBackgroundTaskObserver,
  type ObserveAgentStreamBackgroundTaskProgressInput,
} from '../agent-stream-task-observer';

interface SourceTask {
  readonly id: string;
}

function createBackgroundToolResultEvent() {
  return {
    type: 'tool_result' as const,
    toolResult: {
      toolCallId: 'tool-1',
      success: true,
      data: {
        backgroundMode: true,
        taskId: 'task-1',
        type: 'image',
        message: 'Generate a cat',
        routedTo: { provider: 'openai' },
      },
    },
  };
}

describe('agent stream task observer runtime', () => {
  it('posts taskCreated and subscribes with conversation isolation settings', () => {
    let observerInput:
      | ObserveAgentStreamBackgroundTaskProgressInput<SourceTask, { readonly kind: 'plan' }>
      | undefined;
    const unsubscribe = vi.fn();
    const postMessage = vi.fn();

    const result = startAgentStreamBackgroundTaskObserver<SourceTask, { readonly kind: 'plan' }>({
      conversationId: 'conv-1',
      messageId: 'msg-stream',
      event: createBackgroundToolResultEvent(),
      postMessage,
      observeProgress: (input) => {
        observerInput = input;
        return unsubscribe;
      },
      createRecoveryProgress: (task) => ({
        id: task.id,
        status: 'processing',
        progress: 1,
        updatedAt: '2026-01-01T00:00:01.000Z',
      }),
      createProgressDelivery: (task) => ({
        progress: {
          id: task.id,
          status: 'processing',
          progress: 50,
          updatedAt: '2026-01-01T00:00:02.000Z',
        },
        deliveryPlan: { kind: 'plan' },
      }),
    });

    expect(result).toMatchObject({
      started: true,
      taskId: 'task-1',
      unsubscribe,
    });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'taskCreated',
        conversationId: 'conv-1',
        messageId: 'msg-stream',
      }),
    );
    expect(observerInput).toMatchObject({
      taskId: 'task-1',
      conversationId: 'conv-1',
      unsubscribeOnIgnoredConversation: true,
    });
  });

  it('projects progress updates and persists result urls through injected effects', () => {
    let observerInput:
      | ObserveAgentStreamBackgroundTaskProgressInput<SourceTask, { readonly kind: 'plan' }>
      | undefined;
    const postMessage = vi.fn();
    const persistResultUrls = vi.fn();

    startAgentStreamBackgroundTaskObserver<SourceTask, { readonly kind: 'plan' }>({
      conversationId: 'conv-1',
      messageId: 'msg-stream',
      event: createBackgroundToolResultEvent(),
      postMessage,
      observeProgress: (input) => {
        observerInput = input;
      },
      createRecoveryProgress: (task) => ({
        id: task.id,
        status: 'processing',
        progress: 1,
        updatedAt: '2026-01-01T00:00:01.000Z',
      }),
      createProgressDelivery: (task) => ({
        progress: {
          id: task.id,
          status: 'completed',
          progress: 100,
          updatedAt: '2026-01-01T00:00:02.000Z',
          result: { urls: ['webview://cat.png'], localPaths: ['/tmp/cat.png'] },
        },
        deliveryPlan: { kind: 'plan' },
        persistResultUrls: ['/tmp/cat.png'],
      }),
      persistResultUrls,
    });

    expect(observerInput).toBeDefined();
    observerInput!.onTaskProgress({
      conversationId: 'conv-1',
      sourceTask: { id: 'task-1' },
      task: {
        progress: {
          id: 'task-1',
          status: 'completed',
          progress: 100,
          updatedAt: '2026-01-01T00:00:02.000Z',
          result: { urls: ['webview://cat.png'], localPaths: ['/tmp/cat.png'] },
        },
        deliveryPlan: { kind: 'plan' },
        persistResultUrls: ['/tmp/cat.png'],
      },
    });

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'taskUpdated',
        conversationId: 'conv-1',
        workItem: expect.objectContaining({
          id: 'task-1',
          kind: 'tool-background-task',
          status: 'completed',
          progress: 100,
        }),
      }),
    );
    expect(persistResultUrls).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      taskId: 'task-1',
      toolCallId: 'tool-1',
      urls: ['/tmp/cat.png'],
      deliveryPlan: { kind: 'plan' },
    });
  });

  it('ignores progress delivered for a different conversation', () => {
    let observerInput: ObserveAgentStreamBackgroundTaskProgressInput<SourceTask> | undefined;
    const postMessage = vi.fn();
    const onIgnoredConversationTask = vi.fn();

    startAgentStreamBackgroundTaskObserver<SourceTask>({
      conversationId: 'conv-1',
      messageId: 'msg-stream',
      event: createBackgroundToolResultEvent(),
      postMessage,
      observeProgress: (input) => {
        observerInput = input;
      },
      createRecoveryProgress: (task) => ({
        id: task.id,
        status: 'processing',
        progress: 1,
        updatedAt: '2026-01-01T00:00:01.000Z',
      }),
      createProgressDelivery: (task) => ({
        progress: {
          id: task.id,
          status: 'processing',
          progress: 50,
          updatedAt: '2026-01-01T00:00:02.000Z',
        },
      }),
      onIgnoredConversationTask,
    });

    observerInput!.onTaskProgress({
      conversationId: 'conv-other',
      sourceTask: { id: 'task-1' },
      task: {
        progress: {
          id: 'task-1',
          status: 'processing',
          progress: 50,
          updatedAt: '2026-01-01T00:00:02.000Z',
        },
      },
    });

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(onIgnoredConversationTask).toHaveBeenCalledWith({
      taskId: 'task-1',
      conversationId: 'conv-1',
      sourceTask: { id: 'task-1' },
    });
  });

  it('returns started=false for non-background tool results', () => {
    const result = startAgentStreamBackgroundTaskObserver({
      conversationId: 'conv-1',
      messageId: 'msg-stream',
      event: {
        type: 'tool_result',
        toolResult: {
          toolCallId: 'tool-1',
          success: true,
          data: { taskId: 'task-1' },
        },
      },
      postMessage: vi.fn(),
      createRecoveryProgress: () => ({
        id: 'task-1',
        status: 'processing',
        progress: 1,
        updatedAt: '2026-01-01T00:00:01.000Z',
      }),
      createProgressDelivery: () => ({
        progress: {
          id: 'task-1',
          status: 'processing',
          progress: 50,
          updatedAt: '2026-01-01T00:00:02.000Z',
        },
      }),
    });

    expect(result).toEqual({ started: false });
  });
});
