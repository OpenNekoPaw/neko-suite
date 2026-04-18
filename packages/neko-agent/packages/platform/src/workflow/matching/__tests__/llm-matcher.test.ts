import { describe, expect, it, vi } from 'vitest';
import type { CharacterRegistryFile, CreativeEntityGraphSnapshot } from '@neko/shared';
import { createAssetLibrary, createMemoryFileIO } from '../../asset-library';
import type { AssetLibraryDeps, RawAssetManifestEntry } from '../../asset-library/types';
import { createLLMMatcher, DisabledLLMMatchBroker, type LLMMatchBroker } from '../llm-matcher';

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
  { id: 'alice_formal', type: 'image', path: '/a/formal.png', entityId: 'alice' },
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

describe('LLMMatcher (L4)', () => {
  it('returns undefined when broker declines', async () => {
    const lib = await makeLib();
    const matcher = createLLMMatcher({ broker: DisabledLLMMatchBroker });
    const result = await matcher.match(
      { slot: 'character', entityId: 'alice', name: 'Alice' },
      { id: 's1' },
      lib,
      {},
    );
    expect(result).toBeUndefined();
    lib.dispose();
  });

  it('emits a candidate when broker returns a known assetId', async () => {
    const broker: LLMMatchBroker = {
      choose: async () => ({ assetId: 'alice_formal', confidence: 0.7, reason: 'fits' }),
    };
    const lib = await makeLib();
    const matcher = createLLMMatcher({ broker });
    const result = await matcher.match(
      { slot: 'character', entityId: 'alice', name: 'Alice' },
      { id: 's1' },
      lib,
      {},
    );
    expect(result?.assetId).toBe('alice_formal');
    expect(result?.provenance).toBe('L4');
    expect(result?.confidence).toBeCloseTo(0.7, 5);
    expect(result?.reason).toBe('fits');
    lib.dispose();
  });

  it('skips when broker returns an unknown assetId', async () => {
    const logs: unknown[] = [];
    const broker: LLMMatchBroker = {
      choose: async () => ({ assetId: 'not_in_library', confidence: 0.9 }),
    };
    const lib = await makeLib();
    const matcher = createLLMMatcher({
      broker,
      logger: { warn: (...args: unknown[]) => logs.push(args) },
    });
    const result = await matcher.match(
      { slot: 'character', entityId: 'alice', name: 'Alice' },
      { id: 's1' },
      lib,
      {},
    );
    expect(result).toBeUndefined();
    expect(logs.length).toBe(1);
    lib.dispose();
  });

  it('skips below minConfidence', async () => {
    const broker: LLMMatchBroker = {
      choose: async () => ({ assetId: 'alice_casual', confidence: 0.2 }),
    };
    const lib = await makeLib();
    const matcher = createLLMMatcher({ broker, minConfidence: 0.5 });
    const result = await matcher.match(
      { slot: 'character', entityId: 'alice', name: 'Alice' },
      { id: 's1' },
      lib,
      {},
    );
    expect(result).toBeUndefined();
    lib.dispose();
  });

  it('clamps confidence to [0,1]', async () => {
    const broker: LLMMatchBroker = {
      choose: async () => ({ assetId: 'alice_casual', confidence: 2.5 }),
    };
    const lib = await makeLib();
    const matcher = createLLMMatcher({ broker });
    const result = await matcher.match(
      { slot: 'character', entityId: 'alice', name: 'Alice' },
      { id: 's1' },
      lib,
      {},
    );
    expect(result?.confidence).toBe(1);
    lib.dispose();
  });

  it('passes budgetMs + candidates to broker', async () => {
    const spy = vi.fn().mockResolvedValue({ assetId: 'alice_casual', confidence: 0.8 });
    const broker: LLMMatchBroker = { choose: spy as unknown as LLMMatchBroker['choose'] };
    const lib = await makeLib();
    const matcher = createLLMMatcher({ broker, budgetMs: 1234, maxCandidates: 5 });
    await matcher.match(
      { slot: 'character', entityId: 'alice', name: 'Alice' },
      { id: 's1' },
      lib,
      {},
    );
    const req = spy.mock.calls[0]?.[0] as { budgetMs: number; candidates: { id: string }[] };
    expect(req.budgetMs).toBe(1234);
    expect(req.candidates.length).toBe(2);
    expect(req.candidates[0]?.id).toBe('alice_casual');
    lib.dispose();
  });

  it('swallows broker errors and skips gracefully', async () => {
    const logs: unknown[] = [];
    const broker: LLMMatchBroker = {
      choose: async () => {
        throw new Error('network down');
      },
    };
    const lib = await makeLib();
    const matcher = createLLMMatcher({
      broker,
      logger: { warn: (...args: unknown[]) => logs.push(args) },
    });
    const result = await matcher.match(
      { slot: 'character', entityId: 'alice', name: 'Alice' },
      { id: 's1' },
      lib,
      {},
    );
    expect(result).toBeUndefined();
    expect(logs.length).toBe(1);
    lib.dispose();
  });
});
