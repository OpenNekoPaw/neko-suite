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
import { FlowSwitcher } from '../../skill/flow-switcher';
import { createWorkflowRunStore } from '../workflow-run-store';
import { createReActLoopRunner } from '../react-loop-runner';
import { createEventBus, CREATION_CHANNELS, EXECUTION_CHANNELS } from '../../events';

function ctx(iteration: number): AgentContext {
  return { messages: [], iteration, metadata: {} } as unknown as AgentContext;
}

describe('ReActLoopRunner hooks', () => {
  let switcher: FlowSwitcher;
  let store: ReturnType<typeof createWorkflowRunStore>;

  beforeEach(() => {
    switcher = new FlowSwitcher({ now: () => 0 });
    store = createWorkflowRunStore();
    store.startRun({ workflowId: 'test' });
  });

  it('beforeThink produces a decision and records it on the store', async () => {
    const { hooks, state } = createReActLoopRunner({
      flowSwitcher: switcher,
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
      flowSwitcher: switcher,
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
      flowSwitcher: switcher,
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
      flowSwitcher: switcher,
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
      flowSwitcher: switcher,
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
      flowSwitcher: switcher,
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
      flowSwitcher: switcher,
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

  it('flow switcher kind changes are reflected in subsequent decisions', async () => {
    const { hooks, state } = createReActLoopRunner({
      flowSwitcher: switcher,
      runStore: store,
      getMode: () => 'auto',
    });
    await hooks.onExecuteStart?.('input', ctx(0));
    await hooks.beforeThink?.(ctx(1));
    expect(state.lastDecision!.flow).toBe('creation');

    switcher.onApplyTriggered();
    await hooks.beforeThink?.(ctx(2));
    expect(state.lastDecision!.flow).toBe('execution');
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
        flowSwitcher: switcher,
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
      expect(emitted.summary.activatedPrimitives.length).toBeGreaterThan(0);
      expect(emitted.runId).toBe(store.getActive()!.id);
    });

    it('emits creation.run.ended on onExecuteEnd', async () => {
      const bus = createEventBus();
      const onEnd = vi.fn();
      bus.on(CREATION_CHANNELS.RUN_ENDED, onEnd);

      const { hooks } = createReActLoopRunner({
        flowSwitcher: switcher,
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
        flowSwitcher: switcher,
        runStore: store,
        getMode: () => 'auto',
      });
      await hooks.onExecuteStart?.('input', ctx(0));
      await expect(hooks.beforeThink?.(ctx(1))).resolves.not.toThrow();
    });
  });
});
