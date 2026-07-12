import { describe, expect, it, vi } from 'vitest';
import type { Message } from '@neko-agent/types';
import {
  ConversationRenderLifecycleError,
  createIdleConversationStreamingSnapshot,
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

  it('keeps one foreground conversation and commits only through visible state', () => {
    const events: string[] = [];
    const coordinator = new ConversationRenderCoordinator();
    coordinator.ingest(hostSnapshot('conv-a', 0, [message('a')]));
    coordinator.ingest(hostSnapshot('conv-b', 0, [message('b')]));
    const visibleState = createVisibleStatePort(events);
    coordinator
      .prepareActivation({ kind: 'activation', conversationId: 'conv-a', source: 'ui-tab' })
      .commit({ visibleState });

    expect(events).toEqual(['visible:commit:conv-a']);
    expect(coordinator.read('conv-a')?.visibility).toBe('foreground');
    expect(coordinator.read('conv-b')?.visibility).toBe('background');

    coordinator
      .prepareActivation({
        kind: 'activation',
        conversationId: 'conv-b',
        source: 'extension-tab-state',
      })
      .commit({ visibleState });

    expect(coordinator.foregroundConversationId()).toBe('conv-b');
    expect(coordinator.read('conv-a')?.visibility).toBe('background');
    expect(coordinator.read('conv-b')?.visibility).toBe('foreground');
  });

  it('rejects mutations after disposal', () => {
    const coordinator = new ConversationRenderCoordinator();
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
    transaction.commit({ visibleState });
    expect(() => transaction.commit({ visibleState })).toThrowError(
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
        .commit({ visibleState: mismatchedVisibleState }),
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
