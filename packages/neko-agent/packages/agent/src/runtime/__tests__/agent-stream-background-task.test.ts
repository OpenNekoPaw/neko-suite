import { describe, expect, it, vi } from 'vitest';
import type { Message } from '@neko-agent/types';
import {
  persistAgentStreamBackgroundTaskResultUrls,
  projectAgentStreamBackgroundTaskProgress,
  projectAgentStreamBackgroundTaskStart,
} from '../agent-stream-background-task';

describe('agent stream background task runtime', () => {
  it('projects background tool results to taskCreated messages', () => {
    const projection = projectAgentStreamBackgroundTaskStart({
      conversationId: 'conv-1',
      messageId: 'msg-stream',
      now: () => Date.parse('2026-01-01T00:00:00.000Z'),
      event: {
        type: 'tool_result',
        toolResult: {
          toolCallId: 'tool-1',
          success: true,
          data: {
            backgroundMode: true,
            taskId: 'task-1',
            type: 'video',
            message: 'Generate a city flythrough',
            routedTo: { provider: 'runway' },
          },
        },
      },
    });

    expect(projection).toMatchObject({
      taskId: 'task-1',
      taskType: 'video',
      toolCallId: 'tool-1',
      task: {
        id: 'task-1',
        type: 'video',
        prompt: 'Generate a city flythrough',
      },
      message: {
        type: 'taskCreated',
        conversationId: 'conv-1',
        messageId: 'msg-stream',
        toolCallId: 'tool-1',
        workItem: {
          id: 'task-1',
          kind: 'tool-background-task',
          status: 'queued',
          progress: 0,
          parentMessageId: 'msg-stream',
          parentToolCallId: 'tool-1',
          task: {
            type: 'video',
          },
        },
      },
    });
  });

  it('ignores non-background tool results', () => {
    expect(
      projectAgentStreamBackgroundTaskStart({
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
      }),
    ).toBeNull();
  });

  it('merges progress patches and carries persistable result urls', () => {
    const start = projectAgentStreamBackgroundTaskStart({
      conversationId: 'conv-1',
      messageId: 'msg-stream',
      now: () => Date.parse('2026-01-01T00:00:00.000Z'),
      event: {
        type: 'tool_result',
        toolResult: {
          toolCallId: 'tool-1',
          success: true,
          data: {
            backgroundMode: true,
            taskId: 'task-1',
            type: 'image',
            message: 'Generate a cat',
          },
        },
      },
    });

    expect(start).not.toBeNull();
    const projection = projectAgentStreamBackgroundTaskProgress({
      conversationId: 'conv-1',
      baseTask: start!.task,
      progress: {
        id: 'task-1',
        status: 'completed',
        progress: 100,
        updatedAt: '2026-01-01T00:00:02.000Z',
        result: {
          urls: ['webview://cat.png'],
          localPaths: ['/tmp/cat.png'],
        },
      },
      persistResultUrls: ['/tmp/cat.png'],
    });

    expect(projection).toMatchObject({
      persistResultUrls: ['/tmp/cat.png'],
      task: {
        id: 'task-1',
        status: 'completed',
        progress: 100,
        result: {
          urls: ['webview://cat.png'],
        },
      },
      message: {
        type: 'taskUpdated',
        conversationId: 'conv-1',
        workItem: {
          id: 'task-1',
          kind: 'tool-background-task',
          status: 'completed',
          progress: 100,
          result: {
            urls: ['webview://cat.png'],
          },
        },
      },
    });
    expect(projection.task.result).not.toHaveProperty('localPaths');
    expect(projection.message.workItem.result).not.toHaveProperty('localPaths');
  });

  it('persists result urls into matching tool result data', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: '',
        timestamp: 1,
        contentBlocks: [
          {
            id: 'block-1',
            type: 'tool_call',
            timestamp: 1,
            toolCall: {
              id: 'tool-1',
              name: 'GenerateImage',
              arguments: {},
              result: {
                success: true,
                data: {
                  backgroundMode: true,
                  taskId: 'task-1',
                },
              },
            },
          },
        ],
      },
    ];
    const updateMessages = vi.fn();

    expect(
      persistAgentStreamBackgroundTaskResultUrls({
        conversationId: 'conv-1',
        taskId: 'task-1',
        urls: ['/tmp/cat.png'],
        getMessages: () => messages,
        updateMessages,
      }),
    ).toBe(true);
    expect(updateMessages).toHaveBeenCalledWith(
      'conv-1',
      expect.arrayContaining([
        expect.objectContaining({
          contentBlocks: expect.arrayContaining([
            expect.objectContaining({
              toolCall: expect.objectContaining({
                result: expect.objectContaining({
                  data: expect.objectContaining({
                    status: 'completed',
                    urls: ['/tmp/cat.png'],
                  }),
                }),
              }),
            }),
          ]),
        }),
      ]),
    );
  });

  it('returns false when no matching messages are updated', () => {
    const updateMessages = vi.fn();

    expect(
      persistAgentStreamBackgroundTaskResultUrls({
        conversationId: 'conv-1',
        taskId: 'task-1',
        urls: ['/tmp/cat.png'],
        getMessages: () => [],
        updateMessages,
      }),
    ).toBe(false);
    expect(updateMessages).not.toHaveBeenCalled();
  });
});
