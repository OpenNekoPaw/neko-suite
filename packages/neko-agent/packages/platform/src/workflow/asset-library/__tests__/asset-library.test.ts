/**
 * AssetLibrary facade smoke tests.
 *
 * Uses fixtures injected via AssetLibraryDeps to avoid any file I/O except
 * for BindingHistory (which uses createMemoryFileIO).
 */

import { describe, expect, it } from 'vitest';
import { createAssetLibrary, createMemoryFileIO } from '../index';
import type { AssetLibraryDeps, RawAssetManifestEntry } from '../types';
import type { CharacterRegistryFile, CreativeEntityGraphSnapshot } from '@neko/shared';

// =============================================================================
// Fixtures
// =============================================================================

const ALICE_REGISTRY: CharacterRegistryFile = {
  version: 1,
  characters: [
    {
      id: 'alice',
      canonicalName: 'Alice',
      displayName: '爱丽丝',
      aliases: ['Alice', '爱丽丝', '主角'],
      status: 'confirmed',
      metadata: { role: 'protagonist', gender: 'female' },
    },
    {
      id: 'bob',
      canonicalName: 'Bob',
      aliases: ['Bob', '鲍勃'],
      status: 'confirmed',
    },
    {
      id: 'deprecated_ghost',
      canonicalName: 'Ghost',
      aliases: [],
      status: 'deprecated',
    },
  ],
};

const GRAPH: CreativeEntityGraphSnapshot = {
  version: 1,
  nodes: [
    {
      id: 'e_forest',
      kind: 'entity',
      refId: 'forest',
      label: 'scene:forest',
    },
    { id: 'a_forest_dawn', kind: 'asset', refId: 'forest_dawn', label: '/assets/forest_dawn.png' },
  ],
  edges: [
    { from: 'alice', to: 'forest', type: 'appears-in-scene', strength: 'inferred' },
    { from: 'forest', to: 'forest_dawn', type: 'default-visual-for', strength: 'confirmed' },
  ],
};

const MANIFEST: readonly RawAssetManifestEntry[] = [
  {
    id: 'alice_casual',
    type: 'image',
    path: '/assets/characters/alice_casual.png',
    name: 'Alice Casual',
    source: 'local',
    entityId: 'alice',
    metadata: { outfit: 'casual', version: 2 },
  },
  {
    id: 'alice_formal',
    type: 'image',
    path: '/assets/characters/alice_formal.png',
    entityId: 'alice',
    metadata: { outfit: 'formal' },
  },
  {
    id: 'forest_dawn',
    type: 'image',
    path: '/assets/scenes/forest_dawn.png',
    entityId: 'forest',
  },
];

