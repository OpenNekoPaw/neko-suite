import { describe, expect, it } from 'vitest';
import { InMemoryEmbeddingCache, NodeEmbeddingCache } from '../embedding-cache';
import { createMemoryFileIO } from '../../asset-library';

describe('InMemoryEmbeddingCache', () => {
  it('round-trips put/get', async () => {
    const cache = new InMemoryEmbeddingCache();
    const v = new Float32Array([1, 2, 3]);
    await cache.put('k1', v);
    expect(await cache.get('k1')).toBe(v);
  });

  it('returns undefined on miss', async () => {
    const cache = new InMemoryEmbeddingCache();
    expect(await cache.get('nope')).toBeUndefined();
  });

  it('delete removes entries', async () => {
    const cache = new InMemoryEmbeddingCache();
    await cache.put('k', new Float32Array([1]));
    await cache.delete('k');
    expect(await cache.get('k')).toBeUndefined();
  });

  it('clear drops everything', async () => {
    const cache = new InMemoryEmbeddingCache();
    await cache.put('a', new Float32Array([1]));
    await cache.put('b', new Float32Array([2]));
    await cache.clear();
    expect(await cache.size()).toBe(0);
  });

  it('evicts oldest when above maxEntries', async () => {
    const cache = new InMemoryEmbeddingCache({ maxEntries: 2 });
    await cache.put('a', new Float32Array([1]));
    await cache.put('b', new Float32Array([2]));
    await cache.put('c', new Float32Array([3]));
    expect(await cache.size()).toBe(2);
    expect(await cache.get('a')).toBeUndefined();
    expect(await cache.get('b')).toBeDefined();
    expect(await cache.get('c')).toBeDefined();
  });

  it('does not evict when replacing an existing key', async () => {
    const cache = new InMemoryEmbeddingCache({ maxEntries: 2 });
    await cache.put('a', new Float32Array([1]));
    await cache.put('b', new Float32Array([2]));
    await cache.put('a', new Float32Array([9]));
    expect(await cache.size()).toBe(2);
    expect(await cache.get('a')).toEqual(new Float32Array([9]));
    expect(await cache.get('b')).toEqual(new Float32Array([2]));
  });
});

describe('NodeEmbeddingCache', () => {
  const PATH = '/test-workspace/.neko/.cache/embeddings.json';

  it('persists a put and reloads it through a fresh instance', async () => {
    const io = createMemoryFileIO();
    const first = new NodeEmbeddingCache({ filePath: PATH, fileIO: io });
    await first.put('alice', new Float32Array([0.1, 0.2, 0.3]));

    const second = new NodeEmbeddingCache({ filePath: PATH, fileIO: io });
    const hit = await second.get('alice');
    expect(hit).toBeInstanceOf(Float32Array);
    expect(hit?.length).toBe(3);
    expect(Array.from(hit!)).toEqual([
      expect.closeTo(0.1, 5),
      expect.closeTo(0.2, 5),
      expect.closeTo(0.3, 5),
    ]);
  });

  it('returns undefined on miss + empty file', async () => {
    const io = createMemoryFileIO();
    const cache = new NodeEmbeddingCache({ filePath: PATH, fileIO: io });
    expect(await cache.get('nope')).toBeUndefined();
    expect(await cache.size()).toBe(0);
  });

  it('rejects puts with inconsistent dim', async () => {
    const io = createMemoryFileIO();
    const cache = new NodeEmbeddingCache({ filePath: PATH, fileIO: io });
    await cache.put('a', new Float32Array([1, 2]));
    await expect(cache.put('b', new Float32Array([1, 2, 3]))).rejects.toThrow(/dim/);
  });

  it('evicts oldest entry when maxEntries is exceeded', async () => {
    const io = createMemoryFileIO();
    const cache = new NodeEmbeddingCache({ filePath: PATH, fileIO: io, maxEntries: 2 });
    await cache.put('a', new Float32Array([1, 0]));
    await cache.put('b', new Float32Array([0, 1]));
    await cache.put('c', new Float32Array([1, 1]));
    expect(await cache.size()).toBe(2);
    expect(await cache.get('a')).toBeUndefined();
    expect(await cache.get('b')).toBeDefined();
    expect(await cache.get('c')).toBeDefined();
  });

  it('delete persists to disk', async () => {
    const io = createMemoryFileIO();
    const first = new NodeEmbeddingCache({ filePath: PATH, fileIO: io });
    await first.put('a', new Float32Array([1]));
    await first.delete('a');

    const second = new NodeEmbeddingCache({ filePath: PATH, fileIO: io });
    expect(await second.get('a')).toBeUndefined();
    expect(await second.size()).toBe(0);
  });

  it('clear wipes the file body', async () => {
    const io = createMemoryFileIO();
    const first = new NodeEmbeddingCache({ filePath: PATH, fileIO: io });
    await first.put('a', new Float32Array([1]));
    await first.put('b', new Float32Array([2]));
    await first.clear();

    const second = new NodeEmbeddingCache({ filePath: PATH, fileIO: io });
    expect(await second.size()).toBe(0);
  });

  it('survives a corrupt index file by rehydrating fresh', async () => {
    const io = createMemoryFileIO();
    await io.write(PATH, '{ not-json');
    const cache = new NodeEmbeddingCache({ filePath: PATH, fileIO: io });
    expect(await cache.size()).toBe(0);
    await cache.put('x', new Float32Array([9, 9, 9]));
    expect(await cache.get('x')).toBeDefined();
  });

  it('moves recently-touched keys to the LRU end without a flush', async () => {
    const io = createMemoryFileIO();
    const now = (() => {
      let t = 1_000;
      return () => ++t;
    })();
    const cache = new NodeEmbeddingCache({ filePath: PATH, fileIO: io, maxEntries: 3, now });
    await cache.put('a', new Float32Array([1]));
    await cache.put('b', new Float32Array([2]));
    await cache.put('c', new Float32Array([3]));
    // Touch 'a' so the next overflow should evict 'b', not 'a'.
    await cache.get('a');
    await cache.put('d', new Float32Array([4]));
    expect(await cache.get('b')).toBeUndefined();
    expect(await cache.get('a')).toBeDefined();
    expect(await cache.get('c')).toBeDefined();
    expect(await cache.get('d')).toBeDefined();
  });

  it('rejects puts that disagree with the expectedDim option', async () => {
    const io = createMemoryFileIO();
    const cache = new NodeEmbeddingCache({ filePath: PATH, fileIO: io, dim: 4 });
    // ensureLoaded() pins dim from expectedDim, so the eventual error is the
    // pinned-dim variant; either message phrasing is acceptable as long as
    // the dim mismatch is surfaced.
    await expect(cache.put('a', new Float32Array([1, 2]))).rejects.toThrow(/dim/);
  });

  it('flushPending writes LRU order without a mutation', async () => {
    const io = createMemoryFileIO();
    const now = (() => {
      let t = 1_000;
      return () => ++t;
    })();
    const first = new NodeEmbeddingCache({ filePath: PATH, fileIO: io, now });
    await first.put('a', new Float32Array([1]));
    await first.put('b', new Float32Array([2]));
    // Just reads — wouldn't normally flush.
    await first.get('a');
    await first.flushPending();

    // Persisted doc now records 'a' as most recently used.
    const raw = await io.read(PATH);
    const parsed = JSON.parse(raw!) as {
      entries: { key: string; lastUsed: number }[];
    };
    const tByKey = Object.fromEntries(parsed.entries.map((e) => [e.key, e.lastUsed]));
    expect(tByKey['a']).toBeGreaterThan(tByKey['b']!);
  });
});
