import { describe, expect, it } from 'vitest';
import type {
  AgentTurnTimelineAssistantTextItem,
  AgentTurnTimelineMessage,
  AgentTurnTimelineOperation,
  AgentTurnTimelineStructuralItem,
} from '@neko-agent/types';
import { buildAgentTurnTimelineMessage } from '@neko-agent/types';
import {
  AgentTimelineDeliveryChannel,
  type AgentTimelineDeliveryPort,
  type AgentTimelineDeliveryTimer,
} from '../agentTimelineDeliveryScheduler';

const identity = {
  connectionEpoch: 'epoch-1',
  conversationId: 'conv-1',
  turnId: 'turn-msg-1',
  messageId: 'msg-1',
} as const;

class FakeTimer implements AgentTimelineDeliveryTimer {
  private currentTime = 0;
  private nextId = 1;
  private readonly scheduled = new Map<
    number,
    { readonly at: number; readonly callback: () => void }
  >();

  setTimeout(callback: () => void, delayMs: number): unknown {
    const id = this.nextId++;
    this.scheduled.set(id, { at: this.currentTime + delayMs, callback });
    return id;
  }

  clearTimeout(handle: unknown): void {
    if (typeof handle !== 'number') throw new Error('Unexpected fake timer handle.');
    this.scheduled.delete(handle);
  }

  now(): number {
    return this.currentTime;
  }

  advanceBy(milliseconds: number): void {
    const target = this.currentTime + milliseconds;
    while (true) {
      const next = Array.from(this.scheduled.entries())
        .filter(([, scheduled]) => scheduled.at <= target)
        .sort((left, right) => left[1].at - right[1].at)[0];
      if (!next) break;
      const [id, scheduled] = next;
      this.scheduled.delete(id);
      this.currentTime = scheduled.at;
      scheduled.callback();
    }
    this.currentTime = target;
  }

  pendingCount(): number {
    return this.scheduled.size;
  }
}

class RecordingPort implements AgentTimelineDeliveryPort {
  readonly messages: AgentTurnTimelineMessage[] = [];
  shouldAccept = true;
  rejection: Error | undefined;

  async postMessage(message: AgentTurnTimelineMessage): Promise<boolean> {
    this.messages.push(message);
    if (this.rejection) throw this.rejection;
    return this.shouldAccept;
  }
}

function createChannel(
  input: {
    readonly timer?: FakeTimer;
    readonly port?: AgentTimelineDeliveryPort;
    readonly maxLatencyMs?: number;
    readonly maxPendingTextBytes?: number;
    readonly deliverFirstAppendImmediately?: boolean;
  } = {},
) {
  const timer = input.timer ?? new FakeTimer();
  const port = input.port ?? new RecordingPort();
  const channel = new AgentTimelineDeliveryChannel(identity, port, {
    timer,
    policy: {
      maxLatencyMs: input.maxLatencyMs ?? 32,
      maxPendingTextBytes: input.maxPendingTextBytes ?? 32 * 1024,
      deliverFirstAppendImmediately: input.deliverFirstAppendImmediately ?? true,
    },
  });
  return { channel, timer, port };
}

function textItem(content: string, itemRevision: number, sourceGeneration = 1) {
  return {
    ...identity,
    itemId: 'text-1',
    sequence: 1,
    itemRevision,
    kind: 'assistant_text',
    status: 'streaming',
    payload: { content, format: 'markdown', sourceGeneration },
    createdAt: 1,
    updatedAt: itemRevision,
  } satisfies AgentTurnTimelineAssistantTextItem;
}

function progressItem(itemRevision: number, progress: number) {
  return {
    ...identity,
    itemId: 'media-media-1',
    sequence: 2,
    itemRevision,
    kind: 'media',
    status: 'pending',
    parentAnchor: 'turn',
    payload: { workItem: { id: 'media-1', progress } },
    createdAt: 1,
    updatedAt: itemRevision,
  } satisfies AgentTurnTimelineStructuralItem;
}

function toolItem(itemRevision = 1) {
  return {
    ...identity,
    itemId: 'tool-call-1',
    sequence: 2,
    itemRevision,
    kind: 'tool_call',
    status: 'pending',
    payload: { toolCall: { id: 'call-1', name: 'read', arguments: {} } },
    createdAt: 1,
    updatedAt: itemRevision,
  } satisfies AgentTurnTimelineStructuralItem;
}

function message(
  deliveryRevision: number,
  operations: readonly AgentTurnTimelineOperation[],
  completion?: AgentTurnTimelineMessage['completion'],
): AgentTurnTimelineMessage {
  return buildAgentTurnTimelineMessage({
    ...identity,
    batchKind: 'delta',
    deliveryRevision,
    operations,
    ...(completion ? { completion } : {}),
  });
}

