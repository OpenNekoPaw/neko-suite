import { describe, expect, it } from 'vitest';
import type { CharacterRegistryFile, CreativeEntityGraphSnapshot } from '@neko/shared';
import { createAssetLibrary, createMemoryFileIO } from '../../asset-library';
import type { AssetLibraryDeps, RawAssetManifestEntry } from '../../asset-library/types';
import { InMemoryClipProvider, UnimplementedClipProvider } from '../clip-provider';
import { InMemoryEmbeddingCache } from '../embedding-cache';
import { createSemanticMatcher } from '../semantic-matcher';
import { createFullMatchingEngine } from '../index';
import type { Shot } from '../types';

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
  {
    id: 'alice_casual',
    type: 'image',
    path: '/assets/alice_casual.png',
    entityId: 'alice',
  },
  {
    id: 'alice_formal',
    type: 'image',
    path: '/assets/alice_formal.png',
    entityId: 'alice',
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

describe('SemanticMatcher (L3)', () => {
  it('skips silently when the provider is unimplemented', async () => {
    const lib = await makeLib();
    const matcher = createSemanticMatcher({ clip: new UnimplementedClipProvider() });
    const result = await matcher.match(
      { slot: 'character', entityId: 'alice' },
      { id: 's1', scriptLine: 'Alice in a red dress' },
      lib,
      {},
    );
    expect(result).toBeUndefined();
    lib.dispose();
  });

  it('returns undefined when no ref text or entity', async () => {
    const lib = await makeLib();
    const matcher = createSemanticMatcher({ clip: new InMemoryClipProvider({}, 2) });
    const result = await matcher.match({ slot: 'character' }, { id: 's1' }, lib, {});
    expect(result).toBeUndefined();
    lib.dispose();
  });

  it('picks the higher-scoring asset by cosine similarity', async () => {
    const casual = new Float32Array([1, 0]);
    const formal = new Float32Array([0, 1]);
    const queryText = new Float32Array([0, 1]); // aligned with formal

    const clip = new InMemoryClipProvider(
      {
        'image:/assets/alice_casual.png': casual,
        'image:/assets/alice_formal.png': formal,
        'text:alice formal portrait': queryText,
      },
      2,
    );

    const lib = await makeLib();
    const matcher = createSemanticMatcher({ clip, minConfidence: 0.2 });
    const result = await matcher.match(
      { slot: 'character', entityId: 'alice', name: 'Alice', variant: 'formal' },
      { id: 's1', scriptLine: 'portrait' },
      lib,
      {},
    );
    expect(result?.assetId).toBe('alice_formal');
    expect(result?.provenance).toBe('L3');
    expect(result?.confidence).toBeGreaterThan(0.5);
    lib.dispose();
  });

  it('respects minConfidence threshold (no candidate when below)', async () => {
    // Vectors are nearly orthogonal — cosine → ~0 → confidence ≈ 0.5
    const casual = new Float32Array([1, 0]);
    const queryText = new Float32Array([0, 1]);
    const clip = new InMemoryClipProvider(
      {
        'image:/assets/alice_casual.png': casual,
        'image:/assets/alice_formal.png': casual,
        'text:alice': queryText,
      },
      2,
    );
    const lib = await makeLib();
    const matcher = createSemanticMatcher({ clip, minConfidence: 0.9 });
    const result = await matcher.match(
      { slot: 'character', entityId: 'alice', name: 'Alice' },
      { id: 's1' },
      lib,
      {},
    );
    expect(result).toBeUndefined();
    lib.dispose();
  });

  it('caches image embeddings on second call', async () => {
    let imageCalls = 0;
    const vec = new Float32Array([1, 0]);
    const provider = {
      embeddingDim: 2,
      encodeImage: async (_: string) => {
        imageCalls += 1;
        return vec;
      },
      encodeText: async (_: string) => vec,
    };
    const cache = new InMemoryEmbeddingCache();
    const lib = await makeLib();
    const matcher = createSemanticMatcher({ clip: provider, cache, minConfidence: 0.2 });

    await matcher.match(
      { slot: 'character', entityId: 'alice', name: 'Alice' },
      { id: 's1' },
      lib,
      {},
    );
    await matcher.match(
      { slot: 'character', entityId: 'alice', name: 'Alice' },
      { id: 's2' },
      lib,
      {},
    );
    // 2 assets × 1 call each on first pass; cache hit on second
    expect(imageCalls).toBe(2);
    expect(await cache.size()).toBe(2);
    lib.dispose();
  });
});

describe('createFullMatchingEngine', () => {
  it('returns Phase-1 chain when no semantic/llm options given', async () => {
    const lib = await makeLib();
    const engine = createFullMatchingEngine();
    const shot: Shot = { id: 's1', scriptLine: '@character:alice walks' };
    const bindings = await engine.matchShot(shot, lib);
    expect(bindings.primary.character?.provenance).toBe('L1');
    lib.dispose();
  });

  it('wires semantic matcher into the chain when provided', async () => {
    const clip = new InMemoryClipProvider(
      {
        'image:/assets/alice_casual.png': new Float32Array([1, 0]),
        'image:/assets/alice_formal.png': new Float32Array([0, 1]),
        'text:alice': new Float32Array([0, 1]),
      },
      2,
    );
    const lib = await makeLib();
    const engine = createFullMatchingEngine({
      semantic: { clip, minConfidence: 0.2 },
    });
    const bindings = await engine.matchShot(
      { id: 's1', entityRefs: [{ slot: 'character', name: 'Alice' }] },
      lib,
    );
    // Primary stays L2 (exact alias wins on confidence 1.0) but L3 surfaces as
    // an alternative so the UI can present the semantic match as a swap option.
    expect(bindings.primary.character?.entityId).toBe('alice');
    const alts = bindings.alternatives.character ?? [];
    expect(alts.some((c) => c.provenance === 'L3')).toBe(true);
    lib.dispose();
  });
});
