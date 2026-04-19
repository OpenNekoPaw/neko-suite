/**
 * Orchestrator integration tests.
 *
 * Locks in the end-to-end Route → Plan → dispatch behaviour from Phase
 * 1-3.5 so Phase 4-6 work can't silently break it.  Mirrors the E2E
 * scenarios documented in docs/development/workflow-orchestration-impl-plan.md §7.
 *
 * These are *integration* tests (real Router + PlanBuilder + PlanStore
 * + MatchingEngine + ConsistencyChecker) wired together with an in-memory
 * FileIO adapter — NOT extension-host E2E tests.  They run under vitest
 * without needing a VSCode runtime.
 */

import { describe, expect, it } from 'vitest';
import { Workflow } from '@neko/platform';
import type { CharacterRegistryFile } from '@neko/shared';
import type { AssetLibraryDeps, RawAssetManifestEntry } from '@neko/platform';

// =============================================================================
// Harness
// =============================================================================

async function makeStack(
  opts: {
    workDir?: string;
    registry?: CharacterRegistryFile;
    manifest?: readonly RawAssetManifestEntry[];
  } = {},
) {
  const workDir = opts.workDir ?? '/test-wf';
  const fileIO = Workflow.createMemoryFileIO();

  const matchingEngine = Workflow.createMatchingEngine();
  const consistencyChecker = Workflow.createConsistencyChecker();

  // AssetLibrary is optional; only attach one when fixtures supply a registry.
  let assetLibrary: Workflow.AssetLibrary | undefined;
  if (opts.registry || opts.manifest) {
    const deps: AssetLibraryDeps = {
      workDir,
      loadCharacterRegistry: async () => opts.registry,
      loadEntityGraph: async () => undefined,
      loadAssetManifests: async () => opts.manifest ?? [],
      fileIO,
    };
    assetLibrary = await Workflow.createAssetLibrary(deps);
  }

  const planStore = new Workflow.PlanStore({ workDir, fileIO });

  const router = Workflow.createRouter();
  const planBuilder = Workflow.createPlanBuilder({
    consistencyChecker,
    ...(assetLibrary !== undefined && {
      matchingEngine,
      assetLibrary,
    }),
  });

  return {
    workDir,
    fileIO,
    router,
    planBuilder,
    planStore,
    assetLibrary,
    matchingEngine,
    consistencyChecker,
  };
}

// =============================================================================
// Core scenarios (impl-plan §7)
// =============================================================================

