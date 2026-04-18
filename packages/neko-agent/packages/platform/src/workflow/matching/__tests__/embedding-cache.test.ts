import { describe, expect, it } from 'vitest';
import { InMemoryEmbeddingCache } from '../embedding-cache';

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
