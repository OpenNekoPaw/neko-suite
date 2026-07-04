import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  AgentContext,
  AgentResult,
  AutohealHandler,
  IAutohealChain,
  ToolResultWithMeta,
} from '@neko/shared';
import { createAgentTraceContext } from '@neko/shared';
import { createStageTracker } from '../../skill';
import { createReActLoopRunner, type ReActLoopRunContext } from '../react-loop-runner';
import { createEventBus, CREATION_CHANNELS, EXECUTION_CHANNELS } from '../../events';

const runContext: ReActLoopRunContext = {
  runId: 'creation-test',
  creationKind: 'idc.default',
};

function ctx(iteration: number): AgentContext {
  return {
    messages: [],
    state: { status: 'running' },
    iteration,
    toolResults: [],
    metadata: {},
    trace: createAgentTraceContext({ conversationId: 'conv-test', iteration }),
  };
}

describe('ReActLoopRunner hooks', () => {
  let stageTracker: ReturnType<typeof createStageTracker>;

  beforeEach(() => {
    stageTracker = createStageTracker({ now: () => 0 });
  });

  it('beforeThink records a decision on runner state', async () => {
    const { hooks, state } = createReActLoopRunner({
      getRunContext: () => runContext,
      getMode: () => 'auto',
      now: () => 42,
    });

    await hooks.onExecuteStart?.('input', ctx(0));
    await hooks.beforeThink?.(ctx(1));

    expect(state.lastDecision).not.toBeNull();
    expect(state.lastDecision!.round).toBe(0);
    expect(state.lastDecision!.decidedAt).toBe(42);
  });

  it('afterAct with errored results flips the next observe hint to retry', async () => {
    const { hooks, state } = createReActLoopRunner({
      getRunContext: () => runContext,
      getMode: () => 'auto',
    });

    await hooks.onExecuteStart?.('input', ctx(0));
    await hooks.afterAct?.(erroredResult());

    expect(state.nextObserveHint).toBe('retry');
  });

  it('afterAct with successful results keeps hint normal', async () => {
    const { hooks, state } = createReActLoopRunner({
      getRunContext: () => runContext,
      getMode: () => 'auto',
    });

    await hooks.onExecuteStart?.('input', ctx(0));
    await hooks.afterAct?.(successfulResult('do'));

    expect(state.nextObserveHint).toBe('normal');
  });

  it('onIterationComplete bumps the round counter', async () => {
    const { hooks, state } = createReActLoopRunner({
      getRunContext: () => runContext,
      getMode: () => 'auto',
    });

    expect(state.round).toBe(0);
    await hooks.onIterationComplete?.(1, ctx(1));
    expect(state.round).toBe(1);
    await hooks.onIterationComplete?.(2, ctx(2));
    expect(state.round).toBe(2);
  });

  it('onExecuteEnd without a bus does not throw', async () => {
    const { hooks } = createReActLoopRunner({
      getRunContext: () => runContext,
      getMode: () => 'auto',
    });
    await expect(hooks.onExecuteEnd?.(agentResult({ success: true }))).resolves.not.toThrow();
  });

  it('multi-iteration sequence keeps round counter and decision.round aligned', async () => {
    const { hooks, state } = createReActLoopRunner({
      getRunContext: () => runContext,
      getMode: () => 'auto',
    });
    await hooks.onExecuteStart?.('input', ctx(0));

    for (let i = 0; i < 3; i++) {
      await hooks.beforeThink?.(ctx(i + 1));
      expect(state.lastDecision!.round).toBe(i);
      await hooks.afterAct?.([]);
      await hooks.onIterationComplete?.(i + 1, ctx(i + 1));
    }
    expect(state.round).toBe(3);
  });

  it('terminal stage of each decision is entered into the StageTracker', async () => {
    const { hooks } = createReActLoopRunner({
      stageTracker,
      getRunContext: () => runContext,
      getMode: () => 'auto',
    });

    await hooks.onExecuteStart?.('input', ctx(0));
    await hooks.beforeThink?.(ctx(1));

    expect(stageTracker.current).not.toBeNull();
  });

  describe('EventBus integration', () => {
    it('emits creation.run.started on onExecuteStart when a bus is supplied', async () => {
      const bus = createEventBus();
      const onStart = vi.fn();
      bus.on(CREATION_CHANNELS.RUN_STARTED, onStart);

      const { hooks } = createReActLoopRunner({
        getRunContext: () => runContext,
        getMode: () => 'auto',
        eventBus: bus,
        now: () => 555,
      });
      await hooks.onExecuteStart?.('input', ctx(0));

      expect(onStart).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: CREATION_CHANNELS.RUN_STARTED,
          runId: runContext.runId,
          creationKind: runContext.creationKind,
          at: 555,
        }),
      );
    });

    it('emits execution.round.activation.decided per round when a bus is supplied', async () => {
      const bus = createEventBus();
      const onRound = vi.fn();
      bus.on(EXECUTION_CHANNELS.ROUND_ACTIVATION_DECIDED, onRound);

      const { hooks } = createReActLoopRunner({
        getRunContext: () => runContext,
        getMode: () => 'auto',
        eventBus: bus,
        now: () => 777,
      });
      await hooks.onExecuteStart?.('input', ctx(0));
      await hooks.beforeThink?.(ctx(1));

      expect(onRound).toHaveBeenCalledTimes(1);
      expect(onRound.mock.calls[0]![0]).toEqual(
        expect.objectContaining({
          channel: EXECUTION_CHANNELS.ROUND_ACTIVATION_DECIDED,
          runId: runContext.runId,
          summary: expect.objectContaining({ round: 0 }),
        }),
      );
    });

    it('emits creation.run.ended on onExecuteEnd', async () => {
      const bus = createEventBus();
      const onEnd = vi.fn();
      bus.on(CREATION_CHANNELS.RUN_ENDED, onEnd);

      const { hooks } = createReActLoopRunner({
        getRunContext: () => runContext,
        getMode: () => 'auto',
        eventBus: bus,
      });
      await hooks.onExecuteEnd?.(
        agentResult({ success: false, response: 'bad', error: new Error('x') }),
      );

      expect(onEnd).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: CREATION_CHANNELS.RUN_ENDED,
          runId: runContext.runId,
          status: 'failed',
        }),
      );
    });

    it('no bus means no emission and no errors', async () => {
      const { hooks } = createReActLoopRunner({
        getRunContext: () => runContext,
        getMode: () => 'auto',
      });

      await hooks.onExecuteStart?.('input', ctx(0));
      await expect(hooks.beforeThink?.(ctx(1))).resolves.not.toThrow();
    });
  });

  describe('Autoheal chain integration', () => {
    it('routes errors through the chain; healed outcome produces retry hint', async () => {
      const heal: AutohealHandler = async () => ({
        resolution: 'healed',
        level: 1,
        note: 'retry #1',
      });
      const chain = createFakeAutohealChain(heal);
      const { hooks, state } = createReActLoopRunner({
        getRunContext: () => runContext,
        getMode: () => 'auto',
        autohealChain: chain,
      });

      await hooks.onExecuteStart?.('input', ctx(0));
      await hooks.afterAct?.(erroredResult());

      expect(state.lastAutohealOutcome?.resolution).toBe('healed');
      expect(state.nextObserveHint).toBe('retry');
    });

    it('aborted outcome produces user-cancel hint', async () => {
      const chain = createFakeAutohealChain(async () => ({
        resolution: 'aborted',
        level: 5,
        reason: 'user-decline',
      }));
      const { hooks, state } = createReActLoopRunner({
        getRunContext: () => runContext,
        getMode: () => 'auto',
        autohealChain: chain,
      });

      await hooks.onExecuteStart?.('input', ctx(0));
      await hooks.afterAct?.(erroredResult());

      expect(state.lastAutohealOutcome?.resolution).toBe('aborted');
      expect(state.nextObserveHint).toBe('user-cancel');
    });

    it('successful results after an errored round clear the autoheal outcome', async () => {
      const chain = createFakeAutohealChain(async () => ({
        resolution: 'aborted',
        level: 5,
        reason: 'retry-exhausted',
      }));
      const { hooks, state } = createReActLoopRunner({
        getRunContext: () => runContext,
        getMode: () => 'auto',
        autohealChain: chain,
      });
      await hooks.onExecuteStart?.('input', ctx(0));
      await hooks.afterAct?.(erroredResult());
      expect(state.lastAutohealOutcome).not.toBeNull();

      await hooks.afterAct?.(successfulResult('tool.x'));
      expect(state.lastAutohealOutcome).toBeNull();
      expect(state.nextObserveHint).toBe('normal');
    });

    it('chain throw gracefully falls back to retry hint', async () => {
      const chain = createFakeAutohealChain(async () => ({
        resolution: 'pass',
        level: 1,
      }));
      (chain as unknown as { run: () => Promise<never> }).run = async () => {
        throw new Error('chain explosion');
      };
      const { hooks, state } = createReActLoopRunner({
        getRunContext: () => runContext,
        getMode: () => 'auto',
        autohealChain: chain,
      });

      await hooks.onExecuteStart?.('input', ctx(0));
      await expect(hooks.afterAct?.(erroredResult())).resolves.not.toThrow();
      expect(state.nextObserveHint).toBe('retry');
    });
  });

  describe('execution.apply.committed emission', () => {
    it('emits one event per successful write tool result in the batch', async () => {
      const bus = createEventBus();
      const { hooks } = createReActLoopRunner({
        getRunContext: () => runContext,
        getMode: () => 'auto',
        eventBus: bus,
      });
      await hooks.onExecuteStart?.('input', ctx(0));

      const events: Array<{ kind: string; runId: string }> = [];
      bus.on(EXECUTION_CHANNELS.APPLY_COMMITTED, (e) => {
        events.push({ kind: e.kind, runId: e.runId });
      });

      await hooks.afterAct?.([
        { success: true, data: 'a', callId: 'c1', name: 'GenerateImage' },
        { success: true, data: 'b', callId: 'c2', name: 'AddTimelineElement' },
      ] as unknown as ToolResultWithMeta[]);

      expect(events).toEqual([
        { kind: 'tool:GenerateImage', runId: runContext.runId },
        { kind: 'tool:AddTimelineElement', runId: runContext.runId },
      ]);
    });

    it('skips failed tools and read-only tools', async () => {
      const bus = createEventBus();
      const { hooks } = createReActLoopRunner({
        getRunContext: () => runContext,
        getMode: () => 'auto',
        eventBus: bus,
      });
      await hooks.onExecuteStart?.('input', ctx(0));

      const events: string[] = [];
      bus.on(EXECUTION_CHANNELS.APPLY_COMMITTED, (e) => events.push(e.kind));

      await hooks.afterAct?.([
        { success: true, data: {}, callId: 'c1', name: 'ReadDocument' },
        { success: false, error: 'oom', data: null, callId: 'c2', name: 'GenerateVideo' },
        { success: true, data: {}, callId: 'c3', name: 'GenerateImage' },
      ] as unknown as ToolResultWithMeta[]);

      expect(events).toEqual(['tool:GenerateImage']);
    });
  });

  describe('execution.step.completed emission', () => {
    it('emits one event per onIterationComplete with current round and thinkOnly flag', async () => {
      const bus = createEventBus();
      const { hooks } = createReActLoopRunner({
        getRunContext: () => runContext,
        getMode: () => 'auto',
        eventBus: bus,
      });
      await hooks.onExecuteStart?.('input', ctx(0));

      const events: Array<{ round: number; thinkOnly: boolean }> = [];
      bus.on(EXECUTION_CHANNELS.STEP_COMPLETED, (e) => {
        events.push({ round: e.round, thinkOnly: e.thinkOnly });
      });

      await hooks.afterAct?.(successfulResult('GenerateImage'));
      await hooks.onIterationComplete?.(0, ctx(1));
      await hooks.afterAct?.([]);
      await hooks.onIterationComplete?.(1, ctx(2));

      expect(events).toEqual([
        { round: 0, thinkOnly: false },
        { round: 1, thinkOnly: true },
      ]);
    });
  });
});

function erroredResult(subject = 'tool.x'): ToolResultWithMeta[] {
  return [
    {
      success: false,
      error: 'boom',
      data: null,
      callId: 'c1',
      name: subject,
      code: 'TIMEOUT',
    },
  ] as unknown as ToolResultWithMeta[];
}

function successfulResult(subject: string): ToolResultWithMeta[] {
  return [
    { success: true, data: 'ok', callId: 'c1', name: subject },
  ] as unknown as ToolResultWithMeta[];
}

function createFakeAutohealChain(handler: AutohealHandler): IAutohealChain {
  return {
    run: handler,
  };
}

function agentResult(input: { success: boolean; response?: string; error?: Error }): AgentResult {
  return {
    success: input.success,
    response: input.response ?? 'ok',
    steps: [],
    iterations: 1,
    ...(input.error ? { error: input.error } : {}),
    timing: { startTime: 0, endTime: 1, duration: 1 },
  };
}
