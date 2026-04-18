import { describe, expect, it } from 'vitest';
import {
  IllegalPlanTransitionError,
  canTransitionPlan,
  nextPlanStatuses,
  toNkPlan,
  transitionPlan,
  type PersistentPlan,
} from '../index';

function plan(id = 'p'): PersistentPlan {
  return toNkPlan(
    {
      id,
      createdAt: 100,
      status: 'pending',
      route: {
        level: 'L2',
        flowId: 'flowE',
        entryExtension: 'story',
        skipStages: [],
        reason: 'fix',
        confidence: 0.9,
        provenance: 'rules',
      },
      stages: [],
    },
    { now: 100 },
  );
}

describe('canTransitionPlan', () => {
  it('allows pending → approved', () => {
    expect(canTransitionPlan('pending', 'approved')).toBe(true);
  });

  it('blocks pending → executing (must go via approved)', () => {
    expect(canTransitionPlan('pending', 'executing')).toBe(false);
  });

  it('allows executing → paused + paused → executing', () => {
    expect(canTransitionPlan('executing', 'paused')).toBe(true);
    expect(canTransitionPlan('paused', 'executing')).toBe(true);
  });

  it('allows terminal → pending (fork/revise)', () => {
    expect(canTransitionPlan('completed', 'pending')).toBe(true);
    expect(canTransitionPlan('aborted', 'pending')).toBe(true);
    expect(canTransitionPlan('failed', 'pending')).toBe(true);
  });

  it('rejects same-state transitions', () => {
    expect(canTransitionPlan('pending', 'pending')).toBe(false);
  });
});

describe('transitionPlan', () => {
  it('applies allowed transition + appends history', () => {
    const p = plan();
    const next = transitionPlan(p, 'approved', {
      at: 200,
      reason: 'user-approve',
      by: 'user',
    });
    expect(next.status).toBe('approved');
    expect(next.updatedAt).toBe(200);
    expect(next.statusHistory).toHaveLength(2);
    expect(next.statusHistory[1]).toMatchObject({ status: 'approved', at: 200, by: 'user' });
  });

  it('records pipelineId on approved → executing', () => {
    const approved = transitionPlan(plan(), 'approved');
    const running = transitionPlan(approved, 'executing', { pipelineId: 'pipe_42' });
    expect(running.pipelineId).toBe('pipe_42');
  });

  it('records errorMessage on executing → failed', () => {
    const approved = transitionPlan(plan(), 'approved');
    const executing = transitionPlan(approved, 'executing');
    const failed = transitionPlan(executing, 'failed', { errorMessage: 'boom' });
    expect(failed.status).toBe('failed');
    expect(failed.errorMessage).toBe('boom');
  });

  it('throws IllegalPlanTransitionError on invalid transition', () => {
    expect(() => transitionPlan(plan(), 'executing')).toThrow(IllegalPlanTransitionError);
  });
});

describe('nextPlanStatuses', () => {
  it('lists viable next statuses', () => {
    const p = plan();
    const next = nextPlanStatuses(p);
    expect(next).toEqual(expect.arrayContaining(['approved', 'edited', 'aborted']));
  });
});
