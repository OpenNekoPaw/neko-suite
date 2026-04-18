import { describe, expect, it } from 'vitest';
import { createPlanBuilder } from '../plan-builder';
import { createMatchingEngine } from '../../matching';
import { createAssetLibrary, createMemoryFileIO } from '../../asset-library';
import { createRouter } from '../../router';
import type { AssetLibraryDeps, RawAssetManifestEntry } from '../../asset-library/types';
import type { CharacterRegistryFile } from '@neko/shared';
import type { Shot } from '../../matching/types';

// =============================================================================
// Fixtures
// =============================================================================

const REGISTRY: CharacterRegistryFile = {
  version: 1,
  characters: [{ id: 'alice', canonicalName: 'Alice', aliases: ['Alice'], status: 'confirmed' }],
};
const MANIFEST: readonly RawAssetManifestEntry[] = [
  { id: 'alice_casual', type: 'image', path: '/a.png', entityId: 'alice' },
];

async function makeLib() {
  const deps: AssetLibraryDeps = {
    workDir: '/test',
    loadCharacterRegistry: async () => REGISTRY,
    loadEntityGraph: async () => undefined,
    loadAssetManifests: async () => MANIFEST,
    fileIO: createMemoryFileIO(),
  };
  return createAssetLibrary(deps);
}

// =============================================================================
// Tests
// =============================================================================

describe('PlanBuilder — stage assembly', () => {
  it('builds stages for flowA (full)', async () => {
    const router = createRouter();
    const route = await router.decide({ kind: 'prompt', text: 'x'.repeat(3000) });
    expect(route.flowId).toBe('flowA');

    const builder = createPlanBuilder();
    const plan = await builder.build({ route });
    expect(plan.status).toBe('pending');
    expect(plan.stages.length).toBeGreaterThan(0);
    expect(plan.stages[0]?.id).toBe('readDocument');
    // None skipped for flowA default
    expect(plan.stages.every((s) => !s.skipped)).toBe(true);
  });

  it('honours skipStages in the route', async () => {
    const router = createRouter();
    const route = await router.decide({ kind: 'prompt', text: 'quick' });
    expect(route.level).toBe('L0');
    // L0 → flowB + skip arrangeOnTimeline
    const builder = createPlanBuilder();
    const plan = await builder.build({ route });
    const arrange = plan.stages.find((s) => s.id === 'arrangeOnTimeline');
    expect(arrange?.skipped).toBe(true);
  });

  it('attaches id, createdAt, notes', async () => {
    const router = createRouter();
    const route = await router.decide({ kind: 'prompt', text: 'x' });
    const builder = createPlanBuilder({
      generateId: () => 'plan_fixed',
      now: () => 123456,
    });
    const plan = await builder.build({
      route,
      notes: ['user said "quick"', 'confidence=0.92'],
    });
    expect(plan.id).toBe('plan_fixed');
    expect(plan.createdAt).toBe(123456);
    expect(plan.notes).toEqual(['user said "quick"', 'confidence=0.92']);
  });
});

describe('PlanBuilder — shot bindings integration', () => {
  it('populates bindings when matchingEngine + assetLibrary provided', async () => {
    const lib = await makeLib();
    const engine = createMatchingEngine();
    const router = createRouter();
    const route = await router.decide({ kind: 'prompt', text: 'short' });

    const builder = createPlanBuilder({ matchingEngine: engine, assetLibrary: lib });
    const shots: Shot[] = [{ id: 'shot_1', scriptLine: '@character:alice enters the room' }];
    const plan = await builder.build({ route, shots });
    expect(plan.shots).toBeDefined();
    expect(plan.shots).toHaveLength(1);
    expect(plan.shots?.[0]?.primary.character?.entityId).toBe('alice');
    lib.dispose();
  });

  it('returns empty bindings when matching is not configured', async () => {
    const router = createRouter();
    const route = await router.decide({ kind: 'prompt', text: 'short' });

    const builder = createPlanBuilder();
    const shots: Shot[] = [{ id: 'shot_1', scriptLine: 'hello' }];
    const plan = await builder.build({ route, shots });
    expect(plan.shots).toHaveLength(1);
    expect(plan.shots?.[0]?.primary).toEqual({});
    expect(plan.shots?.[0]?.unmatched).toEqual([]);
  });

  it('threads continuity across shots via matchShots', async () => {
    const lib = await makeLib();
    // Seed prior binding for scene_A
    await lib.upsertBinding({
      shotId: 'prev',
      slot: 'character',
      entityId: 'alice',
      assetId: 'alice_casual',
      provenance: 'user',
      confidence: 1.0,
      userConfirmed: true,
      sceneGroupId: 'scene_A',
    });
    const engine = createMatchingEngine();
    const router = createRouter();
    const route = await router.decide({ kind: 'prompt', text: 'x' });
    const builder = createPlanBuilder({ matchingEngine: engine, assetLibrary: lib });
    const shots: Shot[] = [
      { id: 'shot_1', entityRefs: [{ slot: 'character', name: 'Alice' }], sceneGroupId: 'scene_A' },
      { id: 'shot_2', entityRefs: [{ slot: 'character', name: 'Alice' }], sceneGroupId: 'scene_A' },
    ];
    const plan = await builder.build({ route, shots });
    expect(plan.shots?.[0]?.primary.character?.provenance).toBe('L5');
    expect(plan.shots?.[1]?.primary.character?.provenance).toBe('L5');
    lib.dispose();
  });
});
