/**
 * ReActLoopRunner tests
 *
 * Simulates the executor hook invocations to verify:
 * - beforeThink emits a planner decision + records on the run store
 * - afterAct on errored tool results flips nextObserveHint to 'retry'
 * - onIterationComplete bumps the round counter
 * - onExecuteEnd closes the run with completed/failed status
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { AgentContext, AgentResult, ToolResultWithMeta } from '@neko/shared';
import type { ToolCallInfo } from '@neko/shared';
import { FlowSwitcher } from '../../skill/flow-switcher';
import { createWorkflowRunStore } from '../workflow-run-store';
import { createReActLoopRunner } from '../react-loop-runner';

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
});
