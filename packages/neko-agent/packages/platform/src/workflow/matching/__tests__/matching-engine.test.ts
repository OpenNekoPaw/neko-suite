import { describe, expect, it, beforeEach } from 'vitest';
import { createMatchingEngine, parseExplicitRefs, dice } from '../index';
import { createAssetLibrary, createMemoryFileIO } from '../../asset-library';
import type { AssetLibraryDeps, RawAssetManifestEntry } from '../../asset-library/types';
import type { CharacterRegistryFile, CreativeEntityGraphSnapshot } from '@neko/shared';
import type { Shot } from '../types';

// =============================================================================
// Fixtures
// =============================================================================

const REGISTRY: CharacterRegistryFile = {
  version: 1,
  characters: [
    {
      id: 'alice',
      canonicalName: 'Alice',
      aliases: ['Alice', '爱丽丝', '主角'],
      status: 'confirmed',
    },
    {
      id: 'bob',
      canonicalName: 'Bob',
      aliases: ['Bob'],
      status: 'confirmed',
    },
  ],
};

const GRAPH: CreativeEntityGraphSnapshot = {
  version: 1,
  nodes: [{ id: 'e_forest', kind: 'entity', refId: 'forest', label: 'scene:forest' }],
  edges: [],
};

const MANIFEST: readonly RawAssetManifestEntry[] = [
  {
    id: 'alice_casual',
    type: 'image',
    path: '/assets/characters/alice_casual.png',
    entityId: 'alice',
    metadata: { outfit: 'casual' },
  },
  {
    id: 'alice_formal',
    type: 'image',
    path: '/assets/characters/alice_formal.png',
    entityId: 'alice',
    metadata: { outfit: 'formal' },
  },
  {
    id: 'bob_default',
    type: 'image',
    path: '/assets/characters/bob.png',
    entityId: 'bob',
  },
  {
    id: 'forest_dawn',
    type: 'image',
    path: '/assets/scenes/forest_dawn.png',
    entityId: 'forest',
    metadata: { time: 'dawn' },
  },
  {
    id: 'forest_night',
    type: 'image',
    path: '/assets/scenes/forest_night.png',
    entityId: 'forest',
    metadata: { time: 'night' },
  },
];

async function makeLib() {
  const deps: AssetLibraryDeps = {
    workDir: '/test',
    loadCharacterRegistry: async () => REGISTRY,
    loadEntityGraph: async () => GRAPH,
    loadAssetManifests: async () => MANIFEST,
    fileIO: createMemoryFileIO(),
  };
  return createAssetLibrary(deps);
}

// =============================================================================
// parseExplicitRefs
// =============================================================================

describe('parseExplicitRefs', () => {
  it('parses single tag', () => {
    expect(parseExplicitRefs('@character:alice')).toEqual([
      { slot: 'character', entityId: 'alice' },
    ]);
  });

  it('parses multiple tags in one line', () => {
    const refs = parseExplicitRefs('@character:alice walks through @scene:forest_day');
    expect(refs).toHaveLength(2);
    expect(refs[0]?.slot).toBe('character');
    expect(refs[1]?.slot).toBe('scene');
    expect(refs[1]?.entityId).toBe('forest_day');
  });

  it('parses variant hint', () => {
    expect(parseExplicitRefs('@character:alice#formal')).toEqual([
      { slot: 'character', entityId: 'alice', variant: 'formal' },
    ]);
  });

  it('normalises slot aliases', () => {
    expect(parseExplicitRefs('@person:alice')[0]?.slot).toBe('character');
    expect(parseExplicitRefs('@location:forest')[0]?.slot).toBe('scene');
    expect(parseExplicitRefs('@object:sword')[0]?.slot).toBe('prop');
  });

  it('ignores unknown slots', () => {
    expect(parseExplicitRefs('@foobar:alice')).toEqual([]);
  });

  it('returns [] for empty / undefined input', () => {
    expect(parseExplicitRefs(undefined)).toEqual([]);
    expect(parseExplicitRefs('')).toEqual([]);
  });
});

// =============================================================================
// Dice coefficient
// =============================================================================

describe('dice', () => {
  it('identical strings → 1', () => expect(dice('alice', 'alice')).toBe(1));
  it('disjoint → 0', () => expect(dice('abc', 'xyz')).toBe(0));
  it('case-insensitive', () => expect(dice('Alice', 'ALICE')).toBe(1));
  it('partial overlap', () => {
    const d = dice('alice', 'alison');
    expect(d).toBeGreaterThan(0.3);
    expect(d).toBeLessThan(1);
  });
});

// =============================================================================
// MatchingEngine — L1 explicit
// =============================================================================

describe('MatchingEngine — L1 explicit', () => {
  it('matches inline tag with variant', async () => {
    const lib = await makeLib();
    const engine = createMatchingEngine();
    const shot: Shot = {
      id: 'shot_1',
      scriptLine: 'Morning scene. @character:alice#formal sits at the table.',
    };
    const bindings = await engine.matchShot(shot, lib);
    expect(bindings.primary.character?.assetId).toBe('alice_formal');
    expect(bindings.primary.character?.provenance).toBe('L1');
    expect(bindings.primary.character?.confidence).toBeGreaterThan(0.95);
    lib.dispose();
  });

  it('matches multiple slots in one line', async () => {
    const lib = await makeLib();
    const engine = createMatchingEngine();
    const shot: Shot = {
      id: 'shot_2',
      scriptLine: '@character:alice walks into @scene:forest',
    };
    const bindings = await engine.matchShot(shot, lib);
    expect(bindings.primary.character?.entityId).toBe('alice');
    expect(bindings.primary.scene?.entityId).toBe('forest');
    lib.dispose();
  });
});

