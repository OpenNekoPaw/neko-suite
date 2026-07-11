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

  it('tracks continuation source metadata and prevents prompt editing', () => {
    const queue = createTuiMessageQueue({ conversationId: 'conv-1', now: () => 1000 });

    const item = queue.enqueue({
      content: 'Continue from task result',
      source: 'task-result-continuation',
      metadata: { taskId: 'task-1', observationId: 'obs-1' },
    });

    expect(item).toMatchObject({
      source: 'task-result-continuation',
      displayKind: 'task-continuation',
      metadata: { taskId: 'task-1', observationId: 'obs-1' },
    });
    expect(() => queue.edit(item.id, 'changed')).toThrow('Queued continuation cannot be edited');
  });

  it('dequeues continuations before user messages by default', () => {
    const queue = createTuiMessageQueue({ conversationId: 'conv-1', now: () => 1000 });
    const user = queue.enqueue('later user prompt');
    const continuation = queue.enqueue({
      content: 'Continue from task result',
      source: 'task-result-continuation',
      metadata: { taskId: 'task-1' },
    });

    expect(queue.snapshot().items.map((item) => item.id)).toEqual([user.id, continuation.id]);
    expect(queue.dequeue()?.id).toBe(continuation.id);
    expect(queue.dequeue()?.id).toBe(user.id);
  });

  it('keeps continuation priority ahead of a promoted user message by exact id and source', () => {
    const queue = createTuiMessageQueue({ conversationId: 'conv-1', now: () => 1000 });
    const firstUser = queue.enqueue('first user prompt');
    const continuation = queue.enqueue({
      content: 'Continue from task result',
      source: 'task-result-continuation',
      metadata: { taskId: 'task-1' },
    });
    const promotedUser = queue.enqueue('promoted user prompt');

    queue.promote(promotedUser.id);

    expect(queue.dequeue()).toMatchObject({
      id: continuation.id,
      source: 'task-result-continuation',
    });
    expect(queue.dequeue()).toMatchObject({ id: promotedUser.id, source: 'user' });
    expect(queue.dequeue()).toMatchObject({ id: firstUser.id, source: 'user' });
  });

  it('discards continuations explicitly without treating user messages as continuations', () => {
    const queue = createTuiMessageQueue({ conversationId: 'conv-1', now: () => 1000 });
    const user = queue.enqueue('user prompt');
    const continuation = queue.enqueue({
      content: 'Continue from task result',
      source: 'task-result-continuation',
      metadata: { taskId: 'task-1' },
    });

    expect(() => queue.discardContinuation(user.id)).toThrow(
      'Queued user message cannot be discarded as a continuation',
    );
    expect(queue.discardContinuation(continuation.id, 2000)).toMatchObject({
      id: continuation.id,
      updatedAt: 2000,
      metadata: { taskId: 'task-1', status: 'discarded' },
    });
    expect(queue.snapshot().items.map((item) => item.id)).toEqual([user.id]);
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
      ['Queue: 1 pending (version 1)', '1. queue-1 [user] draft next scene'].join('\n'),
    );
  });
});
