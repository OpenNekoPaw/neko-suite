import { describe, expect, it, vi } from 'vitest';
import type { AutohealHandler, IAutohealChain, ToolResultWithMeta } from '@neko/shared';
import { AGENT_RUNTIME_CHANNELS, createEventBus } from '../../events';
import { createReActLoopRunner } from '../react-loop-runner';

describe('ordinary ReAct loop hooks', () => {
  it('keeps retry state without creating stage or run state', async () => {
    const { hooks, state } = createReActLoopRunner();

    await hooks.onExecuteStart?.('produce', createContext());
    await hooks.afterAct?.(failedResult());

    expect(state.nextObserveHint).toBe('retry');
    expect(state).not.toHaveProperty('lastDecision');
    expect(state).not.toHaveProperty('stage');
    expect(state).not.toHaveProperty('runId');
  });

  it('runs bounded autoheal without IDC identity', async () => {
    const run = vi.fn<AutohealHandler>().mockResolvedValue({
      resolution: 'healed',
      level: 1,
      note: 'retry smaller batch',
    });
    const { hooks, state } = createReActLoopRunner({ autohealChain: { run } });

    await hooks.onExecuteStart?.('produce', createContext());
    await hooks.afterAct?.(failedResult('GenerateVideo'));

    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'GenerateVideo', attempt: 0 }),
      { round: 0 },
    );
    expect(state.lastAutohealOutcome?.resolution).toBe('healed');
  });

  it('emits Tool and step observations without stage/run fields', async () => {
    const bus = createEventBus();
    const committed = vi.fn();
    const completed = vi.fn();
    bus.on(AGENT_RUNTIME_CHANNELS.TOOL_COMMITTED, committed);
    bus.on(AGENT_RUNTIME_CHANNELS.STEP_COMPLETED, completed);
    const { hooks } = createReActLoopRunner({ eventBus: bus, now: () => 42 });

    await hooks.onExecuteStart?.('produce', createContext());
    await hooks.afterAct?.(successfulResult('GenerateImage'));
    await hooks.onIterationComplete?.(1, createContext());

    expect(committed).toHaveBeenCalledWith({
      channel: AGENT_RUNTIME_CHANNELS.TOOL_COMMITTED,
      subject: 'tool:GenerateImage',
      at: 42,
    });
    expect(completed).toHaveBeenCalledWith({
      channel: AGENT_RUNTIME_CHANNELS.STEP_COMPLETED,
      round: 0,
      thinkOnly: false,
      at: 42,
    });
  });

  it('does not report read-only Tools as mutations', async () => {
    const bus = createEventBus();
    const committed = vi.fn();
    bus.on(AGENT_RUNTIME_CHANNELS.TOOL_COMMITTED, committed);
    const { hooks } = createReActLoopRunner({ eventBus: bus });

    await hooks.afterAct?.(successfulResult('ReadDocument'));

    expect(committed).not.toHaveBeenCalled();
  });
});

function createContext() {
  return {
    messages: [],
    state: 'think' as const,
    iteration: 0,
    toolResults: [],
    metadata: {},
  };
}

function failedResult(name = 'tool.x'): ToolResultWithMeta[] {
  return [
    {
      success: false,
      error: 'boom',
      data: null,
      callId: 'call-1',
      name,
    },
  ];
}

function successfulResult(name: string): ToolResultWithMeta[] {
  return [
    {
      success: true,
      data: 'ok',
      callId: 'call-1',
      name,
    },
  ];
}