function append(content: string, itemRevision: number): AgentTurnTimelineOperation {
  return { operation: 'append', item: textItem(content, itemRevision) };
}

function deliveredText(messages: readonly AgentTurnTimelineMessage[]): string {
  return messages
    .flatMap((entry) => entry.operations)
    .filter((operation) => operation.operation === 'append')
    .map((operation) => operation.item.payload.content)
    .join('');
}

describe('AgentTimelineDeliveryChannel', () => {
  it('delivers the first append immediately and coalesces the remaining burst', async () => {
    const { channel, timer, port } = createChannel();
    await channel.enqueue(message(1, [append('a', 1)]));
    void channel.enqueue(message(2, [append('b', 2)]));
    void channel.enqueue(message(3, [append('c', 3)]));

    expect(port.messages).toHaveLength(1);
    expect(timer.pendingCount()).toBe(1);
    timer.advanceBy(32);
    await channel.flush();

    expect(port.messages).toHaveLength(2);
    expect(port.messages.map((entry) => entry.deliveryRevision)).toEqual([1, 2]);
    expect(deliveredText(port.messages)).toBe('abc');
    expect(port.messages[1]?.operations).toHaveLength(1);
  });

  it('flushes a continuously buffered append burst at maximum latency', async () => {
    const { channel, timer, port } = createChannel({ deliverFirstAppendImmediately: false });
    void channel.enqueue(message(1, [append('a', 1)]));
    timer.advanceBy(16);
    void channel.enqueue(message(2, [append('b', 2)]));
    timer.advanceBy(15);
    expect(port.messages).toHaveLength(0);

    timer.advanceBy(1);
    await channel.flush();
    expect(port.messages).toHaveLength(1);
    expect(deliveredText(port.messages)).toBe('ab');
    expect(channel.metrics().maximumFlushLatencyMs).toBe(32);
  });

  it('flushes early when pending append bytes reach the soft budget', async () => {
    const { channel, port } = createChannel({
      deliverFirstAppendImmediately: false,
      maxPendingTextBytes: 4,
    });
    void channel.enqueue(message(1, [append('ab', 1)]));
    await channel.enqueue(message(2, [append('cd', 2)]));

    expect(port.messages).toHaveLength(1);
    expect(deliveredText(port.messages)).toBe('abcd');
    expect(channel.metrics().pendingBytesHighWaterMark).toBe(4);
  });

  it('keeps only the latest pending progress value for an item', async () => {
    const { channel, timer, port } = createChannel();
    void channel.enqueue(message(1, [{ operation: 'upsert', item: progressItem(1, 10) }]));
    void channel.enqueue(message(2, [{ operation: 'upsert', item: progressItem(2, 90) }]));
    timer.advanceBy(32);
    await channel.flush();

    expect(port.messages).toHaveLength(1);
    expect(port.messages[0]?.operations).toEqual([
      { operation: 'upsert', item: progressItem(2, 90) },
    ]);
  });

  it('delivers buffered text before a tool boundary with strict revisions', async () => {
    const { channel, port } = createChannel({ deliverFirstAppendImmediately: false });
    void channel.enqueue(message(1, [append('text', 1)]));
    await channel.enqueue(message(2, [{ operation: 'upsert', item: toolItem() }]));

    expect(port.messages).toHaveLength(2);
    expect(port.messages[0]?.operations[0]?.operation).toBe('append');
    expect(port.messages[1]?.operations[0]?.operation).toBe('upsert');
    expect(port.messages.map((entry) => entry.deliveryRevision)).toEqual([1, 2]);
  });

  it('flushes append before replacement and snapshots the replacement generation', async () => {
    const { channel, port } = createChannel({ deliverFirstAppendImmediately: false });
    void channel.enqueue(message(1, [append('old', 1)]));
    await channel.enqueue(message(2, [{ operation: 'replace', item: textItem('new', 2, 2) }]));
    const snapshot = await channel.snapshot({
      conversationId: identity.conversationId,
      turnId: identity.turnId,
      messageId: identity.messageId,
      items: [textItem('new', 2, 2)],
    });

    expect(port.messages.map((entry) => entry.operations[0]?.operation)).toEqual([
      'append',
      'replace',
    ]);
    expect(snapshot.available).toBe(true);
    if (!snapshot.available) throw new Error('Expected snapshot.');
    const item = snapshot.message.operations[0];
    expect(item?.operation).toBe('snapshot');
    if (item?.operation !== 'snapshot' || item.item.kind !== 'assistant_text') {
      throw new Error('Expected assistant text snapshot.');
    }
    expect(item.item.payload).toMatchObject({ content: 'new', sourceGeneration: 2 });
  });

  it.each(['completed', 'cancelled', 'failed'] as const)(
    'flushes %s completion as a hard boundary',
    async (status) => {
      const { channel, port } = createChannel({ deliverFirstAppendImmediately: false });
      void channel.enqueue(message(1, [append('partial', 1)]));
      await channel.enqueue(message(2, [], { status, completedAt: 10 }));

      expect(port.messages).toHaveLength(2);
      expect(port.messages[0]?.operations[0]?.operation).toBe('append');
      expect(port.messages[1]?.completion?.status).toBe(status);
    },
  );

  it('serializes postMessage calls even when multiple hard boundaries arrive', async () => {
    let activePosts = 0;
    let maximumActivePosts = 0;
    const releases: Array<() => void> = [];
    const delivered: AgentTurnTimelineMessage[] = [];
    const port: AgentTimelineDeliveryPort = {
      postMessage: async (entry) => {
        delivered.push(entry);
        activePosts += 1;
        maximumActivePosts = Math.max(maximumActivePosts, activePosts);
        await new Promise<void>((resolve) => releases.push(resolve));
        activePosts -= 1;
        return true;
      },
    };
    const { channel } = createChannel({ port });
    const first = channel.enqueue(message(1, [{ operation: 'upsert', item: toolItem(1) }]));
    const second = channel.enqueue(message(2, [{ operation: 'upsert', item: toolItem(2) }]));
    await Promise.resolve();
    expect(delivered).toHaveLength(1);

    releases.shift()?.();
    await first;
    await Promise.resolve();
    expect(delivered).toHaveLength(2);
    releases.shift()?.();
    await second;
    expect(maximumActivePosts).toBe(1);
  });

  it('returns a typed endpoint diagnostic for false or rejected posts and keeps the chain usable', async () => {
    const port = new RecordingPort();
    const { channel } = createChannel({ port });
    port.shouldAccept = false;
    const unavailable = await channel.enqueue(
      message(1, [{ operation: 'upsert', item: toolItem(1) }]),
    );
    port.shouldAccept = true;
    port.rejection = new Error('endpoint replaced');
    const rejected = await channel.enqueue(
      message(2, [{ operation: 'upsert', item: toolItem(2) }]),
    );
    port.rejection = undefined;
    const recovered = await channel.enqueue(
      message(3, [{ operation: 'upsert', item: toolItem(3) }]),
    );

    expect(unavailable.diagnostic).toBe('endpoint-unavailable');
    expect(rejected.diagnostic).toBe('endpoint-unavailable');
    expect(recovered.delivered).toBe(true);
    expect(channel.metrics().failedDeliveries).toBe(2);
  });

  it('rejects a stale endpoint generation before state mutation', () => {
    const { channel } = createChannel();
    const stale = buildAgentTurnTimelineMessage({
      ...identity,
      connectionEpoch: 'epoch-stale',
      batchKind: 'delta',
      deliveryRevision: 1,
      operations: [append('x', 1)],
    });

    expect(() => channel.enqueue(stale)).toThrow(/different identity/);
    expect(channel.metrics().inputBatches).toBe(0);
  });

  it('returns exact authoritative source from an active snapshot', async () => {
    const { channel } = createChannel();
    await channel.enqueue(message(1, [append('a', 1)]));
    void channel.enqueue(message(2, [append('b', 2)]));
    void channel.enqueue(message(3, [append('c', 3)]));
    const snapshot = await channel.snapshot({
      conversationId: identity.conversationId,
      turnId: identity.turnId,
      messageId: identity.messageId,
      items: [textItem('abc', 3)],
    });

    expect(snapshot.available).toBe(true);
    if (!snapshot.available) throw new Error('Expected snapshot.');
    const operation = snapshot.message.operations[0];
    if (operation?.operation !== 'snapshot' || operation.item.kind !== 'assistant_text') {
      throw new Error('Expected assistant text snapshot.');
    }
    expect(operation.item.payload.content).toBe('abc');
    expect(snapshot.message.deliveryRevision).toBe(2);
  });

  it('drains pending work, cancels its timer, and rejects late enqueue on disposal', async () => {
    const { channel, timer, port } = createChannel({ deliverFirstAppendImmediately: false });
    void channel.enqueue(message(1, [append('pending', 1)]));
    expect(timer.pendingCount()).toBe(1);

    const result = await channel.dispose();
    const late = await channel.enqueue(message(2, [append('late', 2)]));

    expect(result.delivered).toBe(true);
    expect(port.messages).toHaveLength(1);
    expect(timer.pendingCount()).toBe(0);
    expect(late.diagnostic).toBe('disposed');
    expect(deliveredText(port.messages)).toBe('pending');
  });
});
