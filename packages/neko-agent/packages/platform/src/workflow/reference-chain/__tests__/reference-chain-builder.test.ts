import { describe, expect, it } from 'vitest';
import { buildReferenceChain } from '../reference-chain-builder';
import type { ReferenceChainShot } from '../types';

function shot(
  id: string,
  index: number,
  overrides: Partial<ReferenceChainShot> = {},
): ReferenceChainShot {
  return {
    shotId: id,
    index,
    sceneGroupId: 'sg_default',
    boundEntities: { character: 'alice' },
    ...overrides,
  };
}

describe('buildReferenceChain — strategies', () => {
  const linearShots = [shot('s1', 0), shot('s2', 1), shot('s3', 2), shot('s4', 3)];

  it('first shot in a group never gets an entry (nothing to reference)', () => {
    const result = buildReferenceChain(linearShots, { strategy: 'sequential' });
    expect(result.find((r) => r.shotId === 's1')).toBeUndefined();
  });

  it('sequential strategy references the immediately preceding shot', () => {
    const result = buildReferenceChain(linearShots, { strategy: 'sequential' });
    expect(result.map((r) => ({ shotId: r.shotId, refs: [...r.references] }))).toEqual([
      { shotId: 's2', refs: ['s1'] },
      { shotId: 's3', refs: ['s2'] },
      { shotId: 's4', refs: ['s3'] },
    ]);
  });

  it('anchored strategy always references the first shot of the group', () => {
    const result = buildReferenceChain(linearShots, { strategy: 'anchored' });
    expect(result.every((r) => r.references.length === 1 && r.references[0] === 's1')).toBe(true);
  });

  it('hybrid strategy emits [anchor, previous] for each entry', () => {
    const result = buildReferenceChain(linearShots, { strategy: 'hybrid' });
    expect(result.map((r) => [...r.references])).toEqual([
      ['s1'], // s2: anchor == prev == s1 → dedupe
      ['s1', 's2'],
      ['s1', 's3'],
    ]);
  });

  it('hybrid dedupes when maxReferences clamps the list', () => {
    const result = buildReferenceChain(linearShots, {
      strategy: 'hybrid',
      maxReferences: 1,
    });
    // With maxRefs=1 and hybrid, only the anchor survives after slicing.
    expect(result.map((r) => [...r.references])).toEqual([['s1'], ['s1'], ['s1']]);
  });
});

// ============================================================================

describe('buildReferenceChain — chain breaks', () => {
  it('different sceneGroupId restarts the anchor', () => {
    const shots: ReferenceChainShot[] = [
      shot('s1', 0, { sceneGroupId: 'sg_a' }),
      shot('s2', 1, { sceneGroupId: 'sg_a' }),
      shot('s3', 2, { sceneGroupId: 'sg_b' }),
      shot('s4', 3, { sceneGroupId: 'sg_b' }),
    ];
    const result = buildReferenceChain(shots, { strategy: 'anchored' });
    // s2 anchors to s1; s3 starts a new chain (no entry); s4 anchors to s3.
    const byShot = Object.fromEntries(result.map((r) => [r.shotId, [...r.references]]));
    expect(byShot).toEqual({ s2: ['s1'], s4: ['s3'] });
  });

  it('scene-change tag inside a group breaks the chain', () => {
    const shots: ReferenceChainShot[] = [
      shot('s1', 0),
      shot('s2', 1),
      shot('s3', 2, { tags: ['scene-change'] }),
      shot('s4', 3),
    ];
    const result = buildReferenceChain(shots, { strategy: 'sequential' });
    const byShot = Object.fromEntries(result.map((r) => [r.shotId, [...r.references]]));
    expect(byShot).toEqual({ s2: ['s1'], s4: ['s3'] });
  });

  it('custom breakTags override the default', () => {
    const shots: ReferenceChainShot[] = [
      shot('s1', 0),
      shot('s2', 1, { tags: ['cutaway'] }),
      shot('s3', 2),
    ];
    const result = buildReferenceChain(shots, {
      strategy: 'sequential',
      breakTags: ['cutaway'],
    });
    // s2 restarts because of `cutaway` → s2 has no entry, s3 refs s2.
    expect(result.map((r) => r.shotId)).toEqual(['s3']);
    expect(result[0]?.references).toEqual(['s2']);
  });

  it('entity change on the target slot restarts the chain', () => {
    const shots: ReferenceChainShot[] = [
      shot('s1', 0, { boundEntities: { character: 'alice' } }),
      shot('s2', 1, { boundEntities: { character: 'alice' } }),
      shot('s3', 2, { boundEntities: { character: 'bob' } }),
      shot('s4', 3, { boundEntities: { character: 'bob' } }),
    ];
    const result = buildReferenceChain(shots, { strategy: 'sequential' });
    const byShot = Object.fromEntries(result.map((r) => [r.shotId, [...r.references]]));
    expect(byShot).toEqual({ s2: ['s1'], s4: ['s3'] });
  });

  it('missing binding on the target slot restarts the chain', () => {
    const shots: ReferenceChainShot[] = [
      shot('s1', 0),
      shot('s2', 1),
      shot('s3', 2, { boundEntities: {} }), // no character binding
      shot('s4', 3),
    ];
    const result = buildReferenceChain(shots, { strategy: 'sequential' });
    const byShot = Object.fromEntries(result.map((r) => [r.shotId, [...r.references]]));
    // s3 has no binding → no chain; s4 starts a new chain → no entry either.
    expect(byShot).toEqual({ s2: ['s1'] });
  });
});

