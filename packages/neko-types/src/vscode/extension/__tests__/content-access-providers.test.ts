import { describe, expect, it, vi } from 'vitest';
import { PathResolver } from '../../../path';
import {
  createResourceFingerprint,
  createResourceRef,
  type ContentAccessRequest,
  type ContentIngestRequest,
  type ResourceRef,
  type ResourceVariantRequest,
} from '../../../types';
import type { LocalResourceAccessService } from '../local-resource-access';
import {
  CacheArtifactContentIngestProvider,
  DocumentEntryContentAccessProvider,
  ExportStagingContentIngestProvider,
  GeneratedOutputContentIngestProvider,
  ImportSourceContentIngestProvider,
  PreviewVariantContentAccessProvider,
  RegisterExistingSourceContentIngestProvider,
  ResourceCacheContentAccessProvider,
  SourceFileContentAccessProvider,
  VideoProxyContentAccessProvider,
  type ContentAccessFileOps,
} from '../content-access-providers';
import type {
  ResourceCacheProjectOptions,
  ResourceCacheProvider,
  ResourceCacheService,
} from '../resource-cache-service';

describe('content access providers', () => {
  const resource = createResourceRef({
    scope: 'project',
    provider: 'test',
    kind: 'document',
    source: {
      kind: 'document',
      filePath: '${BOOKS}/comic.epub',
      document: {
        filePath: '${BOOKS}/comic.epub',
        format: 'epub',
      },
    },
    locator: {
      kind: 'document',
      entryPath: 'OPS/page-1.jpg',
      locator: { kind: 'chapter', chapterHref: 'OPS/page-1.xhtml' },
    },
    fingerprint: createResourceFingerprint({ strategy: 'provider', value: 'comic-v1' }),
  });
  const variant: ResourceVariantRequest = {
    role: 'thumbnail',
    width: 256,
    height: 256,
    mimeType: 'image/jpeg',
  };

  it('resolves preview cache variants and materializes missing cache', async () => {
    const cache = createResourceCache({
      absolutePath: '/workspace/demo/.neko/.cache/resources/page-1.jpg',
      bytes: bytes('image-bytes'),
    });
    const provider = new ResourceCacheContentAccessProvider({
      resourceCache: cache,
      fileOps: { readFile: async () => bytes('image-bytes') },
    });

    const result = await provider.resolve({
      request: {
        ref: resource,
        intent: 'interactive-preview',
        target: 'bytes',
        variant,
      },
    });

    expect(result).toMatchObject({
      status: 'ready',
      providerId: 'resource-cache-content-access',
      localPath: '/workspace/demo/.neko/.cache/resources/page-1.jpg',
      mimeType: 'image/jpeg',
    });
    expect(text(result.bytes)).toBe('image-bytes');
    expect(cache.resolve).toHaveBeenCalledWith(resource, variant, { materializeIfMissing: true });
  });

  it('projects cache variants through Webview projection', async () => {
    const cache = createResourceCache({
      absolutePath: '/workspace/demo/.neko/.cache/resources/page-1.jpg',
      uri: 'webview:/page-1.jpg',
    });
    const provider = new ResourceCacheContentAccessProvider({
      resourceCache: cache,
      webviewResolver: () => ({}) as never,
    });

    const result = await provider.resolve({
      request: {
        ref: resource,
        intent: 'interactive-preview',
        target: 'webview-uri',
        variant,
      },
    });

    expect(result).toMatchObject({
      status: 'ready',
      uri: 'webview:/page-1.jpg',
      localPath: '/workspace/demo/.neko/.cache/resources/page-1.jpg',
    });
  });

  it('resolves source-first local paths, bytes, and engine source tokens', async () => {
    const fileOps = createFileOps({ '/media/books/comic.epub': bytes('book') });
    const pathResolver = new PathResolver(new Map([['BOOKS', '/media/books']]));
    const provider = new SourceFileContentAccessProvider({
      projectRoot: '/workspace/demo',
      pathResolver,
      fileOps,
      engineSourceResolver: async ({ path }) => ({
        token: `engine:${path}`,
        sourcePath: path,
        runtimeOnly: true,
      }),
    });
    const request = {
      ref: resource,
      intent: 'final-export',
      target: 'bytes',
    } satisfies ContentAccessRequest;

    await expect(provider.resolve({ request })).resolves.toMatchObject({
      status: 'ready',
      localPath: '/media/books/comic.epub',
    });
    await expect(
      provider.resolve({ request: { ...request, target: 'engine-source' } }),
    ).resolves.toMatchObject({
      status: 'ready',
      engineSource: { token: 'engine:/media/books/comic.epub', runtimeOnly: true },
    });
  });

  it('reports unresolved path variables as missing source', async () => {
    const provider = new SourceFileContentAccessProvider({ projectRoot: '/workspace/demo' });

    const result = await provider.resolve({
      request: { ref: resource, intent: 'verify', target: 'local-path' },
    });

    expect(result).toMatchObject({
      status: 'missing-source',
      error: 'Source path contains an unresolved path variable.',
    });
  });

  it('reports unreadable source bytes as missing source instead of provider failure', async () => {
    const provider = new SourceFileContentAccessProvider({
      projectRoot: '/workspace/demo',
      fileOps: {
        readFile: async () => {
          throw new Error('ENOENT');
        },
      },
    });

    const result = await provider.resolve({
      request: {
        ref: { kind: 'file', path: '/workspace/demo/missing.png' },
        intent: 'verify',
        target: 'bytes',
      },
    });

    expect(result).toMatchObject({
      status: 'missing-source',
      providerId: 'source-file-content-access',
      error: 'Source file cannot be read: ENOENT',
    });
    expect(result.diagnostics?.[0]?.code).toBe('content-provider-missing-source');
  });

  it('reads original document entry bytes for package intent', async () => {
    const provider = new DocumentEntryContentAccessProvider({
      projectRoot: '/workspace/demo',
      pathResolver: new PathResolver(new Map([['BOOKS', '/media/books']])),
      entryReader: async ({ sourcePath, entryPath }) => bytes(`${sourcePath}:${entryPath}`),
    });

    const result = await provider.resolve({
      request: { ref: resource, intent: 'package', target: 'bytes' },
    });

    expect(text(result.bytes)).toBe('/media/books/comic.epub:OPS/page-1.jpg');
  });

  it('uses proxy only for preview and edit playback requests', async () => {
    const provider = new VideoProxyContentAccessProvider({
      proxyResolver: async () => ({
        localPath: '/workspace/demo/.neko/.cache/proxy/clip.mp4',
        mimeType: 'video/mp4',
      }),
    });

    expect(
      provider.supports({
        ref: { kind: 'file', path: '${MEDIA}/clip.mp4' },
        intent: 'edit-playback',
        target: 'local-path',
        role: 'proxy',
      }),
    ).toBe(true);
    expect(
      provider.supports({
        ref: { kind: 'file', path: '${MEDIA}/clip.mp4' },
        intent: 'final-export',
        target: 'local-path',
        role: 'proxy',
        qualityMode: 'draft-proxy',
      }),
    ).toBe(false);
  });

  it('projects proxy local paths before returning Webview URI targets', async () => {
    const localResourceAccess = createLocalResourceAccess('webview:/proxy/clip.mp4');
    const provider = new VideoProxyContentAccessProvider({
      proxyResolver: async () => ({
        localPath: '/workspace/demo/.neko/.cache/proxy/clip.mp4',
        mimeType: 'video/mp4',
      }),
      localResourceAccess,
      webviewResolver: () => ({}) as never,
    });

    const result = await provider.resolve({
      request: {
        ref: { kind: 'file', path: '${MEDIA}/clip.mp4' },
        intent: 'interactive-preview',
        target: 'webview-uri',
        role: 'proxy',
        caller: 'proxy-test',
      },
    });

    expect(result).toMatchObject({
      status: 'ready',
      localPath: '/workspace/demo/.neko/.cache/proxy/clip.mp4',
      uri: 'webview:/proxy/clip.mp4',
      mimeType: 'video/mp4',
    });
  });

  it('rejects proxy Webview URI targets when projection dependencies are missing', async () => {
    const provider = new VideoProxyContentAccessProvider({
      proxyResolver: async () => ({
        localPath: '/workspace/demo/.neko/.cache/proxy/clip.mp4',
      }),
    });

    const result = await provider.resolve({
      request: {
        ref: { kind: 'file', path: '${MEDIA}/clip.mp4' },
        intent: 'interactive-preview',
        target: 'webview-uri',
        role: 'proxy',
      },
    });

    expect(result).toMatchObject({
      status: 'unsupported-destination',
      error:
        'Proxy Webview URI content access requires local resource access and a webview resolver.',
    });
  });

  it('adapts existing preview variant APIs', async () => {
    const provider = new PreviewVariantContentAccessProvider({
      variantResolver: async () => ({
        uri: 'webview:/preview.png',
        width: 640,
        height: 360,
        mimeType: 'image/png',
      }),
    });

    await expect(
      provider.resolve({
        request: {
          ref: { kind: 'file', path: '${MEDIA}/shot.png' },
          intent: 'agent-context',
          target: 'webview-uri',
        },
      }),
    ).resolves.toMatchObject({
      status: 'ready',
      uri: 'webview:/preview.png',
      width: 640,
      height: 360,
    });
  });
});

