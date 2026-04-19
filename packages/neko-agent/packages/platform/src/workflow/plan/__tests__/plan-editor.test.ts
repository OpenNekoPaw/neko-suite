import { describe, expect, it } from 'vitest';
import { createConsistencyChecker } from '../../consistency/consistency-checker';
import {
  applyBindingToAll,
  editPlanBinding,
  togglePlanStageCheckpoint,
  type LitePlan,
} from '../index';
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

  // Review regression — rerunConsistency() used to rebuild the LitePlan
  // without copying parentPlanId / referenceChain, so fork+edit silently
  // dropped parent lineage and Phase 5 continuity anchors.
  it('preserves parentPlanId and referenceChain across edits', () => {
    const alice = candidate({ slot: 'character', entityId: 'alice', assetId: 'casual' });
    const formal = candidate({ slot: 'character', entityId: 'alice', assetId: 'formal' });
    const plan = basePlan({
      parentPlanId: 'plan_parent',
      referenceChain: [
        {
          shotId: 's2',
          slot: 'character',
          references: ['s1'],
          strategy: 'anchored',
        },
      ],
      shots: [
        {
          shotId: 's1',
          primary: { character: alice },
          alternatives: { character: [formal] },
          unmatched: [],
        },
        {
          shotId: 's2',
          primary: { character: alice },
          alternatives: { character: [formal] },
          unmatched: [],
        },
      ],
    });

    const checker = createConsistencyChecker();
    const after = editPlanBinding(
      plan,
      { shotId: 's2', slot: 'character', candidate: formal },
      { shots: SHOTS, consistencyChecker: checker },
    );

    expect(after.parentPlanId).toBe('plan_parent');
    expect(after.referenceChain).toEqual(plan.referenceChain);
    // and the edit itself still took effect + consistency re-ran
    expect(after.shots?.[1]?.primary.character?.assetId).toBe('formal');
    expect(after.violations?.some((v) => v.kind === 'character_lock')).toBe(true);
  });

  // Second-round review fix-C — when the original Shot[] is unavailable
  // (typical for forks) rerunConsistency must NOT compute against an
  // empty shot list (which silently erases prior violations).  Instead
  // it preserves whatever violations were already attached to the plan.
  it('preserves prior violations when ctx.shots is empty (fork scenario)', () => {
    const alice = candidate({ slot: 'character', entityId: 'alice', assetId: 'casual' });
    const formal = candidate({ slot: 'character', entityId: 'alice', assetId: 'formal' });
    const priorViolation = {
      id: 'v1',
      kind: 'character_lock' as const,
      severity: 'warning' as const,
      constraintId: 'c1',
      shotIds: ['s1', 's2'],
      entity: 'alice',
      message: 'prior — must be preserved',
    };
    const plan = basePlan({
      violations: [priorViolation],
      shots: [
        {
          shotId: 's1',
          primary: { character: alice },
          alternatives: { character: [formal] },
          unmatched: [],
        },
        {
          shotId: 's2',
          primary: { character: alice },
          alternatives: { character: [formal] },
          unmatched: [],
        },
      ],
    });

    const checker = createConsistencyChecker();
    const after = editPlanBinding(
      plan,
      { shotId: 's2', slot: 'character', candidate: formal },
      { shots: [], consistencyChecker: checker },
    );

    // Key assertion: prior violations are preserved verbatim.
    expect(after.violations).toEqual([priorViolation]);
    // And the edit itself still took effect.
    expect(after.shots?.[1]?.primary.character?.assetId).toBe('formal');
  });

  // Fifth-round review Fix-I — plans that persist their original Shot[]
  // input MUST use it for consistency recheck even when ctx.shots is
  // empty.  This covers forks + reloaded plans: the session no longer
  // needs a side-table of shots because the plan is self-sufficient.
  it('re-runs consistency using plan.matchingShots when ctx.shots is empty', () => {
    const alice = candidate({ slot: 'character', entityId: 'alice', assetId: 'casual' });
    const formal = candidate({ slot: 'character', entityId: 'alice', assetId: 'formal' });
    const plan = basePlan({
      // Original matching input persisted on the plan body — simulates
      // a fork / reloaded plan where pending.shots was never populated.
      matchingShots: SHOTS,
      shots: [
        {
          shotId: 's1',
          primary: { character: alice },
          alternatives: { character: [formal] },
          unmatched: [],
        },
        {
          shotId: 's2',
          primary: { character: alice },
          alternatives: { character: [formal] },
          unmatched: [],
        },
      ],
    });

    const checker = createConsistencyChecker();
    const after = editPlanBinding(
      plan,
      { shotId: 's2', slot: 'character', candidate: formal },
      { shots: [], consistencyChecker: checker }, // empty side-table
    );

    // Checker ran (against matchingShots), produced new violation.
    expect(after.violations?.some((v) => v.kind === 'character_lock')).toBe(true);
    // matchingShots survives the rebuild so subsequent edits also work.
    expect(after.matchingShots).toEqual(SHOTS);
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

// =============================================================================
// toggleStageCheckpoint
// =============================================================================

describe('togglePlanStageCheckpoint', () => {
  const planWithStages = (): LitePlan => ({
    id: 'plan_cp',
    createdAt: 100,
    status: 'pending',
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
      { id: 'generatePrompts', label: 'Prompts', skipped: false, userCheckpoint: true },
      { id: 'batchGenerate', label: 'Batch', skipped: true },
    ],
    shots: [],
  });

  it('flips the checkpoint when value is omitted', () => {
    const plan = planWithStages();
    const next = togglePlanStageCheckpoint(plan, { stageId: 'parseStoryboard' });
    expect(next.stages[0]?.userCheckpoint).toBe(true);
    const next2 = togglePlanStageCheckpoint(next, { stageId: 'generatePrompts' });
    expect(next2.stages[1]?.userCheckpoint).toBeUndefined();
  });

  it('honours explicit value', () => {
    const plan = planWithStages();
    const next = togglePlanStageCheckpoint(plan, {
      stageId: 'parseStoryboard',
      value: true,
    });
    expect(next.stages[0]?.userCheckpoint).toBe(true);
  });

  it('no-ops on skipped stages', () => {
    const plan = planWithStages();
    const next = togglePlanStageCheckpoint(plan, { stageId: 'batchGenerate', value: true });
    expect(next.stages[2]?.userCheckpoint).toBeUndefined();
  });

  it('no-ops on unknown stage id', () => {
    const plan = planWithStages();
    const next = togglePlanStageCheckpoint(plan, { stageId: 'nope', value: true });
    expect(next).toEqual(plan);
  });

  it('leaves other stages untouched', () => {
    const plan = planWithStages();
    const next = togglePlanStageCheckpoint(plan, { stageId: 'parseStoryboard', value: true });
    expect(next.stages[1]?.userCheckpoint).toBe(true); // generatePrompts unchanged
    expect(next.stages[2]?.skipped).toBe(true);
  });
});
