import { describe, expect, it, vi } from 'vitest';
import { TOOL_NAMES_SYSTEM, type ResourceRef, type ToolResult } from '@neko/shared';
import type { ResourceCacheService } from '@neko/shared/vscode/extension';
import { createReadDocumentImageTool } from '../readDocumentImageTool';
import type { IDocumentReaderService } from '../../services/DocumentReaderService';

const PNG_1X1 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);

const JPEG_1X1 = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x08, 0x08, 0x00, 0x01, 0x00,
  0x01, 0x03, 0x01, 0x11, 0x00, 0xff, 0xd9,
]);

async function* emptyStream(): AsyncIterable<never> {}

function createReader(overrides: Partial<IDocumentReaderService> = {}): IDocumentReaderService {
  return {
    supports: vi.fn(() => true),
    hasDRM: vi.fn(async () => false),
    read: vi.fn(async () => ({ text: '' })),
    readContent: vi.fn(async () => ({ text: '' })),
    getManifest: vi.fn(async () => ({
      source: { filePath: '/books/demo.epub', format: 'epub', fileId: 'book-1' },
      format: 'epub',
      fileId: 'book-1',
      chapterCount: 2,
      units: [
        { kind: 'chapter', locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 0 } },
        { kind: 'chapter', locator: { kind: 'chapter', chapterHref: 'Page_2', spineIndex: 1 } },
      ],
      capabilities: {
        supportsManifest: true,
        supportsRangeRead: true,
        supportsCursorRead: true,
        supportsChapterRange: true,
      },
    })),
    createBatchCursor: vi.fn(async () => ({
      source: { filePath: '/books/demo.epub', format: 'epub', fileId: 'book-1' },
      strategy: 'manifest-order',
      next: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 0 },
      batchIndex: 0,
      done: false,
    })),
    readRange: vi.fn(async () => ({
      source: { filePath: '/books/demo.epub', format: 'epub', fileId: 'book-1' },
      text: '',
      imagePaths: ['/cache/page-1.png', '/cache/page-2.png'],
      imageInfo: [
        {
          path: '/cache/page-1.png',
          width: 1,
          height: 1,
          mimeType: 'image/png',
          byteSize: PNG_1X1.byteLength,
          locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 0 },
          resourceRef: {
            kind: 'document-entry',
            source: { filePath: '/books/demo.epub', format: 'epub', fileId: 'book-1' },
            entryPath: 'OPS/page-1.png',
            cachePath: '/cache/page-1.png',
          },
        },
        {
          path: '/cache/page-2.png',
          width: 1,
          height: 1,
          mimeType: 'image/png',
          byteSize: PNG_1X1.byteLength,
          locator: { kind: 'chapter', chapterHref: 'Page_2', spineIndex: 1 },
          resourceRef: {
            kind: 'document-entry',
            source: { filePath: '/books/demo.epub', format: 'epub', fileId: 'book-1' },
            entryPath: 'OPS/page-2.png',
            cachePath: '/cache/page-2.png',
          },
        },
      ],
      returnedTextChars: 0,
      truncated: false,
    })),
    readNext: vi.fn(async (cursor) => ({
      source: cursor.source,
      text: '',
      returnedTextChars: 0,
      truncated: false,
      cursor,
    })),
    ...overrides,
  };
}