describe('content ingest providers', () => {
  it('imports external files and returns project-relative stable refs', async () => {
    const fileOps = createFileOps({ '/downloads/shot.png': bytes('image') });
    const provider = new ImportSourceContentIngestProvider({
      projectRoot: '/workspace/demo',
      fileOps,
    });
    const request: ContentIngestRequest = {
      mode: 'import-source',
      sourcePath: '/downloads/shot.png',
      destination: {
        kind: 'project',
        projectRoot: '/workspace/demo',
        directory: '/workspace/demo/neko/imports',
      },
      fileName: 'shot.png',
    };

    const result = await provider.ingest({ request });

    expect(fileOps.files.get('/workspace/demo/neko/imports/shot.png')).toEqual(bytes('image'));
    expect(result.contractedPath).toBe('neko/imports/shot.png');
    expect(result.source).toMatchObject({
      scope: 'project',
      source: { filePath: 'neko/imports/shot.png' },
    });
  });

  it('registers existing variable paths without copying', async () => {
    const fileOps = createFileOps({});
    const provider = new RegisterExistingSourceContentIngestProvider({
      projectRoot: '/workspace/demo',
      fileOps,
      pathResolver: new PathResolver(new Map([['MEDIA', '/Volumes/media']])),
    });
    const request: ContentIngestRequest = {
      mode: 'register-existing-source',
      sourcePath: '/Volumes/media/shot.png',
      destination: { kind: 'media-library', mediaLibraryId: 'main' },
    };

    const result = await provider.ingest({ request });

    expect(fileOps.copyCalls).toEqual([]);
    expect(result.contractedPath).toBe('${MEDIA}/shot.png');
    expect(result.source).toMatchObject({
      scope: 'global',
      source: { filePath: '${MEDIA}/shot.png', mediaLibraryId: 'main' },
    });
  });

  it('promotes generated bytes into generated-assets scope', async () => {
    const fileOps = createFileOps({});
    const provider = new GeneratedOutputContentIngestProvider({
      projectRoot: '/workspace/demo',
      fileOps,
    });
    const request: ContentIngestRequest = {
      mode: 'generated-output',
      bytes: bytes('generated'),
      destination: {
        kind: 'generated-assets',
        projectRoot: '/workspace/demo',
        directory: '/workspace/demo/neko/generated/image',
      },
      fileName: 'agent-shot.png',
      metadata: { assetId: 'agent-shot' },
      prewarm: [{ role: 'thumbnail', width: 256 }],
    };

    const result = await provider.ingest({ request });

    expect(fileOps.files.get('/workspace/demo/neko/generated/image/agent-shot.png')).toEqual(
      bytes('generated'),
    );
    expect(result.source).toMatchObject({
      kind: 'generated-asset',
      assetId: 'agent-shot',
      path: 'neko/generated/image/agent-shot.png',
      promoted: true,
    });
    expect(result.prewarm).toEqual([{ role: 'thumbnail', width: 256 }]);
  });

  it('falls back generated outputs to project cache when no destination directory is provided', async () => {
    const fileOps = createFileOps({});
    const provider = new GeneratedOutputContentIngestProvider({
      projectRoot: '/workspace/demo',
      fileOps,
    });
    const request: ContentIngestRequest = {
      mode: 'generated-output',
      bytes: bytes('generated'),
      destination: {
        kind: 'generated-assets',
        projectRoot: '/workspace/demo',
      },
      fileName: 'agent-shot.png',
    };

    const result = await provider.ingest({ request });

    expect(result.outputPath).toBe('/workspace/demo/.neko/.cache/generated/agent-shot.png');
    expect(result.contractedPath).toBe('.neko/.cache/generated/agent-shot.png');
    expect(fileOps.files.get('/workspace/demo/.neko/.cache/generated/agent-shot.png')).toEqual(
      bytes('generated'),
    );
  });

  it('stages export outputs without creating source refs', async () => {
    const provider = new ExportStagingContentIngestProvider({ projectRoot: '/workspace/demo' });
    const request: ContentIngestRequest = {
      mode: 'stage-export',
      destination: {
        kind: 'export-output',
        directory: '/exports',
        allowAbsolutePath: true,
      },
      fileName: 'final.mp4',
    };

    const result = await provider.ingest({ request });

    expect(result).toMatchObject({
      status: 'ready',
      outputPath: '/exports/final.mp4',
      stagedOutput: { path: '/exports/final.mp4', kind: 'export' },
    });
    expect(result.source).toBeUndefined();
  });

  it('delegates cache artifacts to resource cache service', async () => {
    const resource = createResourceRef({
      scope: 'project',
      provider: 'test',
      kind: 'media',
      source: { kind: 'file', filePath: 'media/shot.png' },
      fingerprint: createResourceFingerprint({ strategy: 'provider', value: 'shot-v1' }),
    });
    const variant: ResourceVariantRequest = { role: 'thumbnail', width: 128 };
    const cache = createResourceCache({
      absolutePath: '/workspace/demo/.neko/.cache/resources/shot-thumb.png',
    });
    const provider = new CacheArtifactContentIngestProvider({ resourceCache: cache });
    const request: ContentIngestRequest = {
      mode: 'cache-artifact',
      resource,
      variant,
      destination: { kind: 'cache' },
    };

    await expect(provider.ingest({ request })).resolves.toMatchObject({
      status: 'ready',
      outputPath: '/workspace/demo/.neko/.cache/resources/shot-thumb.png',
      source: resource,
    });
    expect(cache.ensure).toHaveBeenCalledWith(resource, variant, { materializeIfMissing: true });
  });
});

