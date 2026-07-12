import { describe, expect, it, vi } from 'vitest';
import type { Message } from '@neko-agent/types';
import {
  ConversationRenderLifecycleError,
  createIdleConversationStreamingSnapshot,
  type ConversationMarkdownTimelineResourceOwner,
  type ConversationRenderSnapshot,
  type ConversationVisibleStatePort,
} from './conversation-render-contract';
import { ConversationRenderCoordinator } from './conversation-render-coordinator';

describe('ConversationRenderCoordinator', () => {
  it('advances revisions monotonically and rejects stale mutations', () => {
    const coordinator = new ConversationRenderCoordinator();

    expect(coordinator.ingest(hostSnapshot('conv-a', 0, [message('a-1')])).revision).toBe(1);
    expect(coordinator.ingest(hostSnapshot('conv-a', 1, [message('a-2')])).revision).toBe(2);

    expect(() => coordinator.ingest(hostSnapshot('conv-a', 1, [message('stale')]))).toThrowError(
      expect.objectContaining({
        diagnostic: expect.objectContaining({ code: 'stale-revision' }),
      }),
    );
  });

  it('publishes revision changes only to the owning conversation subscribers', () => {
    const coordinator = new ConversationRenderCoordinator();
    const listenerA = vi.fn();
    const listenerB = vi.fn();
    const unsubscribeA = coordinator.subscribeRevision('conv-a', listenerA);
    coordinator.subscribeRevision('conv-b', listenerB);

    coordinator.ingest(hostSnapshot('conv-a', 0, [message('a-1')]));

    expect(coordinator.revision('conv-a')).toBe(1);
    expect(coordinator.revision('conv-b')).toBe(0);
    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).not.toHaveBeenCalled();

    unsubscribeA();
    coordinator.ingest(hostSnapshot('conv-a', 1, [message('a-2')]));
    expect(listenerA).toHaveBeenCalledTimes(1);
  });

  it('keeps one foreground conversation and publishes only after visible state commits', () => {
    const events: string[] = [];
    const coordinator = new ConversationRenderCoordinator();
    coordinator.ingest(hostSnapshot('conv-a', 0, [message('a')]));
    coordinator.ingest(hostSnapshot('conv-b', 0, [message('b')]));
    const visibleState = createVisibleStatePort(events);
    const markdown = createMarkdownOwner(events, (conversationId) => {
      expect(visibleState.currentConversationId()).toBe(conversationId);
      expect(coordinator.foregroundConversationId()).toBe(conversationId);
    });

    coordinator
      .prepareActivation({ kind: 'activation', conversationId: 'conv-a', source: 'ui-tab' })
      .commit({ visibleState, markdown });

    expect(events).toEqual(['markdown:prepare:conv-a', 'visible:commit:conv-a', 'publish:conv-a']);
    expect(coordinator.read('conv-a')?.visibility).toBe('foreground');
    expect(coordinator.read('conv-b')?.visibility).toBe('background');

    coordinator
      .prepareActivation({
        kind: 'activation',
        conversationId: 'conv-b',
        source: 'extension-tab-state',
      })
      .commit({ visibleState, markdown });

    expect(coordinator.foregroundConversationId()).toBe('conv-b');
    expect(coordinator.read('conv-a')?.visibility).toBe('background');
    expect(coordinator.read('conv-b')?.visibility).toBe('foreground');
  });

  it('fails visibly when Markdown Timeline activation has no resource owner', () => {
    const coordinator = new ConversationRenderCoordinator();
    coordinator.ingest({
      ...hostSnapshot('conv-a', 0, [message('message-a')]),
      streaming: {
        ...createIdleConversationStreamingSnapshot(),
        streamingMessageId: 'message-a',
        isThinking: true,
        activeTurnTimeline: markdownTimeline('conv-a'),
      },
    });

    const transaction = coordinator.prepareActivation({
      kind: 'activation',
      conversationId: 'conv-a',
      source: 'extension-tab-state',
    });

    expect(() => transaction.commit({ visibleState: createVisibleStatePort([]) })).toThrowError(
      expect.objectContaining({
        diagnostic: expect.objectContaining({
          code: 'markdown-resource-owner-missing',
          conversationId: 'conv-a',
          activationSource: 'extension-tab-state',
          currentRevision: 1,
          targetRevision: 2,
          messageId: 'message-a',
          turnId: 'turn-a',
        }),
      }),
    );
    expect(coordinator.foregroundConversationId()).toBeNull();
    expect(coordinator.read('conv-a')?.visibility).toBe('background');
  });

  it('releases unavailable Timeline ownership before activation', () => {
    const coordinator = new ConversationRenderCoordinator();
    coordinator.ingest({
      ...hostSnapshot('conv-a', 0, [message('stream')]),
      streaming: {
        ...createIdleConversationStreamingSnapshot(),
        streamingMessageId: 'stream',
        isThinking: true,
        synchronization: 'unavailable',
      },
    });

    const snapshot = coordinator.prepareActivation({
      kind: 'activation',
      conversationId: 'conv-a',
      source: 'extension-active-conversation',
    }).snapshot;

    expect(snapshot.streaming).toMatchObject({
      streamingMessageId: null,
      isThinking: false,
      synchronization: 'unavailable',
      activeTurnTimeline: null,
    });
  });

  it('rejects identity mismatches and mutations after disposal', () => {
    const coordinator = new ConversationRenderCoordinator();
    const timeline = {
      connectionEpoch: 'epoch-1',
      conversationId: 'conv-other',
      turnId: 'turn-a',
      messageId: 'message-a',
      deliveryRevision: 1,
      validationState: {
        connectionEpoch: 'epoch-1',
        conversationId: 'conv-other',
        turnId: 'turn-a',
        messageId: 'message-a',
        deliveryRevision: 1,
        completed: false,
        items: new Map(),
      },
      items: [],
      completed: false,
      synchronization: 'synchronized' as const,
    };

    expect(() =>
      coordinator.ingest({
        ...hostSnapshot('conv-a', 0, []),
        streaming: {
          ...createIdleConversationStreamingSnapshot(),
          activeTurnTimeline: timeline,
        },
      }),
    ).toThrowError(
      expect.objectContaining({
        diagnostic: expect.objectContaining({ code: 'conversation-identity-mismatch' }),
      }),
    );

    coordinator.ingest(hostSnapshot('conv-a', 0, []));
    coordinator.dispose({
      kind: 'disposal',
      conversationId: 'conv-a',
      reason: 'conversation-delete',
    });

    expect(() => coordinator.ingest(hostSnapshot('conv-a', 2, []))).toThrowError(
      expect.objectContaining({
        diagnostic: expect.objectContaining({ code: 'conversation-disposed' }),
      }),
    );
  });

  it('clears only the disposed conversation snapshot', () => {
    const coordinator = new ConversationRenderCoordinator();
    const listenerA = vi.fn();
    const listenerB = vi.fn();
    coordinator.ingest(hostSnapshot('conv-a', 0, [message('a')]));
    coordinator.ingest(hostSnapshot('conv-b', 0, [message('b')]));
    coordinator.subscribeRevision('conv-a', listenerA);
    coordinator.subscribeRevision('conv-b', listenerB);

    const disposed = coordinator.dispose({
      kind: 'disposal',
      conversationId: 'conv-a',
      reason: 'conversation-delete',
    });

    expect(disposed).toMatchObject({ retention: 'disposed', revision: 2 });
    expect(coordinator.read('conv-a')).toBeUndefined();
    expect(coordinator.isDisposed('conv-a')).toBe(true);
    expect(coordinator.revision('conv-a')).toBe(2);
    expect(coordinator.read('conv-b')).toMatchObject({
      messages: [expect.objectContaining({ id: 'b' })],
    });
    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).not.toHaveBeenCalled();
    expect(() =>
      coordinator.dispose({
        kind: 'disposal',
        conversationId: 'conv-a',
        reason: 'conversation-delete',
      }),
    ).toThrowError(
      expect.objectContaining({
        diagnostic: expect.objectContaining({ code: 'conversation-disposed' }),
      }),
    );
  });

  it('makes activation publication single-use and validates the visible commit identity', () => {
    const coordinator = new ConversationRenderCoordinator();
    coordinator.ingest(hostSnapshot('conv-a', 0, []));
    const transaction = coordinator.prepareActivation({
      kind: 'activation',
      conversationId: 'conv-a',
      source: 'character-role-tab',
    });
    const visibleState = createVisibleStatePort([]);
    const markdown = createMarkdownOwner([], () => undefined);

    transaction.commit({ visibleState, markdown });
    expect(() => transaction.commit({ visibleState, markdown })).toThrowError(
      expect.objectContaining({
        diagnostic: expect.objectContaining({ code: 'activation-already-committed' }),
      }),
    );

    coordinator.ingest(hostSnapshot('conv-b', 0, []));
    const mismatchedVisibleState: ConversationVisibleStatePort = {
      commit: vi.fn(),
      currentConversationId: () => 'conv-a',
    };
    expect(() =>
      coordinator
        .prepareActivation({
          kind: 'activation',
          conversationId: 'conv-b',
          source: 'extension-active-conversation',
        })
        .commit({ visibleState: mismatchedVisibleState, markdown }),
    ).toThrowError(ConversationRenderLifecycleError);
  });
});

