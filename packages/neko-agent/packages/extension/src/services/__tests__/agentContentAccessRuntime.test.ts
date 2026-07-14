import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { PathResolver, createResourceFingerprint, createResourceRef } from '@neko/shared';
import {
  createGeneratedAssetResourceRef,
  type ResourceCacheManifestStore,
} from '@neko/shared/vscode/extension';
import type { IEngineClientProvider } from '../engineClientProvider';
import { createExtensionAgentContentAccessRuntime } from '../agentContentAccessRuntime';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));

const PNG_1X1 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);

describe('createExtensionAgentContentAccessRuntime', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    vscode.workspace.workspaceFolders = [
      { uri: { fsPath: '/mock/workspace' } as vscode.Uri, name: 'mock', index: 0 },
    ];
    await Promise.all(
      tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
    );
  });

  it('loads path-backed provider assets through Engine file access', async () => {
    vscode.workspace.workspaceFolders = [
      { uri: { fsPath: '/workspace/demo' } as vscode.Uri, name: 'demo', index: 0 },
    ];
    const engine = createEngine(PNG_1X1);
    const engineClientProvider = createEngineClientProvider(engine);
    const { runtime } = createExtensionAgentContentAccessRuntime({
      engineClientProvider,
      workspaceRoot: '/workspace/demo',
      fileExists: (filePath) => filePath === '/workspace/demo/assets/page.png',
    });
    const signal = new AbortController().signal;

    const result = await runtime.loadProviderAsset({
      caller: 'perception-asset-loader',
      source: { kind: 'file', path: 'assets/page.png' },
      preferredTarget: 'bytes',
      mimeTypeHint: 'image/png',
      signal,
    });

    expect(result.status).toBe('ready');
    expect(Array.from(result.bytes ?? [])).toEqual(Array.from(PNG_1X1));
    expect(engine.registerFile).toHaveBeenCalledWith({
      filePath: '/workspace/demo/assets/page.png',
      purpose: 'agent-attachment',
    });
    expect(engine.readFileRange).toHaveBeenCalledWith(
      'engine-token-1',
      0,
      PNG_1X1.byteLength - 1,
      signal,
    );
    expect(engine.unregisterFile).toHaveBeenCalledWith('engine-token-1');
  });

  it('fails visibly when Engine is unavailable for path-backed binary assets', async () => {
    const { runtime } = createExtensionAgentContentAccessRuntime({
      engineClientProvider: createEngineClientProvider(null),
      workspaceRoot: '/workspace/demo',
      fileExists: (filePath) => filePath === '/workspace/demo/assets/page.png',
    });

    const result = await runtime.loadProviderAsset({
      caller: 'attachment-processor',
      source: { kind: 'file', path: '/workspace/demo/assets/page.png' },
      preferredTarget: 'bytes',
    });

    expect(result.status).toBe('missing-source');
    expect(result.bytes).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'content-provider-missing-source',
        caller: 'attachment-processor',
      }),
    ]);
  });

  it('loads ResourceRef provider assets through ResourceCacheService', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-agent-content-access-'));
    tempDirs.push(tempDir);
    const materializedPath = path.join(tempDir, 'resources/page-1.png');
    await fs.mkdir(path.dirname(materializedPath), { recursive: true });
    await fs.writeFile(materializedPath, PNG_1X1);
    const ref = createResourceRef({
      id: 'res-page-1',
      scope: 'project',
      provider: 'document-archive',
      kind: 'document',
      source: {
        kind: 'document',
        filePath: '/workspace/demo/book.epub',
        document: { filePath: '/workspace/demo/book.epub', format: 'epub' },
      },
      locator: { kind: 'document', entryPath: 'OPS/images/page-1.png' },
      fingerprint: createResourceFingerprint({
        strategy: 'provider',
        value: 'book-v1',
        providerId: 'document-archive',
      }),
    });
    const resourceCache = {
      resolve: vi.fn(async () => ({
        status: 'ready' as const,
        ref,
        variant: { resource: ref, role: 'document-entry' as const, mimeType: 'image/png' },
        absolutePath: materializedPath,
        variantEntry: { sizeBytes: PNG_1X1.byteLength },
      })),
    };
    const { runtime } = createExtensionAgentContentAccessRuntime({
      engineClientProvider: createEngineClientProvider(createEngine(PNG_1X1)),
      resourceCache: resourceCache as never,
      workspaceRoot: '/workspace/demo',
    });

    const result = await runtime.loadProviderAsset({
      caller: 'read-image',
      source: ref,
      preferredTarget: 'bytes',
      variant: { role: 'document-entry', mimeType: 'image/png' },
    });

    expect(result.status).toBe('ready');
    expect(Array.from(result.bytes ?? [])).toEqual(Array.from(PNG_1X1));
    expect(result.source).toMatchObject({
      provider: 'document-archive',
      source: {
        kind: 'document',
        document: { filePath: '/workspace/demo/book.epub', format: 'epub' },
      },
    });
    expect(resourceCache.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'document-archive',
        source: expect.objectContaining({
          document: expect.objectContaining({ filePath: '/workspace/demo/book.epub' }),
        }),
      }),
      { role: 'document-entry', mimeType: 'image/png' },
      { materializeIfMissing: true },
    );
  });

  it('loads generated asset ResourceRefs as image bytes for ReadImage', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-agent-generated-access-'));
    tempDirs.push(tempDir);
    const workspaceRoot = path.join(tempDir, 'workspace');
    const generatedPath = path.join(workspaceRoot, 'neko/generated/image/asset-1.png');
    await fs.mkdir(path.dirname(generatedPath), { recursive: true });
    await fs.writeFile(generatedPath, PNG_1X1);
    vscode.workspace.workspaceFolders = [
      { uri: { fsPath: workspaceRoot } as vscode.Uri, name: 'workspace', index: 0 },
    ];
    const context = {
      extensionUri: { fsPath: path.join(tempDir, 'extension') },
      globalStorageUri: { fsPath: path.join(tempDir, 'global') },
    } as vscode.ExtensionContext;
    const { runtime } = createExtensionAgentContentAccessRuntime({
      context,
      engineClientProvider: createEngineClientProvider(createEngine(PNG_1X1)),
      workspaceRoot,
      pathResolver: new PathResolver(new Map([['WORKSPACE', workspaceRoot]])),
      resourceCacheManifestStore: createMemoryManifestStore(),
    });
    const ref = createGeneratedAssetResourceRef({
      assetId: 'asset-1',
      path: '${WORKSPACE}/neko/generated/image/asset-1.png',
      mimeType: 'image/png',
    });

    const result = await runtime.loadProviderAsset({
      caller: 'read-image',
      source: ref,
      preferredTarget: 'bytes',
    });

    expect(result.status).toBe('ready');
    expect(Array.from(result.bytes ?? [])).toEqual(Array.from(PNG_1X1));
    expect(result.mimeType).toBe('image/png');
  });

  it('loads document entry assets through resolved host paths for ReadImage', async () => {
    const engine = createEngine(PNG_1X1);
    const { runtime } = createExtensionAgentContentAccessRuntime({
      engineClientProvider: createEngineClientProvider(engine),
      workspaceRoot: '/workspace/demo',
      pathResolver: new PathResolver(new Map([['BOOKS', '/media/books']])),
      mediaPathContext: {
        owningWorkspaceRoot: '/workspace/demo',
        workspaceRoots: ['/workspace/demo'],
        pathVariables: new Map([['BOOKS', '/media/books']]),
        allowedRoots: ['/workspace/demo', '/media/books'],
      },
      fileExists: (filePath) => filePath === '/media/books/comic.epub',
    });
    const documentEntryRef = createResourceRef({
      id: 'res-page-1',
      scope: 'project',
      provider: 'document-archive',
      kind: 'document',
      source: {
        kind: 'document',
        filePath: '${BOOKS}/comic.epub',
        document: { filePath: '${BOOKS}/comic.epub', format: 'epub' },
      },
      locator: { kind: 'document', entryPath: 'OPS/images/page-1.png' },
      fingerprint: createResourceFingerprint({
        strategy: 'provider',
        value: 'comic-v1',
        providerId: 'document-archive',
      }),
    });

    const result = await runtime.loadProviderAsset({
      caller: 'read-image',
      source: documentEntryRef,
      preferredTarget: 'bytes',
    });

    expect(result.status).toBe('ready');
    expect(Array.from(result.bytes ?? [])).toEqual(Array.from(PNG_1X1));
    expect(engine.registerFile).toHaveBeenCalledWith({
      filePath: '/media/books/comic.epub',
      purpose: 'document',
    });
    expect(engine.readFileEntry).toHaveBeenCalledWith('engine-token-1', 'OPS/images/page-1.png');
  });

  it('rejects runtime handles as durable Agent content identity', async () => {
    const { runtime } = createExtensionAgentContentAccessRuntime({
      engineClientProvider: createEngineClientProvider(createEngine(PNG_1X1)),
      workspaceRoot: '/workspace/demo',
    });

    const result = await runtime.loadProviderAsset({
      caller: 'perception-asset-loader',
      source: {
        kind: 'runtime',
        runtimeKind: 'transient-preview-uri',
        value: 'vscode-resource://preview/page-1.png',
      },
      preferredTarget: 'bytes',
    });

    expect(result.status).toBe('unsupported-source');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'runtime-handle-rejected',
        caller: 'perception-asset-loader',
      }),
    ]);
  });
});