function createResourceCache(input: {
  readonly absolutePath: string;
  readonly uri?: string;
  readonly bytes?: Uint8Array;
}): ResourceCacheService {
  const ensure = vi.fn(async (ref: ResourceRef, request: ResourceVariantRequest) => ({
    status: 'ready' as const,
    ref,
    variant: { resource: ref, ...request },
    absolutePath: input.absolutePath,
    variantEntry: {
      key: 'variant',
      role: request.role,
      status: 'ready' as const,
      absolutePath: input.absolutePath,
      mimeType: request.mimeType,
      width: request.width,
      height: request.height,
      sizeBytes: input.bytes?.byteLength,
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    },
  }));
  return {
    registerProvider: vi.fn((_provider: ResourceCacheProvider) => undefined),
    findByLocalPath: vi.fn(async () => undefined),
    ensure,
    resolve: vi.fn(async (ref: ResourceRef, request: ResourceVariantRequest) => ({
      status: 'ready' as const,
      ref,
      variant: { resource: ref, ...request },
      absolutePath: input.absolutePath,
      variantEntry: {
        key: 'variant',
        role: request.role,
        status: 'ready' as const,
        absolutePath: input.absolutePath,
        mimeType: request.mimeType,
        width: request.width,
        height: request.height,
        sizeBytes: input.bytes?.byteLength,
        createdAt: '2026-06-05T00:00:00.000Z',
        updatedAt: '2026-06-05T00:00:00.000Z',
      },
    })),
    project: vi.fn(
      async (
        _webview: never,
        ref: ResourceRef,
        request: ResourceVariantRequest,
        _options?: ResourceCacheProjectOptions,
      ) => ({
        status: 'ready' as const,
        ref,
        variant: { resource: ref, ...request },
        absolutePath: input.absolutePath,
        uri: input.uri,
        variantEntry: {
          key: 'variant',
          role: request.role,
          status: 'ready' as const,
          absolutePath: input.absolutePath,
          mimeType: request.mimeType,
          width: request.width,
          height: request.height,
          sizeBytes: input.bytes?.byteLength,
          createdAt: '2026-06-05T00:00:00.000Z',
          updatedAt: '2026-06-05T00:00:00.000Z',
        },
      }),
    ),
    invalidate: vi.fn(async () => undefined),
    invalidateManifestCache: vi.fn(),
    stats: vi.fn(async () => ({
      totalSizeBytes: 0,
      entryCount: 0,
      variantCount: 0,
    })),
    gc: vi.fn(async () => ({
      removedCount: 0,
      removedBytes: 0,
      skippedCount: 0,
      skippedReasons: {},
    })),
  };
}

