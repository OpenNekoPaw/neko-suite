import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CacheManager } from './cache-manager';

const testDir = join(tmpdir(), 'neko-market-cache-test');
const cacheDir = join(testDir, 'cache');
const sourceFile = join(testDir, 'source.tar.gz');

beforeEach(async () => {
  await rm(testDir, { recursive: true, force: true });
  await mkdir(testDir, { recursive: true });
  await writeFile(sourceFile, 'test-content', 'utf-8');
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe('CacheManager', () => {
  it('should return undefined for uncached package', async () => {
    const cache = new CacheManager(cacheDir);
    expect(await cache.getCachedPath('@test/pkg', '1.0.0')).toBeUndefined();
  });

  it('should cache and retrieve a file', async () => {
    const cache = new CacheManager(cacheDir);
    const path = await cache.cacheFile('@test/pkg', '1.0.0', sourceFile);
    expect(path).toContain('test__pkg');
    expect(path).toContain('1.0.0.tar.gz');

    const retrieved = await cache.getCachedPath('@test/pkg', '1.0.0');
    expect(retrieved).toBe(path);
  });

  it('should evict a specific version', async () => {
    const cache = new CacheManager(cacheDir);
    await cache.cacheFile('@test/pkg', '1.0.0', sourceFile);
    await cache.evict('@test/pkg', '1.0.0');
    expect(await cache.getCachedPath('@test/pkg', '1.0.0')).toBeUndefined();
  });

  it('should evict all versions of a package', async () => {
    const cache = new CacheManager(cacheDir);
    await cache.cacheFile('@test/pkg', '1.0.0', sourceFile);
    await cache.cacheFile('@test/pkg', '2.0.0', sourceFile);
    await cache.evict('@test/pkg');
    expect(await cache.getCachedPath('@test/pkg', '1.0.0')).toBeUndefined();
    expect(await cache.getCachedPath('@test/pkg', '2.0.0')).toBeUndefined();
  });

  it('should compute cache size', async () => {
    const cache = new CacheManager(cacheDir);
    await cache.cacheFile('@test/pkg', '1.0.0', sourceFile);
    const size = await cache.getSize();
    expect(size).toBeGreaterThan(0);
  });

  it('should return 0 for empty cache', async () => {
    const cache = new CacheManager(join(testDir, 'nonexistent'));
    expect(await cache.getSize()).toBe(0);
  });
});
