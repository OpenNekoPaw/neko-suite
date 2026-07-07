import { describe, expect, it } from 'vitest';
import type { AgentState, ConversationSummary, OpenTab } from '@neko-agent/types';
import { projectHistoryCleanup, projectHistoryConversationItems } from '../history-menu-presenter';

describe('history menu presenter', () => {
  it('marks open and running conversations as protected cleanup items', () => {
    const conversations: ConversationSummary[] = [
      { id: 'conv-open', title: 'Open', messageCount: 2, updatedAt: 10 },
      { id: 'conv-running', title: 'Running', messageCount: 4, updatedAt: 20 },
      { id: 'conv-done', title: 'Done', messageCount: 3, updatedAt: 30 },
      { id: 'conv-empty', title: 'Empty', messageCount: 0, updatedAt: 40 },
    ];
    const openTabs: OpenTab[] = [{ id: 'tab-open', title: 'Open', conversationId: 'conv-open' }];
    const agentState: AgentState = { phase: 'acting', toolName: 'read_file', startedAt: 20 };

    const items = projectHistoryConversationItems({
      conversations,
      openTabs,
      activeConversationId: 'conv-open',
      activeStreaming: { streamingMessageId: null, isThinking: false, queuedMessageCount: 0 },
      streamingByConversation: new Map([
        [
          'conv-running',
          { streamingMessageId: 'assistant-1', isThinking: true, queuedMessageCount: 0 },
        ],
      ]),
      agentStateByConversation: new Map([['conv-running', agentState]]),
    });

    expect(items).toMatchObject([
      {
        id: 'conv-open',
        isOpen: true,
        isActive: true,
        executionStatus: 'completed',
        canDelete: false,
        protectedReason: 'open',
      },
      {
        id: 'conv-running',
        isOpen: false,
        isActive: false,
        executionStatus: 'running',
        canDelete: false,
        protectedReason: 'running',
      },
      {
        id: 'conv-done',
        executionStatus: 'completed',
        canDelete: true,
      },
      {
        id: 'conv-empty',
        canDelete: true,
      },
    ]);

    expect(projectHistoryCleanup({ historyItems: items })).toEqual({
      deletableConversationIds: ['conv-done', 'conv-empty'],
      protectedConversationCount: 2,
    });
  });

  it('projects creative background conversation metadata and lifecycle actions', () => {
    const conversations: ConversationSummary[] = [
      {
        id: 'background-1',
        title: 'Canvas AI: intro.nkc',
        messageCount: 0,
        updatedAt: 50,
        creativeAi: {
          lifecycleState: 'active',
          sourcePackage: 'neko-canvas',
          associationKey: 'neko-canvas:document:doc-1',
          documentLabel: 'boards/intro.nkc',
          activeRunSummary: {
            activeRunCount: 1,
            activeWorkItemCount: 2,
            latestRunId: 'run-1',
            latestRunStatus: 'running',
          },
        },
      },
    ];

    const [item] = projectHistoryConversationItems({
      conversations,
      openTabs: [],
      activeConversationId: null,
      activeStreaming: { streamingMessageId: null, isThinking: false, queuedMessageCount: 0 },
      streamingByConversation: new Map(),
      agentStateByConversation: new Map(),
    });

    expect(item).toMatchObject({
      id: 'background-1',
      isBackground: true,
      lifecycleState: 'active',
      sourcePackage: 'neko-canvas',
      documentLabel: 'boards/intro.nkc',
      executionStatus: 'running',
      canDelete: false,
      protectedReason: 'running',
    });
    expect(item?.lifecycleActions).toEqual([
      expect.objectContaining({ action: 'archive', enabled: false }),
      expect.objectContaining({ action: 'delete', enabled: false }),
      expect.objectContaining({ action: 'stop-and-archive', enabled: true }),
      expect.objectContaining({ action: 'stop-and-delete', enabled: true }),
    ]);
    expect(projectHistoryCleanup({ historyItems: item ? [item] : [] })).toEqual({
      deletableConversationIds: [],
      protectedConversationCount: 1,
    });
  });

  it('projects restore for archived creative background conversations', () => {
    const conversations: ConversationSummary[] = [
      {
        id: 'background-archived',
        title: 'Canvas AI: archived',
        messageCount: 1,
        updatedAt: 50,
        creativeAi: {
          lifecycleState: 'archived',
          sourcePackage: 'neko-canvas',
          associationKey: 'neko-canvas:document:doc-1',
          documentLabel: 'boards/intro.nkc',
        },
      },
    ];

    const [item] = projectHistoryConversationItems({
      conversations,
      openTabs: [],
      activeConversationId: null,
      activeStreaming: { streamingMessageId: null, isThinking: false, queuedMessageCount: 0 },
      streamingByConversation: new Map(),
      agentStateByConversation: new Map(),
    });

    expect(item?.lifecycleActions.map((action) => action.action)).toEqual(['restore', 'delete']);
    expect(item?.canDelete).toBe(false);
    expect(item?.protectedReason).toBe('background');
  });
});
