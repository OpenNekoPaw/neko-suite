import { describe, expect, it, vi } from 'vitest';
import {
  runAgentMediaTurnForWebview,
  type AgentMediaTurnExecutionInput,
} from '../media-turn-webview-runtime';
import { projectMediaTaskToWorkItem } from '@neko-agent/types';

const mediaModel = {
  providerId: 'openai',
  modelId: 'gpt-image-1',
  category: 'image' as const,
};

const task = {
  id: 'task-1',
  type: 'image',
  status: 'processing',
  progress: 50,
  providerId: 'openai',
  modelId: 'gpt-image-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:01.000Z',
  request: { prompt: 'Generate a cat' },
};

describe('media turn webview runtime', () => {
  it('posts unavailable error when media execution is not injected', async () => {
    const postMessage = vi.fn();

    const result = await runAgentMediaTurnForWebview({
      conversationId: 'conv-1',
      prompt: 'Generate a cat',
      mediaModel,
      postMessage,
    });

    expect(result).toEqual({ status: 'unavailable' });
    expect(postMessage).toHaveBeenCalledWith({
      type: 'error',
      conversationId: 'conv-1',
      message: 'Media generation is unavailable',
    });
  });

  it('posts task created and progress messages from execution callbacks', async () => {
    const postMessage = vi.fn();
    let executionInput:
      | AgentMediaTurnExecutionInput<typeof task, { readonly id: string }>
      | undefined;

    const result = await runAgentMediaTurnForWebview<typeof task, { readonly id: string }>({
      conversationId: 'conv-1',
      prompt: 'Generate a cat',
      mediaModel,
      postMessage,
      executeMediaTurn: async (input) => {
        executionInput = input;
        await input.onTaskCreated({
          conversationId: 'conv-1',
          task,
          sourceTask: { id: 'task-1' },
        });
        await input.onTaskProgress({
          conversationId: 'conv-1',
          task: { ...task, status: 'completed', progress: 100 },
          sourceTask: { id: 'task-1' },
        });
      },
    });

    expect(result).toEqual({ status: 'submitted' });
    expect(executionInput).toMatchObject({
      prompt: 'Generate a cat',
      mediaModel,
      conversationId: 'conv-1',
    });
    expect(postMessage).toHaveBeenCalledWith({
      type: 'mediaTaskCreated',
      conversationId: 'conv-1',
      workItem: projectMediaTaskToWorkItem({
        conversationId: 'conv-1',
        task,
      }),
    });
    expect(postMessage).toHaveBeenCalledWith({
      type: 'mediaTaskProgress',
      conversationId: 'conv-1',
      workItem: projectMediaTaskToWorkItem({
        conversationId: 'conv-1',
        task: { ...task, status: 'completed', progress: 100 },
      }),
    });
  });

  it('ignores task callbacks for a different conversation', async () => {
    const postMessage = vi.fn();
    const onIgnoredConversationTask = vi.fn();

    await runAgentMediaTurnForWebview<typeof task, { readonly id: string }>({
      conversationId: 'conv-1',
      prompt: 'Generate a cat',
      mediaModel,
      postMessage,
      executeMediaTurn: async (input) => {
        await input.onTaskProgress({
          conversationId: 'conv-other',
          task,
          sourceTask: { id: 'task-1' },
        });
      },
      onIgnoredConversationTask,
    });

    expect(postMessage).not.toHaveBeenCalled();
    expect(onIgnoredConversationTask).toHaveBeenCalledWith({
      taskId: 'task-1',
      conversationId: 'conv-1',
      sourceTask: { id: 'task-1' },
    });
  });

  it('posts execution errors through the webview protocol', async () => {
    const postMessage = vi.fn();
    const error = new Error('Provider failed');

    const result = await runAgentMediaTurnForWebview({
      conversationId: 'conv-1',
      prompt: 'Generate a cat',
      mediaModel,
      postMessage,
      executeMediaTurn: async () => {
        throw error;
      },
    });

    expect(result).toEqual({ status: 'failed', error });
    expect(postMessage).toHaveBeenCalledWith({
      type: 'error',
      conversationId: 'conv-1',
      message: 'Provider failed',
    });
  });
});
