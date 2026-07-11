import { describe, expect, it } from 'vitest';
import {
  AgentMessageQueueOperationError,
  createAgentConversationMessageQueue,
} from '@neko/agent/runtime';
import { formatTuiQueueError, formatTuiQueueSnapshot } from './message-queue-format';

describe('TUI message queue formatting', () => {
  it('formats empty and populated runtime snapshots', () => {
    const queue = createAgentConversationMessageQueue({
      conversationId: 'conv-1',
      now: () => 1000,
      createId: () => 'queue-1',
    });

    expect(formatTuiQueueSnapshot(queue.snapshot())).toBe('Queue: empty (version 0)');
    queue.enqueue({ content: 'next request', source: 'user' });
    expect(formatTuiQueueSnapshot(queue.snapshot())).toBe(
      'Queue: 1 pending (version 1)\n1. queue-1 [user] next request',
    );
  });

  it('formats runtime operation diagnostics without a TUI-local error type', () => {
    const error = new AgentMessageQueueOperationError(
      'not-queueable',
      'Queued message content cannot be empty.',
    );

    expect(formatTuiQueueError(error)).toBe(
      'not-queueable: Queued message content cannot be empty.',
    );
  });
});
