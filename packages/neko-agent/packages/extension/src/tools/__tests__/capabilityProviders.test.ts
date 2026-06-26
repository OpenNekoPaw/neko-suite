import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { TOOL_NAMES_SYSTEM, type ToolResult } from '@neko/shared';
import { createDocumentReadCapabilityProvider } from '../documentCapabilityProvider';
import { createMediaReadCapabilityProvider } from '../mediaCapabilityProvider';
import { createSemanticCoverageCapabilityProvider } from '../searchCapabilityProvider';

const mocks = vi.hoisted(() => ({
  png1x1: new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  ]),
  createDocumentReaderService: vi.fn(() => ({})),
  getEngineClientProvider: vi.fn(() => ({})),
  createDocumentResourceCacheService: vi.fn(),
  contentAccessRuntime: {
    resolve: vi.fn(),
    resolveImageMetadata: vi.fn(async (input: { source: unknown }) => ({
      status: 'ready' as const,
      source: input.source,
      diagnostics: [],
      mimeType: 'image/png',
      width: 1,
      height: 1,
      sizeBytes: 25,
    })),
    resolveDocumentContent: vi.fn(),
    resolveDocumentImages: vi.fn(),
    loadProviderAsset: vi.fn(async (input: { source: unknown }) => ({
      status: 'ready' as const,
      source: input.source,
      diagnostics: [],
      bytes: mocks.png1x1,
      mimeType: 'image/png',
      sizeBytes: mocks.png1x1.byteLength,
    })),
    projectResource: vi.fn(),
  },
}));

vi.mock('../../services/DocumentReaderService', () => ({
  createDocumentReaderService: mocks.createDocumentReaderService,
}));

vi.mock('../../services/engineClientProvider', () => ({
  getEngineClientProvider: mocks.getEngineClientProvider,
}));

vi.mock('../../services/documentResourceCacheService', () => ({
  createDocumentResourceCacheService: mocks.createDocumentResourceCacheService,
}));

vi.mock('../../bootstrap/capabilityBootstrap', () => ({
  getCapabilityRuntimeBindings: vi.fn(() => ({
    contentAccessRuntime: mocks.contentAccessRuntime,
  })),
}));

describe('extension tool capability providers', () => {
  const tempDirs: string[] = [];
  let workspaceFoldersSpy: ReturnType<typeof vi.spyOn> | undefined;

  afterEach(async () => {
    workspaceFoldersSpy?.mockRestore();
    workspaceFoldersSpy = undefined;
    mocks.createDocumentReaderService.mockClear();
    mocks.getEngineClientProvider.mockClear();
    mocks.createDocumentResourceCacheService.mockReset();
    mocks.contentAccessRuntime.resolve.mockClear();
    mocks.contentAccessRuntime.resolveImageMetadata.mockClear();
    mocks.contentAccessRuntime.resolveDocumentContent.mockClear();
    mocks.contentAccessRuntime.resolveDocumentImages.mockClear();
    mocks.contentAccessRuntime.loadProviderAsset.mockClear();
    mocks.contentAccessRuntime.projectResource.mockClear();
    await Promise.all(
      tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
    );
  });

  it('exposes document read tools through the document-owned provider', () => {
    const provider = createDocumentReadCapabilityProvider();
    const tools = provider.getTools({ extensionContext: {} }).map((tool) => tool.name);

    expect(provider.id).toBe('neko-agent-platform-document');
    expect(tools).toEqual([TOOL_NAMES_SYSTEM.READ_DOCUMENT, TOOL_NAMES_SYSTEM.READ_DOCUMENT_IMAGE]);
    expect(provider.getToolGroups?.()).toEqual([
      expect.objectContaining({
        name: 'document-reading',
        tools: [TOOL_NAMES_SYSTEM.READ_DOCUMENT, TOOL_NAMES_SYSTEM.READ_DOCUMENT_IMAGE],
        loadingTier: 'resident',
      }),
    ]);
  });

  it('exposes image read through the media-owned provider', () => {
    const provider = createMediaReadCapabilityProvider();
    const tools = provider.getTools({ extensionContext: {} }).map((tool) => tool.name);

    expect(provider.id).toBe('neko-agent-platform-media');
    expect(tools).toEqual([TOOL_NAMES_SYSTEM.READ_IMAGE]);
    expect(provider.getToolGroups?.()).toEqual([
      expect.objectContaining({
        name: 'image-reading',
        tools: [TOOL_NAMES_SYSTEM.READ_IMAGE],
        loadingTier: 'resident',
      }),
    ]);
  });

  it('wires shared content access runtime into the media-owned image reader without local cache service', async () => {
    const workspaceRoot = path.resolve(
      process.cwd(),
      '.test-workspaces',
      `capability-providers-${process.pid}`,
    );
    tempDirs.push(workspaceRoot);
    workspaceFoldersSpy = vi.spyOn(vscode.workspace, 'workspaceFolders', 'get');
    workspaceFoldersSpy.mockReturnValue([
      { uri: { fsPath: workspaceRoot } as vscode.Uri, name: 'fixture', index: 0 },
    ]);
    const provider = createMediaReadCapabilityProvider();
    const [tool] = provider.getTools({
      extensionContext: {
        extensionUri: { fsPath: path.join(workspaceRoot, '.extension') },
        globalStorageUri: { fsPath: path.join(workspaceRoot, '.global') },
      },
    });

    const result = (await tool!.execute({
      image_paths: [path.join(workspaceRoot, 'images/page-1.png')],
      mode: 'metadata',
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(mocks.createDocumentResourceCacheService).not.toHaveBeenCalled();
    expect(mocks.contentAccessRuntime.loadProviderAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        caller: 'read-image',
        preferredTarget: 'bytes',
        source: { kind: 'file', path: path.join(workspaceRoot, 'images/page-1.png') },
      }),
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        images: [
          expect.objectContaining({
            mimeType: 'image/png',
            width: 1,
            height: 1,
          }),
        ],
      }),
    );
    expect(JSON.stringify(result.data)).not.toContain('"cacheResourceRef"');
    expect(JSON.stringify(result.data)).not.toContain('"runtimeKind"');
    expect(JSON.stringify(result.data)).not.toContain('"path"');
  });

  it('exposes semantic coverage through the search-owned provider', () => {
    const provider = createSemanticCoverageCapabilityProvider();
    const tools = provider.getTools({ extensionContext: {} }).map((tool) => tool.name);

    expect(provider.id).toBe('neko-search-semantic-coverage');
    expect(tools).toEqual([TOOL_NAMES_SYSTEM.QUERY_SEMANTIC_COVERAGE]);
    expect(provider.getToolGroups?.()).toEqual([
      expect.objectContaining({
        name: 'semantic-coverage',
        tools: [TOOL_NAMES_SYSTEM.QUERY_SEMANTIC_COVERAGE],
        loadingTier: 'resident',
      }),
    ]);
  });
});
