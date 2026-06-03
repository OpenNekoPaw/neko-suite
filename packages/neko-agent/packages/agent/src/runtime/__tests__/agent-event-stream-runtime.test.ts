import { describe, expect, it, vi } from 'vitest';
import type { AgentEvent } from '../../session/types';
import {
  AgentEventStreamRuntimeProcessor,
  type ObserveAgentStreamBackgroundTaskProgressInput,
  type ProcessAgentEventStreamRuntimeInput,
} from '../index';

interface SourceTask {
  readonly id: string;
}

async function* toAsyncIterable<T>(items: readonly T[]): AsyncIterable<T> {
  for (const item of items) {
    yield item;
  }
}

function createBackgroundToolResultEvent(): AgentEvent {
  return {
    type: 'tool_result',
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

describe('agent event stream runtime processor', () => {
  it('processes agent events, posts projected messages, and returns a persistence snapshot', async () => {
    const processor = new AgentEventStreamRuntimeProcessor();
    const postMessage = vi.fn();
    const onPhaseChange = vi.fn();

    const result = await processor.process({
      conversationId: 'conv-1',
      messageId: 'msg-stream',
      events: toAsyncIterable<AgentEvent>([
        { type: 'thinking_content', thinking: 'Think' },
        { type: 'text', content: 'Answer' },
        {
          type: 'tool_call',
          toolCall: { id: 'tool-1', name: 'read_file', arguments: { path: 'a.ts' } },
        },
        {
          type: 'tool_result',
          toolResult: { toolCallId: 'tool-1', success: true, data: 'content' },
        },
        { type: 'done', usage: { inputTokens: 20, outputTokens: 22, totalTokens: 42 } },
      ]),
      postMessage,
      onPhaseChange,
      now: () => 100,
    });

    expect(result).toMatchObject({
      accumulatedThinking: 'Think',
      accumulatedResponse: 'Answer',
      hasError: false,
    });
    expect(result.collectedToolCalls).toEqual([
      {
        id: 'tool-1',
        name: 'read_file',
        arguments: { path: 'a.ts' },
        result: { success: true, data: 'content', error: undefined },
      },
    ]);
    expect(result.contentBlocks.at(0)).toMatchObject({
      type: 'thinking',
      isThinkingComplete: true,
    });
    expect(result.contentBlocks.at(1)).toMatchObject({ type: 'text', isStreaming: false });
    expect(postMessage).toHaveBeenCalledWith({
      type: 'streamComplete',
      conversationId: 'conv-1',
      messageId: 'msg-stream',
    });
    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'contextTokenCount',
      }),
    );
    expect(onPhaseChange).toHaveBeenCalledWith('thinking', undefined);
    expect(onPhaseChange).toHaveBeenCalledWith('streaming', undefined);
    expect(onPhaseChange).toHaveBeenCalledWith('acting', 'read_file');
    expect(onPhaseChange).toHaveBeenCalledWith('idle', undefined);
  });

  it('starts background task observers and clears subscriptions by conversation', async () => {
    const processor = new AgentEventStreamRuntimeProcessor<
      SourceTask,
      { readonly done: boolean }
    >();
    const postMessage = vi.fn();
    const unsubscribe = vi.fn();
    let observerInput:
      | ObserveAgentStreamBackgroundTaskProgressInput<SourceTask, { readonly done: boolean }>
      | undefined;

    await processor.process({
      conversationId: 'conv-1',
      messageId: 'msg-stream',
      events: toAsyncIterable([createBackgroundToolResultEvent()]),
      postMessage,
      backgroundTasks: {
        observeProgress: (input) => {
          observerInput = input;
          return unsubscribe;
        },
        createFallbackProgress: (task) => ({
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
          },
          deliveryPlan: { done: true },
          persistResultUrls: ['/tmp/cat.png'],
        }),
        persistResultUrls: vi.fn(),
      },
    });

    expect(observerInput).toMatchObject({
      taskId: 'task-1',
      conversationId: 'conv-1',
    });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'taskCreated', conversationId: 'conv-1' }),
    );

    await observerInput!.onTaskProgress({
      conversationId: 'conv-1',
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

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'taskUpdated', conversationId: 'conv-1' }),
    );

    processor.clearConversation('conv-1');
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('disposes all tracked background task subscriptions', async () => {
    const processor = new AgentEventStreamRuntimeProcessor<SourceTask>();
    const unsubscribeA = vi.fn();
    const unsubscribeB = vi.fn();
    let observeCallCount = 0;
    const observeProgress = () => {
      observeCallCount += 1;
      return observeCallCount === 1 ? unsubscribeA : unsubscribeB;
    };

    const createInput = (
      conversationId: string,
    ): ProcessAgentEventStreamRuntimeInput<SourceTask> => ({
      conversationId,
      messageId: 'msg-stream',
      events: toAsyncIterable([createBackgroundToolResultEvent()]),
      postMessage: () => undefined,
      backgroundTasks: {
        observeProgress,
        createFallbackProgress: (task: SourceTask) => ({
          id: task.id,
          status: 'processing',
          progress: 1,
          updatedAt: '2026-01-01T00:00:01.000Z',
        }),
        createProgressDelivery: (task: SourceTask) => ({
          progress: {
            id: task.id,
            status: 'processing',
            progress: 50,
            updatedAt: '2026-01-01T00:00:02.000Z',
          },
        }),
      },
    });

    await processor.process(createInput('conv-a'));
    await processor.process(createInput('conv-b'));

    processor.dispose();

    expect(unsubscribeA).toHaveBeenCalledTimes(1);
    expect(unsubscribeB).toHaveBeenCalledTimes(1);
  });
});
