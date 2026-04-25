/**
 * IdcRunStore tests
 *
 * Covers:
 * - startRun creates a running record with stable id + timestamps
 * - recordRound appends summaries in order
 * - endRun transitions to terminal status + endedAt
 * - restart auto-closes the previous run as 'aborted'
 * - transitions / task attach to the active run only
 */

import { describe, it, expect } from 'vitest';
import type {
  Draft,
  ExecutionPlan,
  IdcRun,
  StageActivationDecision,
  Task,
} from '@neko-agent/types';
import { createIdcRunStore } from '../idc-run-store';

function decision(overrides: Partial<StageActivationDecision> = {}): StageActivationDecision {
  return {
    taskShape: 'multi-step',
    activated: ['plan', 'apply'],
    skipped: [],
    decidedAt: 100,
    round: 0,
    ...overrides,
  };
}

describe('IdcRunStore', () => {
  const draft: Draft = {
    id: 'draft-1',
    title: 'Draft title',
    status: 'pending_review',
    domain: 'cut',
    createdAt: 1,
    updatedAt: 2,
    intent: 'Intent',
    approach: 'Approach',
    artifact: 'Artifact',
  };
  const plan: ExecutionPlan = {
    id: 'plan-1',
    draftId: 'draft-1',
    title: 'Plan title',
    status: 'ready',
    createdAt: 3,
    updatedAt: 4,
    steps: [],
  };

  it('startRun creates a running record with the supplied runKind', () => {
    const t = 1000;
    const store = createIdcRunStore({ now: () => t });
    const id = store.startRun({ runKind: 'flow-c' });
    const run = store.getActive();
    expect(run).not.toBeNull();
    expect(run!.id).toBe(id);
    expect(run!.runKind).toBe('flow-c');
    expect(run!.workflowId).toBe('flow-c');
    expect(run!.status).toBe('running');
    expect(run!.createdAt).toBe(1000);
    expect(run!.startedAt).toBe(1000);
    expect(run!.rounds).toEqual([]);
  });

  it('still accepts legacy workflowId input during migration', () => {
    const store = createIdcRunStore();
    store.startRun({ workflowId: 'legacy-flow' });
    expect(store.getActive()).toEqual(
      expect.objectContaining({
        runKind: 'legacy-flow',
        workflowId: 'legacy-flow',
      }),
    );
  });

  it('uses a user-supplied runId when given', () => {
    const store = createIdcRunStore();
    expect(store.startRun({ workflowId: 'f', runId: 'custom-run' })).toBe('custom-run');
  });

  it('generates distinct default runIds across store instances', () => {
    const now = () => 1234;
    const first = createIdcRunStore({ now });
    const second = createIdcRunStore({ now });

    const firstId = first.startRun({ workflowId: 'flow-a' });
    const secondId = second.startRun({ workflowId: 'flow-b' });

    expect(firstId).not.toBe(secondId);
    expect(firstId).toMatch(/^run-1234-[a-z0-9]+$/);
    expect(secondId).toMatch(/^run-1234-[a-z0-9]+$/);
  });

  it('recordRound appends round summaries in order', () => {
    const store = createIdcRunStore();
    store.startRun({ workflowId: 'f' });
    store.recordRound(decision({ round: 0 }));
    store.recordRound(decision({ round: 1, activated: ['apply'] }), 'retry');
    const rounds = store.getActive()!.rounds;
    expect(rounds).toHaveLength(2);
    expect(rounds[0].round).toBe(0);
    expect(rounds[1].round).toBe(1);
    expect(rounds[1].activatedStages).toEqual(['apply']);
    expect(rounds[1].lastObserveHint).toBe('retry');
  });

  it('recordRound is a no-op without an active run', () => {
    const store = createIdcRunStore();
    store.recordRound(decision());
    expect(store.getActive()).toBeNull();
  });

  it('endRun transitions status + endedAt + moves run to completed list', () => {
    let t = 0;
    const store = createIdcRunStore({ now: () => t });
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
    const store = createIdcRunStore();
    store.startRun({ workflowId: 'f' });
    store.endRun('failed', { code: 'oops', message: 'tool failed' });
    const done = store.listCompleted()[0];
    expect(done.status).toBe('failed');
    expect(done.error?.code).toBe('oops');
  });

  it('startRun while active auto-aborts the previous run', () => {
    const store = createIdcRunStore();
    const first = store.startRun({ workflowId: 'a' });
    store.startRun({ workflowId: 'b' });
    const completed = store.listCompleted();
    expect(completed.map((r) => r.id)).toContain(first);
    expect(completed.find((r) => r.id === first)!.status).toBe('aborted');
  });

  it('setTask attaches the task checklist to the active run', () => {
    const store = createIdcRunStore();
    store.startRun({ workflowId: 'f' });
    const task: Task = { id: 'l1', items: [], createdAt: 0, updatedAt: 0 };
    store.setTask(task);

    const run = store.getActive()!;
    expect(run.task).toBe(task);
  });

  it('tracks draft / plan / task bindings on the active run', () => {
    const store = createIdcRunStore();
    store.startRun({ workflowId: 'f', runId: 'run-1' });
    const task: Task = { id: 'task-1', items: [], createdAt: 5, updatedAt: 6 };

    store.setDraft(draft, {
      kind: 'draft',
      artifactId: 'draft-1',
      path: '/tmp/.neko/drafts/draft-run-1.md',
      updatedAt: 2,
    });
    store.setPlan(plan, {
      kind: 'plan',
      artifactId: 'plan-1',
      path: '/tmp/.neko/plans/plan-run-1.md',
      updatedAt: 4,
    });
    store.setTask(task, {
      kind: 'task',
      artifactId: 'task-1',
      path: '/tmp/.neko/tasks/task-run-1.md',
      updatedAt: 6,
    });

    expect(store.getActive()).toEqual(
      expect.objectContaining({
        draft,
        plan,
        task,
        artifactBindings: [
          {
            kind: 'draft',
            artifactId: 'draft-1',
            path: '/tmp/.neko/drafts/draft-run-1.md',
            updatedAt: 2,
          },
          {
            kind: 'plan',
            artifactId: 'plan-1',
            path: '/tmp/.neko/plans/plan-run-1.md',
            updatedAt: 4,
          },
          {
            kind: 'task',
            artifactId: 'task-1',
            path: '/tmp/.neko/tasks/task-run-1.md',
            updatedAt: 6,
          },
        ],
      }),
    );
  });

  it('restore replaces active and completed run state from a persisted snapshot', () => {
    const store = createIdcRunStore();
    const active: IdcRun = {
      id: 'run-active',
      runKind: 'wf-active',
      workflowId: 'wf-active',
      status: 'running',
      createdAt: 1,
      startedAt: 2,
      rounds: [decision({ round: 0 })],
      artifactBindings: [
        {
          kind: 'draft',
          artifactId: 'draft-active',
          path: '/tmp/.neko/drafts/draft-run-active.md',
          updatedAt: 3,
        },
      ],
    };
    const completed: IdcRun = {
      id: 'run-completed',
      runKind: 'wf-completed',
      workflowId: 'wf-completed',
      status: 'completed',
      createdAt: 4,
      startedAt: 5,
      endedAt: 6,
      rounds: [],
      error: undefined,
    };

    store.restore({ active, completed: [completed] });

    expect(store.getActive()).toEqual(active);
    expect(store.listCompleted()).toEqual([completed]);
  });
});
