import { describe, expect, it, vi } from 'vitest';
import {
  createResourceFingerprint,
  createResourceRef,
  type ResourceRef,
} from '../../../types/resource-cache';
import { LegacyResourceCacheProvider } from '../legacy-resource-cache-provider';

describe('LegacyResourceCacheProvider', () => {
  it('copies legacy cache paths into the unified project resource cache', async () => {
    const fsOps = createFsOps({ '/agent-cache/page-1.jpg': 128 });
    const provider = new LegacyResourceCacheProvider({ fsOps });
    const ref = createRef('/agent-cache/page-1.jpg');

    const result = await provider.ensure({
      ref,
      variant: { role: 'document-entry', mimeType: 'image/jpeg' },
      cacheRoot: '/workspace/.neko/.cache/resources',
    });

    expect(result).toMatchObject({
      status: 'ready',
      absolutePath: expect.stringContaining('/workspace/.neko/.cache/resources/legacy/'),
      relativePath: expect.stringMatching(/^legacy\/document-archive\/res_.+\/page-1\.jpg$/),
      sizeBytes: 128,
      rebuildable: true,
    });
    expect(fsOps.copyFile).toHaveBeenCalledWith(
      '/agent-cache/page-1.jpg',
      expect.stringContaining('/workspace/.neko/.cache/resources/legacy/'),
    );
  });

  it('reports missing when the legacy file no longer exists', async () => {
    const provider = new LegacyResourceCacheProvider({ fsOps: createFsOps({}) });

    await expect(
      provider.ensure({
        ref: createRef('/agent-cache/missing.jpg'),
        variant: { role: 'document-entry' },
        cacheRoot: '/workspace/.neko/.cache/resources',
      }),
    ).resolves.toMatchObject({ status: 'missing' });
  });
});

function createRef(legacyCachePath: string): ResourceRef {
  return createResourceRef({
    scope: 'project',
    provider: 'document-archive',
    kind: 'document',
    source: {
      kind: 'document',
      document: { filePath: '/books/comic.epub', format: 'epub' },
      filePath: '/books/comic.epub',
      metadata: { legacyCachePath },
    },
    locator: { kind: 'document', entryPath: 'OPS/page-1.jpg' },
    fingerprint: createResourceFingerprint({
      strategy: 'provider',
      value: 'comic:OPS/page-1.jpg',
      providerId: 'document-archive',
    }),
  });
}

function createFsOps(files: Record<string, number>) {
  const sizes = new Map(Object.entries(files));
  return {
    copyFile: vi.fn(async (source: string, target: string) => {
      const size = sizes.get(source);
      if (size === undefined) throw new Error(`ENOENT: ${source}`);
      sizes.set(target, size);
    }),
    mkdir: vi.fn(async () => undefined),
    stat: vi.fn(async (filePath: string) => {
      const size = sizes.get(filePath);
      if (size === undefined) throw new Error(`ENOENT: ${filePath}`);
      return { size };
    }),
  };
}
