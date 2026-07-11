import { describe, expect, it, vi } from 'vitest';
import type { AgentTurnTimelineMessage } from '@neko-agent/types';
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
