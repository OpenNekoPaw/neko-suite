import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TOOL_NAMES_SYSTEM,
  createResourceFingerprint,
  createResourceRef,
  type ToolResult,
} from '@neko/shared';
import { createDocumentReadCapabilityProvider } from '../documentCapabilityProvider';
import { createMediaReadCapabilityProvider } from '../mediaCapabilityProvider';
import { createSemanticCoverageCapabilityProvider } from '../searchCapabilityProvider';

const mocks = vi.hoisted(() => ({
  createDocumentReaderService: vi.fn(() => ({})),
  getEngineClientProvider: vi.fn(() => ({})),
  createDocumentResourceCacheService: vi.fn(),
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

const PNG_1X1 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);

describe('extension tool capability providers', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    mocks.createDocumentReaderService.mockClear();
    mocks.getEngineClientProvider.mockClear();
    mocks.createDocumentResourceCacheService.mockReset();
    await Promise.all(
      tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
    );
  });

  it('exposes document read tools through the document-owned provider', () => {
    const provider = createDocumentReadCapabilityProvider({} as never);
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
    const provider = createMediaReadCapabilityProvider({ platform: {} as never });
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

  it('wires the document resource cache into the media-owned image reader', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-read-image-'));
    tempDirs.push(tempDir);
    const cachePath = path.join(tempDir, 'documents/doc_comic/OPS/images/page-1.png');
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, PNG_1X1);
    const cacheResourceRef = createResourceRef({
      id: 'res_page_1',
      scope: 'project',
      provider: 'document-archive',
      kind: 'document',
      source: {
        kind: 'document',
        document: { filePath: '${BOOKS}/comic.epub', format: 'epub' },
        filePath: '${BOOKS}/comic.epub',
      },
      locator: { kind: 'document', entryPath: 'OPS/images/page-1.png' },
      fingerprint: createResourceFingerprint({
        strategy: 'provider',
        value: 'comic-v1',
        providerId: 'document-archive',
      }),
    });
    const resourceCache = {
      findByLocalPath: vi.fn(async () => ({
        ref: cacheResourceRef,
        entry: {
          resource: cacheResourceRef,
          status: 'ready' as const,
          createdAt: '2026-06-05T00:00:00.000Z',
          updatedAt: '2026-06-05T00:00:00.000Z',
          variants: [],
        },
        variantEntry: {
          key: 'variant',
          role: 'document-entry' as const,
          status: 'ready' as const,
          absolutePath: cachePath,
          createdAt: '2026-06-05T00:00:00.000Z',
          updatedAt: '2026-06-05T00:00:00.000Z',
        },
        absolutePath: cachePath,
      })),
    };
    mocks.createDocumentResourceCacheService.mockReturnValue(resourceCache);
    const provider = createMediaReadCapabilityProvider({ platform: {} as never });
    const [tool] = provider.getTools({
      extensionContext: {
        extensionUri: { fsPath: tempDir },
        globalStorageUri: { fsPath: path.join(tempDir, 'global') },
      },
    });

    const result = (await tool!.execute({
      image_paths: [cachePath],
      mode: 'metadata',
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(mocks.createDocumentResourceCacheService).toHaveBeenCalledOnce();
    expect(resourceCache.findByLocalPath).toHaveBeenCalledWith(cachePath);
    expect(result.data).toEqual(
      expect.objectContaining({
        images: [
          expect.objectContaining({
            path: cachePath,
            runtimeKind: 'managed-cache',
            resourceRef: expect.objectContaining({
              kind: 'document-entry',
              entryPath: 'OPS/images/page-1.png',
            }),
            cacheResourceRef,
          }),
        ],
      }),
    );
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
