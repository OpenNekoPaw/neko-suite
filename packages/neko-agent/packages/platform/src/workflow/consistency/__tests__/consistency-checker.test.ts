import { describe, expect, it } from 'vitest';
import {
  characterLockRule,
  createConsistencyChecker,
  timeProgressionRule,
  type CheckContext,
} from '../consistency-checker';
import type { Shot, ShotBindings } from '../../matching/types';

// =============================================================================
// Helpers
// =============================================================================

function shot(id: string, opts: Partial<Shot> = {}): Shot {
  return { id, ...opts };
}

function binding(
  shotId: string,
  entries: Record<
    string,
    { entityId: string; assetId: string; confidence?: number; provenance?: 'L1' | 'L2' | 'L5' }
  >,
): ShotBindings {
  const primary: ShotBindings['primary'] = {};
  for (const [slot, info] of Object.entries(entries)) {
    (primary as Record<string, unknown>)[slot] = {
      slot,
      entityId: info.entityId,
      assetId: info.assetId,
      provenance: info.provenance ?? 'L1',
      confidence: info.confidence ?? 0.95,
    };
  }
  return {
    shotId,
    primary,
    alternatives: {},
    unmatched: [],
  };
}

// =============================================================================
// character_lock
// =============================================================================

describe('characterLockRule', () => {
  it('emits no violation when all shots use the same asset', () => {
    const shots: Shot[] = [
      shot('s1', { sceneGroupId: 'scene_A' }),
      shot('s2', { sceneGroupId: 'scene_A' }),
    ];
    const bindings: ShotBindings[] = [
      binding('s1', { character: { entityId: 'alice', assetId: 'casual' } }),
      binding('s2', { character: { entityId: 'alice', assetId: 'casual' } }),
    ];
    const ctx: CheckContext = { shots, bindings };
    const res = characterLockRule.check(ctx);
    expect(res.constraints).toHaveLength(1);
    expect(res.violations).toHaveLength(0);
  });

  it('emits violation when shot deviates from anchor', () => {
    const shots: Shot[] = [
      shot('s1', { sceneGroupId: 'scene_A' }),
      shot('s2', { sceneGroupId: 'scene_A' }),
      shot('s3', { sceneGroupId: 'scene_A' }),
    ];
    const bindings: ShotBindings[] = [
      binding('s1', { character: { entityId: 'alice', assetId: 'casual' } }),
      binding('s2', { character: { entityId: 'alice', assetId: 'formal' } }),
      binding('s3', { character: { entityId: 'alice', assetId: 'casual' } }),
    ];
    const res = characterLockRule.check({ shots, bindings });
    expect(res.violations).toHaveLength(1);
    expect(res.violations[0]?.shotIds).toEqual(['s2']);
    expect(res.violations[0]?.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'replace-binding', assetId: 'casual' }),
      ]),
    );
  });

  it('respects scene-change tag', () => {
    const shots: Shot[] = [
      shot('s1', { sceneGroupId: 'scene_A' }),
      shot('s2', { sceneGroupId: 'scene_A', tags: ['scene-change'] }),
    ];
    const bindings: ShotBindings[] = [
      binding('s1', { character: { entityId: 'alice', assetId: 'casual' } }),
      binding('s2', { character: { entityId: 'alice', assetId: 'formal' } }),
    ];
    const res = characterLockRule.check({ shots, bindings });
    expect(res.violations).toHaveLength(0);
  });

  it('does not cross scene groups', () => {
    const shots: Shot[] = [
      shot('s1', { sceneGroupId: 'scene_A' }),
      shot('s2', { sceneGroupId: 'scene_B' }),
    ];
    const bindings: ShotBindings[] = [
      binding('s1', { character: { entityId: 'alice', assetId: 'casual' } }),
      binding('s2', { character: { entityId: 'alice', assetId: 'formal' } }),
    ];
    const res = characterLockRule.check({ shots, bindings });
    expect(res.violations).toHaveLength(0);
    // each group still forms a (single-entry) group; no constraint needed when there's only one occurrence
    expect(res.constraints).toHaveLength(0);
  });
});

