/**
 * WorkflowRunStore tests
 *
 * Covers:
 * - startRun creates a running record with stable id + timestamps
 * - recordRound appends summaries in order
 * - endRun transitions to terminal status + endedAt
 * - restart auto-closes the previous run as 'aborted'
 * - transitions / todos attach to the active run only
 */

import { describe, it, expect } from 'vitest';
import type { PrimitiveActivationDecision, TodoList } from '@neko-agent/types';
import { createWorkflowRunStore } from '../workflow-run-store';

function decision(
  overrides: Partial<PrimitiveActivationDecision> = {},
): PrimitiveActivationDecision {
  return {
    flow: 'execution',
    taskShape: 'multi-step',
    activated: ['plan', 'apply', 'step'],
    skipped: [],
    decidedAt: 100,
    round: 0,
    ...overrides,
  };
}

describe('WorkflowRunStore', () => {
  it('startRun creates a running record with the supplied workflowId', () => {
    const t = 1000;
    const store = createWorkflowRunStore({ now: () => t });
    const id = store.startRun({ workflowId: 'flow-c' });
    const run = store.getActive();
    expect(run).not.toBeNull();
    expect(run!.id).toBe(id);
    expect(run!.workflowId).toBe('flow-c');
    expect(run!.status).toBe('running');
    expect(run!.createdAt).toBe(1000);
    expect(run!.startedAt).toBe(1000);
    expect(run!.rounds).toEqual([]);
  });

  it('uses a user-supplied runId when given', () => {
    const store = createWorkflowRunStore();
    expect(store.startRun({ workflowId: 'f', runId: 'custom-run' })).toBe('custom-run');
  });

  it('recordRound appends round summaries in order', () => {
    const store = createWorkflowRunStore();
    store.startRun({ workflowId: 'f' });
    store.recordRound(decision({ round: 0 }));
    store.recordRound(decision({ round: 1, activated: ['step'] }), 'retry');
    const rounds = store.getActive()!.rounds;
    expect(rounds).toHaveLength(2);
    expect(rounds[0].round).toBe(0);
    expect(rounds[1].round).toBe(1);
    expect(rounds[1].activatedPrimitives).toEqual(['step']);
    expect(rounds[1].lastObserveHint).toBe('retry');
  });

  it('recordRound is a no-op without an active run', () => {
    const store = createWorkflowRunStore();
    store.recordRound(decision());
    expect(store.getActive()).toBeNull();
  });

  it('endRun transitions status + endedAt + moves run to completed list', () => {
    let t = 0;
    const store = createWorkflowRunStore({ now: () => t });
    t = 1;
    store.startRun({ workflowId: 'f' });
    t = 50;
    store.endRun('completed');
    expect(store.getActive()).toBeNull();
    const done = store.listCompleted();
    expect(done).toHaveLength(1);
    expect(done[0].status).toBe('completed');
    expect(done[0].endedAt).toBe(50);
  });

  it('endRun carries error payload when failed', () => {
    const store = createWorkflowRunStore();
    store.startRun({ workflowId: 'f' });
    store.endRun('failed', { code: 'oops', message: 'tool failed' });
    const done = store.listCompleted()[0];
    expect(done.status).toBe('failed');
    expect(done.error?.code).toBe('oops');
  });

  it('startRun while active auto-aborts the previous run', () => {
    const store = createWorkflowRunStore();
    const first = store.startRun({ workflowId: 'a' });
    store.startRun({ workflowId: 'b' });
    const completed = store.listCompleted();
    expect(completed.map((r) => r.id)).toContain(first);
    expect(completed.find((r) => r.id === first)!.status).toBe('aborted');
  });

  it('recordTransition + setTodos attach to the active run', () => {
    const store = createWorkflowRunStore();
    store.startRun({ workflowId: 'f' });
    store.recordTransition({
      from: 'creation',
      to: 'execution',
      reason: 'apply-triggered',
      at: 77,
    });
    const todos: TodoList = { id: 'l1', items: [], createdAt: 0, updatedAt: 0 };
    store.setTodos(todos);

    const run = store.getActive()!;
    expect(run.transitions).toHaveLength(1);
    expect(run.transitions[0].reason).toBe('apply-triggered');
    expect(run.todos).toBe(todos);
  });
});
