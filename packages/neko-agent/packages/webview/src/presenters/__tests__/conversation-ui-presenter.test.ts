import { describe, expect, it } from 'vitest';
import type { AgentQueuedMessageItem, AgentState, AgentWorkItem, Message } from '@neko-agent/types';
import type { ActiveTurnTimelineState } from '../active-turn-timeline-presenter';
import type { ActivationProgressTimeline } from '../activation-progress-presenter';
import {
  projectActiveConversation,
  projectConversationError,
  projectHistoryClearedConversation,
} from '../conversation-ui-presenter';
import {
  projectConversationSessionActiveSkillMap,
  projectConversationSessionState,
} from '../conversation-session-state-presenter';

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
      streaming: {
        streamingMessageId: null,
        isThinking: false,
        queuedMessageCount: 0,
        queuedMessages: [],
      },
    });
  });

  it('projects history cleared into empty messages and idle streaming', () => {
    expect(projectHistoryClearedConversation()).toEqual({
      messages: [],
      streaming: {
        streamingMessageId: null,
        isThinking: false,
        queuedMessageCount: 0,
        queuedMessages: [],
      },
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

  it('uses authoritative host messages when local cache is stale', () => {
    const staleCachedMessages: Message[] = [
      {
        id: 'assistant-stale',
        role: 'assistant',
        content: 'old cached answer',
        timestamp: 1,
      },
    ];
    const persistedMessages: Message[] = [
      {
        id: 'assistant-persisted',
        role: 'assistant',
        content: 'persisted answer from host',
        timestamp: 2,
      },
    ];

    const projected = projectActiveConversation({
      conversation: {
        id: 'conv-1',
        title: 'Foreground chat',
        messages: persistedMessages,
      },
      cachedMessages: staleCachedMessages,
      cachedStreaming: { streamingMessageId: 'assistant-stale', isThinking: false },
      openTabs: [{ id: 'tab-1', title: 'Foreground chat', conversationId: 'conv-1' }],
    });

    expect(projected.messages).toEqual(persistedMessages);
    expect(projected.streaming).toEqual({
      streamingMessageId: null,
      isThinking: false,
      queuedMessageCount: 0,
      queuedMessages: [],
    });
    expect(projected.restoredFromCache).toBe(false);
  });

  it('does not let local task-resume prompt cache replace authoritative host messages', () => {
    const cachedPromptMessage: Message = {
      id: 'user-prompt',
      role: 'user',
      content: 'Continue from the completed async task result.',
      timestamp: 1,
    };
    const persistedMessages: Message[] = [
      {
        id: 'assistant-persisted',
        role: 'assistant',
        content: 'visible conversation message',
        timestamp: 2,
      },
    ];

    const projected = projectActiveConversation({
      conversation: {
        id: 'conv-1',
        title: 'Foreground chat',
        messages: persistedMessages,
      },
      cachedMessages: [cachedPromptMessage],
      cachedStreaming: { streamingMessageId: null, isThinking: true },
      openTabs: [{ id: 'tab-1', title: 'Foreground chat', conversationId: 'conv-1' }],
    });

    expect(projected.messages).toEqual(persistedMessages);
    expect(projected.restoredFromCache).toBe(false);
  });

  it('does not treat isThinking alone as proof that a cache extension is an active turn', () => {
    const persistedMessages: Message[] = [
      {
        id: 'assistant-persisted',
        role: 'assistant',
        content: '**visible** conversation message',
        timestamp: 1,
      },
    ];
    const leakedControlMessage: Message = {
      id: 'released:task-observation-1',
      role: 'user',
      content: 'Continue from the completed async task result.',
      timestamp: 2,
    };

    const projected = projectActiveConversation({
      conversation: {
        id: 'conv-1',
        title: 'Foreground chat',
        messages: persistedMessages,
      },
      cachedMessages: [...persistedMessages, leakedControlMessage],
      cachedStreaming: { streamingMessageId: null, isThinking: true },
      openTabs: [{ id: 'tab-1', title: 'Foreground chat', conversationId: 'conv-1' }],
    });

    expect(projected.messages).toEqual(persistedMessages);
    expect(projected.streaming).toEqual({
      streamingMessageId: null,
      isThinking: false,
      queuedMessageCount: 0,
      queuedMessages: [],
    });
    expect(projected.restoredFromCache).toBe(false);
  });

  it('keeps recoverable local activity when cached messages extend host messages', () => {
    const persistedMessage: Message = {
      id: 'user-1',
      role: 'user',
      content: 'generate a sketch',
      timestamp: 1,
    };
    const streamingMessage: Message = {
      id: 'assistant-stream',
      role: 'assistant',
      content: 'Working',
      timestamp: 2,
      isStreaming: true,
    };

    const projected = projectActiveConversation({
      conversation: {
        id: 'conv-1',
        title: 'Foreground chat',
        messages: [persistedMessage],
      },
      cachedMessages: [persistedMessage, streamingMessage],
      cachedStreaming: { streamingMessageId: 'assistant-stream', isThinking: true },
      openTabs: [{ id: 'tab-1', title: 'Foreground chat', conversationId: 'conv-1' }],
    });

    expect(projected.messages).toEqual([persistedMessage, streamingMessage]);
    expect(projected.restoredFromCache).toBe(true);
  });

  it('uses host messages when cached and persisted message payloads differ', () => {
    const cachedMessage = createCompletedBackgroundTaskMessage();
    const persistedMessage: Message = {
      ...cachedMessage,
      contentBlocks: [
        {
          id: 'block-tool-1',
          type: 'tool_call',
          timestamp: 1,
          toolCall: {
            id: 'tool-1',
            name: 'generate_image',
            arguments: { prompt: 'dog' },
            result: {
              success: true,
              data: {
                backgroundMode: true,
                status: 'completed',
                taskId: 'task-1',
                taskScope: taskScope('task-1'),
                urls: ['webview://new-asset.png'],
              },
            },
          },
        },
      ],
    };

    const projected = projectActiveConversation({
      conversation: {
        id: 'conv-1',
        title: 'Generated assets',
        messages: [persistedMessage],
      },
      cachedMessages: [cachedMessage],
      cachedStreaming: { streamingMessageId: null, isThinking: false },
      openTabs: [{ id: 'tab-1', title: 'Generated assets', conversationId: 'conv-1' }],
    });

    expect(projected.messages).toEqual([
      {
        ...persistedMessage,
        workItemIds: ['task-1'],
      },
    ]);
    expect(projected.workItems[0]).toMatchObject({
      result: { urls: ['webview://new-asset.png'] },
    });
    expect(projected.restoredFromCache).toBe(false);
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
      queuedMessages: [],
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
      queuedMessages: [],
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

  it('projects the visible session from one conversation partition only', () => {
    const messageA: Message = { id: 'message-a', role: 'assistant', content: 'A', timestamp: 1 };
    const messageB: Message = { id: 'message-b', role: 'assistant', content: 'B', timestamp: 2 };
    const queuedA = queuedMessage('queue-a', 'conv-a');
    const queuedB = queuedMessage('queue-b', 'conv-b');
    const timelineB: ActiveTurnTimelineState = {
      connectionEpoch: 'epoch-1',
      conversationId: 'conv-b',
      turnId: 'turn-b',
      messageId: 'message-b',
      deliveryRevision: 0,
      validationState: {
        connectionEpoch: 'epoch-1',
        conversationId: 'conv-b',
        turnId: 'turn-b',
        messageId: 'message-b',
        deliveryRevision: 0,
        completed: false,
        items: new Map(),
      },
      items: [],
      completed: false,
      synchronization: 'synchronized',
    };
    const activeSkillA = { conversationId: 'conv-a', skillName: 'skill-a' };
    const activeSkillB = { conversationId: 'conv-b', skillName: 'skill-b' };
    const activationA = activationProgress('conv-a', 'activation-a');
    const activationB = activationProgress('conv-b', 'activation-b');
    const agentStateB: AgentState = { phase: 'acting', toolName: 'ReadFile', startedAt: 20 };
    const workItemB = workItem('work-b', 'conv-b');

    const projected = projectConversationSessionState({
      conversationId: 'conv-b',
      messagesByConversation: new Map([
        ['conv-a', [messageA]],
        ['conv-b', [messageB]],
      ]),
      streamingByConversation: new Map([
        [
          'conv-a',
          { streamingMessageId: 'message-a', isThinking: true, queuedMessages: [queuedA] },
        ],
        [
          'conv-b',
          {
            streamingMessageId: 'message-b',
            isThinking: true,
            queuedMessageCount: 1,
            queuedMessages: [queuedB],
            activeTurnTimeline: timelineB,
          },
        ],
      ]),
      promptModeByConversation: new Map([
        ['conv-a', 'plan'],
        ['conv-b', 'default'],
      ]),
      activeSkillByConversation: new Map([
        ['conv-a', activeSkillA],
        ['conv-b', activeSkillB],
      ]),
      activationProgressByConversation: new Map([
        ['conv-a', [activationA]],
        ['conv-b', [activationB]],
      ]),
      ambientNodesByConversation: new Map([
        ['conv-a', [{ nodeId: 'node-a', type: 'scene', summary: 'A scene' }]],
        ['conv-b', [{ nodeId: 'node-b', type: 'shot', summary: 'B shot' }]],
      ]),
      tokenCountByConversation: new Map([
        ['conv-a', 100],
        ['conv-b', 200],
      ]),
      compressingByConversation: new Map([
        ['conv-a', true],
        ['conv-b', false],
      ]),
      agentStateByConversation: new Map([
        ['conv-a', { phase: 'thinking', startedAt: 10 }],
        ['conv-b', agentStateB],
      ]),
      workItemsByConversation: new Map([
        ['conv-a', new Map([['work-a', workItem('work-a', 'conv-a')]])],
        ['conv-b', new Map([['work-b', workItemB]])],
      ]),
      inputByConversation: new Map([
        ['conv-a', { inputValue: 'draft a', attachedFiles: [], selectedFileReferences: [] }],
        ['conv-b', { inputValue: 'draft b', attachedFiles: [], selectedFileReferences: [] }],
      ]),
    });

    expect(projected).toEqual({
      conversationId: 'conv-b',
      messages: [messageB],
      streaming: {
        streamingMessageId: 'message-b',
        isThinking: true,
        queuedMessageCount: 1,
        queuedMessages: [queuedB],
        activeTurnTimeline: timelineB,
      },
      promptMode: 'default',
      skill: {
        activeSkill: activeSkillB,
        activationProgress: [activationB],
      },
      context: {
        ambientNodes: [{ nodeId: 'node-b', type: 'shot', summary: 'B shot' }],
        tokenCount: 200,
        isCompressing: false,
      },
      agentState: agentStateB,
      workItems: [workItemB],
      input: {
        inputValue: 'draft b',
        attachedFiles: [],
        selectedFileReferences: [],
      },
    });
  });

  it('clears active Skill from the visible conversation partition', () => {
    const skillA = { conversationId: 'conv-a', skillName: 'skill-a' };
    const skillB = { conversationId: 'conv-b', skillName: 'skill-b' };

    const projected = projectConversationSessionActiveSkillMap({
      activeSkillByConversation: new Map([
        ['conv-a', skillA],
        ['conv-b', skillB],
      ]),
      visibleConversationId: 'conv-b',
      value: null,
    });

    expect(projected).toEqual(new Map([['conv-a', skillA]]));
  });
});

function taskScope(childRunId: string) {
  return {
    conversationId: 'conv-1',
    runId: 'run-1',
    parentRunId: 'run-1',
    childRunId,
    childKind: 'task' as const,
  };
}

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
              taskScope: taskScope('task-1'),
              urls: ['webview://asset.png'],
            },
          },
        },
      },
    ],
  };
}

function queuedMessage(id: string, conversationId: string): AgentQueuedMessageItem {
  return {
    id,
    conversationId,
    content: id,
    createdAt: 1,
    source: 'composer',
  };
}

function activationProgress(
  conversationId: string,
  activationId: string,
): ActivationProgressTimeline {
  return {
    conversationId,
    activationId,
    target: 'skill',
    action: 'activate',
    name: activationId,
    source: 'agent-tool',
    requestedBy: 'agent',
    status: 'succeeded',
    events: [],
  };
}

function workItem(id: string, conversationId: string): AgentWorkItem {
  return {
    id,
    conversationId,
    kind: 'tool-background-task',
    parentMessageId: null,
    parentToolCallId: null,
    title: id,
    status: 'processing',
    progress: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    task: {
      scope: {
        conversationId,
        runId: `run:${conversationId}`,
        parentRunId: `run:${conversationId}`,
        childRunId: id,
        childKind: 'task',
      },
      id,
      type: 'image',
      name: id,
      prompt: id,
      providerId: 'provider',
      providerName: 'Provider',
      status: 'processing',
      progress: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  };
}
