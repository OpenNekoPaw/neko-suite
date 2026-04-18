import { describe, expect, it } from 'vitest';
import { createConsistencyChecker } from '../../consistency/consistency-checker';
import { applyBindingToAll, editPlanBinding, type LitePlan } from '../index';
import type { BindingCandidate, Shot } from '../../matching/types';

function candidate(
  overrides: Partial<BindingCandidate> & Pick<BindingCandidate, 'slot' | 'entityId' | 'assetId'>,
): BindingCandidate {
  return {
    provenance: 'L1',
    confidence: 0.95,
    ...overrides,
  };
}

function basePlan(overrides: Partial<LitePlan> & Pick<LitePlan, 'shots'>): LitePlan {
  return {
    id: 'plan_edit',
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
    ...overrides,
  };
}

const SHOTS: Shot[] = [
  { id: 's1', sceneGroupId: 'scene_A' },
  { id: 's2', sceneGroupId: 'scene_A' },
  { id: 's3', sceneGroupId: 'scene_A' },
];

// =============================================================================
// editBinding
// =============================================================================

describe('editPlanBinding', () => {
  it('replaces primary and pushes previous into alternatives', () => {
    const alice = candidate({ slot: 'character', entityId: 'alice', assetId: 'casual' });
    const aliceFormal = candidate({
      slot: 'character',
      entityId: 'alice',
      assetId: 'formal',
      provenance: 'user',
      confidence: 1.0,
    });

    const plan = basePlan({
      shots: [
        {
          shotId: 's1',
          primary: { character: alice },
          alternatives: {},
          unmatched: [],
        },
      ],
    });

    const next = editPlanBinding(
      plan,
      { shotId: 's1', slot: 'character', candidate: aliceFormal },
      { shots: [{ id: 's1' }] },
    );

    expect(next.shots?.[0]?.primary.character?.assetId).toBe('formal');
    expect(next.shots?.[0]?.alternatives.character?.some((c) => c.assetId === 'casual')).toBe(true);
  });

  it('clears unmatched flag for the edited slot', () => {
    const plan = basePlan({
      shots: [
        {
          shotId: 's1',
          primary: {},
          alternatives: {},
          unmatched: ['character'],
        },
      ],
    });
    const pick = candidate({ slot: 'character', entityId: 'alice', assetId: 'casual' });
    const next = editPlanBinding(
      plan,
      { shotId: 's1', slot: 'character', candidate: pick },
      { shots: [{ id: 's1' }] },
    );
    expect(next.shots?.[0]?.unmatched).toEqual([]);
    expect(next.shots?.[0]?.primary.character?.assetId).toBe('casual');
  });

  it('re-runs consistency check and updates violations', () => {
    const alice = candidate({ slot: 'character', entityId: 'alice', assetId: 'casual' });
    const formal = candidate({ slot: 'character', entityId: 'alice', assetId: 'formal' });
    const plan = basePlan({
      shots: [
        {
          shotId: 's1',
          primary: { character: alice },
          alternatives: {},
          unmatched: [],
        },
        {
          shotId: 's2',
          primary: { character: alice },
          alternatives: {},
          unmatched: [],
        },
      ],
    });

    // Before edit: both shots use 'casual' so no violation
    const checker = createConsistencyChecker();
    const before = editPlanBinding(
      plan,
      { shotId: 's1', slot: 'character', candidate: alice }, // no-op
      { shots: SHOTS, consistencyChecker: checker },
    );
    expect(before.violations?.length ?? 0).toBe(0);

    // Edit s2 to 'formal' — character_lock should fire
    const after = editPlanBinding(
      plan,
      { shotId: 's2', slot: 'character', candidate: formal },
      { shots: SHOTS, consistencyChecker: checker },
    );
    expect(after.violations?.some((v) => v.kind === 'character_lock')).toBe(true);
  });
});

// =============================================================================
// applyBindingToAll
// =============================================================================

describe('applyBindingToAll', () => {
  it('propagates the candidate to every shot that currently uses the same entity', () => {
    const casual = candidate({ slot: 'character', entityId: 'alice', assetId: 'casual' });
    const formal = candidate({
      slot: 'character',
      entityId: 'alice',
      assetId: 'formal',
      provenance: 'user',
      confidence: 1,
    });
    const plan = basePlan({
      shots: [
        {
          shotId: 's1',
          primary: { character: casual },
          alternatives: {},
          unmatched: [],
        },
        {
          shotId: 's2',
          primary: { character: casual },
          alternatives: {},
          unmatched: [],
        },
        {
          // Different entity — should not be touched
          shotId: 's3',
          primary: {
            character: candidate({ slot: 'character', entityId: 'bob', assetId: 'bob_a' }),
          },
          alternatives: {},
          unmatched: [],
        },
      ],
    });

    const next = applyBindingToAll(
      plan,
      { entityId: 'alice', slot: 'character', candidate: formal },
      { shots: SHOTS },
    );
    expect(next.shots?.[0]?.primary.character?.assetId).toBe('formal');
    expect(next.shots?.[1]?.primary.character?.assetId).toBe('formal');
    expect(next.shots?.[2]?.primary.character?.assetId).toBe('bob_a');
  });

  it('skips shots that do not have a binding on the slot', () => {
    const formal = candidate({
      slot: 'character',
      entityId: 'alice',
      assetId: 'formal',
    });
    const plan = basePlan({
      shots: [
        {
          shotId: 's1',
          primary: {},
          alternatives: {},
          unmatched: ['character'],
        },
      ],
    });
    const next = applyBindingToAll(
      plan,
      { entityId: 'alice', slot: 'character', candidate: formal },
      { shots: SHOTS },
    );
    // Unchanged because there was no existing alice binding on this shot
    expect(next.shots?.[0]?.primary.character).toBeUndefined();
  });
});
