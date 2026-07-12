import { describe, expect, it, vi } from 'vitest';
import { createConversationRuntimeContext } from '../session/conversation-runtime-context';

function createSession() {
  return {
    cancel: vi.fn(),
    dispose: vi.fn(),
  };
}

describe('ConversationRuntimeContext', () => {
  it('moves through explicit restoring, ready, and disposed lifecycle states', () => {
    const session = createSession();
    const context = createConversationRuntimeContext({
      conversationId: 'conversation-a',
      session,
    });

    expect(context.lifecycle).toBe('restoring');
    context.markReady();
    expect(context.lifecycle).toBe('ready');

    context.dispose();

    expect(context.lifecycle).toBe('disposed');
    expect(session.cancel).toHaveBeenCalledOnce();
    expect(session.dispose).toHaveBeenCalledOnce();
  });

  it('fails visibly for missing ownership and invalid lifecycle transitions', () => {
    expect(() =>
      createConversationRuntimeContext({ conversationId: ' ', session: createSession() }),
    ).toThrow(/conversationId is required/);

    const context = createConversationRuntimeContext({
      conversationId: 'conversation-a',
      session: createSession(),
    });
    context.markReady();

    expect(() => context.markReady()).toThrow(/cannot become ready from ready/);
    context.dispose();
    expect(() => context.cancel()).toThrow(/is disposed/);
  });

  it('disposes the owned run registry before releasing the session', () => {
    const order: string[] = [];
    const session = createSession();
    session.cancel.mockImplementation(() => order.push('session'));
    const context = createConversationRuntimeContext({
      conversationId: 'conversation-a',
      session,
    });
    context.markReady();
    context.runs.registerRun({ conversationId: 'conversation-a', runId: 'run-1' }, () =>
      order.push('run'),
    );

    context.dispose();

    expect(order).toEqual(['run', 'session']);
    expect(context.runs.disposed).toBe(true);
  });

  it('still disposes the session when cancellation fails and exposes the failure', () => {
    const session = createSession();
    session.cancel.mockImplementation(() => {
      throw new Error('cancel failed');
    });
    const context = createConversationRuntimeContext({
      conversationId: 'conversation-a',
      session,
    });
    context.markReady();

    expect(() => context.dispose()).toThrow('cancel failed');
    expect(session.dispose).toHaveBeenCalledOnce();
    expect(context.lifecycle).toBe('disposed');
  });

  it('owns and disposes an independent authoritative projection store', () => {
    const contextA = createConversationRuntimeContext({
      conversationId: 'conversation-a',
      session: createSession(),
    });
    const contextB = createConversationRuntimeContext({
      conversationId: 'conversation-b',
      session: createSession(),
    });

    contextA.projection.apply({
      type: 'agentTurnTimelineUpdate',
      conversationId: 'conversation-a',
      turnId: 'turn-a',
      messageId: 'message-a',
      operations: [],
      completion: { status: 'completed', completedAt: 1 },
    });

    expect(contextA.projection.snapshot().projectionVersion).toBe(1);
    expect(contextB.projection.snapshot().projectionVersion).toBe(0);

    contextA.dispose();

    expect(() => contextA.projection.snapshot()).toThrow(/disposed/i);
    expect(contextB.projection.snapshot()).toMatchObject({
      conversationId: 'conversation-b',
      projectionVersion: 0,
    });
    contextB.dispose();
  });
});
