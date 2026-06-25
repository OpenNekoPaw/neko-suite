import { describe, expect, it, vi } from 'vitest';
import { TOOL_NAMES_SYSTEM, type ResourceRef, type ToolResult } from '@neko/shared';
import type { ResourceCacheService } from '@neko/shared/vscode/extension';
import { createWorkspaceFileAccessPolicy } from '@neko/agent/tools';
import { createReadDocumentTool } from '../readDocumentTool';
import type { IDocumentReaderService } from '../../services/DocumentReaderService';

const WORKSPACE_ROOT = '/workspace';

function createFileAccessPolicy() {
  return createWorkspaceFileAccessPolicy({
    workspaceRoot: WORKSPACE_ROOT,
    ignoredPathExemptRoots: [`${WORKSPACE_ROOT}/.neko/.cache/resources`],
  });
}

function createReadDocumentTestTool(deps: Parameters<typeof createReadDocumentTool>[0]) {
  return createReadDocumentTool({
    fileAccessPolicy: createFileAccessPolicy(),
    ...deps,
  });
}

function createReader(overrides: Partial<IDocumentReaderService> = {}): IDocumentReaderService {
  return {
    supports: vi.fn(() => true),
    hasDRM: vi.fn(async () => false),
    read: vi.fn(async () => ({
      text: 'Chapter one',
      pageCount: 1,
      metadata: { title: 'Book' },
    })),
    readContent: vi.fn(async () => ({ text: 'Chapter one' })),
    getManifest: vi.fn(async () => ({
      source: { filePath: '/workspace/books/demo.epub', format: 'epub', fileId: 'book-1' },
      format: 'epub',
      fileId: 'book-1',
      chapterCount: 1,
      units: [
        {
          kind: 'chapter',
          locator: { kind: 'chapter', chapterHref: 'chapter-1', spineIndex: 0 },
        },
      ],
      capabilities: {
        supportsManifest: true,
        supportsRangeRead: true,
        supportsCursorRead: true,
        supportsChapterRange: true,
      },
    })),
    createBatchCursor: vi.fn(async () => ({
      source: { filePath: '/workspace/books/demo.epub', format: 'epub', fileId: 'book-1' },
      strategy: 'manifest-order',
      next: { kind: 'chapter', chapterHref: 'chapter-1', spineIndex: 0 },
      batchIndex: 0,
      done: false,
      fileId: 'book-1',
    })),
    readRange: vi.fn(async () => ({
      source: { filePath: '/workspace/books/demo.epub', format: 'epub', fileId: 'book-1' },
      locator: { kind: 'chapter', chapterHref: 'chapter-1', spineIndex: 0 },
      text: 'Chapter range',
      totalTextChars: 13,
      returnedTextChars: 13,
      truncated: false,
    })),
    readNext: vi.fn(async (cursor) => ({
      source: cursor.source,
      text: 'Next batch',
      returnedTextChars: 10,
      truncated: false,
      cursor: { ...cursor, done: true, batchIndex: cursor.batchIndex + 1 },
    })),
    ...overrides,
  };
}

