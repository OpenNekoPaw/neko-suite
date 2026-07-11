import { describe, expect, it, vi } from 'vitest';
import {
  ConversationRenderLifecycleError,
  createIdleConversationStreamingSnapshot,
  type ConversationRenderSnapshot,
} from './conversation-render-contract';
import { ConversationRenderCoordinator } from './conversation-render-coordinator';
import {
  commitConversationSnapshotProjection,
  createConversationVisibleStatePort,
  discardConversationSnapshotProjection,
  ingestConversationRenderSnapshot,
} from './conversation-render-state-adapter';

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

  it('discards only the selected transitional projection without disposing canonical snapshots', () => {
    const coordinator = new ConversationRenderCoordinator();
    const conversationMessagesRef = { current: new Map() };
    const conversationStreamingRef = { current: new Map() };
    const snapshotA = ingestConversationRenderSnapshot({
      coordinator,
      conversationId: 'conv-a',
      messages: [],
      streaming: {
        streamingMessageId: 'message-a',
        isThinking: true,
        queuedMessageCount: 1,
        queuedMessages: [],
      },
    });
    const snapshotB = ingestConversationRenderSnapshot({
      coordinator,
      conversationId: 'conv-b',
      messages: [],
      streaming: {
        streamingMessageId: 'message-b',
        isThinking: false,
        queuedMessageCount: 2,
        queuedMessages: [],
      },
    });

    commitConversationSnapshotProjection({
      snapshot: snapshotA,
      conversationMessagesRef,
      conversationStreamingRef,
    });
    commitConversationSnapshotProjection({
      snapshot: snapshotB,
      conversationMessagesRef,
      conversationStreamingRef,
    });
    discardConversationSnapshotProjection({
      conversationId: 'conv-a',
      conversationMessagesRef,
      conversationStreamingRef,
    });

    expect(conversationMessagesRef.current.has('conv-a')).toBe(false);
    expect(conversationStreamingRef.current.has('conv-a')).toBe(false);
    expect(conversationMessagesRef.current.get('conv-b')).toEqual([]);
    expect(conversationStreamingRef.current.get('conv-b')).toMatchObject({
      streamingMessageId: 'message-b',
      queuedMessageCount: 2,
    });
    expect(coordinator.read('conv-a')).toBe(snapshotA);
    expect(coordinator.read('conv-b')).toBe(snapshotB);
    expect(coordinator.isDisposed('conv-a')).toBe(false);
  });
});
