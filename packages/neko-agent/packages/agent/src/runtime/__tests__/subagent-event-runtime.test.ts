import { describe, expect, it } from 'vitest';
import { createSubAgentEventRuntime } from '../subagent-event-runtime';

describe('subagent-event-runtime', () => {
  it('projects events for the target conversation', () => {
    const runtime = createSubAgentEventRuntime();

    const message = runtime.projectForConversation({
      conversationId: 'conv-1',
      event: {
        type: 'progress',
        subAgentId: 'sub-1',
        parentAgentId: 'agent-1',
        conversationId: 'conv-1',
        data: {
          status: 'running',
          progress: 'reading files',
        },
        timestamp: 100,
      },
    });

    expect(message).toEqual({
      type: 'subagentEvent',
      conversationId: 'conv-1',
      event: expect.objectContaining({
        subAgentId: 'sub-1',
        conversationId: 'conv-1',
      }),
      workItem: expect.objectContaining({
        id: 'sub-1',
        conversationId: 'conv-1',
        kind: 'subagent',
        status: 'processing',
      }),
    });
  });

  it('drops events from other conversations', () => {
    const runtime = createSubAgentEventRuntime();

    const message = runtime.projectForConversation({
      conversationId: 'conv-1',
      event: {
        type: 'started',
        subAgentId: 'sub-2',
        parentAgentId: 'agent-2',
        conversationId: 'conv-2',
        timestamp: 200,
      },
    });

    expect(message).toBeNull();
  });
});
