import { describe, expect, it, vi } from 'vitest';
import type { AgentTurnTimelineMessage } from '@neko-agent/types';
import { ConversationRenderCoordinator } from '../../render-lifecycle/conversation-render-coordinator';
import { ingestConversationRenderSnapshot } from '../../render-lifecycle/conversation-render-state-adapter';
import {
  createTimelineRenderCommitScheduler,
  type TimelineRenderFramePort,
} from '../timeline-render-commit-scheduler';

describe('timeline render commit scheduler', () => {
  it('coalesces contiguous append deliveries for one turn into one frame commit', () => {
    const frame = createFrameHarness();
    const scheduler = createTimelineRenderCommitScheduler(frame.port);
    const commit = vi.fn();

    scheduler.enqueue(appendMessage(1, 'a'), commit);
    scheduler.enqueue(appendMessage(2, 'b'), commit);
    scheduler.enqueue(appendMessage(3, 'c'), commit);

    expect(commit).not.toHaveBeenCalled();
    expect(frame.pending()).toBe(1);
    frame.flush();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0]?.[0]).toHaveLength(3);
    expect(scheduler.metrics()).toMatchObject({
      scheduledDeliveries: 3,
      renderCommits: 1,
      maxPendingDeliveries: 3,
      pendingDeliveries: 0,
    });
  });

  it('flushes pending append source before completion and cancels the frame', () => {
    const frame = createFrameHarness();
    const scheduler = createTimelineRenderCommitScheduler(frame.port);
    const commits: AgentTurnTimelineMessage[][] = [];
    const commit = (messages: readonly AgentTurnTimelineMessage[]) => commits.push([...messages]);

    scheduler.enqueue(appendMessage(1, 'a'), commit);
    scheduler.enqueue(completionMessage(2), commit);

    expect(commits.map((messages) => messages.map((message) => message.deliveryRevision))).toEqual([
      [1],
      [2],
    ]);
    expect(frame.pending()).toBe(0);
  });

  it('flushes pending append source before replacement and explicit conversation switch', () => {
    const frame = createFrameHarness();
    const scheduler = createTimelineRenderCommitScheduler(frame.port);
    const commits: AgentTurnTimelineMessage[][] = [];
    const commit = (messages: readonly AgentTurnTimelineMessage[]) => commits.push([...messages]);

    scheduler.enqueue(appendMessage(1, 'a'), commit);
    scheduler.enqueue(replacementMessage(2, 'replacement'), commit);
    scheduler.enqueue(appendMessage(1, 'other', 'conv-b'), commit);
    scheduler.flushAll();

    expect(commits.map((messages) => messages.map((message) => message.deliveryRevision))).toEqual([
      [1],
      [2],
      [1],
    ]);
    expect(frame.pending()).toBe(0);
  });

  it('advances only the owning coordinator revision for coalesced foreground and background commits', () => {
    const frame = createFrameHarness();
    const scheduler = createTimelineRenderCommitScheduler(frame.port);
    const coordinator = new ConversationRenderCoordinator();
    const seedSnapshot = (conversationId: string) =>
      ingestConversationRenderSnapshot({
        coordinator,
        conversationId,
        messages: [],
        streaming: {
          streamingMessageId: null,
          isThinking: false,
          queuedMessageCount: 0,
          queuedMessages: [],
        },
      });
    seedSnapshot('conv-a');
    const initialB = seedSnapshot('conv-b');
    let visibleConversationId: string | null = null;
    coordinator
      .prepareActivation({ kind: 'activation', conversationId: 'conv-a', source: 'ui-tab' })
      .commit({
        visibleState: {
          commit(snapshot): void {
            visibleConversationId = snapshot.conversationId;
          },
          currentConversationId(): string | null {
            return visibleConversationId;
          },
        },
      });
    const initialA = coordinator.read('conv-a');
    if (!initialA) throw new Error('Foreground conversation seed snapshot is unavailable.');
    const committedDeliveries = new Map<string, number[]>();
    const commit = (deliveries: readonly AgentTurnTimelineMessage[]): void => {
      const first = deliveries[0];
      if (!first) throw new Error('Timeline scheduler commit requires at least one delivery.');
      committedDeliveries.set(
        first.conversationId,
        deliveries.map(({ deliveryRevision }) => deliveryRevision),
      );
      ingestConversationRenderSnapshot({
        coordinator,
        conversationId: first.conversationId,
        messages: [],
        streaming: {
          streamingMessageId: first.messageId,
          isThinking: false,
          queuedMessageCount: 0,
          queuedMessages: [],
        },
        kind: 'timeline-commit',
      });
    };

    scheduler.enqueue(appendMessage(1, 'a', 'conv-a'), commit);
    scheduler.enqueue(appendMessage(2, 'b', 'conv-a'), commit);
    scheduler.enqueue(appendMessage(1, 'background', 'conv-b'), commit);

    scheduler.flushConversation('conv-a');

    expect(committedDeliveries.get('conv-a')).toEqual([1, 2]);
    expect(committedDeliveries.has('conv-b')).toBe(false);
    expect(coordinator.revision('conv-a')).toBe(initialA.revision + 1);
    expect(coordinator.revision('conv-b')).toBe(initialB.revision);
    expect(coordinator.foregroundConversationId()).toBe('conv-a');

    scheduler.flushConversation('conv-b');

    expect(committedDeliveries.get('conv-b')).toEqual([1]);
    expect(coordinator.revision('conv-a')).toBe(initialA.revision + 1);
    expect(coordinator.revision('conv-b')).toBe(initialB.revision + 1);
    expect(coordinator.foregroundConversationId()).toBe('conv-a');
  });

  it('discards one conversation without committing it or disturbing another owner', () => {
    const frame = createFrameHarness();
    const scheduler = createTimelineRenderCommitScheduler(frame.port);
    const commitA = vi.fn();
    const commitB = vi.fn();

    scheduler.enqueue(appendMessage(1, 'a', 'conv-a'), commitA);
    scheduler.enqueue(appendMessage(1, 'b', 'conv-b'), commitB);
    scheduler.discardConversation('conv-a');

    expect(commitA).not.toHaveBeenCalled();
    expect(scheduler.metrics().pendingDeliveries).toBe(1);
    expect(frame.pending()).toBe(1);

    frame.flush();
    expect(commitA).not.toHaveBeenCalled();
    expect(commitB).toHaveBeenCalledTimes(1);
  });

  it('cancels an idle frame when the last pending turn is discarded', () => {
    const frame = createFrameHarness();
    const scheduler = createTimelineRenderCommitScheduler(frame.port);
    const commit = vi.fn();

    scheduler.enqueue(appendMessage(1, 'a', 'conv-a'), commit);
    scheduler.discardTurn('conv-a', 'message-1');

    expect(frame.pending()).toBe(0);
    expect(scheduler.metrics().pendingDeliveries).toBe(0);
    frame.flush();
    expect(commit).not.toHaveBeenCalled();
  });

  it('flushes one conversation independently and cancels all pending work on disposal', () => {
    const frame = createFrameHarness();
    const scheduler = createTimelineRenderCommitScheduler(frame.port);
    const commitA = vi.fn();
    const commitB = vi.fn();

    scheduler.enqueue(appendMessage(1, 'a', 'conv-a'), commitA);
    scheduler.enqueue(appendMessage(1, 'b', 'conv-b'), commitB);
    scheduler.flushConversation('conv-a');

    expect(commitA).toHaveBeenCalledTimes(1);
    expect(commitB).not.toHaveBeenCalled();
    scheduler.dispose();
    expect(frame.pending()).toBe(0);
    expect(scheduler.metrics()).toMatchObject({ pendingDeliveries: 0, disposed: true });
    expect(commitB).not.toHaveBeenCalled();
    expect(() => scheduler.enqueue(appendMessage(2, 'late'), commitA)).toThrow('disposed');
  });
});