function makeDeps(): AssetLibraryDeps {
  return {
    workDir: '/test',
    loadCharacterRegistry: async () => ALICE_REGISTRY,
    loadEntityGraph: async () => GRAPH,
    loadAssetManifests: async () => MANIFEST,
    fileIO: createMemoryFileIO(),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('AssetLibrary — entity queries', () => {
  it('lists confirmed characters (skips deprecated)', async () => {
    const lib = await createAssetLibrary(makeDeps());
    const characters = lib.listEntities('character');
    expect(characters.map((e) => e.id).sort()).toEqual(['alice', 'bob']);
    expect(characters.find((e) => e.id === 'deprecated_ghost')).toBeUndefined();
    lib.dispose();
  });

  it('resolves entity by canonical name and alias', async () => {
    const lib = await createAssetLibrary(makeDeps());
    expect(lib.resolveEntityByName('Alice')?.id).toBe('alice');
    expect(lib.resolveEntityByName('爱丽丝')?.id).toBe('alice');
    expect(lib.resolveEntityByName('主角')?.id).toBe('alice');
    // Case-insensitive
    expect(lib.resolveEntityByName('BOB')?.id).toBe('bob');
    expect(lib.resolveEntityByName('nobody')).toBeUndefined();
    lib.dispose();
  });

  it('includes non-character entities from the graph', async () => {
    const lib = await createAssetLibrary(makeDeps());
    const scenes = lib.listEntities('scene');
    expect(scenes.some((e) => e.id === 'forest')).toBe(true);
    lib.dispose();
  });

  it('resolves scene entity by name', async () => {
    const lib = await createAssetLibrary(makeDeps());
    // The graph label is "scene:forest" so canonical match would need exact — aliases empty.
    // Our fuzzy lookup is canonicalName match (case-insensitive).
    const forest = lib.resolveEntityByName('scene:forest', 'scene');
    expect(forest?.id).toBe('forest');
    lib.dispose();
  });
});

describe('AssetLibrary — asset queries', () => {
  it('findAssetsForEntity returns all variants for a character', async () => {
    const lib = await createAssetLibrary(makeDeps());
    const aliceAssets = lib.findAssetsForEntity('alice');
    expect(aliceAssets.map((a) => a.id).sort()).toEqual(['alice_casual', 'alice_formal']);
    expect(aliceAssets[0]?.variants).toBeDefined();
    lib.dispose();
  });

  it('respects limit and kind filter', async () => {
    const lib = await createAssetLibrary(makeDeps());
    const one = lib.findAssetsForEntity('alice', { limit: 1 });
    expect(one).toHaveLength(1);

    const imagesOnly = lib.findAssetsForEntity('alice', { kind: 'image' });
    expect(imagesOnly).toHaveLength(2);

    const videosOnly = lib.findAssetsForEntity('alice', { kind: 'video' });
    expect(videosOnly).toHaveLength(0);
    lib.dispose();
  });

  it('listAssets with filter', async () => {
    const lib = await createAssetLibrary(makeDeps());
    const forForest = lib.listAssets({ entityId: 'forest' });
    expect(forForest).toHaveLength(1);
    expect(forForest[0]?.id).toBe('forest_dawn');
    lib.dispose();
  });
});

describe('AssetLibrary — binding writes', () => {
  it('upsertBinding returns a Binding with id + timestamp', async () => {
    const lib = await createAssetLibrary(makeDeps());
    const b = await lib.upsertBinding({
      shotId: 'shot_1',
      slot: 'character',
      entityId: 'alice',
      assetId: 'alice_casual',
      provenance: 'L1',
      confidence: 0.95,
      userConfirmed: false,
    });
    expect(b.id).toBeDefined();
    expect(b.timestamp).toBeGreaterThan(0);

    const found = lib.findBindings({ entityId: 'alice' });
    expect(found).toHaveLength(1);
    lib.dispose();
  });

  it('findSiblingShotBindings pulls from same sceneGroup', async () => {
    const lib = await createAssetLibrary(makeDeps());
    await lib.upsertBinding({
      shotId: 'shot_1',
      slot: 'character',
      entityId: 'alice',
      assetId: 'alice_casual',
      provenance: 'L1',
      confidence: 0.95,
      userConfirmed: false,
      sceneGroupId: 'scene_A',
    });
    await lib.upsertBinding({
      shotId: 'shot_2',
      slot: 'character',
      entityId: 'alice',
      assetId: 'alice_casual',
      provenance: 'L5',
      confidence: 0.9,
      userConfirmed: false,
      sceneGroupId: 'scene_A',
    });
    const siblings = lib.findSiblingShotBindings('shot_1');
    expect(siblings.map((b) => b.shotId)).toEqual(['shot_2']);
    lib.dispose();
  });
});

describe('AssetLibrary — relations', () => {
  it('exposes relations with filters', async () => {
    const lib = await createAssetLibrary(makeDeps());
    const all = lib.listRelations();
    // appears-in-scene maps to 'contains'; default-visual-for stays
    expect(all.length).toBeGreaterThan(0);
    const containsOnly = lib.listRelations({ kind: 'contains' });
    expect(containsOnly.some((r) => r.from === 'alice' && r.to === 'forest')).toBe(true);
    lib.dispose();
  });
});
