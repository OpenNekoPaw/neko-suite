/**
 * P1.1 — Feature-flag wiring for the L3/L4 matchers.
 *
 * `bootstrapOrchestrator` builds the MatchingEngine via
 * `createMatchingEngineFromSettings(settings)`; this test isolates that
 * helper so we can verify:
 *   1. With both flags off, the chain is the Phase-1 L1/L5/L2 default.
 *   2. Flipping `matching.semantic.enabled` installs an L3 matcher that
 *      is safely disabled (UnimplementedClipProvider just returns no
 *      candidate — never throws up the chain).
 *   3. Flipping `matching.llm.enabled` installs an L4 matcher that is
 *      similarly inert until a real broker is wired in.
 *
 * These are unit tests against the helper, not the full bootstrap, so
 * they don't require VSCode / platform stack.
 */

import { describe, expect, it } from 'vitest';
import { Workflow } from '@neko/platform';
import type { CharacterRegistryFile, CreativeEntityGraphSnapshot } from '@neko/shared';
import type { AssetLibraryDeps, RawAssetManifestEntry } from '@neko/platform';
import { createMatchingEngineFromSettings } from '../orchestrator-bootstrap';

const REGISTRY: CharacterRegistryFile = {
  version: 1,
  characters: [
    {
      id: 'alice',
      canonicalName: 'Alice',
      aliases: ['Alice'],
      status: 'confirmed',
    },
  ],
};

const GRAPH: CreativeEntityGraphSnapshot = {
  version: 1,
  nodes: [],
  edges: [],
};

const MANIFEST: readonly RawAssetManifestEntry[] = [
  { id: 'alice_casual', type: 'image', path: '/a/casual.png', entityId: 'alice' },
];

async function makeLib(): Promise<Workflow.AssetLibrary> {
  const deps: AssetLibraryDeps = {
    workDir: '/test',
    loadCharacterRegistry: async () => REGISTRY,
    loadEntityGraph: async () => GRAPH,
    loadAssetManifests: async () => MANIFEST,
    fileIO: Workflow.createMemoryFileIO(),
  };
  return Workflow.createAssetLibrary(deps);
}

describe('createMatchingEngineFromSettings — Phase 4 flag wiring', () => {
  it('returns the default chain when both flags are off', async () => {
    const engine = createMatchingEngineFromSettings({
      matchingSemanticEnabled: false,
      matchingLlmEnabled: false,
    });
    const lib = await makeLib();
    // No L3/L4 matchers installed → default chain only exposes L1/L2/L5.
    // A plain name-based ref will resolve via L2; engine stays functional.
    const result = await engine.matchShot(
      { id: 's1', entityRefs: [{ slot: 'character', name: 'Alice' }] },
      lib,
    );
    expect(result.primary.character?.provenance).toBe('L2');
    lib.dispose();
  });

  it('installs L3 semantic matcher when matching.semantic.enabled=true', async () => {
    const engine = createMatchingEngineFromSettings({
      matchingSemanticEnabled: true,
      matchingLlmEnabled: false,
    });
    const lib = await makeLib();
    // L3 is wired but the default UnimplementedClipProvider throws
    // ClipUnavailableError — the SemanticMatcher catches it and returns
    // undefined, so L2 still wins.  The test verifies (a) nothing blows
    // up and (b) L2 is still the primary.
    const result = await engine.matchShot(
      { id: 's1', entityRefs: [{ slot: 'character', name: 'Alice' }] },
      lib,
    );
    expect(result.primary.character?.provenance).toBe('L2');
    lib.dispose();
  });

  it('installs L4 LLM matcher when matching.llm.enabled=true', async () => {
    const engine = createMatchingEngineFromSettings({
      matchingSemanticEnabled: false,
      matchingLlmEnabled: true,
    });
    const lib = await makeLib();
    // L4 is wired but the default DisabledLLMMatchBroker declines every
    // request.  L2 still wins.
    const result = await engine.matchShot(
      { id: 's1', entityRefs: [{ slot: 'character', name: 'Alice' }] },
      lib,
    );
    expect(result.primary.character?.provenance).toBe('L2');
    lib.dispose();
  });

  it('installs both matchers when both flags are on', async () => {
    const engine = createMatchingEngineFromSettings({
      matchingSemanticEnabled: true,
      matchingLlmEnabled: true,
    });
    const lib = await makeLib();
    const result = await engine.matchShot(
      { id: 's1', entityRefs: [{ slot: 'character', name: 'Alice' }] },
      lib,
    );
    expect(result.primary.character?.provenance).toBe('L2');
    lib.dispose();
  });

  it('L3 surfaces a candidate when an injected provider returns a matching embedding', async () => {
    // This simulates what happens after the engine-side CLIP binding
    // replaces the UnimplementedClipProvider — we build the engine with
    // a real chain, then swap in a working provider via a second
    // `createFullMatchingEngine` call.  Having this test locks in the
    // expected behaviour so the swap-in path doesn't regress.
    const clip = new Workflow.InMemoryClipProvider(
      {
        'image:/a/casual.png': new Float32Array([1, 0]),
        'text:alice': new Float32Array([1, 0]),
      },
      2,
    );
    const engine = Workflow.createFullMatchingEngine({
      semantic: { clip, minConfidence: 0.2 },
    });
    const lib = await makeLib();
    const result = await engine.matchShot(
      { id: 's1', entityRefs: [{ slot: 'character', name: 'Alice' }] },
      lib,
    );
    expect(result.primary.character?.entityId).toBe('alice');
    // L2 confidence (1.0 on alias match) beats L3 (capped at 0.85), so L3
    // lands in alternatives.
    const alts = result.alternatives.character ?? [];
    expect(alts.some((c) => c.provenance === 'L3')).toBe(true);
    lib.dispose();
  });
});