function hostSnapshot(conversationId: string, baseRevision: number, messages: readonly Message[]) {
  return {
    kind: 'host-snapshot' as const,
    conversationId,
    baseRevision,
    messages,
    streaming: createIdleConversationStreamingSnapshot(),
  };
}

function markdownTimeline(conversationId: string) {
  return {
    connectionEpoch: 'epoch-1',
    conversationId,
    turnId: 'turn-a',
    messageId: 'message-a',
    deliveryRevision: 1,
    validationState: {
      connectionEpoch: 'epoch-1',
      conversationId,
      turnId: 'turn-a',
      messageId: 'message-a',
      deliveryRevision: 1,
      completed: false,
      items: new Map(),
    },
    items: [
      {
        conversationId,
        turnId: 'turn-a',
        messageId: 'message-a',
        itemId: 'text-a',
        sequence: 1,
        itemRevision: 1,
        kind: 'assistant_text' as const,
        status: 'streaming' as const,
        payload: { content: 'stream', format: 'markdown' as const, sourceGeneration: 1 },
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    completed: false,
    synchronization: 'synchronized' as const,
  };
}

function message(id: string): Message {
  return { id, role: 'assistant', content: id, timestamp: 1 };
}

function createVisibleStatePort(events: string[]): ConversationVisibleStatePort {
  let activeConversationId: string | null = null;
  return {
    commit(snapshot): void {
      activeConversationId = snapshot.conversationId;
      events.push(`visible:commit:${snapshot.conversationId}`);
    },
    currentConversationId: () => activeConversationId,
  };
}

function createMarkdownOwner(
  events: string[],
  onPublish: (conversationId: string) => void,
): ConversationMarkdownTimelineResourceOwner {
  return {
    prepare(snapshot: ConversationRenderSnapshot) {
      events.push(`markdown:prepare:${snapshot.conversationId}`);
      return {
        publish(): void {
          onPublish(snapshot.conversationId);
          events.push(`publish:${snapshot.conversationId}`);
        },
      };
    },
    disposeConversation: vi.fn(),
  };
}
