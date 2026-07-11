import { describe, expect, it, vi } from 'vitest';
import {
  ConversationRenderLifecycleError,
  createIdleConversationStreamingSnapshot,
  type ConversationRenderSnapshot,
} from './conversation-render-contract';
import { createConversationVisibleStatePort } from './conversation-render-state-adapter';

describe('conversation render state adapter', () => {
  it('rejects a background snapshot before any foreground state or cache write', () => {
    const setMessages = vi.fn();
    const setStreamingMessageId = vi.fn();
    const setIsThinking = vi.fn();
    const setActiveConversationId = vi.fn();
    const conversationMessagesRef = { current: new Map() };
    const conversationStreamingRef = { current: new Map() };
    const visibleState = createConversationVisibleStatePort({
      activeConversationIdRef: { current: 'conv-b' },
      streamingMessageIdRef: { current: null },
      conversationMessagesRef,
      conversationStreamingRef,
      setMessages,
      setStreamingMessageId,
      setIsThinking,
      setActiveConversationId,
    });
    const backgroundSnapshot: ConversationRenderSnapshot = {
      conversationId: 'conv-a',
      revision: 3,
      messages: [],
      streaming: createIdleConversationStreamingSnapshot(),
      viewport: { followMode: 'follow-tail' },
      visibility: 'background',
      retention: 'retained',
    };

    expect(() => visibleState.commit(backgroundSnapshot)).toThrowError(
      expect.objectContaining({
        diagnostic: expect.objectContaining({
          code: 'background-visible-state-write',
          conversationId: 'conv-a',
          targetRevision: 3,
        }),
      }),
    );
    expect(() => visibleState.commit(backgroundSnapshot)).toThrowError(
      ConversationRenderLifecycleError,
    );
    expect(conversationMessagesRef.current.size).toBe(0);
    expect(conversationStreamingRef.current.size).toBe(0);
    expect(setMessages).not.toHaveBeenCalled();
    expect(setStreamingMessageId).not.toHaveBeenCalled();
    expect(setIsThinking).not.toHaveBeenCalled();
    expect(setActiveConversationId).not.toHaveBeenCalled();
  });
});