// =============================================================================
// MatchingEngine — L2 fuzzy name
// =============================================================================

describe('MatchingEngine — L2 name match', () => {
  it('matches via entity canonical name', async () => {
    const lib = await makeLib();
    const engine = createMatchingEngine();
    const shot: Shot = {
      id: 'shot_1',
      entityRefs: [{ slot: 'character', name: 'Alice' }],
    };
    const bindings = await engine.matchShot(shot, lib);
    expect(bindings.primary.character?.entityId).toBe('alice');
    expect(bindings.primary.character?.provenance).toBe('L2');
    lib.dispose();
  });

  it('matches alias (CJK)', async () => {
    const lib = await makeLib();
    const engine = createMatchingEngine();
    const shot: Shot = {
      id: 'shot_1',
      entityRefs: [{ slot: 'character', name: '爱丽丝' }],
    };
    const bindings = await engine.matchShot(shot, lib);
    expect(bindings.primary.character?.entityId).toBe('alice');
    lib.dispose();
  });

  it('does not match unknown name', async () => {
    const lib = await makeLib();
    const engine = createMatchingEngine();
    const shot: Shot = {
      id: 'shot_1',
      entityRefs: [{ slot: 'character', name: 'Nonexistent' }],
    };
    const bindings = await engine.matchShot(shot, lib);
    expect(bindings.primary.character).toBeUndefined();
    expect(bindings.unmatched).toContain('character');
    lib.dispose();
  });
});

// =============================================================================
// MatchingEngine — L5 continuity
// =============================================================================

describe('MatchingEngine — L5 continuity', () => {
  it('re-uses prior binding when in same scene group', async () => {
    const lib = await makeLib();
    // Seed a prior binding
    await lib.upsertBinding({
      shotId: 'shot_prev',
      slot: 'character',
      entityId: 'alice',
      assetId: 'alice_formal',
      provenance: 'user',
      confidence: 1.0,
      userConfirmed: true,
      sceneGroupId: 'scene_A',
    });

    const engine = createMatchingEngine();
    const shot: Shot = {
      id: 'shot_next',
      entityRefs: [{ slot: 'character', name: 'Alice' }],
      sceneGroupId: 'scene_A',
    };
    const bindings = await engine.matchShot(shot, lib);
    // L5 should beat L2 → assetId should be the previously-used formal variant
    expect(bindings.primary.character?.provenance).toBe('L5');
    expect(bindings.primary.character?.assetId).toBe('alice_formal');
    lib.dispose();
  });

  it('scene-change tag breaks continuity', async () => {
    const lib = await makeLib();
    await lib.upsertBinding({
      shotId: 'shot_prev',
      slot: 'character',
      entityId: 'alice',
      assetId: 'alice_formal',
      provenance: 'user',
      confidence: 1.0,
      userConfirmed: true,
      sceneGroupId: 'scene_A',
    });

    const engine = createMatchingEngine();
    const shot: Shot = {
      id: 'shot_next',
      entityRefs: [{ slot: 'character', name: 'Alice' }],
      sceneGroupId: 'scene_A',
      tags: ['scene-change'],
    };
    const bindings = await engine.matchShot(shot, lib);
    // Falls back to L2 → picks the first asset (alice_casual by manifest order)
    expect(bindings.primary.character?.provenance).toBe('L2');
    lib.dispose();
  });
});

// =============================================================================
// matchShots — cross-shot continuity threading
// =============================================================================

describe('MatchingEngine — matchShots cross-shot', () => {
  it('threads primaries into subsequent shots', async () => {
    const lib = await makeLib();
    const engine = createMatchingEngine();
    const shots: Shot[] = [
      {
        id: 'shot_1',
        scriptLine: '@character:alice#formal enters the room',
        sceneGroupId: 'scene_A',
      },
      {
        id: 'shot_2',
        entityRefs: [{ slot: 'character', name: 'Alice' }],
        sceneGroupId: 'scene_A',
      },
    ];
    const results = await engine.matchShots(shots, lib);
    expect(results).toHaveLength(2);
    // shot_1: L1 exact → alice_formal
    expect(results[0]?.primary.character?.provenance).toBe('L1');
    expect(results[0]?.primary.character?.assetId).toBe('alice_formal');
    // shot_2: L5 continuity reuses alice_formal
    expect(results[1]?.primary.character?.provenance).toBe('L5');
    expect(results[1]?.primary.character?.assetId).toBe('alice_formal');
    lib.dispose();
  });
});

// =============================================================================
// Layer selection
// =============================================================================

describe('MatchingEngine — enableLayers', () => {
  it('disabling L1 drops explicit matches', async () => {
    const lib = await makeLib();
    const engine = createMatchingEngine();
    const shot: Shot = {
      id: 'shot_1',
      scriptLine: '@character:alice#formal',
    };
    const bindings = await engine.matchShot(shot, lib, { enableLayers: ['L2', 'L5'] });
    // L1 disabled, L2 should still find alice via parseExplicitRefs providing entityId
    // But L2 needs `name`, and parseExplicitRefs gives `entityId` — so L2 doesn't fire either.
    // Result: unmatched. This documents the behaviour.
    expect(bindings.primary.character).toBeUndefined();
    lib.dispose();
  });
});
