import { describe, expect, it } from 'vitest';
import { diffPlans } from '../plan-diff';
import type { PersistentPlan } from '../persistence-types';

function base(): PersistentPlan {
  return {
    version: '1.0',
    id: 'plan_a',
    createdAt: 1,
    updatedAt: 1,
    status: 'pending',
    statusHistory: [{ status: 'pending', at: 1 }],
    route: {
      level: 'L2',
      flowId: 'flowE',
      entryExtension: 'story',
      skipStages: [],
      reason: 'rule',
      confidence: 0.9,
      provenance: 'rules',
    },
    stages: [
      { id: 'parseStoryboard', label: 'Parse', skipped: false },
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
      },
    ],
  };
}

describe('diffPlans', () => {
  it('returns unchanged=true when both plans are identical', () => {
    const a = base();
    const b = base();
    const diff = diffPlans(a, b);
    expect(diff.unchanged).toBe(true);
    expect(diff.route).toHaveLength(0);
    expect(diff.stages).toHaveLength(0);
    expect(diff.shots).toHaveLength(0);
  });

  it('detects route level + flowId + skipStages changes', () => {
    const a = base();
    const b: PersistentPlan = {
      ...base(),
      route: { ...a.route, level: 'L3', flowId: 'flowA', skipStages: ['readDocument'] },
    };
    const diff = diffPlans(a, b);
    const kinds = diff.route.map((r) => r.kind).sort();
    expect(kinds).toEqual(['flowId', 'level', 'skipStages'].sort());
    expect(diff.unchanged).toBe(false);
  });

  it('detects added/removed stages and skipped/checkpoint toggles', () => {
    const a = base();
    const b: PersistentPlan = {
      ...base(),
      stages: [
        { id: 'parseStoryboard', label: 'Parse', skipped: true }, // skipped toggled
        { id: 'generatePrompts', label: 'Prompts', skipped: false, userCheckpoint: true }, // checkpoint
        { id: 'generatePilot', label: 'Pilot', skipped: false }, // added
      ],
    };
    const diff = diffPlans(a, b);
    const byKind = diff.stages.reduce<Record<string, number>>((acc, s) => {
      acc[s.kind] = (acc[s.kind] ?? 0) + 1;
      return acc;
    }, {});
    expect(byKind['added']).toBe(1);
    expect(byKind['skippedToggled']).toBe(1);
    expect(byKind['checkpointToggled']).toBe(1);
  });

  it('detects shot primary swaps + unmatched changes', () => {
    const a = base();
    const b: PersistentPlan = {
      ...base(),
      shots: [
        {
          shotId: 's1',
          primary: {
            character: {
              slot: 'character',
              entityId: 'alice',
              assetId: 'formal', // swapped
              provenance: 'user',
              confidence: 1,
            },
          },
          alternatives: {},
          unmatched: ['scene'], // added
        },
      ],
    };
    const diff = diffPlans(a, b);
    const swap = diff.shots.find((s) => s.kind === 'primarySwapped');
    expect(swap?.slot).toBe('character');
    expect(swap?.fromAssetId).toBe('casual');
    expect(swap?.toAssetId).toBe('formal');
    expect(diff.shots.some((s) => s.kind === 'unmatchedChanged')).toBe(true);
  });

  it('detects added/removed shots', () => {
    const a = base();
    const b: PersistentPlan = {
      ...base(),
      shots: [...base().shots!, { shotId: 's2', primary: {}, alternatives: {}, unmatched: [] }],
    };
    const diffAdded = diffPlans(a, b);
    expect(diffAdded.shots.some((s) => s.kind === 'shotAdded' && s.shotId === 's2')).toBe(true);

    const diffRemoved = diffPlans(b, a);
    expect(diffRemoved.shots.some((s) => s.kind === 'shotRemoved' && s.shotId === 's2')).toBe(true);
  });

  it('detects added/removed constraints by id', () => {
    const a: PersistentPlan = { ...base(), constraints: [] };
    const b: PersistentPlan = {
      ...base(),
      constraints: [
        {
          id: 'c1',
          kind: 'character_lock',
          entity: 'alice',
          shots: ['s1'],
          payload: {},
        },
      ],
    };
    const diff = diffPlans(a, b);
    expect(diff.constraints).toEqual([
      { kind: 'added', constraintId: 'c1', constraintKind: 'character_lock' },
    ]);
  });
});