describe('createReadDocumentTool', () => {
  it('creates a read-only document tool with the shared tool name', () => {
    const tool = createReadDocumentTestTool({ reader: createReader() });

    expect(tool.name).toBe(TOOL_NAMES_SYSTEM.READ_DOCUMENT);
    expect(tool.category).toBe('document');
    expect(tool.isReadOnly).toBe(true);
    expect(tool.isConcurrencySafe).toBe(true);
    expect(tool.parameters.required).toEqual(['file_path']);
  });

  it('reads EPUB/text content through the injected reader service', async () => {
    const reader = createReader({
      read: vi.fn(async () => ({
        text: 'EPUB chapter text',
        metadata: { title: 'Demo EPUB', author: 'Neko' },
      })),
    });
    const tool = createReadDocumentTestTool({ reader });

    const result = (await tool.execute({
      file_path: '/workspace/books/demo.epub',
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(reader.supports).toHaveBeenCalledWith('/workspace/books/demo.epub');
    expect(reader.read).toHaveBeenCalledWith('/workspace/books/demo.epub');
    expect(result.data).toEqual(
      expect.objectContaining({
        filePath: '/workspace/books/demo.epub',
        text: 'EPUB chapter text',
        metadata: { title: 'Demo EPUB', author: 'Neko' },
        totalTextChars: 'EPUB chapter text'.length,
        returnedTextChars: 'EPUB chapter text'.length,
        truncated: false,
      }),
    );
  });

  it('fails closed for local documents when no authorized workspace policy is provided', async () => {
    const reader = createReader();
    const tool = createReadDocumentTool({ reader });

    const result = (await tool.execute({
      file_path: '/workspace/books/demo.epub',
    })) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error).toContain('no authorized workspace root');
    expect(reader.read).not.toHaveBeenCalled();
  });

  it('returns a clear error for unsupported local formats', async () => {
    const reader = createReader({ supports: vi.fn(() => false) });
    const tool = createReadDocumentTestTool({ reader });

    const result = (await tool.execute({ file_path: '/workspace/app.bin' })) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unsupported document format');
    expect(reader.read).not.toHaveBeenCalled();
  });

  it('allows URL reads without local extension support checks', async () => {
    const reader = createReader({
      supports: vi.fn(() => false),
      read: vi.fn(async () => ({ text: 'Remote article' })),
    });
    const tool = createReadDocumentTestTool({ reader });

    const result = (await tool.execute({ file_path: 'https://example.com/article' })) as ToolResult;

    expect(result.success).toBe(true);
    expect(reader.supports).not.toHaveBeenCalled();
    expect(reader.read).toHaveBeenCalledWith('https://example.com/article');
  });

  it('truncates long text and preserves total character counts', async () => {
    const longText = 'a'.repeat(1200);
    const reader = createReader({
      read: vi.fn(async () => ({ text: longText })),
    });
    const tool = createReadDocumentTestTool({ reader });

    const result = (await tool.execute({
      file_path: '/workspace/notes.txt',
      max_chars: 1000,
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        text: expect.stringContaining('ReadDocument truncated 200 characters'),
        totalTextChars: 1200,
        truncated: true,
      }),
    );
  });

  it('limits image paths returned by archive readers', async () => {
    const reader = createReader({
      read: vi.fn(async () => ({
        text: 'Comic archive with 3 pages',
        pageCount: 3,
        imagePaths: [
          '/workspace/.neko/.cache/resources/document-runtime/1.png',
          '/workspace/.neko/.cache/resources/document-runtime/2.png',
          '/workspace/.neko/.cache/resources/document-runtime/3.png',
        ],
        imageInfo: [
          {
            path: '/workspace/.neko/.cache/resources/document-runtime/1.png',
            width: 100,
            height: 200,
            mimeType: 'image/png',
            byteSize: 10,
            resourceRef: {
              kind: 'document-entry',
              source: { filePath: '/workspace/books/comic.cbz', format: 'cbz' },
              entryPath: '1.png',
              cachePath: '/workspace/.neko/.cache/resources/document-runtime/1.png',
            },
          },
          {
            path: '/workspace/.neko/.cache/resources/document-runtime/2.png',
            width: 110,
            height: 210,
            mimeType: 'image/png',
            byteSize: 11,
          },
          {
            path: '/workspace/.neko/.cache/resources/document-runtime/3.png',
            width: 120,
            height: 220,
            mimeType: 'image/png',
            byteSize: 12,
          },
        ],
      })),
    });
    const tool = createReadDocumentTestTool({ reader });

    const result = (await tool.execute({
      file_path: '/workspace/books/comic.cbz',
      image_path_limit: 2,
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        imagePaths: [
          '/workspace/.neko/.cache/resources/document-runtime/1.png',
          '/workspace/.neko/.cache/resources/document-runtime/2.png',
        ],
        runtimeImagePaths: [
          '/workspace/.neko/.cache/resources/document-runtime/1.png',
          '/workspace/.neko/.cache/resources/document-runtime/2.png',
        ],
        imageInfo: [
          expect.objectContaining({
            path: '/workspace/.neko/.cache/resources/document-runtime/1.png',
            runtimePath: '/workspace/.neko/.cache/resources/document-runtime/1.png',
            runtimeKind: 'scratch-cache',
            alias: 'image_1',
            aliasScope: 'document:/workspace/books/comic.cbz',
            sourceDocumentId: '/workspace/books/comic.cbz',
            entryPath: '1.png',
            portableForTransfer: true,
            resourceRef: expect.not.objectContaining({
              cachePath: expect.any(String),
            }),
            width: 100,
            height: 200,
            mimeType: 'image/png',
            byteSize: 10,
            cacheResourceRef: expect.objectContaining({
              provider: 'document-archive',
              kind: 'document',
              locator: expect.objectContaining({ entryPath: '1.png' }),
            }),
          }),
          expect.objectContaining({
            path: '/workspace/.neko/.cache/resources/document-runtime/2.png',
            runtimePath: '/workspace/.neko/.cache/resources/document-runtime/2.png',
            runtimeKind: 'scratch-cache',
            alias: 'image_2',
            portableForTransfer: false,
            width: 110,
            height: 210,
            mimeType: 'image/png',
            byteSize: 11,
          }),
        ],
        imagePathCount: 3,
        imagePathsTruncated: true,
      }),
    );
  });

  it('rejects system temp image outputs from document readers', async () => {
    const tempImagePath =
      '/var/folders/26/b9fmn08x6mv2bcl771rnjyt80000gn/T/neko_epub_1vehc43/0001_moe-017905.jpg';
    const reader = createReader({
      read: vi.fn(async () => ({
        text: 'Comic archive',
        imagePaths: [tempImagePath],
        imageInfo: [{ path: tempImagePath, width: 100, height: 200 }],
      })),
    });
    const tool = createReadDocumentTestTool({ reader });

    const result = (await tool.execute({
      file_path: '/workspace/books/comic.cbz',
    })) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error).toContain('system temp');
  });

  it('prewarms project document image refs in the unified resource cache', async () => {
    const reader = createReader({
      read: vi.fn(async () => ({
        text: 'Comic archive',
        imagePaths: ['/workspace/.neko/.cache/resources/document-runtime/1.png'],
        imageInfo: [
          {
            path: '/workspace/.neko/.cache/resources/document-runtime/1.png',
            width: 100,
            height: 200,
            mimeType: 'image/png',
            resourceRef: {
              kind: 'document-entry',
              source: { filePath: '/workspace/books/comic.cbz', format: 'cbz' },
              entryPath: '1.png',
              cachePath: '/workspace/.neko/.cache/resources/document-runtime/1.png',
            },
          },
        ],
      })),
    });
    const resourceCache = createResourceCache();
    const tool = createReadDocumentTestTool({ reader, resourceCache });

    const result = (await tool.execute({ file_path: '/workspace/books/comic.cbz' })) as ToolResult;

    expect(result.success).toBe(true);
    expect(resourceCache.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'project',
        provider: 'document-archive',
        kind: 'document',
        locator: expect.objectContaining({ entryPath: '1.png' }),
      }),
      { role: 'document-entry', mimeType: 'image/png', width: 100, height: 200 },
      { materializeIfMissing: true },
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        imagePaths: ['/workspace/.neko/.cache/resources/documents/page.png'],
        runtimeImagePaths: ['/workspace/.neko/.cache/resources/documents/page.png'],
        imageInfo: [
          expect.objectContaining({
            path: '/workspace/.neko/.cache/resources/documents/page.png',
            runtimePath: '/workspace/.neko/.cache/resources/documents/page.png',
            runtimeKind: 'managed-cache',
            alias: 'image_1',
            aliasScope: 'document:/workspace/books/comic.cbz',
            sourceDocumentId: '/workspace/books/comic.cbz',
            entryPath: '1.png',
            portableForTransfer: true,
            resourceRef: {
              kind: 'document-entry',
              source: { filePath: '/workspace/books/comic.cbz', format: 'cbz' },
              entryPath: '1.png',
            },
            cacheResourceRef: expect.objectContaining({
              provider: 'document-archive',
            }),
          }),
        ],
      }),
    );
    expect(JSON.stringify(result.data)).not.toContain('legacyCachePath');
    expect(JSON.stringify(result.data)).not.toContain('"cachePath"');
  });

  it('marks no-workspace document image refs as extension-private and non-portable', async () => {
    const reader = createReader({
      read: vi.fn(async () => ({
        text: 'Comic archive',
        imagePaths: ['/workspace/.neko/.cache/resources/document-runtime/1.png'],
        imageInfo: [
          {
            path: '/workspace/.neko/.cache/resources/document-runtime/1.png',
            resourceRef: {
              kind: 'document-entry',
              source: { filePath: '/workspace/books/comic.cbz', format: 'cbz' },
              entryPath: '1.png',
              cachePath: '/workspace/.neko/.cache/resources/document-runtime/1.png',
            },
          },
        ],
      })),
    });
    const resourceCache = createResourceCache();
    const tool = createReadDocumentTestTool({
      reader,
      resourceCache,
      resolveResourceScope: () => 'extension-private',
    });

    const result = (await tool.execute({
      file_path: '/workspace/books/comic.cbz',
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        imageInfo: [
          expect.objectContaining({
            cacheResourceRef: expect.objectContaining({
              scope: 'extension-private',
              source: expect.objectContaining({
                metadata: expect.objectContaining({
                  nonPortable: true,
                  nonPortableReason: 'no-workspace-or-extension-private-scratch',
                }),
              }),
            }),
          }),
        ],
      }),
    );
    expect(resourceCache.resolve).not.toHaveBeenCalled();
    expect(resourceCache.ensure).not.toHaveBeenCalled();
  });

  it('returns document manifests without full content reads', async () => {
    const reader = createReader();
    const tool = createReadDocumentTestTool({ reader });

    const result = (await tool.execute({
      file_path: '/workspace/books/demo.epub',
      mode: 'manifest',
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(reader.getManifest).toHaveBeenCalledWith('/workspace/books/demo.epub');
    expect(reader.read).not.toHaveBeenCalled();
    expect(result.data).toEqual(expect.objectContaining({ format: 'epub', chapterCount: 1 }));
  });

  it('can start a manifest-order batch cursor from manifest mode', async () => {
    const reader = createReader();
    const tool = createReadDocumentTestTool({ reader });

    const result = (await tool.execute({
      file_path: '/workspace/books/demo.epub',
      mode: 'manifest',
      start_batch: true,
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(reader.createBatchCursor).toHaveBeenCalledWith(
      { filePath: '/workspace/books/demo.epub', format: 'epub', fileId: 'book-1' },
      { maxChars: 20000 },
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        manifest: expect.objectContaining({ format: 'epub' }),
        cursor: expect.objectContaining({ strategy: 'manifest-order' }),
      }),
    );
  });

  it('reads explicit document ranges', async () => {
    const reader = createReader();
    const tool = createReadDocumentTestTool({ reader });

    const result = (await tool.execute({
      file_path: '/workspace/books/demo.epub',
      mode: 'range',
      max_chars: 1000,
      range: { locator: { kind: 'chapter', chapterHref: 'chapter-1', spineIndex: 0 } },
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(reader.readRange).toHaveBeenCalledWith('/workspace/books/demo.epub', {
      locator: { kind: 'chapter', chapterHref: 'chapter-1', spineIndex: 0 },
      limit: { maxChars: 1000, maxImages: 50 },
    });
    expect(result.data).toEqual(expect.objectContaining({ text: 'Chapter range' }));
  });

  it('limits image metadata with image paths in range results', async () => {
    const reader = createReader({
      readRange: vi.fn(async () => ({
        source: { filePath: '/workspace/books/demo.epub', format: 'epub', fileId: 'book-1' },
        locator: { kind: 'chapter', chapterHref: 'chapter-1', spineIndex: 0 },
        text: 'EPUB chapter range with 3 image pages',
        imagePaths: [
          '/workspace/.neko/.cache/resources/document-runtime/1.jpg',
          '/workspace/.neko/.cache/resources/document-runtime/2.jpg',
          '/workspace/.neko/.cache/resources/document-runtime/3.jpg',
        ],
        imageInfo: [
          {
            path: '/workspace/.neko/.cache/resources/document-runtime/1.jpg',
            width: 100,
            height: 200,
            mimeType: 'image/jpeg',
            byteSize: 10,
          },
          {
            path: '/workspace/.neko/.cache/resources/document-runtime/2.jpg',
            width: 110,
            height: 210,
            mimeType: 'image/jpeg',
            byteSize: 11,
          },
          {
            path: '/workspace/.neko/.cache/resources/document-runtime/3.jpg',
            width: 120,
            height: 220,
            mimeType: 'image/jpeg',
            byteSize: 12,
          },
        ],
        excerpt: {
          contentKind: 'image',
          imagePaths: [
            '/workspace/.neko/.cache/resources/document-runtime/1.jpg',
            '/workspace/.neko/.cache/resources/document-runtime/2.jpg',
            '/workspace/.neko/.cache/resources/document-runtime/3.jpg',
          ],
          imageInfo: [
            {
              path: '/workspace/.neko/.cache/resources/document-runtime/1.jpg',
              width: 100,
              height: 200,
              mimeType: 'image/jpeg',
              byteSize: 10,
            },
            {
              path: '/workspace/.neko/.cache/resources/document-runtime/2.jpg',
              width: 110,
              height: 210,
              mimeType: 'image/jpeg',
              byteSize: 11,
            },
            {
              path: '/workspace/.neko/.cache/resources/document-runtime/3.jpg',
              width: 120,
              height: 220,
              mimeType: 'image/jpeg',
              byteSize: 12,
            },
          ],
        },
        totalTextChars: 37,
        returnedTextChars: 37,
        truncated: false,
      })),
    });
    const tool = createReadDocumentTestTool({ reader });

    const result = (await tool.execute({
      file_path: '/workspace/books/demo.epub',
      mode: 'range',
      image_path_limit: 2,
      range: { locator: { kind: 'chapter', chapterHref: 'chapter-1', spineIndex: 0 } },
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        imagePaths: [
          '/workspace/.neko/.cache/resources/document-runtime/1.jpg',
          '/workspace/.neko/.cache/resources/document-runtime/2.jpg',
        ],
        runtimeImagePaths: [
          '/workspace/.neko/.cache/resources/document-runtime/1.jpg',
          '/workspace/.neko/.cache/resources/document-runtime/2.jpg',
        ],
        imageInfo: [
          expect.objectContaining({
            path: '/workspace/.neko/.cache/resources/document-runtime/1.jpg',
            runtimePath: '/workspace/.neko/.cache/resources/document-runtime/1.jpg',
            runtimeKind: 'scratch-cache',
            alias: 'image_1',
            portableForTransfer: false,
            width: 100,
            height: 200,
            mimeType: 'image/jpeg',
            byteSize: 10,
          }),
          expect.objectContaining({
            path: '/workspace/.neko/.cache/resources/document-runtime/2.jpg',
            runtimePath: '/workspace/.neko/.cache/resources/document-runtime/2.jpg',
            runtimeKind: 'scratch-cache',
            alias: 'image_2',
            portableForTransfer: false,
            width: 110,
            height: 210,
            mimeType: 'image/jpeg',
            byteSize: 11,
          }),
        ],
        excerpt: expect.objectContaining({
          imagePaths: [
            '/workspace/.neko/.cache/resources/document-runtime/1.jpg',
            '/workspace/.neko/.cache/resources/document-runtime/2.jpg',
          ],
        }),
        metadata: expect.objectContaining({
          imagePathCount: 3,
          imagePathsTruncated: true,
        }),
      }),
    );
  });

  it('hides image metadata when image paths are excluded', async () => {
    const reader = createReader({
      readRange: vi.fn(async () => ({
        source: { filePath: '/workspace/books/demo.epub', format: 'epub', fileId: 'book-1' },
        text: 'EPUB chapter range with 1 image pages',
        imagePaths: ['/workspace/.neko/.cache/resources/document-runtime/1.jpg'],
        imageInfo: [
          {
            path: '/workspace/.neko/.cache/resources/document-runtime/1.jpg',
            width: 100,
            height: 200,
            mimeType: 'image/jpeg',
            byteSize: 10,
          },
        ],
        excerpt: {
          contentKind: 'image',
          imagePaths: ['/workspace/.neko/.cache/resources/document-runtime/1.jpg'],
          imageInfo: [
            {
              path: '/workspace/.neko/.cache/resources/document-runtime/1.jpg',
              width: 100,
              height: 200,
              mimeType: 'image/jpeg',
              byteSize: 10,
            },
          ],
        },
        returnedTextChars: 37,
        truncated: false,
      })),
    });
    const tool = createReadDocumentTestTool({ reader });

    const result = (await tool.execute({
      file_path: '/workspace/books/demo.epub',
      mode: 'range',
      include_image_paths: false,
      range: { locator: { kind: 'chapter', chapterHref: 'chapter-1', spineIndex: 0 } },
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        imagePaths: [],
        imageInfo: [],
        excerpt: expect.objectContaining({
          imagePaths: [],
        }),
      }),
    );
  });

  it('omits range manifests by default and honors include_metadata=false', async () => {
    const reader = createReader({
      readRange: vi.fn(async () => ({
        source: { filePath: '/workspace/books/demo.epub', format: 'epub', fileId: 'book-1' },
        locator: { kind: 'chapter', chapterHref: 'chapter-1', spineIndex: 0 },
        text: 'Chapter range',
        imagePaths: ['/workspace/.neko/.cache/resources/document-runtime/1.jpg'],
        imageInfo: [
          {
            path: '/workspace/.neko/.cache/resources/document-runtime/1.jpg',
            width: 100,
            height: 200,
          },
        ],
        totalTextChars: 13,
        returnedTextChars: 13,
        truncated: false,
        metadata: { title: 'Demo EPUB' },
        manifest: {
          source: { filePath: '/workspace/books/demo.epub', format: 'epub', fileId: 'book-1' },
          format: 'epub',
          fileId: 'book-1',
          chapterCount: 1,
          units: [
            {
              kind: 'chapter',
              locator: { kind: 'chapter', chapterHref: 'chapter-1', spineIndex: 0 },
            },
          ],
          capabilities: {
            supportsManifest: true,
            supportsRangeRead: true,
            supportsCursorRead: true,
          },
        },
      })),
    });
    const tool = createReadDocumentTestTool({ reader });

    const result = (await tool.execute({
      file_path: '/workspace/books/demo.epub',
      mode: 'range',
      include_metadata: false,
      range: { locator: { kind: 'chapter', chapterHref: 'chapter-1', spineIndex: 0 } },
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        text: 'Chapter range',
        imagePaths: ['/workspace/.neko/.cache/resources/document-runtime/1.jpg'],
        runtimeImagePaths: ['/workspace/.neko/.cache/resources/document-runtime/1.jpg'],
        imageInfo: [
          expect.objectContaining({
            path: '/workspace/.neko/.cache/resources/document-runtime/1.jpg',
            runtimePath: '/workspace/.neko/.cache/resources/document-runtime/1.jpg',
            runtimeKind: 'scratch-cache',
            alias: 'image_1',
            portableForTransfer: false,
            width: 100,
            height: 200,
          }),
        ],
      }),
    );
    expect(result.data).not.toHaveProperty('metadata');
    expect(result.data).not.toHaveProperty('manifest');
  });

  it('can explicitly include range manifests when requested', async () => {
    const reader = createReader({
      readRange: vi.fn(async () => ({
        source: { filePath: '/workspace/books/demo.epub', format: 'epub', fileId: 'book-1' },
        locator: { kind: 'chapter', chapterHref: 'chapter-1', spineIndex: 0 },
        text: 'Chapter range',
        returnedTextChars: 13,
        truncated: false,
        manifest: {
          source: { filePath: '/workspace/books/demo.epub', format: 'epub', fileId: 'book-1' },
          format: 'epub',
          fileId: 'book-1',
          chapterCount: 1,
          units: [
            {
              kind: 'chapter',
              locator: { kind: 'chapter', chapterHref: 'chapter-1', spineIndex: 0 },
            },
          ],
          capabilities: {
            supportsManifest: true,
            supportsRangeRead: true,
            supportsCursorRead: true,
          },
        },
      })),
    });
    const tool = createReadDocumentTestTool({ reader });

    const result = (await tool.execute({
      file_path: '/workspace/books/demo.epub',
      mode: 'range',
      include_manifest: true,
      range: { locator: { kind: 'chapter', chapterHref: 'chapter-1', spineIndex: 0 } },
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        manifest: expect.objectContaining({ chapterCount: 1 }),
      }),
    );
  });

  it('defaults missing range mode ranges to the first manifest units', async () => {
    const reader = createReader({
      getManifest: vi.fn(async () => ({
        source: { filePath: '/workspace/books/demo.epub', format: 'epub', fileId: 'book-1' },
        format: 'epub',
        fileId: 'book-1',
        chapterCount: 3,
        units: [
          {
            kind: 'chapter',
            locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 0 },
          },
          {
            kind: 'chapter',
            locator: { kind: 'chapter', chapterHref: 'Page_2', spineIndex: 1 },
          },
          {
            kind: 'chapter',
            locator: { kind: 'chapter', chapterHref: 'Page_3', spineIndex: 2 },
          },
        ],
        capabilities: {
          supportsManifest: true,
          supportsRangeRead: true,
          supportsCursorRead: true,
          supportsChapterRange: true,
        },
      })),
    });
    const tool = createReadDocumentTestTool({ reader });

    const result = (await tool.execute({
      file_path: '/workspace/books/demo.epub',
      mode: 'range',
      image_path_limit: 2,
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(reader.getManifest).toHaveBeenCalledWith('/workspace/books/demo.epub');
    expect(reader.readRange).toHaveBeenCalledWith('/workspace/books/demo.epub', {
      locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 0 },
      endLocator: { kind: 'chapter', chapterHref: 'Page_2', spineIndex: 1 },
      limit: { maxChars: 20000, maxImages: 2 },
    });
    expect(reader.read).not.toHaveBeenCalled();
  });

  it('accepts chapterRange shorthand from document preview ranges', async () => {
    const reader = createReader();
    const tool = createReadDocumentTestTool({ reader });

    const result = (await tool.execute({
      file_path: '/workspace/books/demo.epub',
      mode: 'range',
      range: {
        kind: 'chapterRange',
        start: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 1 },
        end: { kind: 'chapter', chapterHref: 'Page_10', spineIndex: 10 },
      },
      image_path_limit: 10,
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(reader.readRange).toHaveBeenCalledWith('/workspace/books/demo.epub', {
      locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 1 },
      endLocator: { kind: 'chapter', chapterHref: 'Page_10', spineIndex: 10 },
      limit: { maxChars: 20000, maxImages: 10 },
    });
  });

  it('rejects malformed range locators before calling the reader', async () => {
    const reader = createReader();
    const tool = createReadDocumentTestTool({ reader });

    const result = (await tool.execute({
      file_path: '/workspace/books/demo.epub',
      mode: 'range',
      range: { locator: { chapterHref: 'chapter-1' } },
    })) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing or invalid required field for range mode');
    expect(reader.readRange).not.toHaveBeenCalled();
  });

  it('rejects malformed cursors before calling the reader', async () => {
    const reader = createReader();
    const tool = createReadDocumentTestTool({ reader });

    const result = (await tool.execute({
      file_path: '/workspace/books/demo.epub',
      mode: 'next',
      cursor: {
        source: { filePath: '/workspace/books/demo.epub', format: 'epub' },
        strategy: 'unknown',
        done: false,
      },
    })) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing or invalid required field for next mode');
    expect(reader.readNext).not.toHaveBeenCalled();
  });

  it('continues cursor batches', async () => {
    const reader = createReader();
    const tool = createReadDocumentTestTool({ reader });

    const cursor = {
      source: { filePath: '/workspace/books/demo.epub', format: 'epub' as const, fileId: 'book-1' },
      strategy: 'manifest-order' as const,
      next: { kind: 'chapter' as const, chapterHref: 'chapter-1', spineIndex: 0 },
      batchIndex: 0,
      done: false,
      fileId: 'book-1',
    };
    const result = (await tool.execute({
      file_path: '/workspace/books/demo.epub',
      mode: 'next',
      cursor,
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(reader.readNext).toHaveBeenCalledWith(cursor);
    expect(result.data).toEqual(expect.objectContaining({ text: 'Next batch' }));
  });

  it('omits next manifests by default to keep cursor batches compact', async () => {
    const reader = createReader({
      readNext: vi.fn(async (cursor) => ({
        source: cursor.source,
        text: 'Next batch',
        imagePaths: ['/workspace/.neko/.cache/resources/document-runtime/page-1.jpg'],
        imageInfo: [
          {
            path: '/workspace/.neko/.cache/resources/document-runtime/page-1.jpg',
            width: 100,
            height: 200,
          },
        ],
        returnedTextChars: 10,
        truncated: false,
        metadata: { title: 'Book' },
        manifest: {
          source: cursor.source,
          format: 'epub',
          fileId: 'book-1',
          chapterCount: 2,
          units: [
            {
              kind: 'chapter',
              locator: { kind: 'chapter', chapterHref: 'chapter-1', spineIndex: 0 },
            },
            {
              kind: 'chapter',
              locator: { kind: 'chapter', chapterHref: 'chapter-2', spineIndex: 1 },
            },
          ],
          capabilities: {
            supportsManifest: true,
            supportsRangeRead: true,
            supportsCursorRead: true,
          },
        },
        cursor: { ...cursor, done: true, batchIndex: cursor.batchIndex + 1 },
      })),
    });
    const tool = createReadDocumentTestTool({ reader });

    const result = (await tool.execute({
      file_path: '/workspace/books/demo.epub',
      mode: 'next',
      cursor: {
        source: {
          filePath: '/workspace/books/demo.epub',
          format: 'epub' as const,
          fileId: 'book-1',
        },
        strategy: 'manifest-order' as const,
        next: { kind: 'chapter' as const, chapterHref: 'chapter-1', spineIndex: 0 },
        batchIndex: 0,
        done: false,
        fileId: 'book-1',
      },
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        text: 'Next batch',
        imagePaths: ['/workspace/.neko/.cache/resources/document-runtime/page-1.jpg'],
        runtimeImagePaths: ['/workspace/.neko/.cache/resources/document-runtime/page-1.jpg'],
        imageInfo: [
          expect.objectContaining({
            path: '/workspace/.neko/.cache/resources/document-runtime/page-1.jpg',
            runtimePath: '/workspace/.neko/.cache/resources/document-runtime/page-1.jpg',
            runtimeKind: 'scratch-cache',
            alias: 'image_1',
            portableForTransfer: false,
            width: 100,
            height: 200,
          }),
        ],
        cursor: expect.objectContaining({ done: true }),
        metadata: expect.objectContaining({
          title: 'Book',
          imagePathCount: 1,
          imagePathsTruncated: false,
        }),
      }),
    );
    expect(result.data).not.toHaveProperty('manifest');
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
    record: vi.fn(async (record) => ({
      status: record.status ?? 'ready',
      ref: record.ref,
      variant: { resource: record.ref, ...record.variant },
      absolutePath: record.absolutePath,
      relativePath: record.relativePath,
    })),
    updateLifecycle: vi.fn(async (record) => ({
      status: 'ready',
      ref: record.ref,
      variant: { resource: record.ref, ...record.variant },
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
