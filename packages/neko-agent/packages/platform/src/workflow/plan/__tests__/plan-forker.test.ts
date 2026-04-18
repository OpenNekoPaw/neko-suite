import { describe, expect, it } from 'vitest';
import { forkPlan } from '../plan-forker';
import { toNkPlan } from '../persistence-types';
import type { PersistentPlan } from '../persistence-types';
import type { LitePlan } from '../types';

function liteBase(): LitePlan {
  return {
    id: 'plan_src',
    createdAt: 100,
    status: 'approved',
    route: {
      level: 'L2',
      flowId: 'flowE',
      entryExtension: 'story',
      skipStages: ['readDocument'],
      reason: 'rule-script',
      confidence: 0.92,
      provenance: 'rules',
    },
    stages: [
      { id: 'parseStoryboard', label: 'Parse', skipped: false, userCheckpoint: true },
      { id: 'generatePrompts', label: 'Prompts', skipped: false },
    ],
    shots: [
      {
        shotId: 's1',
        primary: {
          character: {
            slot: 'character',
            entityId: 'alice',
            assetId: 'casual',
            provenance: 'L1',
            confidence: 0.95,
          },
        },
        alternatives: {},
        unmatched: [],
        userConfirmed: true,
      } as never,
    ],
  };
}

function persistent(overrides: Partial<PersistentPlan> = {}): PersistentPlan {
  const base = toNkPlan(liteBase(), { now: 100 });
  return {
    ...base,
    statusHistory: [{ status: base.status, at: 100 }],
    ...overrides,
  };
}

describe('forkPlan', () => {
  it('creates a new plan with parentPlanId and fresh timestamps', () => {
    const source = persistent();
    const fork = forkPlan(source, { now: 200, reason: 'manual-fork', by: 'user' });
    expect(fork.id).not.toBe(source.id);
    expect(fork.parentPlanId).toBe(source.id);
    expect(fork.createdAt).toBe(200);
    expect(fork.updatedAt).toBe(200);
    expect(fork.status).toBe('pending');
    expect(fork.statusHistory).toEqual([
      { status: 'pending', at: 200, reason: 'manual-fork', by: 'user' },
    ]);
  });

  it('inherits route + stages + shots by default', () => {
    const source = persistent();
    const fork = forkPlan(source, { now: 200 });
    expect(fork.route).toBe(source.route);
    expect(fork.stages).toBe(source.stages);
    expect(fork.shots).toBe(source.shots);
  });

  it('strips pipelineId + errorMessage', () => {
    const source: PersistentPlan = {
      ...persistent({ pipelineId: 'pipe_abc', errorMessage: 'boom' }),
    };
    const fork = forkPlan(source, { now: 200 });
    expect((fork as { pipelineId?: string }).pipelineId).toBeUndefined();
    expect((fork as { errorMessage?: string }).errorMessage).toBeUndefined();
  });

  it('clears userConfirmed flags when resetToOriginal=true', () => {
    const source = persistent();
    const fork = forkPlan(source, { now: 200, resetToOriginal: true });
    expect(fork.shots?.[0]?.userConfirmed).toBeUndefined();
  });

  it('uses custom id generator', () => {
    const source = persistent();
    const fork = forkPlan(source, { now: 200, generateId: (s) => `${s.id}_custom` });
    expect(fork.id).toBe('plan_src_custom');
  });
});
