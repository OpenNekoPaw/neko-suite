import { describe, expect, it, vi } from 'vitest';
import type { AgentEvent } from '../../session/types';
import type { AgentTurnTimelineMessage, AgentTurnTimelineToolCallItem } from '@neko-agent/types';
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
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'streamComplete',
        conversationId: 'conv-1',
        messageId: 'msg-stream',
        contentBlocks: expect.arrayContaining([
          expect.objectContaining({ type: 'thinking' }),
          expect.objectContaining({ type: 'text' }),
        ]),
      }),
    );
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

  it('emits ordered turn timeline items for interleaved text and tools', async () => {
    const processor = new AgentEventStreamRuntimeProcessor();
    const postMessage = vi.fn();

    await processor.process({
      conversationId: 'conv-1',
      messageId: 'msg-stream',
      events: toAsyncIterable<AgentEvent>([
        { type: 'text_delta', content: 'Before.' },
        {
          type: 'tool_call',
          toolCall: { id: 'tool-1', name: 'read_file', arguments: { path: 'a.ts' } },
        },
        {
          type: 'tool_result',
          toolResult: { toolCallId: 'tool-1', success: true, data: 'content' },
        },
        { type: 'text_delta', content: ' After.' },
      ]),
      postMessage,
      now: () => 100,
    });

    const timelineMessages = postMessage.mock.calls
      .map(([message]) => message)
      .filter(isAgentTurnTimelineMessage);
    const timelineItems = timelineMessages.flatMap((message) => message.events);

    expect(timelineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemId: 'text-1',
          sequence: 1,
          kind: 'assistant_text',
          payload: { content: 'Before.', format: 'markdown' },
        }),
        expect.objectContaining({
          itemId: 'tool-tool-1',
          sequence: 2,
          kind: 'tool_call',
          payload: expect.objectContaining({
            toolCall: expect.objectContaining({ id: 'tool-1', name: 'read_file' }),
          }),
        }),
        expect.objectContaining({
          itemId: 'text-3',
          sequence: 3,
          kind: 'assistant_text',
          payload: { content: ' After.', format: 'markdown' },
        }),
      ]),
    );
    expect(
      timelineItems.filter((item) => item.itemId === 'tool-tool-1').map((item) => item.sequence),
    ).toEqual([2, 2]);
  });

  it('does not create timeline tool items from tool results without a prior tool call', async () => {
    const processor = new AgentEventStreamRuntimeProcessor();
    const postMessage = vi.fn();

    await processor.process({
      conversationId: 'conv-1',
      messageId: 'msg-stream',
      events: toAsyncIterable<AgentEvent>([
        {
          type: 'tool_result',
          toolResult: { toolCallId: 'tool-1', success: false, error: 'missing call' },
        },
      ]),
      postMessage,
      now: () => 100,
    });

    const timelineItems = postMessage.mock.calls
      .map(([message]) => message)
      .filter(isAgentTurnTimelineMessage)
      .flatMap((message) => message.events);

    expect(timelineItems).toEqual([]);
  });

  it('projects tool confirmations and backfills onto the original timeline tool item', async () => {
    const processor = new AgentEventStreamRuntimeProcessor();
    const postMessage = vi.fn();
    const times = [10, 20, 30, 40, 50];
    const now = vi.fn(() => times.shift() ?? 50);

    await processor.process({
      conversationId: 'conv-1',
      messageId: 'msg-stream',
      events: toAsyncIterable<AgentEvent>([
        {
          type: 'tool_call',
          toolCall: { id: 'tool-1', name: 'write_file', arguments: { path: 'a.ts' } },
        },
        {
          type: 'tool_confirmation',
          toolConfirmation: {
            toolCall: { id: 'tool-1', name: 'write_file', arguments: { path: 'a.ts' }, index: 0 },
            action: 'write',
            description: 'Write a.ts',
            details: { path: 'a.ts' },
            confirmationToken: 'confirm-1',
          },
        },
        {
          type: 'tool_result',
          toolResult: {
            toolCallId: 'tool-1',
            success: true,
            data: { status: 'queued', taskId: 'task-1' },
          },
        },
        {
          type: 'tool_result_backfill',
          toolResultBackfill: {
            toolCallId: 'tool-1',
            timestamp: 2,
            dataPatch: { status: 'completed', resultUrl: '/tmp/out.png' },
          },
        },
      ]),
      postMessage,
      now,
    });

    const toolTimelineItems = postMessage.mock.calls
      .map(([message]) => message)
      .filter(isAgentTurnTimelineMessage)
      .flatMap((message) => message.events)
      .filter((item) => item.itemId === 'tool-tool-1');

    expect(toolTimelineItems.map((item) => item.sequence)).toEqual([1, 1, 1, 1]);
    expect(toolTimelineItems.map((item) => item.createdAt)).toEqual([10, 10, 10, 10]);
    expect(toolTimelineItems.map((item) => item.updatedAt)).toEqual([10, 20, 30, 40]);
    expect(toolTimelineItems[1]).toMatchObject({
      status: 'pending',
      payload: {
        toolCall: {
          id: 'tool-1',
          pendingConfirmation: true,
          confirmation: {
            action: 'write',
            description: 'Write a.ts',
            details: { path: 'a.ts' },
          },
        },
      },
    });
    expect(toolTimelineItems.at(-1)).toMatchObject({
      status: 'succeeded',
      payload: {
        toolCall: {
          id: 'tool-1',
          result: {
            success: true,
            data: {
              status: 'completed',
              taskId: 'task-1',
              resultUrl: '/tmp/out.png',
            },
          },
        },
      },
    });
  });

  it('keeps concurrent tool results anchored when results arrive out of call order', async () => {
    const processor = new AgentEventStreamRuntimeProcessor();
    const postMessage = vi.fn();
    const times = [10, 20, 30, 40, 50, 60];
    const now = vi.fn(() => times.shift() ?? 60);

    await processor.process({
      conversationId: 'conv-1',
      messageId: 'msg-stream',
      events: toAsyncIterable<AgentEvent>([
        {
          type: 'tool_call',
          toolCall: { id: 'tool-a', name: 'read_a', arguments: { path: 'a.ts' } },
        },
        {
          type: 'tool_call',
          toolCall: { id: 'tool-b', name: 'read_b', arguments: { path: 'b.ts' } },
        },
        {
          type: 'tool_result',
          toolResult: { toolCallId: 'tool-b', success: true, data: 'B' },
        },
        {
          type: 'tool_result',
          toolResult: { toolCallId: 'tool-a', success: false, error: 'A failed' },
        },
      ]),
      postMessage,
      now,
    });

    const toolTimelineItems = postMessage.mock.calls
      .map(([message]) => message)
      .filter(isAgentTurnTimelineMessage)
      .flatMap((message) => message.events)
      .filter(isTimelineToolCallItem);
    const latestByToolCallId = new Map(
      toolTimelineItems.map((item) => [item.payload.toolCall.id, item]),
    );

    expect(toolTimelineItems.map((item) => item.itemId)).toEqual([
      'tool-tool-a',
      'tool-tool-b',
      'tool-tool-b',
      'tool-tool-a',
    ]);
    expect(latestByToolCallId.get('tool-a')).toMatchObject({
      sequence: 1,
      status: 'failed',
      createdAt: 10,
      updatedAt: 40,
      payload: {
        toolCall: {
          id: 'tool-a',
          result: { success: false, error: 'A failed' },
        },
      },
    });
    expect(latestByToolCallId.get('tool-b')).toMatchObject({
      sequence: 2,
      status: 'succeeded',
      createdAt: 20,
      updatedAt: 30,
      payload: {
        toolCall: {
          id: 'tool-b',
          result: { success: true, data: 'B' },
        },
      },
    });
  });

  it('emits resumable partial assistant snapshots with the stream message id', async () => {
    const processor = new AgentEventStreamRuntimeProcessor();
    const onPartialAssistantMessage = vi.fn();
    const now = vi.fn(() => 100);

    await processor.process({
      conversationId: 'conv-1',
      messageId: 'assistant-stream',
      events: toAsyncIterable<AgentEvent>([
        { type: 'thinking_content', thinking: 'Think' },
        { type: 'text', content: 'Hello' },
      ]),
      postMessage: vi.fn(),
      onPartialAssistantMessage,
      partialAssistantSnapshotIntervalMs: 0,
      now,
    });

    expect(onPartialAssistantMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'assistant-stream',
        role: 'assistant',
        content: 'Hello',
        isStreaming: true,
        contentBlocks: expect.arrayContaining([
          expect.objectContaining({ type: 'text', isStreaming: true }),
        ]),
      }),
    );
  });

  it('throttles text partial snapshots while always persisting structural events', async () => {
    const processor = new AgentEventStreamRuntimeProcessor();
    const onPartialAssistantMessage = vi.fn();
    const times = [100, 120, 140, 160];
    const now = vi.fn(() => times.shift() ?? 160);

    await processor.process({
      conversationId: 'conv-1',
      messageId: 'assistant-stream',
      events: toAsyncIterable<AgentEvent>([
        { type: 'text_delta', content: 'A' },
        { type: 'text_delta', content: 'B' },
        {
          type: 'tool_call',
          toolCall: { id: 'tool-1', name: 'read_file', arguments: {} },
        },
        { type: 'text_delta', content: 'C' },
      ]),
      postMessage: vi.fn(),
      onPartialAssistantMessage,
      partialAssistantSnapshotIntervalMs: 250,
      now,
    });

    expect(onPartialAssistantMessage).toHaveBeenCalledTimes(2);
    expect(onPartialAssistantMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ content: 'A' }),
    );
    expect(onPartialAssistantMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        contentBlocks: expect.arrayContaining([
          expect.objectContaining({ type: 'text', content: 'AB', isStreaming: false }),
          expect.objectContaining({ type: 'tool_call' }),
        ]),
      }),
    );
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
    expect(
      postMessage.mock.calls
        .map(([message]) => message)
        .filter(isAgentTurnTimelineMessage)
        .flatMap((message) => message.events),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemId: 'tool-background-task-task-1',
          kind: 'task',
          parentAnchor: 'tool_call',
          parentToolCallId: 'tool-1',
          payload: {
            workItem: expect.objectContaining({
              id: 'task-1',
              parentMessageId: 'msg-stream',
              parentToolCallId: 'tool-1',
            }),
          },
        }),
      ]),
    );
    expect(postMessage).not.toHaveBeenCalledWith(
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

    const taskTimelineEvents = postMessage.mock.calls
      .map(([message]) => message)
      .filter(isAgentTurnTimelineMessage)
      .flatMap((message) => message.events)
      .filter((item) => item.itemId === 'tool-background-task-task-1');

    expect(taskTimelineEvents.map((item) => item.sequence)).toEqual([
      taskTimelineEvents[0]?.sequence,
      taskTimelineEvents[0]?.sequence,
    ]);
    expect(taskTimelineEvents.at(-1)).toMatchObject({
      status: 'pending',
      payload: {
        workItem: {
          id: 'task-1',
          progress: 50,
          parentMessageId: 'msg-stream',
          parentToolCallId: 'tool-1',
        },
      },
    });
    expect(postMessage).not.toHaveBeenCalledWith(
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
        createRecoveryProgress: (task: SourceTask) => ({
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

function isAgentTurnTimelineMessage(message: unknown): message is AgentTurnTimelineMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === 'agentTurnTimeline'
  );
}

function isTimelineToolCallItem(
  item: AgentTurnTimelineMessage['events'][number],
): item is AgentTurnTimelineToolCallItem {
  return item.kind === 'tool_call';
}
