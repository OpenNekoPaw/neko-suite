import { describe, expect, it, vi } from 'vitest';
import {
  createAgentCapabilityActivationIntent,
  createAgentCapabilityActivationProgressEvent,
} from '@neko/shared';
import {
  AGENT_SESSION_BUSY_MESSAGE,
  AGENT_SESSION_CONFIG_LOCKED_MESSAGE,
  AgentSessionRunner,
  DEFAULT_AGENT_SESSION_CONFIRMATION_TIMEOUT_MS,
  createAgentSessionRunner,
} from '../runner/agent-session-runner';
import type { AgentEvent, IAgentSession } from '../../session/types';

function createSession(events: AgentEvent[] = [{ type: 'text', content: 'response' }]) {
  const history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];
  return {
    configure: vi.fn(),
    getExecutionMode: vi.fn(),
    setExecutionMode: vi.fn(),
    setExecutionModeWithIntent: vi.fn(),
    setSkillProvider: vi.fn(),
    setPromptFragments: vi.fn(),
    getArtifactsForRun: vi.fn(() => []),
    listArtifactRunIds: vi.fn(() => []),
    getValidationCycles: vi.fn(() => []),
    getOperationToolAdapterRegistry: vi.fn(() => null),
    writeDraftArtifact: vi.fn(),
    writePlanArtifact: vi.fn(),
    writeTaskArtifact: vi.fn(),
    execute: vi.fn().mockImplementation(async function* (_input, context) {
      yield* events;
      if (context?.metadata?.echo) {
        yield { type: 'text', content: String(context.metadata.echo) };
      }
    }),
    cancel: vi.fn(),
    isRunning: vi.fn(() => false),
    confirmTool: vi.fn(),
    getPendingConfirmations: vi.fn(() => []),
    getHistory: vi.fn(() => [...history]),
    addMessage: vi.fn((message) => history.push(message)),
    applySkillLifecycleProjection: vi.fn(),
    applySkillInjection: vi.fn(),
    activateToolSetsForTools: vi.fn(() => []),
    deactivateToolSet: vi.fn(),
    removeSkillInjection: vi.fn(),
    getActiveSkill: vi.fn(),
    clearActiveSkill: vi.fn(),
    isToolAllowed: vi.fn(() => true),
    clearHistory: vi.fn(() => {
      history.length = 0;
    }),
    loadHistory: vi.fn(),
    getTokenCount: vi.fn(() => 123),
    compressContext: vi.fn(async () => ({
      originalTokens: 123,
      compressedTokens: 45,
      ratio: 45 / 123,
    })),
    dispose: vi.fn(),
  } as unknown as IAgentSession;
}

