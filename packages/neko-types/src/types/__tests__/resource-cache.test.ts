import { describe, expect, it } from 'vitest';
import {
  asProjectCachePath,
  asProjectFactPath,
  createResourceFingerprint,
  createResourceRef,
  createResourceRefId,
  createResourceVariantKey,
  getResourcePathCategory,
  isManagedCachePathCategory,
  isProjectCachePath,
  isProjectFactPath,
  isResourceCacheManifest,
  isResourceCacheStatus,
  isResourceKind,
  isResourceRef,
  isResourceScope,
  isResourceVariantRef,
  isResourceVariantRole,
  type ResourceCacheManifest,
  type ResourceRef,
  type ResourceVariantRef,
} from '../resource-cache';
import { migrateStorageLayout, resolveStorageLayout, type MigrateFsOps } from '../storage';

describe('resource cache contracts', () => {
  const source = {
    kind: 'document' as const,
    document: {
      filePath: '${BOOKS}/comic.epub',
      format: 'epub' as const,
      fileId: 'comic-v1',
    },
    identity: { fileId: 'comic-v1', sizeBytes: 1024, mtimeMs: 42 },
  };

  const locator = {
    kind: 'document' as const,
    locator: { kind: 'chapter' as const, chapterHref: 'OPS/page-1.xhtml', spineIndex: 0 },
    entryPath: 'OPS/page-1.jpg',
  };

  it('validates enum-like resource cache fields', () => {
    expect(isResourceScope('project')).toBe(true);
    expect(isResourceScope('workspace')).toBe(false);
    expect(isResourceKind('storyboard-reference')).toBe(true);
    expect(isResourceKind('asset')).toBe(false);
    expect(isResourceVariantRole('thumbnail')).toBe(true);
    expect(isResourceVariantRole('poster')).toBe(false);
    expect(isResourceCacheStatus('materializing')).toBe(true);
    expect(isResourceCacheStatus('pending')).toBe(false);
  });

  it('creates deterministic resource ids from source locator and fingerprint', () => {
    const fingerprint = createResourceFingerprint({
      strategy: 'mtime-size',
      source: source.identity,
    });
    const input = {
      scope: 'project' as const,
      provider: 'document-archive',
      kind: 'document' as const,
      source,
      locator,
      fingerprint,
    };

    expect(createResourceRefId(input)).toBe(createResourceRefId({ ...input }));

    const ref = createResourceRef(input);
    const sameRef = createResourceRef({ ...input });
    expect(ref.id).toBe(sameRef.id);
    expect(isResourceRef(ref)).toBe(true);
    expect(
      isResourceRef({
        ...ref,
        locator: { kind: 'document', locator: { kind: 'bad' } },
      }),
    ).toBe(false);
  });

  it('creates deterministic variant keys and validates variants', () => {
    const resource: ResourceRef = createResourceRef({
      scope: 'project',
      provider: 'document-archive',
      kind: 'document',
      source,
      locator,
      fingerprint: createResourceFingerprint({ strategy: 'provider', value: 'doc-entry-v1' }),
    });
    const variant: ResourceVariantRef = {
      resource,
      role: 'thumbnail',
      format: 'jpg',
      mimeType: 'image/jpeg',
      width: 256,
      height: 256,
    };

    expect(createResourceVariantKey(variant)).toBe(createResourceVariantKey({ ...variant }));
    expect(createResourceVariantKey({ role: 'thumbnail', width: 256, height: 256 })).toBe(
      createResourceVariantKey({ height: 256, role: 'thumbnail', width: 256 }),
    );
    expect(isResourceVariantRef(variant)).toBe(true);
    expect(isResourceVariantRef({ ...variant, role: 'poster' })).toBe(false);
  });

  it('validates cache manifests with mapping and freshness metadata', () => {
    const resource = createResourceRef({
      scope: 'project',
      provider: 'document-archive',
      kind: 'document',
      source,
      locator,
      fingerprint: createResourceFingerprint({ strategy: 'provider', value: 'doc-entry-v1' }),
    });
    const now = '2026-06-05T00:00:00.000Z';
    const manifest: ResourceCacheManifest = {
      version: 1,
      projectRoot: '/workspace',
      createdAt: now,
      updatedAt: now,
      entries: {
        [resource.id]: {
          resource,
          status: 'ready',
          createdAt: now,
          updatedAt: now,
          variants: [
            {
              key: createResourceVariantKey({ resource, role: 'thumbnail', width: 256 }),
              role: 'thumbnail',
              status: 'ready',
              relativePath: 'documents/res/page-1.jpg',
              mimeType: 'image/jpeg',
              sizeBytes: 2048,
              createdAt: now,
              updatedAt: now,
              sourceFingerprint: resource.fingerprint,
              rebuildable: true,
            },
          ],
        },
      },
      stats: {
        totalSizeBytes: 2048,
        entryCount: 1,
        variantCount: 1,
        scopeBytes: { project: 2048 },
        providerBytes: { 'document-archive': 2048 },
      },
    };

    expect(isResourceCacheManifest(manifest)).toBe(true);
    expect(
      isResourceCacheManifest({ ...manifest, entries: { [resource.id]: { status: 'ready' } } }),
    ).toBe(false);
  });

  it('classifies cache and project fact paths conservatively', () => {
    const projectRoot = '/workspace/demo';
    const globalRoot = '/Users/feng/.neko';
    const extensionPrivateRoot =
      '/Users/feng/Library/Application Support/Code/User/globalStorage/neko.neko-agent';

    expect(
      getResourcePathCategory('/workspace/demo/.neko/.cache/resources/a.jpg', { projectRoot }),
    ).toBe('project-cache');
    expect(
      getResourcePathCategory('/workspace/demo/neko/assets/library.json', { projectRoot }),
    ).toBe('project-fact');
    expect(getResourcePathCategory('/Users/feng/.neko/market-cache/pkg.zip', { globalRoot })).toBe(
      'global-cache',
    );
    expect(
      getResourcePathCategory(
        '/Users/feng/Library/Application Support/Code/User/globalStorage/neko.neko-agent/document-image-cache/a.jpg',
        { extensionPrivateRoot },
      ),
    ).toBe('extension-private-cache');
    expect(getResourcePathCategory('/media/source/a.jpg', { projectRoot })).toBe('source-asset');
    expect(
      isProjectCachePath('/workspace/demo/.neko/.cache/resources/a.jpg', { projectRoot }),
    ).toBe(true);
    expect(isProjectFactPath('/workspace/demo/neko/assets/library.json', { projectRoot })).toBe(
      true,
    );
    expect(
      asProjectCachePath('/workspace/demo/neko/assets/library.json', { projectRoot }),
    ).toBeUndefined();
    expect(
      asProjectFactPath('/workspace/demo/.neko/.cache/resources/a.jpg', { projectRoot }),
    ).toBeUndefined();
    expect(isManagedCachePathCategory('project-cache')).toBe(true);
    expect(isManagedCachePathCategory('project-fact')).toBe(false);
  });

  it('adds unified resource cache paths to storage layout', () => {
    const layout = resolveStorageLayout('/workspace/demo', '/Users/feng');

    expect(layout.project.cache.resources).toBe('/workspace/demo/.neko/.cache/resources');
    expect(layout.project.cache.resourceManifest).toBe(
      '/workspace/demo/.neko/.cache/resources/manifest.json',
    );
    expect(layout.project.cache.database).toBe('/workspace/demo/.neko/.cache/neko-cache.db');
  });

  it('renames legacy cache directories into .neko/.cache and removes the old paths', async () => {
    const fsOps = createMigrationFs(['/workspace/demo/.neko/generated']);

    const actions = await migrateStorageLayout('/workspace/demo', fsOps);

    expect(actions).toContain(
      'migrated generated: /workspace/demo/.neko/generated → /workspace/demo/.neko/.cache/generated',
    );
    expect(fsOps.existsSync('/workspace/demo/.neko/generated')).toBe(false);
    expect(fsOps.existsSync('/workspace/demo/.neko/.cache/generated')).toBe(true);
    expect(fsOps.renameCalls).toEqual([
      {
        oldPath: '/workspace/demo/.neko/generated',
        newPath: '/workspace/demo/.neko/.cache/generated',
      },
    ]);
  });

  it('force-merges missing legacy cache files and deletes old directories when the new target exists', async () => {
    const fsOps = createMigrationFs([
      '/workspace/demo/.neko/generated',
      '/workspace/demo/.neko/.cache/generated',
      '/workspace/demo/.neko/cache',
      '/workspace/demo/.neko/.cache',
    ]);

    const actions = await migrateStorageLayout('/workspace/demo', fsOps);

    expect(actions).toEqual(
      expect.arrayContaining([
        'merged and removed legacy generated: /workspace/demo/.neko/generated → /workspace/demo/.neko/.cache/generated',
        'merged and removed legacy cache: /workspace/demo/.neko/cache → /workspace/demo/.neko/.cache',
      ]),
    );
    expect(fsOps.existsSync('/workspace/demo/.neko/generated')).toBe(false);
    expect(fsOps.existsSync('/workspace/demo/.neko/cache')).toBe(false);
    expect(fsOps.existsSync('/workspace/demo/.neko/.cache/generated')).toBe(true);
    expect(fsOps.existsSync('/workspace/demo/.neko/.cache')).toBe(true);
    expect(fsOps.copyCalls).toEqual([
      {
        oldPath: '/workspace/demo/.neko/generated',
        newPath: '/workspace/demo/.neko/.cache/generated',
      },
      {
        oldPath: '/workspace/demo/.neko/cache',
        newPath: '/workspace/demo/.neko/.cache',
      },
    ]);
    expect(fsOps.rmCalls).toEqual([
      { path: '/workspace/demo/.neko/generated', recursive: true, force: true },
      { path: '/workspace/demo/.neko/cache', recursive: true, force: true },
    ]);
  });
});