function createMemoryManifestStore(): ResourceCacheManifestStore {
  let manifest = {
    version: 1 as const,
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T00:00:00.000Z',
    entries: {},
  };
  return {
    load: async () => manifest,
    save: async (next) => {
      manifest = next;
    },
    update: async (operation) => {
      manifest = await operation(manifest);
      return manifest;
    },
    invalidateCache: () => undefined,
  };
}

function createEngine(bytes: Uint8Array) {
  const engine = {
    registerFile: vi.fn(async () => ({
      token: 'engine-token-1',
      fileSizeBytes: bytes.byteLength,
    })),
    readFileRange: vi.fn(async () => bytes.buffer.slice(0)),
    readFileEntry: vi.fn(async () => bytes.buffer.slice(0)),
    unregisterFile: vi.fn(async () => undefined),
    withRegisteredFile: vi.fn(async (request, task) => {
      const registered = await engine.registerFile(request);
      try {
        return await task(registered);
      } finally {
        await engine.unregisterFile(registered.token);
      }
    }),
  };
  return engine;
}

function createEngineClientProvider(
  engine: ReturnType<typeof createEngine> | null,
): IEngineClientProvider {
  return {
    getOptionalClient: vi.fn(async () => engine as never),
    getRequiredClient: vi.fn(async () => {
      if (!engine) throw new Error('missing engine');
      return engine as never;
    }),
    createPerceptionClient: vi.fn(),
    createPerceptionClients: vi.fn(),
  } as unknown as IEngineClientProvider;
}
