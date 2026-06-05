import { describe, expect, it, vi } from 'vitest';
import { TOOL_NAMES_SYSTEM, type ResourceRef, type ToolResult } from '@neko/shared';
import type { ResourceCacheService } from '@neko/shared/vscode/extension';
import { createReadDocumentTool } from '../readDocumentTool';
import type { IDocumentReaderService } from '../../services/DocumentReaderService';

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
      source: { filePath: '/books/demo.epub', format: 'epub', fileId: 'book-1' },
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
      source: { filePath: '/books/demo.epub', format: 'epub', fileId: 'book-1' },
      strategy: 'manifest-order',
      next: { kind: 'chapter', chapterHref: 'chapter-1', spineIndex: 0 },
      batchIndex: 0,
      done: false,
      fileId: 'book-1',
    })),
    readRange: vi.fn(async () => ({
      source: { filePath: '/books/demo.epub', format: 'epub', fileId: 'book-1' },
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
    const tool = createReadDocumentTool({ reader: createReader() });

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
    const tool = createReadDocumentTool({ reader });

    const result = (await tool.execute({
      file_path: '/books/demo.epub',
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(reader.supports).toHaveBeenCalledWith('/books/demo.epub');
    expect(reader.read).toHaveBeenCalledWith('/books/demo.epub');
    expect(result.data).toEqual(
      expect.objectContaining({
        filePath: '/books/demo.epub',
        text: 'EPUB chapter text',
        metadata: { title: 'Demo EPUB', author: 'Neko' },
        totalTextChars: 'EPUB chapter text'.length,
        returnedTextChars: 'EPUB chapter text'.length,
        truncated: false,
      }),
    );
  });

  it('returns a clear error for unsupported local formats', async () => {
    const reader = createReader({ supports: vi.fn(() => false) });
    const tool = createReadDocumentTool({ reader });

    const result = (await tool.execute({ file_path: '/tmp/app.bin' })) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unsupported document format');
    expect(reader.read).not.toHaveBeenCalled();
  });

  it('allows URL reads without local extension support checks', async () => {
    const reader = createReader({
      supports: vi.fn(() => false),
      read: vi.fn(async () => ({ text: 'Remote article' })),
    });
    const tool = createReadDocumentTool({ reader });

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
    const tool = createReadDocumentTool({ reader });

    const result = (await tool.execute({
      file_path: '/tmp/notes.txt',
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
        imagePaths: ['/tmp/1.png', '/tmp/2.png', '/tmp/3.png'],
        imageInfo: [
          {
            path: '/tmp/1.png',
            width: 100,
            height: 200,
            mimeType: 'image/png',
            byteSize: 10,
            resourceRef: {
              kind: 'document-entry',
              source: { filePath: '/tmp/comic.cbz', format: 'cbz' },
              entryPath: '1.png',
              cachePath: '/tmp/1.png',
            },
          },
          { path: '/tmp/2.png', width: 110, height: 210, mimeType: 'image/png', byteSize: 11 },
          { path: '/tmp/3.png', width: 120, height: 220, mimeType: 'image/png', byteSize: 12 },
        ],
      })),
    });
    const tool = createReadDocumentTool({ reader });

    const result = (await tool.execute({
      file_path: '/tmp/comic.cbz',
      image_path_limit: 2,
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        imagePaths: ['/tmp/1.png', '/tmp/2.png'],
        imageInfo: [
          expect.objectContaining({
            path: '/tmp/1.png',
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
          { path: '/tmp/2.png', width: 110, height: 210, mimeType: 'image/png', byteSize: 11 },
        ],
        imagePathCount: 3,
        imagePathsTruncated: true,
      }),
    );
  });

  it('prewarms project document image refs in the unified resource cache', async () => {
    const reader = createReader({
      read: vi.fn(async () => ({
        text: 'Comic archive',
        imagePaths: ['/tmp/1.png'],
        imageInfo: [
          {
            path: '/tmp/1.png',
            width: 100,
            height: 200,
            mimeType: 'image/png',
            resourceRef: {
              kind: 'document-entry',
              source: { filePath: '/tmp/comic.cbz', format: 'cbz' },
              entryPath: '1.png',
              cachePath: '/tmp/1.png',
            },
          },
        ],
      })),
    });
    const resourceCache = createResourceCache();
    const tool = createReadDocumentTool({ reader, resourceCache });

    const result = (await tool.execute({ file_path: '/tmp/comic.cbz' })) as ToolResult;

    expect(result.success).toBe(true);
    expect(resourceCache.ensure).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'project',
        provider: 'document-archive',
        kind: 'document',
        locator: expect.objectContaining({ entryPath: '1.png' }),
      }),
      { role: 'document-entry', mimeType: 'image/png', width: 100, height: 200 },
    );
  });

  it('marks no-workspace document image refs as extension-private and non-portable', async () => {
    const reader = createReader({
      read: vi.fn(async () => ({
        text: 'Comic archive',
        imagePaths: ['/tmp/1.png'],
        imageInfo: [
          {
            path: '/tmp/1.png',
            resourceRef: {
              kind: 'document-entry',
              source: { filePath: '/tmp/comic.cbz', format: 'cbz' },
              entryPath: '1.png',
              cachePath: '/tmp/1.png',
            },
          },
        ],
      })),
    });
    const resourceCache = createResourceCache();
    const tool = createReadDocumentTool({
      reader,
      resourceCache,
      resolveResourceScope: () => 'extension-private',
    });

    const result = (await tool.execute({
      file_path: '/tmp/comic.cbz',
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
    expect(resourceCache.ensure).not.toHaveBeenCalled();
  });

  it('returns document manifests without full content reads', async () => {
    const reader = createReader();
    const tool = createReadDocumentTool({ reader });

    const result = (await tool.execute({
      file_path: '/books/demo.epub',
      mode: 'manifest',
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(reader.getManifest).toHaveBeenCalledWith('/books/demo.epub');
    expect(reader.read).not.toHaveBeenCalled();
    expect(result.data).toEqual(expect.objectContaining({ format: 'epub', chapterCount: 1 }));
  });

  it('can start a manifest-order batch cursor from manifest mode', async () => {
    const reader = createReader();
    const tool = createReadDocumentTool({ reader });

    const result = (await tool.execute({
      file_path: '/books/demo.epub',
      mode: 'manifest',
      start_batch: true,
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(reader.createBatchCursor).toHaveBeenCalledWith(
      { filePath: '/books/demo.epub', format: 'epub', fileId: 'book-1' },
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
    const tool = createReadDocumentTool({ reader });

    const result = (await tool.execute({
      file_path: '/books/demo.epub',
      mode: 'range',
      max_chars: 1000,
      range: { locator: { kind: 'chapter', chapterHref: 'chapter-1', spineIndex: 0 } },
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(reader.readRange).toHaveBeenCalledWith('/books/demo.epub', {
      locator: { kind: 'chapter', chapterHref: 'chapter-1', spineIndex: 0 },
      limit: { maxChars: 1000, maxImages: 50 },
    });
    expect(result.data).toEqual(expect.objectContaining({ text: 'Chapter range' }));
  });

  it('limits image metadata with image paths in range results', async () => {
    const reader = createReader({
      readRange: vi.fn(async () => ({
        source: { filePath: '/books/demo.epub', format: 'epub', fileId: 'book-1' },
        locator: { kind: 'chapter', chapterHref: 'chapter-1', spineIndex: 0 },
        text: 'EPUB chapter range with 3 image pages',
        imagePaths: ['/tmp/1.jpg', '/tmp/2.jpg', '/tmp/3.jpg'],
        imageInfo: [
          { path: '/tmp/1.jpg', width: 100, height: 200, mimeType: 'image/jpeg', byteSize: 10 },
          { path: '/tmp/2.jpg', width: 110, height: 210, mimeType: 'image/jpeg', byteSize: 11 },
          { path: '/tmp/3.jpg', width: 120, height: 220, mimeType: 'image/jpeg', byteSize: 12 },
        ],
        excerpt: {
          contentKind: 'image',
          imagePaths: ['/tmp/1.jpg', '/tmp/2.jpg', '/tmp/3.jpg'],
          imageInfo: [
            { path: '/tmp/1.jpg', width: 100, height: 200, mimeType: 'image/jpeg', byteSize: 10 },
            { path: '/tmp/2.jpg', width: 110, height: 210, mimeType: 'image/jpeg', byteSize: 11 },
            { path: '/tmp/3.jpg', width: 120, height: 220, mimeType: 'image/jpeg', byteSize: 12 },
          ],
        },
        totalTextChars: 37,
        returnedTextChars: 37,
        truncated: false,
      })),
    });
    const tool = createReadDocumentTool({ reader });

    const result = (await tool.execute({
      file_path: '/books/demo.epub',
      mode: 'range',
      image_path_limit: 2,
      range: { locator: { kind: 'chapter', chapterHref: 'chapter-1', spineIndex: 0 } },
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        imagePaths: ['/tmp/1.jpg', '/tmp/2.jpg'],
        imageInfo: [
          { path: '/tmp/1.jpg', width: 100, height: 200, mimeType: 'image/jpeg', byteSize: 10 },
          { path: '/tmp/2.jpg', width: 110, height: 210, mimeType: 'image/jpeg', byteSize: 11 },
        ],
        excerpt: expect.objectContaining({
          imagePaths: ['/tmp/1.jpg', '/tmp/2.jpg'],
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
        source: { filePath: '/books/demo.epub', format: 'epub', fileId: 'book-1' },
        text: 'EPUB chapter range with 1 image pages',
        imagePaths: ['/tmp/1.jpg'],
        imageInfo: [
          { path: '/tmp/1.jpg', width: 100, height: 200, mimeType: 'image/jpeg', byteSize: 10 },
        ],
        excerpt: {
          contentKind: 'image',
          imagePaths: ['/tmp/1.jpg'],
          imageInfo: [
            { path: '/tmp/1.jpg', width: 100, height: 200, mimeType: 'image/jpeg', byteSize: 10 },
          ],
        },
        returnedTextChars: 37,
        truncated: false,
      })),
    });
    const tool = createReadDocumentTool({ reader });

    const result = (await tool.execute({
      file_path: '/books/demo.epub',
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
        source: { filePath: '/books/demo.epub', format: 'epub', fileId: 'book-1' },
        locator: { kind: 'chapter', chapterHref: 'chapter-1', spineIndex: 0 },
        text: 'Chapter range',
        imagePaths: ['/tmp/1.jpg'],
        imageInfo: [{ path: '/tmp/1.jpg', width: 100, height: 200 }],
        totalTextChars: 13,
        returnedTextChars: 13,
        truncated: false,
        metadata: { title: 'Demo EPUB' },
        manifest: {
          source: { filePath: '/books/demo.epub', format: 'epub', fileId: 'book-1' },
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
    const tool = createReadDocumentTool({ reader });

    const result = (await tool.execute({
      file_path: '/books/demo.epub',
      mode: 'range',
      include_metadata: false,
      range: { locator: { kind: 'chapter', chapterHref: 'chapter-1', spineIndex: 0 } },
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        text: 'Chapter range',
        imagePaths: ['/tmp/1.jpg'],
        imageInfo: [{ path: '/tmp/1.jpg', width: 100, height: 200 }],
      }),
    );
    expect(result.data).not.toHaveProperty('metadata');
    expect(result.data).not.toHaveProperty('manifest');
  });

  it('can explicitly include range manifests when requested', async () => {
    const reader = createReader({
      readRange: vi.fn(async () => ({
        source: { filePath: '/books/demo.epub', format: 'epub', fileId: 'book-1' },
        locator: { kind: 'chapter', chapterHref: 'chapter-1', spineIndex: 0 },
        text: 'Chapter range',
        returnedTextChars: 13,
        truncated: false,
        manifest: {
          source: { filePath: '/books/demo.epub', format: 'epub', fileId: 'book-1' },
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
    const tool = createReadDocumentTool({ reader });

    const result = (await tool.execute({
      file_path: '/books/demo.epub',
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
        source: { filePath: '/books/demo.epub', format: 'epub', fileId: 'book-1' },
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
    const tool = createReadDocumentTool({ reader });

    const result = (await tool.execute({
      file_path: '/books/demo.epub',
      mode: 'range',
      image_path_limit: 2,
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(reader.getManifest).toHaveBeenCalledWith('/books/demo.epub');
    expect(reader.readRange).toHaveBeenCalledWith('/books/demo.epub', {
      locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 0 },
      endLocator: { kind: 'chapter', chapterHref: 'Page_2', spineIndex: 1 },
      limit: { maxChars: 20000, maxImages: 2 },
    });
    expect(reader.read).not.toHaveBeenCalled();
  });

  it('accepts chapterRange shorthand from document preview ranges', async () => {
    const reader = createReader();
    const tool = createReadDocumentTool({ reader });

    const result = (await tool.execute({
      file_path: '/books/demo.epub',
      mode: 'range',
      range: {
        kind: 'chapterRange',
        start: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 1 },
        end: { kind: 'chapter', chapterHref: 'Page_10', spineIndex: 10 },
      },
      image_path_limit: 10,
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(reader.readRange).toHaveBeenCalledWith('/books/demo.epub', {
      locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 1 },
      endLocator: { kind: 'chapter', chapterHref: 'Page_10', spineIndex: 10 },
      limit: { maxChars: 20000, maxImages: 10 },
    });
  });

  it('rejects malformed range locators before calling the reader', async () => {
    const reader = createReader();
    const tool = createReadDocumentTool({ reader });

    const result = (await tool.execute({
      file_path: '/books/demo.epub',
      mode: 'range',
      range: { locator: { chapterHref: 'chapter-1' } },
    })) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing or invalid required field for range mode');
    expect(reader.readRange).not.toHaveBeenCalled();
  });

  it('rejects malformed cursors before calling the reader', async () => {
    const reader = createReader();
    const tool = createReadDocumentTool({ reader });

    const result = (await tool.execute({
      file_path: '/books/demo.epub',
      mode: 'next',
      cursor: {
        source: { filePath: '/books/demo.epub', format: 'epub' },
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
    const tool = createReadDocumentTool({ reader });

    const cursor = {
      source: { filePath: '/books/demo.epub', format: 'epub' as const, fileId: 'book-1' },
      strategy: 'manifest-order' as const,
      next: { kind: 'chapter' as const, chapterHref: 'chapter-1', spineIndex: 0 },
      batchIndex: 0,
      done: false,
      fileId: 'book-1',
    };
    const result = (await tool.execute({
      file_path: '/books/demo.epub',
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
        imagePaths: ['/tmp/page-1.jpg'],
        imageInfo: [{ path: '/tmp/page-1.jpg', width: 100, height: 200 }],
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
    const tool = createReadDocumentTool({ reader });

    const result = (await tool.execute({
      file_path: '/books/demo.epub',
      mode: 'next',
      cursor: {
        source: { filePath: '/books/demo.epub', format: 'epub' as const, fileId: 'book-1' },
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
        imagePaths: ['/tmp/page-1.jpg'],
        imageInfo: [{ path: '/tmp/page-1.jpg', width: 100, height: 200 }],
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
    ensure: vi.fn(async (ref: ResourceRef, variant) => ({
      status: 'ready',
      ref,
      variant: { resource: ref, ...variant },
      absolutePath: '/workspace/.neko/.cache/resources/documents/page.png',
    })),
    resolve: vi.fn(async (ref: ResourceRef, variant) => ({
      status: 'missing',
      ref,
      variant: { resource: ref, ...variant },
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
