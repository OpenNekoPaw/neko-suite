import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createResourceFingerprint,
  createResourceRef,
  createResourceVariantKey,
  type ResourceRef,
  type ResourceVariantRequest,
} from '../../../types/resource-cache';
import type { LocalResourceAccessService } from '../local-resource-access';
import {
  JsonResourceCacheManifestStore,
  VSCodeResourceCacheService,
  computeStats,
  resolveResourceCacheQuotaPolicy,
  type ResourceCacheFsOps,
  type ResourceCacheProvider,
  type ResourceEnsureInput,
} from '../resource-cache-service';

vi.mock('vscode', () => ({
  Uri: {
    file: (filePath: string) => ({
      scheme: 'file',
      fsPath: filePath,
      path: filePath,
      toString: () => `file://${filePath}`,
    }),
  },
}));

describe('resource cache service', () => {
  let fsOps: FakeFsOps;
  let localResourceAccess: LocalResourceAccessService;
  let ref: ResourceRef;
  let variant: ResourceVariantRequest;

  beforeEach(() => {
    fsOps = new FakeFsOps();
    localResourceAccess = createLocalResourceAccess();
    ref = createResourceRef({
      scope: 'project',
      provider: 'document-archive',
      kind: 'document',
      source: {
        kind: 'document',
        document: {
          filePath: '${BOOKS}/comic.epub',
          format: 'epub',
          fileId: 'comic-v1',
        },
      },
      locator: {
        kind: 'document',
        locator: { kind: 'chapter', chapterHref: 'OPS/page-1.xhtml', spineIndex: 0 },
        entryPath: 'OPS/page-1.jpg',
      },
      fingerprint: createResourceFingerprint({
        strategy: 'provider',
        value: 'comic-v1:OPS/page-1.jpg',
      }),
    });
    variant = { role: 'thumbnail', width: 256, height: 256, mimeType: 'image/jpeg' };
  });

  it('loads invalid or missing manifests as empty rebuildable cache', async () => {
    const store = new JsonResourceCacheManifestStore({
      manifestPath: '/workspace/.neko/.cache/resources/manifest.json',
      projectRoot: '/workspace',
      fsOps,
      now: () => '2026-06-05T00:00:00.000Z',
    });

    await expect(store.load()).resolves.toEqual({
      version: 1,
      projectRoot: '/workspace',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
      entries: {},
    });

    fsOps.files.set('/workspace/.neko/.cache/resources/manifest.json', 'not json');
    await expect(store.load()).resolves.toMatchObject({ entries: {} });
  });

  it('persists manifests with atomic write semantics', async () => {
    const store = new JsonResourceCacheManifestStore({
      manifestPath: '/workspace/.neko/.cache/resources/manifest.json',
      projectRoot: '/workspace',
      fsOps,
      now: () => '2026-06-05T00:00:00.000Z',
    });

    await store.save({
      version: 1,
      projectRoot: '/workspace',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
      entries: {},
    });

    expect(fsOps.mkdirCalls).toContain('/workspace/.neko/.cache/resources');
    expect(fsOps.writeCalls[0]?.path).toBe('/workspace/.neko/.cache/resources/manifest.json.tmp');
    expect(fsOps.renameCalls[0]).toEqual({
      oldPath: '/workspace/.neko/.cache/resources/manifest.json.tmp',
      newPath: '/workspace/.neko/.cache/resources/manifest.json',
    });
  });

  it('materializes missing variants through a provider and records stats', async () => {
    const provider = createProvider(async (input) => {
      const absolutePath = `${input.cacheRoot}/documents/page-1.jpg`;
      fsOps.files.set(absolutePath, 'image-bytes');
      return {
        status: 'ready',
        ref: input.ref,
        variant: input.variant,
        absolutePath,
        mimeType: 'image/jpeg',
        width: 256,
        height: 256,
        rebuildable: true,
      };
    });
    const service = createService([provider]);

    const result = await service.resolve(ref, variant, { materializeIfMissing: true });

    expect(result.status).toBe('ready');
    expect(result.absolutePath).toBe('/workspace/.neko/.cache/resources/documents/page-1.jpg');
    const stats = await service.stats();
    expect(stats).toMatchObject({
      totalSizeBytes: 'image-bytes'.length,
      entryCount: 1,
      variantCount: 1,
      providerBytes: { 'document-archive': 'image-bytes'.length },
    });
  });

  it('coalesces duplicate ensure calls for the same variant', async () => {
    let calls = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const provider = createProvider(async (input) => {
      calls += 1;
      await gate;
      const absolutePath = `${input.cacheRoot}/documents/page-1.jpg`;
      fsOps.files.set(absolutePath, 'image-bytes');
      return { status: 'ready', ref: input.ref, variant: input.variant, absolutePath };
    });
    const service = createService([provider]);

    const first = service.ensure(ref, variant);
    const second = service.ensure(ref, variant);
    release?.();

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ status: 'ready' }),
      expect.objectContaining({ status: 'ready' }),
    ]);
    expect(calls).toBe(1);
  });

  it('reports unsupported and failed provider states explicitly', async () => {
    const unsupported = await createService([]).ensure(ref, variant);
    expect(unsupported).toMatchObject({
      status: 'unsupported',
      error: 'No provider supports this variant.',
    });

    const provider = createProvider(async () => {
      throw new Error('extract failed');
    });
    const logger = { warn: vi.fn() };
    const service = createService([provider], logger);

    const failed = await service.ensure(ref, variant);

    expect(failed).toMatchObject({ status: 'failed', error: 'extract failed' });
    expect(logger.warn).toHaveBeenCalledWith('Resource cache provider failed', {
      provider: 'document-archive',
      error: 'extract failed',
    });
  });

  it('detects missing disk files and can re-materialize them', async () => {
    const absolutePath = '/workspace/.neko/.cache/resources/documents/page-1.jpg';
    let writes = 0;
    const provider = createProvider(async (input) => {
      writes += 1;
      fsOps.files.set(absolutePath, `image-${writes}`);
      return { status: 'ready', ref: input.ref, variant: input.variant, absolutePath };
    });
    const service = createService([provider]);

    await service.ensure(ref, variant);
    fsOps.files.delete(absolutePath);

    await expect(service.resolve(ref, variant)).resolves.toMatchObject({ status: 'missing' });
    await expect(
      service.resolve(ref, variant, { materializeIfMissing: true }),
    ).resolves.toMatchObject({ status: 'ready', absolutePath });
    expect(writes).toBe(2);
  });

  it('marks ready variants stale when the source fingerprint changes', async () => {
    const absolutePath = '/workspace/.neko/.cache/resources/documents/page-1.jpg';
    let writes = 0;
    const provider = createProvider(async (input) => {
      writes += 1;
      fsOps.files.set(absolutePath, `image-${writes}`);
      return { status: 'ready', ref: input.ref, variant: input.variant, absolutePath };
    });
    const service = createService([provider]);

    await service.ensure(ref, variant);
    const updatedRef: ResourceRef = {
      ...ref,
      fingerprint: createResourceFingerprint({
        strategy: 'provider',
        value: 'comic-v2:OPS/page-1.jpg',
      }),
    };

    await expect(service.resolve(updatedRef, variant)).resolves.toMatchObject({
      status: 'stale',
      error: 'Cached artifact source fingerprint is stale.',
    });
    await expect(
      service.resolve(updatedRef, variant, { materializeIfMissing: true }),
    ).resolves.toMatchObject({
      status: 'ready',
      absolutePath,
    });
    expect(writes).toBe(2);
  });

  it('projects ready resources through local resource access and reports unauthorized paths', async () => {
    const provider = createProvider(async (input) => {
      const absolutePath = `${input.cacheRoot}/documents/page-1.jpg`;
      fsOps.files.set(absolutePath, 'image-bytes');
      return { status: 'ready', ref: input.ref, variant: input.variant, absolutePath };
    });
    const service = createService([provider]);
    const webview = {} as never;

    await expect(service.project(webview, ref, variant)).resolves.toMatchObject({
      status: 'ready',
      uri: 'webview:/workspace/.neko/.cache/resources/documents/page-1.jpg',
    });

    localResourceAccess = createLocalResourceAccess({ unauthorized: true });
    await expect(createService([provider]).project(webview, ref, variant)).resolves.toMatchObject({
      status: 'unauthorized',
      error: 'Local resource path is outside authorized roots.',
    });
  });

  it('invalidates entries and garbage collects rebuildable variants by quota', async () => {
    const oldNow = '2026-06-05T00:00:00.000Z';
    const newNow = '2026-06-05T00:00:01.000Z';
    let now = oldNow;
    const absolutePath = '/workspace/.neko/.cache/resources/documents/page-1.jpg';
    const provider = createProvider(async (input) => {
      fsOps.files.set(absolutePath, 'image-bytes');
      return {
        status: 'ready',
        ref: input.ref,
        variant: input.variant,
        absolutePath,
        sizeBytes: 128,
      };
    });
    const service = createService([provider], undefined, () => now);

    await service.ensure(ref, variant);
    now = newNow;
    await service.invalidate(ref);

    const variantKey = createResourceVariantKey({ resource: ref, ...variant });
    const manifestAfterInvalidate = JSON.parse(
      fsOps.files.get('/workspace/.neko/.cache/resources/manifest.json') ?? '{}',
    );
    expect(manifestAfterInvalidate.entries[ref.id].variants[0]).toMatchObject({
      key: variantKey,
      status: 'stale',
    });

    const gc = await service.gc({ projectMaxBytes: 1 });

    expect(gc).toEqual({
      removedCount: 1,
      removedBytes: 128,
      skippedCount: 0,
      skippedReasons: {},
    });
    expect(fsOps.files.has(absolutePath)).toBe(false);
  });

  it('preserves unsafe paths, pinned entries, and session-active variants during GC', async () => {
    const service = createService([]);
    const oldVariant = { role: 'thumbnail' as const, width: 64, height: 64 };
    const activeVariant = { role: 'preview' as const, width: 128, height: 128 };
    const oldKey = createResourceVariantKey({ resource: ref, ...oldVariant });
    const activeKey = createResourceVariantKey({ resource: ref, ...activeVariant });
    fsOps.files.set('/workspace/.neko/.cache/resources/old.jpg', 'old-cache');
    fsOps.files.set('/workspace/neko/facts.json', 'project-fact');
    fsOps.files.set('/workspace/.neko/.cache/resources/pinned.jpg', 'pinned-cache');
    fsOps.files.set('/workspace/.neko/.cache/resources/active.jpg', 'active-cache');

    await fsOps.writeFile(
      '/workspace/.neko/.cache/resources/manifest.json',
      JSON.stringify({
        version: 1,
        projectRoot: '/workspace',
        createdAt: '2026-06-05T00:00:00.000Z',
        updatedAt: '2026-06-05T00:00:00.000Z',
        entries: {
          [ref.id]: {
            resource: ref,
            status: 'ready',
            createdAt: '2026-06-05T00:00:00.000Z',
            updatedAt: '2026-06-05T00:00:00.000Z',
            variants: [
              {
                key: oldKey,
                role: 'thumbnail',
                status: 'ready',
                absolutePath: '/workspace/.neko/.cache/resources/old.jpg',
                sizeBytes: 128,
                createdAt: '2026-06-05T00:00:00.000Z',
                updatedAt: '2026-06-05T00:00:00.000Z',
                lastAccessedAt: '2026-06-05T00:00:00.000Z',
                rebuildable: true,
              },
              {
                key: 'fact',
                role: 'thumbnail',
                status: 'ready',
                absolutePath: '/workspace/neko/facts.json',
                sizeBytes: 128,
                createdAt: '2026-06-05T00:00:00.000Z',
                updatedAt: '2026-06-05T00:00:00.000Z',
                rebuildable: true,
              },
              {
                key: 'pinned',
                role: 'thumbnail',
                status: 'ready',
                absolutePath: '/workspace/.neko/.cache/resources/pinned.jpg',
                sizeBytes: 128,
                createdAt: '2026-06-05T00:00:00.000Z',
                updatedAt: '2026-06-05T00:00:00.000Z',
                pinned: true,
                rebuildable: true,
              },
              {
                key: activeKey,
                role: 'preview',
                status: 'ready',
                absolutePath: '/workspace/.neko/.cache/resources/active.jpg',
                sizeBytes: 128,
                createdAt: '2026-06-05T00:00:00.000Z',
                updatedAt: '2026-06-05T00:00:00.000Z',
                rebuildable: true,
              },
            ],
          },
        },
      }),
      'utf-8',
    );

    const gc = await service.gc({
      projectMaxBytes: 1,
      activeVariantKeys: [`${ref.id}:${activeKey}`],
    });

    expect(gc).toMatchObject({
      removedCount: 1,
      removedBytes: 128,
      skippedReasons: {
        'unsafe-project-fact': 1,
        pinned: 1,
        'session-active': 1,
      },
    });
    expect(fsOps.files.has('/workspace/.neko/.cache/resources/old.jpg')).toBe(false);
    expect(fsOps.files.has('/workspace/neko/facts.json')).toBe(true);
    expect(fsOps.files.has('/workspace/.neko/.cache/resources/pinned.jpg')).toBe(true);
    expect(fsOps.files.has('/workspace/.neko/.cache/resources/active.jpg')).toBe(true);
  });

  it('reports extension-private refs as non-portable through shared resolution', async () => {
    const service = createService([]);
    const scratchRef: ResourceRef = { ...ref, scope: 'extension-private' };

    await expect(
      service.resolve(scratchRef, variant, { materializeIfMissing: true }),
    ).resolves.toMatchObject({
      status: 'non-portable',
      error: expect.stringContaining('extension-private'),
    });
    await expect(service.project({} as never, scratchRef, variant)).resolves.toMatchObject({
      status: 'non-portable',
      error: expect.stringContaining('portable'),
    });
  });

  it('computes stats from a manifest', () => {
    const manifest = {
      version: 1 as const,
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
      entries: {
        [ref.id]: {
          resource: ref,
          status: 'ready' as const,
          createdAt: '2026-06-05T00:00:00.000Z',
          updatedAt: '2026-06-05T00:00:00.000Z',
          variants: [
            {
              key: 'thumb',
              role: 'thumbnail' as const,
              status: 'missing' as const,
              sizeBytes: 32,
              createdAt: '2026-06-05T00:00:00.000Z',
              updatedAt: '2026-06-05T00:00:00.000Z',
            },
          ],
        },
      },
    };

    expect(computeStats(manifest)).toMatchObject({
      totalSizeBytes: 32,
      entryCount: 1,
      variantCount: 1,
      missingCount: 1,
      scopeBytes: { project: 32 },
      statusCounts: { missing: 1 },
      roleCounts: { thumbnail: 1 },
      scopeEntryCounts: { project: 1 },
      providerEntryCounts: { 'document-archive': 1 },
    });
  });

  it('resolves cache quota policy defaults from settings', () => {
    expect(
      resolveResourceCacheQuotaPolicy(
        {
          projectMaxBytes: 1024,
          globalMaxBytes: 2048,
          minFreeDiskBytes: 512,
        },
        ['res:variant'],
      ),
    ).toEqual({
      projectMaxBytes: 1024,
      globalMaxBytes: 2048,
      minFreeDiskBytes: 512,
      preservePinned: true,
      preserveSessionActive: true,
      activeVariantKeys: ['res:variant'],
    });
  });

  function createService(
    providers: readonly ResourceCacheProvider[],
    logger?: { warn: ReturnType<typeof vi.fn> },
    now: () => string = () => '2026-06-05T00:00:00.000Z',
  ): VSCodeResourceCacheService {
    return new VSCodeResourceCacheService({
      cacheRoot: '/workspace/.neko/.cache/resources',
      manifestPath: '/workspace/.neko/.cache/resources/manifest.json',
      projectRoot: '/workspace',
      globalRoot: '/Users/feng/.neko',
      extensionPrivateRoot:
        '/Users/feng/Library/Application Support/Code/User/globalStorage/neko.neko-agent',
      localResourceAccess,
      providers,
      fsOps,
      now,
      logger,
      maxConcurrentEnsures: 1,
    });
  }
});