function appendMessage(
  deliveryRevision: number,
  content: string,
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
          itemRevision: deliveryRevision,
          kind: 'assistant_text',
          status: 'streaming',
          payload: { content, format: 'markdown', sourceGeneration: 1 },
          createdAt: 1,
          updatedAt: deliveryRevision,
        },
      },
    ],
  };
}

function replacementMessage(deliveryRevision: number, content: string): AgentTurnTimelineMessage {
  const base = appendMessage(deliveryRevision, content);
  const append = base.operations[0];
  if (!append || append.operation !== 'append' || append.item.kind !== 'assistant_text') {
    throw new Error('Replacement fixture requires an assistant text append operation base.');
  }
  return {
    ...base,
    operations: [
      {
        operation: 'replace',
        item: {
          ...append.item,
          payload: { content, format: 'markdown', sourceGeneration: 2 },
        },
      },
    ],
  };
}

function completionMessage(deliveryRevision: number): AgentTurnTimelineMessage {
  return {
    ...appendMessage(deliveryRevision, ''),
    operations: [
      {
        operation: 'complete',
        itemId: 'text-1',
        itemRevision: deliveryRevision,
        kind: 'assistant_text',
        sourceGeneration: 1,
        status: 'complete',
        updatedAt: deliveryRevision,
      },
    ],
    completion: { status: 'completed', completedAt: deliveryRevision },
  };
}

function createFrameHarness(): {
  readonly port: TimelineRenderFramePort;
  pending(): number;
  flush(): void;
} {
  let nextHandle = 1;
  const callbacks = new Map<number, () => void>();
  return {
    port: {
      request(callback): number {
        const handle = nextHandle++;
        callbacks.set(handle, callback);
        return handle;
      },
      cancel(handle): void {
        callbacks.delete(handle);
      },
    },
    pending(): number {
      return callbacks.size;
    },
    flush(): void {
      const entries = Array.from(callbacks.values());
      callbacks.clear();
      for (const callback of entries) callback();
    },
  };
}