function createFileOps(initial: Record<string, Uint8Array>): ContentAccessFileOps & {
  readonly files: Map<string, Uint8Array>;
  readonly copyCalls: Array<{ readonly sourcePath: string; readonly targetPath: string }>;
} {
  const files = new Map(Object.entries(initial));
  const copyCalls: Array<{ readonly sourcePath: string; readonly targetPath: string }> = [];
  return {
    files,
    copyCalls,
    readFile: async (filePath) => files.get(filePath) ?? bytes(''),
    writeFile: async (filePath, content) => {
      files.set(filePath, content);
    },
    copyFile: async (sourcePath, targetPath) => {
      copyCalls.push({ sourcePath, targetPath });
      files.set(targetPath, files.get(sourcePath) ?? bytes(''));
    },
    mkdir: async () => undefined,
  };
}

function createLocalResourceAccess(uri: string): LocalResourceAccessService {
  return {
    getLocalResourceRoots: async () => [],
    configureWebview: async () => undefined,
    isAuthorizedPath: async () => true,
    toWebviewUri: async (_webview, source) => ({
      ok: true,
      kind: 'local',
      source,
      uri,
    }),
    createSyncProjector: () => () => uri,
  };
}

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function text(value: Uint8Array | undefined): string {
  return new TextDecoder().decode(value);
}
