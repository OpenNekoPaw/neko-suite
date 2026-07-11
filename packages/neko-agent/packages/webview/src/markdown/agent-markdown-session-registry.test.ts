import { describe, expect, it, vi } from 'vitest';
import type { AgentTurnTimelineItem, AgentTurnTimelineMessage } from '@neko-agent/types';
import {
  createAgentMarkdownSessionKey,
  createAgentMarkdownSessionRegistry,
} from './agent-markdown-session-registry';

describe('agent markdown session registry', () => {
  it('coalesces all append operations for one frame into one Markdown revision', () => {
    const registry = createAgentMarkdownSessionRegistry();
    const key = sessionKey();
    const listener = vi.fn();
    registry.subscribe(key, listener);

    registry.applyTimelineDeliveries([
      appendMessage(1, 1, '| A'),
      appendMessage(2, 2, ' | B |\n'),
      appendMessage(3, 3, '| - | - |\n'),
    ]);

    expect(registry.getSnapshot(key)).toMatchObject({
      source: '| A | B |\n| - | - |\n',
      isFinal: false,
    });
    expect(registry.metrics()).toMatchObject({ renderRevisions: 1, activeSessions: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('stages source visibility before publishing one external-store notification', () => {
    const registry = createAgentMarkdownSessionRegistry();
    const key = sessionKey();
    const listener = vi.fn();
    registry.subscribe(key, listener);

    const publication = registry.commitTimelineDeliveries([appendMessage(1, 2000, 'coalesced')]);

    expect(registry.getSnapshot(key)?.source).toBe('coalesced');
    expect(listener).not.toHaveBeenCalled();
    publication.publish();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(() => publication.publish()).toThrow(
      'Markdown Timeline commit publication may only be published once',
    );
  });

  it('keeps one session while a GFM table crosses multiple Timeline revisions', () => {
    const registry = createAgentMarkdownSessionRegistry();
    const key = sessionKey();

    registry.applyTimelineDeliveries([appendMessage(1, 1, '| Shot | Prompt |\n')]);
    const first = registry.getSnapshot(key);
    registry.applyTimelineDeliveries([appendMessage(2, 2, '| --- | --- |\n')]);
    registry.applyTimelineDeliveries([appendMessage(3, 3, '| 1 | Pan right |')]);
    const final = registry.getSnapshot(key);

    expect(final).toMatchObject({
      sessionId: first?.sessionId,
      revision: 3,
      source: '| Shot | Prompt |\n| --- | --- |\n| 1 | Pan right |',
      isFinal: false,
    });
    expect(final?.document.root.children.some((node) => node.type === 'table')).toBe(true);
  });

  it('coalesces append plus completion into one final session revision', () => {
    const registry = createAgentMarkdownSessionRegistry();
    const key = sessionKey();

    registry.applyTimelineDeliveries([
      appendMessage(1, 1, 'exact final source'),
      completeMessage(2, 2, 1),
    ]);

    expect(registry.getSnapshot(key)).toMatchObject({
      revision: 1,
      source: 'exact final source',
      isFinal: true,
    });
    expect(registry.metrics()).toMatchObject({
      createdSessions: 1,
      renderRevisions: 1,
      notifications: 0,
    });
  });

  it('rebuilds a missing streaming session from an authoritative Timeline snapshot', () => {
    const registry = createAgentMarkdownSessionRegistry();
    const key = sessionKey();
    const listener = vi.fn();
    registry.subscribe(key, listener);

    const publication = registry.commitTimelineSnapshot({
      conversationId: 'conv-1',
      messageId: 'message-1',
      items: [markdownSnapshotItem('partial **markdown**', 4)],
    });

    expect(registry.getSnapshot(key)).toMatchObject({
      source: 'partial **markdown**',
      isFinal: false,
    });
    expect(listener).not.toHaveBeenCalled();
    publication.publish();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not create a render revision when the authoritative snapshot already matches', () => {
    const registry = createAgentMarkdownSessionRegistry();
    const item = markdownSnapshotItem('stable', 2);

    registry
      .commitTimelineSnapshot({
        conversationId: 'conv-1',
        messageId: 'message-1',
        items: [item],
      })
      .publish();
    const first = registry.getSnapshot(sessionKey());
    const metricsBefore = registry.metrics();

    registry
      .commitTimelineSnapshot({
        conversationId: 'conv-1',
        messageId: 'message-1',
        items: [item],
      })
      .publish();

    expect(registry.getSnapshot(sessionKey())).toBe(first);
    expect(registry.metrics()).toMatchObject({
      createdSessions: metricsBefore.createdSessions,
      disposedSessions: metricsBefore.disposedSessions,
      renderRevisions: metricsBefore.renderRevisions,
      notifications: metricsBefore.notifications,
    });
  });

  it('removes sessions omitted by the authoritative message snapshot and publishes once', () => {
    const registry = createAgentMarkdownSessionRegistry();
    const retainedKey = sessionKey('conv-1', 'text-1');
    const removedKey = sessionKey('conv-1', 'text-2');
    const retainedListener = vi.fn();
    const removedListener = vi.fn();
    registry.subscribe(retainedKey, retainedListener);
    registry.subscribe(removedKey, removedListener);

    registry
      .commitTimelineSnapshot({
        conversationId: 'conv-1',
        messageId: 'message-1',
        items: [
          markdownSnapshotItem('retained', 1, 'streaming', 1, 'text-1'),
          markdownSnapshotItem('removed', 1, 'streaming', 1, 'text-2'),
        ],
      })
      .publish();
    retainedListener.mockClear();
    removedListener.mockClear();

    registry
      .commitTimelineSnapshot({
        conversationId: 'conv-1',
        messageId: 'message-1',
        items: [markdownSnapshotItem('retained', 1, 'streaming', 1, 'text-1')],
      })
      .publish();

    expect(registry.getSnapshot(retainedKey)?.source).toBe('retained');
    expect(registry.getSnapshot(removedKey)).toBeUndefined();
    expect(retainedListener).not.toHaveBeenCalled();
    expect(removedListener).toHaveBeenCalledTimes(1);
    expect(registry.metrics()).toMatchObject({ activeSessions: 1, disposedSessions: 1 });
  });

  it('replaces stale registry state with the authoritative Timeline snapshot', () => {
    const registry = createAgentMarkdownSessionRegistry();
    registry.applyTimelineDeliveries([appendMessage(1, 1, 'stale')]);
    const staleSessionId = registry.getSnapshot(sessionKey())?.sessionId;

    registry
      .commitTimelineSnapshot({
        conversationId: 'conv-1',
        messageId: 'message-1',
        items: [markdownSnapshotItem('canonical', 5, 'complete', 2)],
      })
      .publish();

    expect(registry.getSnapshot(sessionKey())).toMatchObject({
      source: 'canonical',
      isFinal: true,
    });
    expect(registry.getSnapshot(sessionKey())?.sessionId).not.toBe(staleSessionId);
  });

  it('replaces a source generation explicitly and finalizes the replacement session', () => {
    const registry = createAgentMarkdownSessionRegistry();
    const key = sessionKey();
    registry.applyTimelineDeliveries([appendMessage(1, 1, 'draft')]);
    const firstSession = registry.getSnapshot(key)?.sessionId;

    registry.applyTimelineDeliveries([replaceMessage(2, 2, 'final', 2)]);
    registry.applyTimelineDeliveries([completeMessage(3, 3, 2)]);

    expect(registry.getSnapshot(key)).toMatchObject({ source: 'final', isFinal: true });
    expect(registry.getSnapshot(key)?.sessionId).not.toBe(firstSession);
    expect(registry.metrics()).toMatchObject({
      createdSessions: 2,
      disposedSessions: 1,
      renderRevisions: 3,
    });
  });

  it('rejects stale item revisions and append generation changes instead of guessing replacement', () => {
    const registry = createAgentMarkdownSessionRegistry();
    registry.applyTimelineDeliveries([appendMessage(1, 1, 'a')]);

    expect(() => registry.applyTimelineDeliveries([appendMessage(2, 1, 'stale')])).toThrow(
      'Markdown item revision must increase',
    );
    expect(() => registry.applyTimelineDeliveries([appendMessage(3, 2, 'wrong', 2)])).toThrow(
      'Markdown append generation mismatch',
    );
  });

  it('keeps concurrent conversations isolated and disposes only the selected owner', () => {
    const registry = createAgentMarkdownSessionRegistry();
    const listenerA = vi.fn();
    const listenerB = vi.fn();
    registry.subscribe(sessionKey('conv-a'), listenerA);
    registry.subscribe(sessionKey('conv-b'), listenerB);
    registry.applyTimelineDeliveries([
      appendMessage(1, 1, 'a', 1, 'conv-a'),
      appendMessage(1, 1, 'b', 1, 'conv-b'),
    ]);

    registry.disposeConversation('conv-a');

    expect(registry.getSnapshot(sessionKey('conv-a'))).toBeUndefined();
    expect(registry.getSnapshot(sessionKey('conv-b'))?.source).toBe('b');
    expect(listenerA).toHaveBeenCalledTimes(2);
    expect(listenerB).toHaveBeenCalledTimes(1);
    expect(registry.metrics()).toMatchObject({
      activeSessions: 1,
      disposedSessions: 1,
      activeSubscriptions: 1,
    });
  });

  it('releases only the selected active turn sessions and subscriptions', () => {
    const registry = createAgentMarkdownSessionRegistry();
    const releasedKey = sessionKey('conv-a');
    const retainedKey = createAgentMarkdownSessionKey({
      conversationId: 'conv-a',
      messageId: 'message-2',
      itemId: 'text-1',
    });
    const releasedListener = vi.fn();
    const retainedListener = vi.fn();
    registry.subscribe(releasedKey, releasedListener);
    registry.subscribe(retainedKey, retainedListener);
    registry.applyTimelineDeliveries([appendMessage(1, 1, 'a', 1, 'conv-a')]);
    registry
      .commitTimelineSnapshot({
        conversationId: 'conv-a',
        messageId: 'message-2',
        items: [
          {
            conversationId: 'conv-a',
            turnId: 'turn-2',
            messageId: 'message-2',
            itemId: 'text-1',
            sequence: 1,
            itemRevision: 1,
            kind: 'assistant_text',
            status: 'streaming',
            payload: { content: 'b', format: 'markdown', sourceGeneration: 1 },
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      })
      .publish();

    registry.releaseTurn('conv-a', 'message-1');

    expect(registry.getSnapshot(releasedKey)).toBeUndefined();
    expect(registry.getSnapshot(retainedKey)?.source).toBe('b');
    expect(releasedListener).toHaveBeenCalledTimes(2);
    expect(retainedListener).toHaveBeenCalledTimes(1);
    expect(registry.metrics()).toMatchObject({ activeSessions: 1, activeSubscriptions: 1 });
  });

  it('disposes realm sessions without notifying subscribers during teardown', () => {
    const registry = createAgentMarkdownSessionRegistry();
    const listener = vi.fn();
    const key = sessionKey();
    registry.subscribe(key, listener);
    registry.applyTimelineDeliveries([appendMessage(1, 1, 'before dispose')]);
    expect(registry.metrics().activeSubscriptions).toBe(1);

    registry.disposeAll();
    expect(registry.metrics()).toMatchObject({ activeSessions: 0, activeSubscriptions: 0 });
    registry.applyTimelineDeliveries([appendMessage(1, 1, 'after remount')]);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(registry.getSnapshot(key)?.source).toBe('after remount');
    expect(registry.metrics()).toMatchObject({
      activeSessions: 1,
      createdSessions: 2,
      disposedSessions: 1,
      notifications: 1,
      activeSubscriptions: 0,
    });
  });
});

function sessionKey(conversationId = 'conv-1', itemId = 'text-1'): string {
  return createAgentMarkdownSessionKey({
    conversationId,
    messageId: 'message-1',
    itemId,
  });
}

function appendMessage(
  deliveryRevision: number,
  itemRevision: number,
  content: string,
  sourceGeneration = 1,
  conversationId = 'conv-1',
): AgentTurnTimelineMessage {
  return {
    type: 'agentTurnTimeline',
    schemaVersion: 2,
    connectionEpoch: 'epoch-1',
    conversationId,
    turnId: 'turn-1',
    messageId: 'message-1',
    batchKind: 'delta',
    deliveryRevision,
    operations: [
      {
        operation: 'append',
        item: {
          conversationId,
          turnId: 'turn-1',
          messageId: 'message-1',
          itemId: 'text-1',
          sequence: 1,
          itemRevision,
          kind: 'assistant_text',
          status: 'streaming',
          payload: { content, format: 'markdown', sourceGeneration },
          createdAt: 1,
          updatedAt: itemRevision,
        },
      },
    ],
  };
}

function replaceMessage(
  deliveryRevision: number,
  itemRevision: number,
  content: string,
  sourceGeneration: number,
): AgentTurnTimelineMessage {
  const base = appendMessage(deliveryRevision, itemRevision, content, sourceGeneration);
  const operation = base.operations[0];
  if (!operation || operation.operation !== 'append' || operation.item.kind !== 'assistant_text') {
    throw new Error('Replacement fixture requires an assistant text append base.');
  }
  return { ...base, operations: [{ operation: 'replace', item: operation.item }] };
}

function completeMessage(
  deliveryRevision: number,
  itemRevision: number,
  sourceGeneration: number,
): AgentTurnTimelineMessage {
  return {
    ...appendMessage(deliveryRevision, itemRevision, '', sourceGeneration),
    operations: [
      {
        operation: 'complete',
        itemId: 'text-1',
        itemRevision,
        kind: 'assistant_text',
        sourceGeneration,
        status: 'complete',
        updatedAt: itemRevision,
      },
    ],
    completion: { status: 'completed', completedAt: itemRevision },
  };
}

function markdownSnapshotItem(
  content: string,
  itemRevision: number,
  status: 'streaming' | 'complete' = 'streaming',
  sourceGeneration = 1,
  itemId = 'text-1',
): AgentTurnTimelineItem {
  return {
    conversationId: 'conv-1',
    turnId: 'turn-1',
    messageId: 'message-1',
    itemId,
    sequence: itemId === 'text-1' ? 1 : 2,
    itemRevision,
    kind: 'assistant_text',
    status,
    payload: { content, format: 'markdown', sourceGeneration },
    createdAt: 1,
    updatedAt: itemRevision,
  };
}
