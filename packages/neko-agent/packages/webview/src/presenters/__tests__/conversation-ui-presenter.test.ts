import { describe, expect, it } from 'vitest';
import type { Message } from '@neko-agent/types';
import {
  projectActiveConversation,
  projectConversationError,
  projectHistoryClearedConversation,
} from '../conversation-ui-presenter';

describe('conversation UI presenter', () => {
  it('appends an error message and resets streaming state', () => {
    const projected = projectConversationError({
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: 'hello',
          timestamp: 1,
        },
      ],
      errorMessage: 'failed',
      now: () => 1000,
    });

    expect(projected).toEqual({
      messages: [
        { id: 'user-1', role: 'user', content: 'hello', timestamp: 1 },
        {
          id: '1000',
          role: 'assistant',
          content: 'failed',
          timestamp: 1000,
          isError: true,
        },
      ],
      streaming: { streamingMessageId: null, isThinking: false, queuedMessageCount: 0 },
    });
  });

  it('projects history cleared into empty messages and idle streaming', () => {
    expect(projectHistoryClearedConversation()).toEqual({
      messages: [],
      streaming: { streamingMessageId: null, isThinking: false, queuedMessageCount: 0 },
    });
  });

  it('restores active conversation from cache and rehydrates work items', () => {
    const cachedMessages: Message[] = [createCompletedBackgroundTaskMessage()];

    const projected = projectActiveConversation({
      conversation: {
        id: 'conv-1',
        title: 'Cached chat',
        messages: [createCompletedBackgroundTaskMessage()],
      },
      cachedMessages,
      cachedStreaming: { streamingMessageId: 'assistant-1', isThinking: true },
      openTabs: [{ id: 'tab-1', title: 'Cached chat', conversationId: 'conv-1' }],
    });

    expect(projected.messages).toEqual([
      {
        ...cachedMessages[0],
        workItemIds: ['task-1'],
      },
    ]);
    expect(projected.streaming).toEqual({
      streamingMessageId: 'assistant-1',
      isThinking: true,
    });
    expect(projected.workItems).toMatchObject([
      {
        id: 'task-1',
        conversationId: 'conv-1',
        kind: 'tool-background-task',
        parentMessageId: 'assistant-1',
        parentToolCallId: 'tool-1',
        status: 'completed',
      },
    ]);
    expect(projected.activeTabId).toBe('tab-1');
    expect(projected.restoredFromCache).toBe(true);
  });

  it('loads active conversation, creates a tab, and rehydrates work items', () => {
    const projected = projectActiveConversation({
      conversation: {
        id: 'conv-1',
        title: 'Generated assets',
        messages: [createCompletedBackgroundTaskMessage()],
      },
      openTabs: [],
      now: () => Date.parse('2026-01-01T00:00:00.000Z'),
    });

    expect(projected.activeConversationId).toBe('conv-1');
    expect(projected.openTabs).toEqual([
      { id: 'tab-1767225600000', title: 'Generated assets', conversationId: 'conv-1' },
    ]);
    expect(projected.activeTabId).toBe('tab-1767225600000');
    expect(projected.streaming).toEqual({
      streamingMessageId: null,
      isThinking: false,
      queuedMessageCount: 0,
    });
    expect(projected.workItems).toMatchObject([
      {
        id: 'task-1',
        conversationId: 'conv-1',
        kind: 'tool-background-task',
        parentMessageId: 'assistant-1',
        parentToolCallId: 'tool-1',
        status: 'completed',
        result: { urls: ['webview://asset.png'] },
      },
    ]);
  });

  it('updates an existing default tab title from active conversation metadata', () => {
    const projected = projectActiveConversation({
      conversation: {
        id: 'conv-1',
        title: 'Generated assets',
        messages: [],
      },
      openTabs: [{ id: 'tab-1', title: 'New Chat', conversationId: 'conv-1' }],
    });

    expect(projected.openTabs).toEqual([
      { id: 'tab-1', title: 'Generated assets', conversationId: 'conv-1' },
    ]);
    expect(projected.activeTabId).toBe('tab-1');
  });

  it('restores streaming state from a persisted partial assistant message', () => {
    const projected = projectActiveConversation({
      conversation: {
        id: 'conv-1',
        title: 'Draft',
        messages: [
          { id: 'user-1', role: 'user', content: 'hello', timestamp: 1 },
          {
            id: 'assistant-stream',
            role: 'assistant',
            content: 'partial',
            timestamp: 2,
            isStreaming: true,
          },
        ],
      },
      openTabs: [],
      generateTabId: () => 'tab-1',
    });

    expect(projected.messages.at(-1)).toMatchObject({
      id: 'assistant-stream',
      isStreaming: true,
    });
    expect(projected.streaming).toEqual({
      streamingMessageId: 'assistant-stream',
      isThinking: true,
      queuedMessageCount: 0,
    });
  });

  it('projects empty active conversation into a cleared UI state', () => {
    const projected = projectActiveConversation({
      openTabs: [{ id: 'tab-1', title: 'Old chat', conversationId: 'conv-old' }],
    });

    expect(projected).toMatchObject({
      activeConversationId: null,
      messages: [],
      streaming: { streamingMessageId: null, isThinking: false, queuedMessageCount: 0 },
      activeTabId: null,
      activeTab: 'chat',
      workItems: [],
      restoredFromCache: false,
    });
    expect(projected.openTabs).toEqual([
      { id: 'tab-1', title: 'Old chat', conversationId: 'conv-old' },
    ]);
  });
});

function createCompletedBackgroundTaskMessage(): Message {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: '',
    timestamp: 1,
    contentBlocks: [
      {
        id: 'block-tool-1',
        type: 'tool_call',
        timestamp: 1,
        toolCall: {
          id: 'tool-1',
          name: 'generate_image',
          arguments: { prompt: 'cat' },
          result: {
            success: true,
            data: {
              backgroundMode: true,
              status: 'completed',
              taskId: 'task-1',
              urls: ['webview://asset.png'],
            },
          },
        },
      },
    ],
  };
}