describe('Orchestrator integration — core routing scenarios', () => {
  it('E2E-1: short prompt → L0 direct single-shot', async () => {
    const { router, planBuilder } = await makeStack();
    const route = await router.decide({ kind: 'prompt', text: 'make a cat jumping clip' });
    expect(route.level).toBe('L0');
    expect(route.provenance).toBe('rules');
    expect(route.confidence).toBeGreaterThan(0.9);
    expect(route.skipStages).toContain('arrangeOnTimeline');

    const plan = await planBuilder.build({ route });
    expect(plan.route.level).toBe('L0');
    expect(plan.stages.length).toBeGreaterThan(0);
    // Arrange-on-timeline should be marked skipped in the plan
    const arrange = plan.stages.find((s) => s.id === 'arrangeOnTimeline');
    expect(arrange?.skipped).toBe(true);
  });

  it('E2E-2: .fountain file → L2 skip readDocument', async () => {
    const { router, planBuilder } = await makeStack();
    const route = await router.decide({ kind: 'file', path: '/tmp/script.fountain' });
    expect(route.level).toBe('L2');
    expect(route.entryExtension).toBe('story');
    expect(route.skipStages).toContain('readDocument');

    const plan = await planBuilder.build({ route });
    // L2 → flowE, which doesn't include readDocument at all; either absent
    // or marked skipped is acceptable (both mean "won't run").
    const read = plan.stages.find((s) => s.id === 'readDocument');
    expect(read === undefined || read.skipped).toBe(true);
    // Parsing must be present and not skipped.
    const parse = plan.stages.find((s) => s.id === 'parseStoryboard');
    expect(parse).toBeDefined();
    expect(parse!.skipped).toBe(false);
  });

  it('E2E-3: long text → L3 full pipeline', async () => {
    const { router, planBuilder } = await makeStack();
    // 3000-char text trips the L3 threshold (2000+)
    const text = 'Once upon a time in a quiet village.\n'.repeat(80);
    expect(text.length).toBeGreaterThan(2000);
    const route = await router.decide({ kind: 'prompt', text });
    expect(route.level).toBe('L3');
    expect(route.entryExtension).toBe('story');

    const plan = await planBuilder.build({ route });
    // L3 runs the full flowA chain — readDocument is included, not skipped
    expect(plan.stages[0]?.id).toBe('readDocument');
    expect(plan.stages.every((s) => !s.skipped)).toBe(true);
  });

  it('E2E-4: L5 continuity reuses a prior binding on the same scene group', async () => {
    const { router, planBuilder, assetLibrary } = await makeStack({
      registry: {
        version: 1,
        characters: [
          { id: 'alice', canonicalName: 'Alice', aliases: ['Alice'], status: 'confirmed' },
        ],
      },
      manifest: [
        { id: 'alice_casual', type: 'image', path: '/a/casual.png', entityId: 'alice' },
        { id: 'alice_formal', type: 'image', path: '/a/formal.png', entityId: 'alice' },
      ],
    });
    expect(assetLibrary).toBeDefined();

    // Seed a prior committed binding for scene_A.
    await assetLibrary!.upsertBinding({
      shotId: 'shot_prev',
      slot: 'character',
      entityId: 'alice',
      assetId: 'alice_casual',
      provenance: 'user',
      confidence: 1.0,
      userConfirmed: true,
      sceneGroupId: 'scene_A',
    });

    const route = await router.decide({ kind: 'prompt', text: 'a brief scene' });
    const shots = [
      {
        id: 'shot_1',
        entityRefs: [{ slot: 'character' as const, name: 'Alice' }],
        sceneGroupId: 'scene_A',
      },
      {
        id: 'shot_2',
        entityRefs: [{ slot: 'character' as const, name: 'Alice' }],
        sceneGroupId: 'scene_A',
      },
    ];
    const plan = await planBuilder.build({ route, shots });
    expect(plan.shots).toBeDefined();
    expect(plan.shots).toHaveLength(2);
    // Both shots should reuse alice_casual via the L5 continuity matcher.
    for (const shot of plan.shots!) {
      expect(shot.primary.character?.assetId).toBe('alice_casual');
      expect(shot.primary.character?.provenance).toBe('L5');
    }
    assetLibrary!.dispose();
  });

  it('E2E-5: user-override bypasses probing', async () => {
    const { router } = await makeStack();
    const route = await router.decide({ kind: 'prompt', text: 'anything' }, { forceLevel: 'L4' });
    expect(route.level).toBe('L4');
    expect(route.provenance).toBe('user-override');
    expect(route.confidence).toBe(1.0);
  });

  it('E2E-6: multi-shot plan carries a reference chain end-to-end', async () => {
    const { router, planBuilder, assetLibrary } = await makeStack({
      registry: {
        version: 1,
        characters: [
          { id: 'alice', canonicalName: 'Alice', aliases: ['Alice'], status: 'confirmed' },
        ],
      },
      manifest: [{ id: 'alice_casual', type: 'image', path: '/a.png', entityId: 'alice' }],
    });
    expect(assetLibrary).toBeDefined();

    const route = await router.decide({ kind: 'prompt', text: 'x' });
    const shots = [0, 1, 2].map((i) => ({
      id: `shot_${i}`,
      index: i,
      entityRefs: [{ slot: 'character' as const, name: 'Alice' }],
      sceneGroupId: 'scene_A',
    }));
    const plan = await planBuilder.build({ route, shots });
    expect(plan.referenceChain).toBeDefined();
    // Hybrid default: shot_1 refs [shot_0]; shot_2 refs [shot_0, shot_1].
    const byShot = Object.fromEntries(
      (plan.referenceChain ?? []).map((e) => [e.shotId, [...e.references]]),
    );
    expect(byShot['shot_1']).toEqual(['shot_0']);
    expect(byShot['shot_2']).toEqual(['shot_0', 'shot_1']);

    // Round-trip preserves the chain.
    const persistent = Workflow.toNkPlan(plan);
    const liteReloaded = Workflow.toLitePlan(persistent);
    expect(liteReloaded.referenceChain).toHaveLength(2);
    assetLibrary!.dispose();
  });
});

// =============================================================================
// Plan persistence round-trip
// =============================================================================

describe('Orchestrator integration — plan persistence', () => {
  it('builds → toNkPlan → save → load → toLitePlan preserves core fields', async () => {
    const { router, planBuilder, planStore } = await makeStack();
    const route = await router.decide({ kind: 'file', path: '/tmp/script.fountain' });
    const lite = await planBuilder.build({ route });

    const persistent = Workflow.toNkPlan(lite, { now: 1000 });
    await planStore.save(persistent);
    expect(await planStore.exists(persistent.id)).toBe(true);

    const reloaded = await planStore.load(persistent.id);
    expect(reloaded).toBeDefined();
    expect(reloaded!.id).toBe(lite.id);
    expect(reloaded!.route.level).toBe('L2');
    expect(reloaded!.status).toBe('pending');

    const liteReloaded = Workflow.toLitePlan(reloaded!);
    expect(liteReloaded.route.flowId).toBe(lite.route.flowId);
    expect(liteReloaded.stages).toHaveLength(lite.stages.length);
  });

  it('listPlans returns stored plans sorted newest-first', async () => {
    const { router, planBuilder, planStore } = await makeStack();
    const inputs: Array<{ kind: 'prompt'; text: string }> = [
      { kind: 'prompt', text: 'first' },
      { kind: 'prompt', text: 'second' },
    ];
    const ids: string[] = [];
    for (let i = 0; i < inputs.length; i++) {
      const route = await router.decide(inputs[i]!);
      const lite = await planBuilder.build({ route });
      const persistent = Workflow.toNkPlan(lite, { now: 1000 + i * 10 });
      await planStore.save(persistent);
      ids.push(persistent.id);
    }
    const list = await planStore.listPlans();
    expect(list.length).toBe(inputs.length);
    // Newest first — the second save has the higher updatedAt.
    expect(list[0]?.id).toBe(ids[1]);
  });
});

