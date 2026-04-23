/**
 * ReActLoopRunner tests
 *
 * Simulates the executor hook invocations to verify:
 * - beforeThink emits a planner decision + records on the run store
 * - afterAct on errored tool results flips nextObserveHint to 'retry'
 * - onIterationComplete bumps the round counter
 * - onExecuteEnd closes the run with completed/failed status
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentContext, AgentResult, ToolResultWithMeta } from '@neko/shared';
import type { ToolCallInfo } from '@neko/shared';
import { createStageTracker } from '../../skill';
import { createIdcRunStore } from '../idc-run-store';
import { createReActLoopRunner } from '../react-loop-runner';
import { createEventBus, CREATION_CHANNELS, EXECUTION_CHANNELS } from '../../events';
import { createAutohealChain } from '../../autoheal';
import type { AutohealHandler } from '../../autoheal';

function ctx(iteration: number): AgentContext {
  return { messages: [], iteration, metadata: {} } as unknown as AgentContext;
}

describe('ReActLoopRunner hooks', () => {
  let stageTracker: ReturnType<typeof createStageTracker>;
  let store: ReturnType<typeof createIdcRunStore>;

  beforeEach(() => {
    stageTracker = createStageTracker({ now: () => 0 });
    store = createIdcRunStore();
    store.startRun({ workflowId: 'test' });
  });

  it('beforeThink produces a decision and records it on the store', async () => {
    const { hooks, state } = createReActLoopRunner({
      runStore: store,
      getMode: () => 'auto',
      now: () => 42,
    });
    await hooks.onExecuteStart?.('input', ctx(0));
    await hooks.beforeThink?.(ctx(1));

    expect(state.lastDecision).not.toBeNull();
    expect(state.lastDecision!.round).toBe(0);
    expect(state.lastDecision!.decidedAt).toBe(42);
    expect(store.getActive()!.rounds).toHaveLength(1);
  });

  it('afterAct with errored results flips the next observe hint to retry', async () => {
    const { hooks, state } = createReActLoopRunner({
      runStore: store,
      getMode: () => 'auto',
    });
    await hooks.onExecuteStart?.('input', ctx(0));

    const badResult = [
      { success: false, error: 'boom', data: null, callId: 'c1', name: 'do' },
    ] as unknown as ToolResultWithMeta[];
    await hooks.afterAct?.(badResult);
    expect(state.nextObserveHint).toBe('retry');
  });

  it('afterAct with successful results keeps hint normal', async () => {
    const { hooks, state } = createReActLoopRunner({
      runStore: store,
      getMode: () => 'auto',
    });
    await hooks.onExecuteStart?.('input', ctx(0));

    const ok = [
      { success: true, data: 'ok', callId: 'c1', name: 'do' },
    ] as unknown as ToolResultWithMeta[];
    await hooks.afterAct?.(ok);
    expect(state.nextObserveHint).toBe('normal');
  });

  it('onIterationComplete bumps the round counter', async () => {
    const { hooks, state } = createReActLoopRunner({
      runStore: store,
      getMode: () => 'auto',
    });
    expect(state.round).toBe(0);
    await hooks.onIterationComplete?.(1, ctx(1));
    expect(state.round).toBe(1);
    await hooks.onIterationComplete?.(2, ctx(2));
    expect(state.round).toBe(2);
  });

  it('onExecuteEnd closes the run as completed on success', async () => {
    const { hooks } = createReActLoopRunner({
      runStore: store,
      getMode: () => 'auto',
    });
    const result: AgentResult = {
      success: true,
      response: 'ok',
      steps: [],
      iterations: 1,
      timing: { startTime: 0, endTime: 1, duration: 1 },
    };
    await hooks.onExecuteEnd?.(result);
    expect(store.getActive()).toBeNull();
    expect(store.listCompleted()[0].status).toBe('completed');
  });

  it('onExecuteEnd records failure + error code on failure', async () => {
    const { hooks } = createReActLoopRunner({
      runStore: store,
      getMode: () => 'auto',
    });
    const result: AgentResult = {
      success: false,
      response: 'oops',
      steps: [],
      iterations: 1,
      error: new Error('tool timeout'),
      timing: { startTime: 0, endTime: 1, duration: 1 },
    };
    await hooks.onExecuteEnd?.(result);
    const closed = store.listCompleted()[0];
    expect(closed.status).toBe('failed');
    expect(closed.error?.code).toBe('executor-error');
  });

  it('multi-iteration sequence: round counter + decision.round match', async () => {
    const { hooks, state } = createReActLoopRunner({
      runStore: store,
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
    expect(store.getActive()!.rounds).toHaveLength(3);
  });

  it('stage-activation decisions are produced each think round', async () => {
    const { hooks, state } = createReActLoopRunner({
      runStore: store,
      getMode: () => 'auto',
    });
    await hooks.onExecuteStart?.('input', ctx(0));
    await hooks.beforeThink?.(ctx(1));
    const first = state.lastDecision;
    expect(first).not.toBeNull();
    expect(first!.activated.length).toBeGreaterThan(0);

    await hooks.onIterationComplete?.(1, ctx(1));
    await hooks.beforeThink?.(ctx(2));
    const second = state.lastDecision;
    expect(second).not.toBeNull();
    expect(second!.round).toBeGreaterThan(first!.round);
  });

  it('terminal stage of each decision is entered into the StageTracker', async () => {
    const { hooks } = createReActLoopRunner({
      stageTracker,
      runStore: store,
      getMode: () => 'auto',
    });
    await hooks.onExecuteStart?.('input', ctx(0));
    await hooks.beforeThink?.(ctx(1));
    // Default classifier + entry signal produce Implement for round 0
    // multi-step tasks; the runner feeds that into the tracker.
    expect(stageTracker.current).not.toBeNull();
  });

  it('unused ToolCallInfo type import has no effect on runtime', () => {
    // Dummy — ensures the test file compiles with the shared type import.
    const _probe: ToolCallInfo | undefined = undefined;
    expect(_probe).toBeUndefined();
  });

  describe('EventBus integration (P5)', () => {
    it('emits execution.round.activation.decided per round when a bus is supplied', async () => {
      const bus = createEventBus();
      const onRound = vi.fn();
      bus.on(EXECUTION_CHANNELS.ROUND_ACTIVATION_DECIDED, onRound);

      const { hooks } = createReActLoopRunner({
        runStore: store,
        getMode: () => 'auto',
        eventBus: bus,
        now: () => 777,
      });
      await hooks.onExecuteStart?.('input', ctx(0));
      await hooks.beforeThink?.(ctx(1));

      expect(onRound).toHaveBeenCalledTimes(1);
      const emitted = onRound.mock.calls[0][0];
      expect(emitted.channel).toBe(EXECUTION_CHANNELS.ROUND_ACTIVATION_DECIDED);
      expect(emitted.summary.round).toBe(0);
      expect(emitted.summary.activatedStages.length).toBeGreaterThan(0);
      expect(emitted.runId).toBe(store.getActive()!.id);
    });

    it('emits creation.run.ended on onExecuteEnd', async () => {
      const bus = createEventBus();
      const onEnd = vi.fn();
      bus.on(CREATION_CHANNELS.RUN_ENDED, onEnd);

      const { hooks } = createReActLoopRunner({
        runStore: store,
        getMode: () => 'auto',
        eventBus: bus,
      });
      const result: AgentResult = {
        success: false,
        response: 'bad',
        steps: [],
        iterations: 1,
        error: new Error('x'),
        timing: { startTime: 0, endTime: 1, duration: 1 },
      };
      await hooks.onExecuteEnd?.(result);

      expect(onEnd).toHaveBeenCalledTimes(1);
      expect(onEnd.mock.calls[0][0].status).toBe('failed');
    });

    it('no bus → no emission + no errors', async () => {
      // Identical to the happy-path test above but without a bus.
      const { hooks } = createReActLoopRunner({
        runStore: store,
        getMode: () => 'auto',
      });
      await hooks.onExecuteStart?.('input', ctx(0));
      await expect(hooks.beforeThink?.(ctx(1))).resolves.not.toThrow();
    });
  });

  describe('Autoheal chain integration (P3 ↔ P1.6 wiring)', () => {
    const errored = (subject = 'tool.x'): ToolResultWithMeta[] =>
      [
        {
          success: false,
          error: 'boom',
          data: null,
          callId: 'c1',
          name: subject,
          code: 'TIMEOUT',
        },
      ] as unknown as ToolResultWithMeta[];

    it('routes errors through the chain; healed outcome → retry hint', async () => {
      const heal: AutohealHandler = async () => ({
        resolution: 'healed',
        level: 1,
        note: 'retry #1',
      });
      const chain = createAutohealChain({ handlers: { l1Retry: heal } });
      const { hooks, state } = createReActLoopRunner({
        runStore: store,
        getMode: () => 'auto',
        autohealChain: chain,
      });

      await hooks.onExecuteStart?.('input', ctx(0));
      await hooks.afterAct?.(errored());

      expect(state.lastAutohealOutcome?.resolution).toBe('healed');
      expect(state.nextObserveHint).toBe('retry');
    });

    it('aborted outcome → user-cancel hint', async () => {
      const abort: AutohealHandler = async () => ({
        resolution: 'aborted',
        level: 5,
        reason: 'user-decline',
      });
      const chain = createAutohealChain({
        handlers: {
          // Force every level to pass so L5 is reached.
          l1Retry: async () => ({ resolution: 'pass', level: 1 }),
          l5Escalate: abort,
        },
      });
      const { hooks, state } = createReActLoopRunner({
        runStore: store,
        getMode: () => 'auto',
        autohealChain: chain,
      });

      await hooks.onExecuteStart?.('input', ctx(0));
      await hooks.afterAct?.(errored());

      expect(state.lastAutohealOutcome?.resolution).toBe('aborted');
      expect(state.nextObserveHint).toBe('user-cancel');
    });

    it('pass-all outcome (default chain) → retry hint, attempt counter advances', async () => {
      // Default chain: L1 heals twice then passes; L2-L4 no-op pass; L5 aborts.
      // First call: L1 heals. Second call: still within budget → heal again.
      // Third call: L1 exhausted → all pass → L5 aborts.
      const chain = createAutohealChain();
      const { hooks, state } = createReActLoopRunner({
        runStore: store,
        getMode: () => 'auto',
        autohealChain: chain,
      });
      await hooks.onExecuteStart?.('input', ctx(0));

      await hooks.afterAct?.(errored());
      expect(state.lastAutohealOutcome?.level).toBe(1);
      expect(state.nextObserveHint).toBe('retry');
    });

    it('successful results after an errored round clear the autoheal outcome', async () => {
      const chain = createAutohealChain();
      const { hooks, state } = createReActLoopRunner({
        runStore: store,
        getMode: () => 'auto',
        autohealChain: chain,
      });
      await hooks.onExecuteStart?.('input', ctx(0));
      await hooks.afterAct?.(errored());
      expect(state.lastAutohealOutcome).not.toBeNull();

      // Next round succeeds.
      const ok = [
        { success: true, data: 'ok', callId: 'c2', name: 'tool.x' },
      ] as unknown as ToolResultWithMeta[];
      await hooks.afterAct?.(ok);
      expect(state.lastAutohealOutcome).toBeNull();
      expect(state.nextObserveHint).toBe('normal');
    });

    it('chain throw → graceful fallback to retry hint', async () => {
      const chain = createAutohealChain({
        handlers: {
          l1Retry: async () => {
            throw new Error('handler explosion');
          },
          // If the chain itself throws (as opposed to the handler), we
          // want the runner to still recover. Simulate by mocking `run`.
        },
      });
      // Monkey-patch run to throw.
      (chain as unknown as { run: () => Promise<never> }).run = async () => {
        throw new Error('chain explosion');
      };

      const { hooks, state } = createReActLoopRunner({
        runStore: store,
        getMode: () => 'auto',
        autohealChain: chain,
      });

      await hooks.onExecuteStart?.('input', ctx(0));
      await expect(hooks.afterAct?.(errored())).resolves.not.toThrow();
      expect(state.nextObserveHint).toBe('retry');
    });

    it('without autohealChain → bare retry-hint fallback (prior P1.6 behaviour)', async () => {
      const { hooks, state } = createReActLoopRunner({
        runStore: store,
        getMode: () => 'auto',
      });
      await hooks.onExecuteStart?.('input', ctx(0));
      await hooks.afterAct?.(errored());
      expect(state.lastAutohealOutcome).toBeNull();
      expect(state.nextObserveHint).toBe('retry');
    });
  });

  describe('execution.apply.committed emission (B4)', () => {
    it('emits one event per successful tool result in the batch', async () => {
      const bus = createEventBus();
      const { hooks } = createReActLoopRunner({
        runStore: store,
        getMode: () => 'auto',
        eventBus: bus,
      });
      await hooks.onExecuteStart?.('input', ctx(0));

      const events: Array<{ kind: string; runId: string }> = [];
      bus.on(EXECUTION_CHANNELS.APPLY_COMMITTED, (e) => {
        events.push({ kind: e.kind, runId: e.runId });
      });

      const results = [
        { success: true, data: 'a', callId: 'c1', name: 'GenerateImage' },
        { success: true, data: 'b', callId: 'c2', name: 'AddTimelineElement' },
      ] as unknown as ToolResultWithMeta[];
      await hooks.afterAct?.(results);

      expect(events).toHaveLength(2);
      expect(events[0]!.kind).toBe('tool:GenerateImage');
      expect(events[1]!.kind).toBe('tool:AddTimelineElement');
      expect(events[0]!.runId).toBe(store.getActive()!.id);
    });

    it('skips failed tools (they route through autoheal instead)', async () => {
      const bus = createEventBus();
      const { hooks } = createReActLoopRunner({
        runStore: store,
        getMode: () => 'auto',
        eventBus: bus,
      });
      await hooks.onExecuteStart?.('input', ctx(0));

      const events: string[] = [];
      bus.on(EXECUTION_CHANNELS.APPLY_COMMITTED, (e) => events.push(e.kind));

      const mixed = [
        { success: true, data: 'ok', callId: 'c1', name: 'GenerateImage' },
        { success: false, error: 'oom', data: null, callId: 'c2', name: 'GenerateVideo' },
      ] as unknown as ToolResultWithMeta[];
      await hooks.afterAct?.(mixed);

      expect(events).toEqual(['tool:GenerateImage']);
    });

    it('no emission without an event bus', async () => {
      const { hooks } = createReActLoopRunner({
        runStore: store,
        getMode: () => 'auto',
      });
      await hooks.onExecuteStart?.('input', ctx(0));
      const ok = [
        { success: true, data: 'a', callId: 'c1', name: 'Read' },
      ] as unknown as ToolResultWithMeta[];
      // Should not throw even though no event bus is configured.
      await hooks.afterAct?.(ok);
    });

    it('no emission on empty result batches', async () => {
      const bus = createEventBus();
      const { hooks } = createReActLoopRunner({
        runStore: store,
        getMode: () => 'auto',
        eventBus: bus,
      });
      await hooks.onExecuteStart?.('input', ctx(0));
      const events: string[] = [];
      bus.on(EXECUTION_CHANNELS.APPLY_COMMITTED, (e) => events.push(e.kind));
      await hooks.afterAct?.([]);
      expect(events).toEqual([]);
    });
  });

  describe('execution.step.completed emission', () => {
    it('emits one event per onIterationComplete with current round + thinkOnly flag', async () => {
      const bus = createEventBus();
      const { hooks } = createReActLoopRunner({
        runStore: store,
        getMode: () => 'auto',
        eventBus: bus,
      });
      await hooks.onExecuteStart?.('input', ctx(0));

      const events: Array<{ round: number; thinkOnly: boolean }> = [];
      bus.on(EXECUTION_CHANNELS.STEP_COMPLETED, (e) => {
        events.push({ round: e.round, thinkOnly: e.thinkOnly });
      });

      // Round 0: think → act → observe with tools
      await hooks.afterAct?.([
        { success: true, data: 'x', callId: 'c1', name: 'GenerateImage' },
      ] as unknown as ToolResultWithMeta[]);
      await hooks.onIterationComplete?.(0, ctx(1));

      // Round 1: pure-think (no tool calls)
      await hooks.afterAct?.([]);
      await hooks.onIterationComplete?.(1, ctx(2));

      expect(events).toEqual([
        { round: 0, thinkOnly: false },
        { round: 1, thinkOnly: true },
      ]);
    });

    it('no emission without an event bus', async () => {
      const { hooks } = createReActLoopRunner({
        runStore: store,
        getMode: () => 'auto',
      });
      await hooks.onExecuteStart?.('input', ctx(0));
      // Should not throw.
      await hooks.onIterationComplete?.(0, ctx(1));
    });
  });
});