function createMigrationFs(initialPaths: readonly string[]): MigrateFsOps & {
  readonly renameCalls: Array<{ oldPath: string; newPath: string }>;
  readonly copyCalls: Array<{ oldPath: string; newPath: string }>;
  readonly rmCalls: Array<{ path: string; recursive: boolean; force: boolean }>;
  existsSync(path: string): boolean;
} {
  const paths = new Set(initialPaths);
  const fsOps: MigrateFsOps & {
    readonly renameCalls: Array<{ oldPath: string; newPath: string }>;
    readonly copyCalls: Array<{ oldPath: string; newPath: string }>;
    readonly rmCalls: Array<{ path: string; recursive: boolean; force: boolean }>;
    existsSync(path: string): boolean;
  } = {
    renameCalls: [],
    copyCalls: [],
    rmCalls: [],
    existsSync: (path) => paths.has(path),
    exists: async (path) => paths.has(path),
    mkdir: async (path) => {
      paths.add(path);
    },
    rename: async (oldPath, newPath) => {
      paths.delete(oldPath);
      paths.add(newPath);
      fsOps.renameCalls.push({ oldPath, newPath });
    },
    copy: async (oldPath, newPath) => {
      if (paths.has(oldPath)) {
        paths.add(newPath);
      }
      fsOps.copyCalls.push({ oldPath, newPath });
    },
    rm: async (path, opts) => {
      paths.delete(path);
      fsOps.rmCalls.push({ path, recursive: opts.recursive, force: opts.force });
    },
  };
  return fsOps;
}