// =============================================================================
// Fork + diff integration
// =============================================================================

describe('Orchestrator integration — fork + diff', () => {
  it('fork preserves route + stages but resets status/history', async () => {
    const { router, planBuilder, planStore } = await makeStack();
    const route = await router.decide({ kind: 'prompt', text: 'a brief prompt' });
    const lite = await planBuilder.build({ route });
    const source = Workflow.toNkPlan(lite, { now: 1000 });
    await planStore.save(source);

    const fork = Workflow.forkPlan(source, { now: 2000, reason: 'test' });
    await planStore.save(fork);

    expect(fork.parentPlanId).toBe(source.id);
    expect(fork.route).toBe(source.route); // structural share
    expect(fork.stages).toBe(source.stages);
    expect(fork.status).toBe('pending');
    expect(fork.statusHistory).toHaveLength(1);
    expect(fork.statusHistory[0]?.reason).toBe('test');

    const forks = await planStore.listForks(source.id);
    expect(forks).toHaveLength(1);
    expect(forks[0]?.id).toBe(fork.id);
  });

  it('diff between fork and its unmodified source is unchanged=true', async () => {
    const { router, planBuilder } = await makeStack();
    const route = await router.decide({ kind: 'prompt', text: 'hi' });
    const lite = await planBuilder.build({ route });
    const source = Workflow.toNkPlan(lite, { now: 1000 });
    const fork = Workflow.forkPlan(source, { now: 2000 });
    const diff = Workflow.diffPlans(source, fork);
    expect(diff.unchanged).toBe(true);
  });
});

// =============================================================================
// Consistency checker surfaces violations through the plan
// =============================================================================

describe('Orchestrator integration — consistency', () => {
  it('character_lock violation when the same character maps to different assets in one scene', async () => {
    const { router, planBuilder, assetLibrary } = await makeStack({
      registry: {
        version: 1,
        characters: [
          { id: 'alice', canonicalName: 'Alice', aliases: ['Alice'], status: 'confirmed' },
        ],
      },
      manifest: [
        { id: 'alice_casual', type: 'image', path: '/a/casual.png', entityId: 'alice' },
        { id: 'alice_formal', type: 'image', path: '/a/formal.png', entityId: 'alice' },
      ],
    });
    // Seed both shots with different bindings in the same scene group.
    await assetLibrary!.upsertBinding({
      shotId: 'shot_1',
      slot: 'character',
      entityId: 'alice',
      assetId: 'alice_casual',
      provenance: 'user',
      confidence: 1,
      userConfirmed: true,
      sceneGroupId: 'scene_X',
    });

    const route = await router.decide({ kind: 'prompt', text: 'scene' });

    // Build a plan that forces shot_2 → alice_formal by explicit reference
    // (FastProbe matches the name and bindings happen to conflict).
    const plan = await planBuilder.build({
      route,
      shots: [
        {
          id: 'shot_1',
          entityRefs: [{ slot: 'character' as const, name: 'Alice' }],
          sceneGroupId: 'scene_X',
        },
        {
          id: 'shot_2',
          entityRefs: [{ slot: 'character' as const, name: 'Alice' }],
          sceneGroupId: 'scene_X',
        },
      ],
    });
    // Manually force shot_2 to use the different asset via editBinding to
    // exercise the checker's violation path.
    const edited = Workflow.editPlanBinding(
      plan,
      {
        shotId: 'shot_2',
        slot: 'character',
        candidate: {
          slot: 'character',
          entityId: 'alice',
          assetId: 'alice_formal',
          provenance: 'user',
          confidence: 1,
        },
      },
      {
        shots: [
          { id: 'shot_1', sceneGroupId: 'scene_X' },
          { id: 'shot_2', sceneGroupId: 'scene_X' },
        ],
        consistencyChecker: Workflow.createConsistencyChecker(),
      },
    );
    expect(edited.violations).toBeDefined();
    expect(edited.violations!.some((v) => v.kind === 'character_lock')).toBe(true);
    assetLibrary!.dispose();
  });
});