describe('createReadDocumentImageTool', () => {
  it('creates a read-only document image tool', () => {
    const tool = createReadDocumentImageTool({
      reader: createReader(),
      readFile: vi.fn(async () => PNG_1X1),
    });

    expect(tool.name).toBe(TOOL_NAMES_SYSTEM.READ_DOCUMENT_IMAGE);
    expect(tool.category).toBe('document');
    expect(tool.isReadOnly).toBe(true);
    expect(tool.description).toContain('document locators or page indexes');
    expect(tool.description).toContain('call ReadImage directly instead of this tool');
    expect(tool.description).toContain('never call both ReadImage and ReadDocumentImage');
  });

  it('resolves a document page image and delegates to ReadImage metadata flow', async () => {
    const reader = createReader();
    const resourceCache = createResourceCache();
    const readFile = vi.fn(async () => PNG_1X1);
    const tool = createReadDocumentImageTool({
      reader,
      readFile,
      resourceCache,
    });

    const result = (await tool.execute({
      file_path: '/books/demo.epub',
      page_indexes: [1],
      mode: 'metadata',
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(reader.readRange).toHaveBeenCalledWith(
      { filePath: '/books/demo.epub', format: 'epub', fileId: 'book-1' },
      expect.objectContaining({ limit: expect.objectContaining({ maxImages: 4 }) }),
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        images: [
          expect.objectContaining({
            path: '/workspace/.neko/.cache/resources/documents/page.png',
            runtimePath: '/cache/page-2.png',
            runtimeKind: 'managed-cache',
            alias: 'page_2',
            aliasScope: 'document:book-1',
            sourceDocumentId: 'book-1',
            entryPath: 'OPS/page-2.png',
            portableForTransfer: true,
            documentImage: expect.objectContaining({
              path: '/workspace/.neko/.cache/resources/documents/page.png',
              runtimePath: '/cache/page-2.png',
              runtimeKind: 'managed-cache',
              alias: 'page_2',
              aliasScope: 'document:book-1',
              sourceDocumentId: 'book-1',
              entryPath: 'OPS/page-2.png',
              portableForTransfer: true,
              locator: { kind: 'chapter', chapterHref: 'Page_2', spineIndex: 1 },
              resourceRef: expect.objectContaining({
                cachePath: '/workspace/.neko/.cache/resources/documents/page.png',
              }),
              cacheResourceRef: expect.objectContaining({
                provider: 'document-archive',
                kind: 'document',
                locator: expect.objectContaining({ entryPath: 'OPS/page-2.png' }),
              }),
            }),
            cacheResourceRef: expect.objectContaining({
              provider: 'document-archive',
              kind: 'document',
            }),
          }),
        ],
      }),
    );
    expect(JSON.stringify(result.data)).not.toContain('legacyCachePath');
    expect(readFile).toHaveBeenCalledWith('/workspace/.neko/.cache/resources/documents/page.png');
    expect(resourceCache.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'project',
        provider: 'document-archive',
        kind: 'document',
        locator: expect.objectContaining({ entryPath: 'OPS/page-2.png' }),
      }),
      { role: 'document-entry', mimeType: 'image/png', width: 1, height: 1 },
      { materializeIfMissing: true },
    );
  });

  it('marks no-workspace document image analysis refs as extension-private', async () => {
    const reader = createReader();
    const resourceCache = createResourceCache();
    const tool = createReadDocumentImageTool({
      reader,
      readFile: vi.fn(async () => PNG_1X1),
      resourceCache,
      resolveResourceScope: () => 'extension-private',
    });

    const result = (await tool.execute({
      file_path: '/books/demo.epub',
      page_indexes: [0],
      mode: 'metadata',
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        images: [
          expect.objectContaining({
            runtimePath: '/cache/page-1.png',
            runtimeKind: 'scratch-cache',
            alias: 'page_1',
            portableForTransfer: false,
            nonPortableReason: 'no-workspace-or-extension-private-scratch',
            cacheResourceRef: expect.objectContaining({
              scope: 'extension-private',
              source: expect.objectContaining({
                metadata: expect.objectContaining({ nonPortable: true }),
              }),
            }),
          }),
        ],
      }),
    );
    expect(resourceCache.resolve).not.toHaveBeenCalled();
    expect(resourceCache.ensure).not.toHaveBeenCalled();
  });

  it('uses provided image_paths directly when ReadDocument already returned them', async () => {
    const reader = createReader();
    const readFile = vi.fn(async () => PNG_1X1);
    const tool = createReadDocumentImageTool({ reader, readFile });

    const result = (await tool.execute({
      file_path: '/books/demo.epub',
      image_paths: ['/cache/direct.png'],
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(reader.getManifest).not.toHaveBeenCalled();
    expect(readFile).toHaveBeenCalledWith('/cache/direct.png');
  });

  it('passes vision preprocessing options through to ReadImage', async () => {
    const reader = createReader();
    const readFile = vi.fn(async () => PNG_1X1);
    const imageProcessor = {
      metadata: vi.fn(async () => ({ width: 1, height: 1 })),
      toJpeg: vi.fn(async () => JPEG_1X1),
    };
    const service = {
      chatStream: vi.fn(() => ({
        stream: emptyStream(),
        response: Promise.resolve({
          message: { role: 'assistant', content: 'page analysis' },
        }),
      })),
    };
    const platform = {
      createService: vi.fn(() => service),
    };
    const tool = createReadDocumentImageTool({
      reader,
      readFile,
      imageProcessor,
      platform: platform as never,
      getSelectedChatModel: () => ({
        providerId: 'deepseek-direct',
        modelId: 'deepseek-vision',
        category: 'llm',
      }),
    });

    const result = (await tool.execute({
      file_path: '/books/demo.epub',
      image_paths: ['/cache/direct.png'],
      mode: 'vision',
      preprocess: 'auto',
      max_long_edge: 768,
      quality: 75,
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(imageProcessor.toJpeg).toHaveBeenCalledWith({
      buffer: PNG_1X1,
      jpegQuality: 75,
    });
    expect(result.data).toEqual(
      expect.objectContaining({
        images: [
          expect.objectContaining({
            analysis: 'page analysis',
            visionInput: expect.objectContaining({
              preprocess: 'auto',
              mimeType: 'image/jpeg',
              maxLongEdge: 768,
              jpegQuality: 75,
            }),
            documentImage: expect.objectContaining({ path: '/cache/direct.png' }),
          }),
        ],
      }),
    );
  });
});

function createResourceCache(): ResourceCacheService {
  return {
    registerProvider: vi.fn(),
    findByLocalPath: vi.fn(async () => undefined),
    ensure: vi.fn(async (ref: ResourceRef, variant) => ({
      status: 'ready',
      ref,
      variant: { resource: ref, ...variant },
      absolutePath: '/workspace/.neko/.cache/resources/documents/page.png',
    })),
    resolve: vi.fn(async (ref: ResourceRef, variant) => ({
      status: 'ready',
      ref,
      variant: { resource: ref, ...variant },
      absolutePath: '/workspace/.neko/.cache/resources/documents/page.png',
    })),
    project: vi.fn(async (_webview, ref: ResourceRef, variant) => ({
      status: 'missing',
      ref,
      variant: { resource: ref, ...variant },
    })),
    invalidate: vi.fn(async () => undefined),
    invalidateManifestCache: vi.fn(),
    stats: vi.fn(async () => ({
      totalSizeBytes: 0,
      entryCount: 0,
      variantCount: 0,
      staleCount: 0,
      missingCount: 0,
      scopeCounts: {},
      providerCounts: {},
      providerBytes: {},
    })),
    gc: vi.fn(async () => ({
      removedCount: 0,
      removedBytes: 0,
      skippedCount: 0,
      skippedReasons: {},
    })),
  };
}