// =============================================================================
// time_progression
// =============================================================================

describe('timeProgressionRule', () => {
  it('emits no violation for monotonic time', () => {
    const shots: Shot[] = [shot('s1'), shot('s2'), shot('s3')];
    const bindings: ShotBindings[] = [
      binding('s1', { scene: { entityId: 'forest', assetId: 'forest_dawn' } }),
      binding('s2', { scene: { entityId: 'forest', assetId: 'forest_morning' } }),
      binding('s3', { scene: { entityId: 'forest', assetId: 'forest_noon' } }),
    ];
    const res = timeProgressionRule.check({ shots, bindings });
    expect(res.violations).toHaveLength(0);
    expect(res.constraints).toHaveLength(1);
    expect(res.constraints[0]?.payload['sequence']).toEqual(['dawn', 'morning', 'noon']);
  });

  it('flags time reversal', () => {
    const shots: Shot[] = [shot('s1'), shot('s2')];
    const bindings: ShotBindings[] = [
      binding('s1', { scene: { entityId: 'forest', assetId: 'forest_noon' } }),
      binding('s2', { scene: { entityId: 'forest', assetId: 'forest_dawn' } }),
    ];
    const res = timeProgressionRule.check({ shots, bindings });
    expect(res.violations).toHaveLength(1);
    expect(res.violations[0]?.severity).toBe('warning');
    expect(res.violations[0]?.shotIds).toEqual(['s1', 's2']);
  });

  it('scene-change tag suppresses the warning', () => {
    const shots: Shot[] = [shot('s1'), shot('s2', { tags: ['scene-change'] })];
    const bindings: ShotBindings[] = [
      binding('s1', { scene: { entityId: 'forest', assetId: 'forest_noon' } }),
      binding('s2', { scene: { entityId: 'forest', assetId: 'forest_dawn' } }),
    ];
    const res = timeProgressionRule.check({ shots, bindings });
    expect(res.violations).toHaveLength(0);
  });

  it('ignores assets without recognised time suffix', () => {
    const shots: Shot[] = [shot('s1'), shot('s2')];
    const bindings: ShotBindings[] = [
      binding('s1', { scene: { entityId: 'forest', assetId: 'forest_a' } }),
      binding('s2', { scene: { entityId: 'forest', assetId: 'forest_b' } }),
    ];
    const res = timeProgressionRule.check({ shots, bindings });
    expect(res.violations).toHaveLength(0);
  });
});

// =============================================================================
// Facade composition
// =============================================================================

describe('ConsistencyChecker facade', () => {
  it('composes default rules', () => {
    const checker = createConsistencyChecker();
    const res = checker.check({
      shots: [shot('s1', { sceneGroupId: 'A' }), shot('s2', { sceneGroupId: 'A' })],
      bindings: [
        binding('s1', {
          character: { entityId: 'alice', assetId: 'casual' },
          scene: { entityId: 'forest', assetId: 'forest_dawn' },
        }),
        binding('s2', {
          character: { entityId: 'alice', assetId: 'formal' },
          scene: { entityId: 'forest', assetId: 'forest_night' },
        }),
      ],
    });
    // Should emit the character_lock violation for s2
    expect(res.violations.some((v) => v.kind === 'character_lock')).toBe(true);
    // But no time_progression violation (dawn → night is monotonic)
    expect(res.violations.some((v) => v.kind === 'time_progression')).toBe(false);
    // Both constraints recorded
    expect(res.constraints.map((c) => c.kind).sort()).toEqual([
      'character_lock',
      'time_progression',
    ]);
  });

  it('returns empty report for empty input', () => {
    const res = createConsistencyChecker().check({ shots: [], bindings: [] });
    expect(res.constraints).toEqual([]);
    expect(res.violations).toEqual([]);
  });
});