async function collect(iterable: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

function iterator(iterable: AsyncIterable<AgentEvent>) {
  return iterable[Symbol.asyncIterator]();
}

describe('AgentSessionRunner', () => {
  it('returns an error event when no session is configured', async () => {
    const runner = new AgentSessionRunner({
      buildExecutionContext: () => ({}),
    });

    await expect(collect(runner.execute('hello', {}))).resolves.toEqual([
      expect.objectContaining({ type: 'error' }),
    ]);
  });

  it('executes session events with host-built execution context', async () => {
    const onDidStart = vi.fn();
    const onDidStop = vi.fn();
    const session = createSession();
    const runner = new AgentSessionRunner<{ traceId: string }>({
      buildExecutionContext: (context) => ({ metadata: { echo: context.traceId } }),
      onDidStart,
      onDidStop,
    });
    runner.setSession(session);

    const events = await collect(runner.execute('hello', { traceId: 'trace-1' }));

    expect(events).toEqual([
      { type: 'text', content: 'response' },
      { type: 'text', content: 'trace-1' },
      expect.objectContaining({ type: 'done' }),
    ]);
    expect(onDidStart).toHaveBeenCalledTimes(1);
    expect(onDidStop).toHaveBeenCalledTimes(1);
  });

  it('forwards session activation progress through the runner callback', () => {
    const onDidActivationProgress = vi.fn();
    const runner = new AgentSessionRunner({
      buildExecutionContext: () => ({}),
      onDidActivationProgress,
    });
    const intent = createAgentCapabilityActivationIntent({
      conversationId: 'conv-1',
      source: 'agent-tool',
      target: 'creation-profile',
      action: 'activate',
      name: 'creation-profile',
      requestedBy: 'agent',
      createdAt: 100,
    });
    const event = createAgentCapabilityActivationProgressEvent({
      intent,
      step: 'requested',
      status: 'succeeded',
      at: 101,
    });

    runner.buildActivationProgressCallback()('conv-1', [event]);

    expect(onDidActivationProgress).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      events: [event],
    });
  });

  it('rejects a second direct execute while execution is running', async () => {
    const session = createSession();
    const runner = new AgentSessionRunner({
      buildExecutionContext: () => ({}),
    });
    runner.setSession(session);

    const first = runner.execute('first', {});
    await iterator(first).next();

    const queued = await collect(runner.execute('second', {}));

    expect(queued).toEqual([
      expect.objectContaining({
        type: 'error',
        error: expect.objectContaining({ message: AGENT_SESSION_BUSY_MESSAGE }),
      }),
    ]);
    expect(runner.getPendingMessagesCount()).toBe(0);

    await collect(first);
  });

  it('queues pending message items while execution is running', async () => {
    const session = createSession();
    const runner = new AgentSessionRunner({
      buildExecutionContext: () => ({}),
    });
    runner.setSession(session);

    const first = runner.execute('first', {});
    await iterator(first).next();

    const second = runner.enqueuePendingMessage({
      conversationId: 'conv-1',
      content: 'second',
      now: 1000,
    });
    const third = runner.enqueuePendingMessage({
      conversationId: 'conv-1',
      content: 'third',
      now: 1001,
    });
    expect(second).toEqual(
      expect.objectContaining({
        conversationId: 'conv-1',
        content: 'second',
        createdAt: 1000,
        source: 'composer',
      }),
    );
    expect(third).toEqual(
      expect.objectContaining({
        conversationId: 'conv-1',
        content: 'third',
        createdAt: 1001,
        source: 'composer',
      }),
    );
    expect(runner.getPendingMessagesCount()).toBe(2);
    expect(runner.dequeuePendingMessage()).toEqual(expect.objectContaining({ content: 'second' }));
    expect(runner.getPendingMessagesCount()).toBe(1);
    expect(runner.drainPendingMessageQueue()).toEqual([
      expect.objectContaining({ content: 'third' }),
    ]);
    expect(runner.getPendingMessagesCount()).toBe(0);

    await collect(first);
  });

  it('keeps task-result observation pending messages distinguishable from composer input', async () => {
    const session = createSession();
    const runner = new AgentSessionRunner({
      buildExecutionContext: () => ({}),
    });
    runner.setSession(session);

    const first = runner.execute('first', {});
    await iterator(first).next();

    const queued = runner.enqueuePendingMessage({
      conversationId: 'conv-1',
      content: 'continue from task',
      source: 'task-result-continuation',
      now: 1000,
    });

    expect(queued).toEqual(
      expect.objectContaining({
        conversationId: 'conv-1',
        content: 'continue from task',
        source: 'task-result-continuation',
      }),
    );

    await collect(first);
  });

  it('does not queue pending messages when idle', () => {
    const session = createSession();
    const runner = new AgentSessionRunner({
      buildExecutionContext: () => ({}),
    });
    runner.setSession(session);

    expect(
      runner.enqueuePendingMessage({
        conversationId: 'conv-1',
        content: 'idle',
      }),
    ).toBeNull();
    expect(runner.getPendingMessagesCount()).toBe(0);
  });

  it('edits, promotes, removes, and rejects stale pending message items', async () => {
    const session = createSession();
    const runner = new AgentSessionRunner({
      buildExecutionContext: () => ({}),
    });
    runner.setSession(session);

    const first = runner.execute('first', {});
    await iterator(first).next();

    const second = runner.enqueuePendingMessage({
      conversationId: 'conv-1',
      content: 'second',
      now: 1000,
    });
    const third = runner.enqueuePendingMessage({
      conversationId: 'conv-1',
      content: 'third',
      now: 1001,
    });
    expect(second).toBeTruthy();
    expect(third).toBeTruthy();

    const updated = runner.updatePendingMessage(second!.id, 'second revised', 1002);
    expect(updated).toEqual(
      expect.objectContaining({ content: 'second revised', updatedAt: 1002 }),
    );

    const promoted = runner.promotePendingMessage(third!.id);
    expect(promoted.id).toBe(third!.id);
    expect(runner.getPendingMessageQueue().map((item) => item.id)).toEqual([third!.id, second!.id]);

    const removed = runner.removePendingMessage(third!.id);
    expect(removed.id).toBe(third!.id);
    expect(runner.getPendingMessageQueue().map((item) => item.id)).toEqual([second!.id]);

    expect(() => runner.removePendingMessage(third!.id)).toThrow(
      'Queued message is no longer pending',
    );
    expect(() => runner.updatePendingMessage(second!.id, '   ')).toThrow(
      'Queued message content cannot be empty',
    );

    await collect(first);
  });

  it('rejects configuration changes while execution is running', async () => {
    const session = createSession();
    const runner = new AgentSessionRunner({
      buildExecutionContext: () => ({}),
    });
    runner.setSession(session);

    const first = runner.execute('first', {});
    await iterator(first).next();

    expect(() => runner.configureSession({ systemPrompt: 'changed' })).toThrow(
      AGENT_SESSION_CONFIG_LOCKED_MESSAGE,
    );

    await collect(first);
  });

  it('resolves a pending tool confirmation when the host confirms it', async () => {
    const onDidRequestConfirmation = vi.fn();
    const timer = { set: vi.fn(() => 'timer-1'), clear: vi.fn() };
    const runner = new AgentSessionRunner({
      buildExecutionContext: () => ({}),
      onDidRequestConfirmation,
      confirmationTimeoutMs: 1000,
      timer,
    });

    const approval = runner.handleToolConfirmation({
      toolCall: { id: 'call-1', name: 'write_file', arguments: {}, index: 0 },
      action: 'write',
      description: 'Write file',
      details: { path: 'README.md' },
      confirmationToken: 'token-1',
    });
    runner.confirmTool('call-1', true);

    await expect(approval).resolves.toBe(true);
    expect(onDidRequestConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ toolCallId: 'call-1', toolName: 'write_file' }),
    );
    expect(timer.clear).toHaveBeenCalledWith('timer-1');
  });

  it('auto-rejects a pending tool confirmation on timeout', async () => {
    let timeout: (() => void) | undefined;
    const onConfirmationTimeout = vi.fn();
    const runner = new AgentSessionRunner({
      buildExecutionContext: () => ({}),
      onConfirmationTimeout,
      confirmationTimeoutMs: 1000,
      timer: {
        set: vi.fn((callback) => {
          timeout = callback;
          return 'timer-1';
        }),
        clear: vi.fn(),
      },
    });

    const approval = runner.handleToolConfirmation({
      toolCall: { id: 'call-1', name: 'write_file', arguments: {}, index: 0 },
      action: 'write',
      description: 'Write file',
      details: {},
      confirmationToken: 'token-1',
    });
    timeout?.();

    await expect(approval).resolves.toBe(false);
    expect(onConfirmationTimeout).toHaveBeenCalledWith(
      expect.objectContaining({ toolCallId: 'call-1' }),
    );
  });

  it('applies the runtime default confirmation timeout through the factory', async () => {
    let timeout: (() => void) | undefined;
    const timer = {
      set: vi.fn((callback) => {
        timeout = callback;
        return 'timer-1';
      }),
      clear: vi.fn(),
    };
    const runner = createAgentSessionRunner({
      buildExecutionContext: () => ({}),
      timer,
    });

    const approval = runner.handleToolConfirmation({
      toolCall: { id: 'call-1', name: 'write_file', arguments: {}, index: 0 },
      action: 'write',
      description: 'Write file',
      details: {},
      confirmationToken: 'token-1',
    });
    timeout?.();

    await expect(approval).resolves.toBe(false);
    expect(timer.set).toHaveBeenCalledWith(
      expect.any(Function),
      DEFAULT_AGENT_SESSION_CONFIRMATION_TIMEOUT_MS,
    );
  });
});