function createProvider(
  ensure: (
    input: ResourceEnsureInput,
  ) => Promise<ReturnType<ResourceCacheProvider['ensure']> extends Promise<infer T> ? T : never>,
): ResourceCacheProvider {
  return {
    id: 'document-archive',
    supports: (resource, request) =>
      resource.provider === 'document-archive' && request.role === 'thumbnail',
    ensure,
  };
}

function createLocalResourceAccess(
  options: { unauthorized?: boolean } = {},
): LocalResourceAccessService {
  return {
    getLocalResourceRoots: async () => [],
    configureWebview: async () => undefined,
    isAuthorizedPath: async () => !options.unauthorized,
    toWebviewUri: async (_webview, source) =>
      options.unauthorized
        ? {
            ok: false,
            reason: 'unauthorized',
            source,
            message: 'Local resource path is outside authorized roots.',
          }
        : {
            ok: true,
            kind: 'local',
            source,
            uri: `webview:${source}`,
          },
    createSyncProjector: () => () => undefined,
  };
}

class FakeFsOps implements ResourceCacheFsOps {
  readonly files = new Map<string, string>();
  readonly mkdirCalls: string[] = [];
  readonly writeCalls: Array<{ path: string; content: string }> = [];
  readonly renameCalls: Array<{ oldPath: string; newPath: string }> = [];
  readonly rmCalls: string[] = [];

  async readFile(filePath: string): Promise<string> {
    const value = this.files.get(filePath);
    if (value === undefined) {
      throw new Error(`ENOENT: ${filePath}`);
    }
    return value;
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    this.writeCalls.push({ path: filePath, content });
    this.files.set(filePath, content);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    this.renameCalls.push({ oldPath, newPath });
    const value = this.files.get(oldPath);
    if (value === undefined) {
      throw new Error(`ENOENT: ${oldPath}`);
    }
    this.files.delete(oldPath);
    this.files.set(newPath, value);
  }

  async mkdir(filePath: string): Promise<void> {
    this.mkdirCalls.push(filePath);
  }

  async stat(filePath: string): Promise<{ readonly size: number }> {
    const value = this.files.get(filePath);
    if (value === undefined) {
      throw new Error(`ENOENT: ${filePath}`);
    }
    return { size: value.length };
  }

  async rm(filePath: string): Promise<void> {
    this.rmCalls.push(filePath);
    this.files.delete(filePath);
  }
}
