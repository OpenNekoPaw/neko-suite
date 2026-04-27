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
  };
}

function createMockAgentManager() {
  return {
    confirmTool: vi.fn(),
    get: vi.fn().mockReturnValue({ isRunning: vi.fn().mockReturnValue(false) }),
    cancel: vi.fn(),
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

  it('confirms tools against the provided conversationId', () => {
    handler.handleConfirmTool('tool-1', true, 'conv-a');

    expect(agentManager.confirmTool).toHaveBeenCalledWith('conv-a', 'tool-1', true);
    expect(conversations.getActiveId).not.toHaveBeenCalled();
  });

  it('does not fall back to the active conversation when confirmTool has no conversationId', () => {
    handler.handleConfirmTool('tool-1', true, '');

    expect(agentManager.confirmTool).not.toHaveBeenCalled();
    expect(conversations.getActiveId).not.toHaveBeenCalled();
  });

  it('cancels the provided conversationId', () => {
    handler.handleCancelMessage(webview as any, 'conv-a');

    expect(agentManager.get).toHaveBeenCalledWith('conv-a');
    expect(agentManager.cancel).toHaveBeenCalledWith('conv-a');
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'messageCancelled',
      conversationId: 'conv-a',
    });
    expect(conversations.getActiveId).not.toHaveBeenCalled();
  });

  it('waits for a running agent to stop before posting cancellation', () => {
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

    handler.handleCancelMessage(webview as any, 'conv-a');

    expect(agentManager.cancel).toHaveBeenCalledWith('conv-a');
    expect(webview.postMessage).not.toHaveBeenCalled();

    stopListener?.();

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'messageCancelled',
      conversationId: 'conv-a',
    });
  });

  it('does not fall back to the active conversation when cancelMessage has no conversationId', () => {
    handler.handleCancelMessage(webview as any, '');

    expect(agentManager.get).not.toHaveBeenCalled();
    expect(agentManager.cancel).not.toHaveBeenCalled();
    expect(webview.postMessage).not.toHaveBeenCalled();
    expect(conversations.getActiveId).not.toHaveBeenCalled();
  });
});
