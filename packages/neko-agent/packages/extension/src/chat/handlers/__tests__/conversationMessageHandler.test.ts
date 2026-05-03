/**
 * ConversationMessageHandler unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    updateMessagesForConversation: vi.fn(),
    clearAll: vi.fn(),
    manager: {
      updateMessages: vi.fn(),
      clear: vi.fn(),
    },
  };
}

function createMockAgentManager() {
  return {
    confirmTool: vi.fn(),
    get: vi.fn().mockReturnValue({ isRunning: vi.fn().mockReturnValue(false) }),
    cancel: vi.fn(),
    remove: vi.fn(),
    clearHistory: vi.fn(),
  };
}

function createMockPromptModeCleanup() {
  return {
    clearPromptMode: vi.fn(),
    clearAllPromptModes: vi.fn(),
  };
}

describe('ConversationMessageHandler', () => {
  let webview: ReturnType<typeof createMockWebview>;
  let conversations: ReturnType<typeof createMockConversations>;
  let agentManager: ReturnType<typeof createMockAgentManager>;
  let promptModeCleanup: ReturnType<typeof createMockPromptModeCleanup>;
  let handler: ConversationMessageHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    webview = createMockWebview();
    conversations = createMockConversations();
    agentManager = createMockAgentManager();
    promptModeCleanup = createMockPromptModeCleanup();
    handler = new ConversationMessageHandler({
      conversations: conversations as any,
      agentManager: agentManager as any,
      promptModeCleanup,
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
    let stopListener: (() => void) | undefined;
    const runningAgent = {
      isRunning: vi.fn().mockReturnValue(true),
      onDidStop: vi.fn((listener: () => void) => {
        stopListener = listener;
        return { dispose };
      }),
    };
    agentManager.get.mockReturnValue(runningAgent);

    await handler.handleCancelMessage(webview as any, 'conv-a');

    expect(agentManager.cancel).toHaveBeenCalledWith('conv-a');
    expect(webview.postMessage).not.toHaveBeenCalled();

    stopListener?.();

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

  it('deletes a conversation and clears scoped prompt mode state', async () => {
    const messages = { clearAgentState: vi.fn() };
    handler = new ConversationMessageHandler({
      conversations: conversations as any,
      agentManager: agentManager as any,
      messages: messages as any,
      promptModeCleanup,
      getWebview: () => webview as any,
    });

    await handler.handleDeleteConversation('conv-a');

    expect(agentManager.remove).toHaveBeenCalledWith('conv-a');
    expect(messages.clearAgentState).toHaveBeenCalledWith('conv-a');
    expect(promptModeCleanup.clearPromptMode).toHaveBeenCalledWith('conv-a');
    expect(conversations.delete).toHaveBeenCalledWith('conv-a');
    expect(conversations.sendConversationList).toHaveBeenCalledWith(webview);
    expect(conversations.sendActiveConversation).toHaveBeenCalledWith(webview);
  });

  it('clears history through conversation runtime effects', async () => {
    await handler.handleClearHistory(webview as any, 'conv-a');

    expect(agentManager.clearHistory).toHaveBeenCalledWith('conv-a');
    expect(conversations.updateMessagesForConversation).toHaveBeenCalledWith('conv-a', []);
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'historyCleared',
      conversationId: 'conv-a',
    });
  });

  it('clears all conversations using the pre-clear conversation snapshot', async () => {
    const messages = { clearAgentState: vi.fn() };
    handler = new ConversationMessageHandler({
      conversations: conversations as any,
      agentManager: agentManager as any,
      messages: messages as any,
      promptModeCleanup,
      getWebview: () => webview as any,
    });

    await handler.handleClearAllConversations(webview as any);

    expect(agentManager.remove).toHaveBeenCalledWith('conv-a');
    expect(agentManager.remove).toHaveBeenCalledWith('conv-b');
    expect(messages.clearAgentState).toHaveBeenCalledWith('conv-a');
    expect(messages.clearAgentState).toHaveBeenCalledWith('conv-b');
    expect(promptModeCleanup.clearAllPromptModes).toHaveBeenCalledTimes(1);
    expect(promptModeCleanup.clearPromptMode).not.toHaveBeenCalled();
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

  it('stops agent and clears transient UI state', async () => {
    const messages = { clearAgentState: vi.fn() };
    handler = new ConversationMessageHandler({
      conversations: conversations as any,
      agentManager: agentManager as any,
      messages: messages as any,
      promptModeCleanup,
      getWebview: () => webview as any,
    });

    await handler.handleStopAgent(webview as any, 'conv-a');

    expect(agentManager.cancel).toHaveBeenCalledWith('conv-a');
    expect(messages.clearAgentState).toHaveBeenCalledWith('conv-a');
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'agentStopped',
      conversationId: 'conv-a',
    });
    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agentPhase',
        conversationId: 'conv-a',
        phase: 'idle',
      }),
    );
  });
});