// ============================================================================

describe('buildReferenceChain — multi-slot', () => {
  it('each slot gets its own independent chain', () => {
    const shots: ReferenceChainShot[] = [
      {
        shotId: 's1',
        index: 0,
        sceneGroupId: 'sg',
        boundEntities: { character: 'alice', scene: 'forest' },
      },
      {
        shotId: 's2',
        index: 1,
        sceneGroupId: 'sg',
        boundEntities: { character: 'alice', scene: 'forest' },
      },
    ];
    const result = buildReferenceChain(shots, {
      strategy: 'sequential',
      slots: ['character', 'scene'],
    });
    const bySlot = result.reduce<Record<string, string[]>>((acc, r) => {
      acc[`${r.shotId}:${r.slot}`] = [...r.references];
      return acc;
    }, {});
    expect(bySlot).toEqual({
      's2:character': ['s1'],
      's2:scene': ['s1'],
    });
  });

  it('breaking one slot does not break the other', () => {
    const shots: ReferenceChainShot[] = [
      {
        shotId: 's1',
        index: 0,
        sceneGroupId: 'sg',
        boundEntities: { character: 'alice', scene: 'forest' },
      },
      {
        shotId: 's2',
        index: 1,
        sceneGroupId: 'sg',
        boundEntities: { character: 'alice', scene: 'cave' }, // scene changes, character continuous
      },
    ];
    const result = buildReferenceChain(shots, {
      strategy: 'sequential',
      slots: ['character', 'scene'],
    });
    const bySlot = result.reduce<Record<string, string[]>>((acc, r) => {
      acc[`${r.shotId}:${r.slot}`] = [...r.references];
      return acc;
    }, {});
    // character chain continues; scene chain breaks.
    expect(bySlot['s2:character']).toEqual(['s1']);
    expect(bySlot['s2:scene']).toBeUndefined();
  });
});

// ============================================================================

describe('buildReferenceChain — ordering', () => {
  it('sorts shots by index even when passed out of order', () => {
    const shots = [shot('s3', 2), shot('s1', 0), shot('s2', 1)];
    const result = buildReferenceChain(shots, { strategy: 'sequential' });
    expect(result.map((r) => r.shotId)).toEqual(['s2', 's3']);
    expect(result[0]?.references).toEqual(['s1']);
    expect(result[1]?.references).toEqual(['s2']);
  });

  it('every emitted entry carries the chosen strategy for explainability', () => {
    const result = buildReferenceChain([shot('s1', 0), shot('s2', 1)], {
      strategy: 'anchored',
    });
    expect(result[0]?.strategy).toBe('anchored');
  });
});
