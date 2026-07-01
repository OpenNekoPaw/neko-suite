import { describe, expect, it } from 'vitest';
import {
  TuiMessageQueueError,
  createTuiMessageQueue,
  formatTuiQueueSnapshot,
} from './message-queue';

describe('createTuiMessageQueue', () => {
  it('tracks item ids and monotonic snapshot versions', () => {
    const queue = createTuiMessageQueue({
      conversationId: 'conv-1',
      now: () => 1000,
    });

    const first = queue.enqueue('first');
    const second = queue.enqueue('second');

    expect(first.id).toBe('queue-1');
    expect(second.id).toBe('queue-2');
    expect(queue.snapshot()).toMatchObject({
      conversationId: 'conv-1',
      pendingCount: 2,
      version: 2,
    });
  });

  it('promotes, edits, cancels, and dequeues authoritative items', () => {
    const queue = createTuiMessageQueue({
      conversationId: 'conv-1',
      now: () => 1000,
    });
    const first = queue.enqueue('first');
    const second = queue.enqueue('second');

    expect(queue.promote(second.id).id).toBe(second.id);
    expect(queue.snapshot().items.map((item) => item.id)).toEqual([second.id, first.id]);

    expect(queue.edit(first.id, 'first revised', 2000)).toMatchObject({
      id: first.id,
      content: 'first revised',
      updatedAt: 2000,
    });
    expect(queue.cancel(second.id).id).toBe(second.id);
    expect(queue.dequeue()?.id).toBe(first.id);
    expect(queue.dequeue()).toBeNull();
  });

  it('rejects stale ids and non-queueable input visibly', () => {
    const queue = createTuiMessageQueue({ conversationId: 'conv-1' });

    expect(() => queue.cancel('missing')).toThrow(TuiMessageQueueError);
    expect(() => queue.enqueue('/status')).toThrow('Commands cannot be queued');
    expect(() => queue.enqueue('$review')).toThrow('Skill invocations cannot be queued');
    expect(() => queue.enqueue('   ')).toThrow('Queued message cannot be empty');
  });
});

describe('formatTuiQueueSnapshot', () => {
  it('formats an empty or populated terminal snapshot', () => {
    const queue = createTuiMessageQueue({ conversationId: 'conv-1', now: () => 1000 });

    expect(formatTuiQueueSnapshot(queue.snapshot())).toBe('Queue: empty (version 0)');

    queue.enqueue('draft next scene');

    expect(formatTuiQueueSnapshot(queue.snapshot())).toBe(
      ['Queue: 1 pending (version 1)', '1. queue-1 draft next scene'].join('\n'),
    );
  });
});
