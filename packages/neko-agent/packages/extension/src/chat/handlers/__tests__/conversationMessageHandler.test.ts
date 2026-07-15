/**
 * ConversationMessageHandler unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentPendingMessageQueueError } from '@neko/agent/runtime';
import { ConversationMessageHandler } from '../conversationHandler';

function createMockWebview() {
  return { postMessage: vi.fn().mockResolvedValue(true) };
}

function createMockConversations() {
  return {
    getActiveId: vi.fn().mockReturnValue('active-conv'),
    create: vi.fn().mockReturnValue('conv-new'),
    switchTo: vi.fn().mockReturnValue(true),
    delete: vi.fn(),
    list: vi.fn().mockReturnValue([{ id: 'conv-a' }, { id: 'conv-b' }]),
    sendConversationList: vi.fn(),
    sendActiveConversation: vi.fn(),
    sendConversationSnapshot: vi.fn().mockReturnValue(true),
    updateMessagesForConversation: vi.fn(),
    clearAll: vi.fn(),
    manager: {
      updateMessages: vi.fn(),
      clear: vi.fn(),
    },
  };
}

function createMockAgentManager() {
  let queueSnapshotVersion = 0;
  let queueItems = [
    {
      id: 'queue-1',
      conversationId: 'conv-a',
      content: '继续优化',
      createdAt: 10,
      source: 'composer' as const,
    },
    {
      id: 'queue-2',
      conversationId: 'conv-a',
      content: '再补一条',
      createdAt: 11,
      source: 'composer' as const,
    },
  ];
  return {
    confirmTool: vi.fn(),
    get: vi.fn().mockReturnValue({ isRunning: vi.fn().mockReturnValue(false) }),
    cancel: vi.fn(),
    remove: vi.fn(),
    clearHistory: vi.fn(),
    getPendingMessageQueue: vi.fn().mockImplementation(() => queueItems),
    promotePendingMessage: vi
      .fn()
      .mockImplementation((conversationId: string, queueItemId: string) => {
        const itemIndex = queueItems.findIndex(
          (candidate) =>
            candidate.conversationId === conversationId && candidate.id === queueItemId,
        );
        if (itemIndex < 0) {
          throw new AgentPendingMessageQueueError(
            'stale-item',
            `Queued message is no longer pending: ${queueItemId}`,
            queueItemId,
          );
        }
        const item = queueItems[itemIndex];
        if (!item) {
          throw new AgentPendingMessageQueueError(
            'stale-item',
            `Queued message is no longer pending: ${queueItemId}`,
            queueItemId,
          );
        }
        queueItems.splice(itemIndex, 1);
        queueItems.unshift(item);
        return item;
      }),
    removePendingMessage: vi
      .fn()
      .mockImplementation((conversationId: string, queueItemId: string) => {
        const itemIndex = queueItems.findIndex(
          (candidate) =>
            candidate.conversationId === conversationId && candidate.id === queueItemId,
        );
        if (itemIndex < 0) {
          throw new AgentPendingMessageQueueError(
            'stale-item',
            `Queued message is no longer pending: ${queueItemId}`,
            queueItemId,
          );
        }
        const item = queueItems[itemIndex];
        if (!item) {
          throw new AgentPendingMessageQueueError(
            'stale-item',
            `Queued message is no longer pending: ${queueItemId}`,
            queueItemId,
          );
        }
        queueItems.splice(itemIndex, 1);
        return item;
      }),
    clearPendingMessages: vi.fn().mockImplementation((conversationId: string) => {
      queueItems = queueItems.filter((item) => item.conversationId !== conversationId);
    }),
    nextMessageQueueSnapshotVersion: vi.fn().mockImplementation(() => {
      queueSnapshotVersion += 1;
      return queueSnapshotVersion;
    }),
  };
}

describe('ConversationMessageHandler', () => {
  let webview: ReturnType<typeof createMockWebview>;
  let conversations: ReturnType<typeof createMockConversations>;
  let agentManager: ReturnType<typeof createMockAgentManager>;
  let handler: ConversationMessageHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    webview = createMockWebview();
    conversations = createMockConversations();
    agentManager = createMockAgentManager();
    handler = new ConversationMessageHandler({
      conversations: conversations as any,
      agentManager: agentManager as any,
      getWebview: () => webview as any,
    });
  });

  it('confirms tools against the provided conversationId', async () => {
    await handler.handleConfirmTool('tool-1', true, 'conv-a');

    expect(agentManager.confirmTool).toHaveBeenCalledWith('conv-a', 'tool-1', true);
    expect(conversations.getActiveId).not.toHaveBeenCalled();
  });

  it('does not fall back to the active conversation when confirmTool has no conversationId', async () => {
    await handler.handleConfirmTool('tool-1', true, '');

    expect(agentManager.confirmTool).not.toHaveBeenCalled();
    expect(conversations.getActiveId).not.toHaveBeenCalled();
  });

  it('handles creative conversation lifecycle commands with full shared command identity', async () => {
    const canvasBoards = { removeConversationBinding: vi.fn().mockResolvedValue(undefined) };
    const lifecycle = {
      handleCommand: vi.fn().mockResolvedValue({
        ok: true,
        conversationId: 'background-1',
        state: 'archived',
        diagnostics: [],
      }),
    };
    handler.updateDeps({ creativeAiLifecycle: lifecycle, canvasBoards });

    await handler.handleConversationLifecycle(webview as any, {
      type: 'conversationLifecycle',
      conversationId: 'background-1',
      action: 'archive',
      commandId: 'command-1',
      expectedState: 'active',
      activeRunIds: ['run-1'],
      reason: 'user-requested',
    });

    expect(lifecycle.handleCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: 1,
        commandId: 'command-1',
        conversationId: 'background-1',
        action: 'archive',
        expectedState: 'active',
        activeRunIds: ['run-1'],
        reason: 'user-requested',
      }),
    );
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'conversationLifecycleResult',
      conversationId: 'background-1',
      action: 'archive',
      success: true,
      state: 'archived',
      diagnostics: [],
    });
    expect(conversations.sendConversationList).toHaveBeenCalledWith(webview);
    expect(canvasBoards.removeConversationBinding).toHaveBeenCalledWith('background-1');
  });

  it('reports lifecycle service availability instead of silently succeeding', async () => {
    await handler.handleConversationLifecycle(webview as any, {
      type: 'conversationLifecycle',
      conversationId: 'background-1',
      action: 'archive',
    });

    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'conversationLifecycleResult',
      conversationId: 'background-1',
      action: 'archive',
      success: false,
      diagnostics: [
        expect.objectContaining({
          code: 'creative-ai-lifecycle-service-unavailable',
          severity: 'error',
        }),
      ],
    });
  });

  it('cancels the provided conversationId', async () => {
    await handler.handleCancelMessage(webview as any, 'conv-a');

    expect(agentManager.get).toHaveBeenCalledWith('conv-a');
    expect(agentManager.cancel).toHaveBeenCalledWith('conv-a');
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'messageCancelled',
      conversationId: 'conv-a',
    });
    expect(conversations.getActiveId).not.toHaveBeenCalled();
  });

  it('waits for a running agent to stop before posting cancellation', async () => {
    const dispose = vi.fn();
    let runnerEventListener: ((event: { readonly type: 'stop' }) => void) | undefined;
    const runningAgent = {
      isRunning: vi.fn().mockReturnValue(true),
      onDidRunnerEvent: vi.fn((listener: (event: { readonly type: 'stop' }) => void) => {
        runnerEventListener = listener;
        return { dispose };
      }),
    };
    agentManager.get.mockReturnValue(runningAgent);

    await handler.handleCancelMessage(webview as any, 'conv-a');

    expect(agentManager.cancel).toHaveBeenCalledWith('conv-a');
    expect(webview.postMessage).not.toHaveBeenCalledWith({
      type: 'messageCancelled',
      conversationId: 'conv-a',
    });

    runnerEventListener?.({ type: 'stop' });

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'messageCancelled',
      conversationId: 'conv-a',
    });
  });

  it('does not fall back to the active conversation when cancelMessage has no conversationId', async () => {
    await handler.handleCancelMessage(webview as any, '');

    expect(agentManager.get).not.toHaveBeenCalled();
    expect(agentManager.cancel).not.toHaveBeenCalled();
    expect(webview.postMessage).not.toHaveBeenCalled();
    expect(conversations.getActiveId).not.toHaveBeenCalled();
  });

  it('separates host active snapshots from explicit conversation snapshots', async () => {
    await handler.sendActiveConversation();

    expect(conversations.sendActiveConversation).toHaveBeenCalledWith(webview, undefined);
    expect(conversations.sendConversationSnapshot).not.toHaveBeenCalled();

    await expect(handler.sendConversationSnapshot('conv-b')).resolves.toBe(true);
    expect(conversations.sendConversationSnapshot).toHaveBeenCalledWith(webview, 'conv-b');
    expect(conversations.getActiveId).not.toHaveBeenCalled();
  });

  it('deletes a conversation and clears scoped agent state', async () => {
    const messages = { clearAgentState: vi.fn() };
    const canvasBoards = { removeConversationBinding: vi.fn().mockResolvedValue(undefined) };
    handler = new ConversationMessageHandler({
      conversations: conversations as any,
      agentManager: agentManager as any,
      messages: messages as any,
      canvasBoards,
      getWebview: () => webview as any,
    });

    await handler.handleDeleteConversation('conv-a');

    expect(agentManager.remove).toHaveBeenCalledWith('conv-a');
    expect(messages.clearAgentState).toHaveBeenCalledWith('conv-a');
    expect(conversations.delete).toHaveBeenCalledWith('conv-a', { activateNext: true });
    expect(conversations.sendConversationList).toHaveBeenCalledWith(webview);
    expect(conversations.sendActiveConversation).toHaveBeenCalledWith(webview, undefined);
    expect(canvasBoards.removeConversationBinding).toHaveBeenCalledWith('conv-a');
  });

  it('deletes the final closed tab without activating another conversation', async () => {
    await handler.handleDeleteConversation('conv-a', { activateNext: false });

    expect(conversations.delete).toHaveBeenCalledWith('conv-a', { activateNext: false });
    expect(conversations.sendConversationList).toHaveBeenCalledWith(webview);
    expect(conversations.sendActiveConversation).not.toHaveBeenCalled();
  });

  it('clears history through conversation runtime effects', async () => {
    await handler.handleClearHistory(webview as any, 'conv-a');

    expect(agentManager.clearHistory).toHaveBeenCalledWith('conv-a');
    expect(conversations.updateMessagesForConversation).toHaveBeenCalledWith('conv-a', []);
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'historyCleared',
      conversationId: 'conv-a',
    });
    expect(agentManager.clearPendingMessages).toHaveBeenCalledWith('conv-a');
    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'messageQueueSnapshot',
        snapshot: expect.objectContaining({ conversationId: 'conv-a', pendingCount: 0 }),
      }),
    );
  });

  it('sends an authoritative queue snapshot for an explicit conversation', () => {
    handler.sendMessageQueueSnapshot(webview as any, 'conv-a');

    expect(agentManager.getPendingMessageQueue).toHaveBeenCalledWith('conv-a');
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'messageQueueSnapshot',
      snapshot: {
        conversationId: 'conv-a',
        pendingCount: 2,
        version: 1,
        items: [
          {
            id: 'queue-1',
            conversationId: 'conv-a',
            content: '继续优化',
            createdAt: 10,
            source: 'composer',
          },
          {
            id: 'queue-2',
            conversationId: 'conv-a',
            content: '再补一条',
            createdAt: 11,
            source: 'composer',
          },
        ],
      },
    });
  });

  it('promotes and cancels queued messages then publishes snapshots', () => {
    handler.handlePromoteQueuedMessage(webview as any, 'conv-a', 'queue-2');
    handler.handleCancelQueuedMessage(webview as any, 'conv-a', 'queue-1');

    expect(agentManager.promotePendingMessage).toHaveBeenCalledWith('conv-a', 'queue-2');
    expect(agentManager.removePendingMessage).toHaveBeenCalledWith('conv-a', 'queue-1');
    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'messageQueueSnapshot',
        snapshot: expect.objectContaining({
          conversationId: 'conv-a',
          version: 1,
          items: [
            expect.objectContaining({ id: 'queue-2' }),
            expect.objectContaining({ id: 'queue-1' }),
          ],
        }),
      }),
    );
    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'messageQueueSnapshot',
        snapshot: expect.objectContaining({
          conversationId: 'conv-a',
          pendingCount: 1,
          version: 2,
          items: [expect.objectContaining({ id: 'queue-2' })],
        }),
      }),
    );
  });

  it('removes a queued message for re-edit and sends the removed item content', () => {
    handler.handleEditQueuedMessage(webview as any, 'tab-a', 'conv-a', 'queue-1');

    expect(agentManager.removePendingMessage).toHaveBeenCalledWith('conv-a', 'queue-1');
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'queuedMessageEditRequested',
      tabId: 'tab-a',
      conversationId: 'conv-a',
      item: {
        id: 'queue-1',
        conversationId: 'conv-a',
        content: '继续优化',
        createdAt: 10,
        source: 'composer',
      },
      snapshot: expect.objectContaining({
        conversationId: 'conv-a',
        pendingCount: 1,
        version: 1,
      }),
    });
  });

  it('reports stale queue item errors with a refreshed snapshot', () => {
    handler.handleCancelQueuedMessage(webview as any, 'conv-a', 'missing');

    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'messageQueueError',
      conversationId: 'conv-a',
      code: 'stale-item',
      message: 'Queued message is no longer pending: missing',
      queueItemId: 'missing',
      snapshot: expect.objectContaining({
        conversationId: 'conv-a',
        pendingCount: 2,
        version: 1,
      }),
    });
  });

  it('clears all conversations using the pre-clear conversation snapshot', async () => {
    const messages = { clearAgentState: vi.fn() };
    handler = new ConversationMessageHandler({
      conversations: conversations as any,
      agentManager: agentManager as any,
      messages: messages as any,
      getWebview: () => webview as any,
    });

    await handler.handleClearAllConversations(webview as any);

    expect(agentManager.remove).toHaveBeenCalledWith('conv-a');
    expect(agentManager.remove).toHaveBeenCalledWith('conv-b');
    expect(messages.clearAgentState).toHaveBeenCalledWith('conv-a');
    expect(messages.clearAgentState).toHaveBeenCalledWith('conv-b');
    expect(conversations.clearAll).toHaveBeenCalledTimes(1);
    expect(conversations.sendConversationList).toHaveBeenCalledWith(webview);
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'historyCleared',
      conversationId: 'conv-a',
    });
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'historyCleared',
      conversationId: 'conv-b',
    });
  });
});
