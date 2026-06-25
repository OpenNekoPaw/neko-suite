import { describe, expect, it, vi } from 'vitest';
import { createAgentRunnerEventEmitter, type AgentRunnerPort } from '../agent-runner-port';

describe('AgentRunnerPort', () => {
  it('provides a host-agnostic event source with disposable subscriptions', () => {
    const emitter = createAgentRunnerEventEmitter<{ readonly type: 'start' | 'stop' }>();
    const listener = vi.fn();
    const disposable = emitter.event(listener);

    emitter.fire({ type: 'start' });
    disposable.dispose();
    emitter.fire({ type: 'stop' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ type: 'start' });
  });

  it('fires against a listener snapshot', () => {
    const emitter = createAgentRunnerEventEmitter<{ readonly type: 'start' | 'stop' }>();
    const lateListener = vi.fn();
    const firstListener = vi.fn(() => {
      emitter.event(lateListener);
    });

    emitter.event(firstListener);
    emitter.fire({ type: 'start' });
    emitter.fire({ type: 'stop' });

    expect(firstListener).toHaveBeenCalledTimes(2);
    expect(lateListener).toHaveBeenCalledTimes(1);
    expect(lateListener).toHaveBeenCalledWith({ type: 'stop' });
  });

  it('can describe a runner contract without VSCode event or disposable types', () => {
    const runner = {
      configure: vi.fn(async () => undefined),
      getConfig: vi.fn(() => ({ provider: 'mock' })),
      execute: vi.fn(() => emptyEvents()),
      cancel: vi.fn(),
      isRunning: vi.fn(() => false),
      appendMessage: vi.fn(() => false),
      drainPendingMessages: vi.fn(() => []),
      getPendingMessagesCount: vi.fn(() => 0),
      clearPendingMessages: vi.fn(),
      getContextTokenCount: vi.fn(() => 0),
      compressContext: vi.fn(async () => ({
        originalTokens: 0,
        compressedTokens: 0,
        ratio: 1,
      })),
      confirmTool: vi.fn(),
      getPendingConfirmations: vi.fn(() => []),
      getHistory: vi.fn(() => []),
      clearHistory: vi.fn(),
      addMessage: vi.fn(),
      loadHistory: vi.fn(),
      getToolSkills: vi.fn(() => []),
      setSkillProvider: vi.fn(),
      refreshCapabilityRuntime: vi.fn(),
      applySkillInjection: vi.fn(),
      getActiveSkill: vi.fn(() => undefined),
      clearActiveSkill: vi.fn(),
      isToolAllowed: vi.fn(() => true),
      onDidStart: vi.fn(() => ({ dispose: vi.fn() })),
      onDidStop: vi.fn(() => ({ dispose: vi.fn() })),
      onDidRequestConfirmation: vi.fn(() => ({ dispose: vi.fn() })),
      onDidSubAgentEvent: vi.fn(() => ({ dispose: vi.fn() })),
      onDidRunnerEvent: vi.fn(() => ({ dispose: vi.fn() })),
      dispose: vi.fn(),
    } satisfies AgentRunnerPort<{ readonly provider: string }, Record<string, never>>;

    expect(runner.isRunning()).toBe(false);
    expect(runner.getConfig()).toEqual({ provider: 'mock' });
  });
});

async function* emptyEvents() {}
