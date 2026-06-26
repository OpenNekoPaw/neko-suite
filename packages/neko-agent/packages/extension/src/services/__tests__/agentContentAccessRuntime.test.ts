import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { createResourceFingerprint, createResourceRef } from '@neko/shared';
import type { IEngineClientProvider } from '../engineClientProvider';
import { createExtensionAgentContentAccessRuntime } from '../agentContentAccessRuntime';

const PNG_1X1 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);

describe('createExtensionAgentContentAccessRuntime', () => {
  let workspaceFoldersSpy: ReturnType<typeof vi.spyOn> | undefined;
  const tempDirs: string[] = [];

  afterEach(async () => {
    workspaceFoldersSpy?.mockRestore();
    workspaceFoldersSpy = undefined;
    await Promise.all(
      tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
    );
  });

  it('loads path-backed provider assets through Engine file access', async () => {
    workspaceFoldersSpy = vi.spyOn(vscode.workspace, 'workspaceFolders', 'get');
    workspaceFoldersSpy.mockReturnValue([
      { uri: { fsPath: '/workspace/demo' } as vscode.Uri, name: 'demo', index: 0 },
    ]);
    const engine = createEngine(PNG_1X1);
    const engineClientProvider = createEngineClientProvider(engine);
    const { runtime } = createExtensionAgentContentAccessRuntime({
      engineClientProvider,
      workspaceRoot: '/workspace/demo',
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
    });

    const result = await runtime.loadProviderAsset({
      caller: 'attachment-processor',
      source: { kind: 'file', path: '/workspace/demo/assets/page.png' },
      preferredTarget: 'bytes',
    });

    expect(result.status).toBe('failed');
    expect(result.bytes).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'engine-file-access-unavailable',
        caller: 'attachment-processor',
      }),
    ]);
  });

  it('loads ResourceRef provider assets through ResourceCacheService', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-agent-content-access-'));
    tempDirs.push(tempDir);
    const cachePath = path.join(tempDir, '.neko/.cache/resources/page-1.png');
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, PNG_1X1);
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
        absolutePath: cachePath,
        variantEntry: { sizeBytes: PNG_1X1.byteLength },
      })),
    };
    const { runtime } = createExtensionAgentContentAccessRuntime({
      engineClientProvider: createEngineClientProvider(createEngine(PNG_1X1)),
      resourceCache: resourceCache as never,
      workspaceRoot: '/workspace/demo',
    });

    const result = await runtime.loadProviderAsset({
      caller: 'read-document-image',
      source: ref,
      preferredTarget: 'bytes',
      variant: { role: 'document-entry', mimeType: 'image/png' },
    });

    expect(result.status).toBe('ready');
    expect(Array.from(result.bytes ?? [])).toEqual(Array.from(PNG_1X1));
    expect(result.source).toBe(ref);
    expect(resourceCache.resolve).toHaveBeenCalledWith(
      ref,
      { role: 'document-entry', mimeType: 'image/png' },
      { materializeIfMissing: true },
    );
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
        runtimeKind: 'cache-path',
        value: '/workspace/demo/.neko/.cache/resources/page-1.png',
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

function createEngine(bytes: Uint8Array) {
  const engine = {
    registerFile: vi.fn(async () => ({
      token: 'engine-token-1',
      fileSizeBytes: bytes.byteLength,
    })),
    readFileRange: vi.fn(async () => bytes.buffer.slice(0)),
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
