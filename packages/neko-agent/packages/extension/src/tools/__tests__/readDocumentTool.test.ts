import { describe, expect, it, vi } from 'vitest';
import { TOOL_NAMES_SYSTEM, type ToolResult } from '@neko/shared';
import { createWorkspaceFileAccessPolicy } from '@neko/agent/tools';
import type { AgentContentAccessRuntime } from '@neko/agent/runtime';
import { createReadDocumentTool } from '../readDocumentTool';
import type { IDocumentReaderService } from '../../services/DocumentReaderService';

const WORKSPACE_ROOT = '/workspace';

function createFileAccessPolicy() {
  return createWorkspaceFileAccessPolicy({
    workspaceRoot: WORKSPACE_ROOT,
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

  it('limits image metadata returned by archive readers without exposing cache paths', async () => {
    const reader = createReader({
      read: vi.fn(async () => ({
        text: 'Comic archive with 3 pages',
        pageCount: 3,
        imagePaths: [
          '/workspace/.neko/.cache/resources/documents/doc_test/1.png',
          '/workspace/.neko/.cache/resources/documents/doc_test/2.png',
          '/workspace/.neko/.cache/resources/documents/doc_test/3.png',
        ],
        imageInfo: [
          {
            path: '/workspace/.neko/.cache/resources/documents/doc_test/1.png',
            width: 100,
            height: 200,
            mimeType: 'image/png',
            byteSize: 10,
            resourceRef: {
              kind: 'document-entry',
              source: { filePath: '/workspace/books/comic.cbz', format: 'cbz' },
              entryPath: '1.png',
            },
          },
          {
            path: '/workspace/.neko/.cache/resources/documents/doc_test/2.png',
            width: 110,
            height: 210,
            mimeType: 'image/png',
            byteSize: 11,
          },
          {
            path: '/workspace/.neko/.cache/resources/documents/doc_test/3.png',
            width: 120,
            height: 220,
            mimeType: 'image/png',
            byteSize: 12,
          },
        ],
      })),
    });
    const contentAccessRuntime = createContentAccessRuntime();
    const tool = createReadDocumentTestTool({ reader, contentAccessRuntime });

    const result = (await tool.execute({
      file_path: '/workspace/books/comic.cbz',
      max_images: 2,
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(contentAccessRuntime.resolveDocumentImages).toHaveBeenCalledWith(
      expect.objectContaining({
        caller: 'read-document',
        locators: [expect.objectContaining({ entryPath: '1.png' })],
        variant: { role: 'document-entry', mimeType: 'image/png', width: 100, height: 200 },
        source: expect.objectContaining({
          kind: 'document',
          entryPath: '1.png',
          source: expect.objectContaining({
            kind: 'document',
            filePath: '/workspace/books/comic.cbz',
          }),
        }),
      }),
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        imageInfo: [
          expect.objectContaining({
            alias: 'image_1',
            aliasScope: 'document:/workspace/books/comic.cbz',
            sourceDocumentId: '/workspace/books/comic.cbz',
            entryPath: '1.png',
            portableForTransfer: true,
            width: 100,
            height: 200,
            mimeType: 'image/png',
            byteSize: 10,
          }),
          expect.objectContaining({
            alias: 'image_2',
            portableForTransfer: false,
            width: 110,
            height: 210,
            mimeType: 'image/png',
            byteSize: 11,
          }),
        ],
        imageCount: 3,
        imagesTruncated: true,
      }),
    );
    expect(JSON.stringify(result.data)).not.toContain('/workspace/.neko/.cache/resources/');
    expect(JSON.stringify(result.data)).not.toContain('"path"');
    expect(JSON.stringify(result.data)).not.toContain('"runtimePath"');
    expect(JSON.stringify(result.data)).not.toContain('"runtimeKind"');
    expect(JSON.stringify(result.data)).not.toContain('"cacheResourceRef"');
  });

  it('hides system temp image outputs from document readers', async () => {
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

    expect(result.success).toBe(true);
    expect(JSON.stringify(result.data)).not.toContain(tempImagePath);
    expect(JSON.stringify(result.data)).not.toContain('"path"');
  });

  it('prewarms project document image refs in the unified resource cache', async () => {
    const reader = createReader({
      read: vi.fn(async () => ({
        text: 'Comic archive',
        imagePaths: ['/workspace/.neko/.cache/resources/documents/doc_test/1.png'],
        imageInfo: [
          {
            path: '/workspace/.neko/.cache/resources/documents/doc_test/1.png',
            width: 100,
            height: 200,
            mimeType: 'image/png',
            resourceRef: {
              kind: 'document-entry',
              source: { filePath: '/workspace/books/comic.cbz', format: 'cbz' },
              entryPath: '1.png',
            },
          },
        ],
      })),
    });
    const contentAccessRuntime = createContentAccessRuntime();
    const tool = createReadDocumentTestTool({ reader, contentAccessRuntime });

    const result = (await tool.execute({ file_path: '/workspace/books/comic.cbz' })) as ToolResult;

    expect(result.success).toBe(true);
    expect(contentAccessRuntime.resolveDocumentImages).toHaveBeenCalledWith(
      expect.objectContaining({
        caller: 'read-document',
        locators: [expect.objectContaining({ entryPath: '1.png' })],
        variant: { role: 'document-entry', mimeType: 'image/png', width: 100, height: 200 },
        source: expect.objectContaining({
          kind: 'document',
          entryPath: '1.png',
          source: expect.objectContaining({
            kind: 'document',
            filePath: '/workspace/books/comic.cbz',
          }),
        }),
      }),
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        imageInfo: [
          expect.objectContaining({
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
          }),
        ],
      }),
    );
    expect(JSON.stringify(result.data)).not.toContain('legacyCachePath');
    expect(JSON.stringify(result.data)).not.toContain('/workspace/.neko/.cache/resources/');
    expect(JSON.stringify(result.data)).not.toContain('"cachePath"');
    expect(JSON.stringify(result.data)).not.toContain('"cacheResourceRef"');
    expect(JSON.stringify(result.data)).not.toContain('"runtimeKind"');
    expect(JSON.stringify(result.data)).not.toContain('"path"');
  });

  it('fails visibly when document image content access cannot rebuild cache resources', async () => {
    const reader = createReader({
      read: vi.fn(async () => ({
        text: 'Comic archive',
        imagePaths: ['/workspace/.neko/.cache/resources/documents/doc_test/1.png'],
        imageInfo: [
          {
            path: '/workspace/.neko/.cache/resources/documents/doc_test/1.png',
            width: 100,
            height: 200,
            mimeType: 'image/png',
            resourceRef: {
              kind: 'document-entry',
              source: { filePath: '/workspace/books/comic.cbz', format: 'cbz' },
              entryPath: '1.png',
            },
          },
        ],
      })),
    });
    const contentAccessRuntime = createContentAccessRuntime();
    contentAccessRuntime.resolveDocumentImages.mockResolvedValueOnce({
      status: 'failed',
      diagnostics: [
        {
          code: 'resource-cache-unavailable',
          severity: 'error',
          message: 'document image cache rebuild failed',
        },
      ],
      images: [],
    });
    const tool = createReadDocumentTestTool({ reader, contentAccessRuntime });

    const result = (await tool.execute({ file_path: '/workspace/books/comic.cbz' })) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error).toContain('document image cache rebuild failed');
    expect(JSON.stringify(result)).not.toContain('/workspace/.neko/.cache/resources/');
  });

  it('marks no-workspace document image refs as extension-private and non-portable', async () => {
    const reader = createReader({
      read: vi.fn(async () => ({
        text: 'Comic archive',
        imagePaths: ['/workspace/.neko/.cache/resources/documents/doc_test/1.png'],
        imageInfo: [
          {
            path: '/workspace/.neko/.cache/resources/documents/doc_test/1.png',
            resourceRef: {
              kind: 'document-entry',
              source: { filePath: '/workspace/books/comic.cbz', format: 'cbz' },
              entryPath: '1.png',
            },
          },
        ],
      })),
    });
    const contentAccessRuntime = createContentAccessRuntime();
    const tool = createReadDocumentTestTool({
      reader,
      contentAccessRuntime,
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
            portableForTransfer: false,
            nonPortableReason: 'no-workspace-or-extension-private-scratch',
            resourceRef: {
              kind: 'document-entry',
              source: { filePath: '/workspace/books/comic.cbz', format: 'cbz' },
              entryPath: '1.png',
            },
          }),
        ],
      }),
    );
    expect(contentAccessRuntime.resolveDocumentImages).toHaveBeenCalledWith(
      expect.objectContaining({
        caller: 'read-document',
        locators: [expect.objectContaining({ entryPath: '1.png' })],
        variant: { role: 'document-entry' },
        source: expect.objectContaining({
          kind: 'document',
          entryPath: '1.png',
        }),
      }),
    );
    expect(JSON.stringify(result.data)).not.toContain('/workspace/.neko/.cache/resources/');
    expect(JSON.stringify(result.data)).not.toContain('"cacheResourceRef"');
    expect(JSON.stringify(result.data)).not.toContain('"runtimeKind"');
    expect(JSON.stringify(result.data)).not.toContain('"path"');
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
          '/workspace/.neko/.cache/resources/documents/doc_test/1.jpg',
          '/workspace/.neko/.cache/resources/documents/doc_test/2.jpg',
          '/workspace/.neko/.cache/resources/documents/doc_test/3.jpg',
        ],
        imageInfo: [
          {
            path: '/workspace/.neko/.cache/resources/documents/doc_test/1.jpg',
            width: 100,
            height: 200,
            mimeType: 'image/jpeg',
            byteSize: 10,
          },
          {
            path: '/workspace/.neko/.cache/resources/documents/doc_test/2.jpg',
            width: 110,
            height: 210,
            mimeType: 'image/jpeg',
            byteSize: 11,
          },
          {
            path: '/workspace/.neko/.cache/resources/documents/doc_test/3.jpg',
            width: 120,
            height: 220,
            mimeType: 'image/jpeg',
            byteSize: 12,
          },
        ],
        excerpt: {
          contentKind: 'image',
          imagePaths: [
            '/workspace/.neko/.cache/resources/documents/doc_test/1.jpg',
            '/workspace/.neko/.cache/resources/documents/doc_test/2.jpg',
            '/workspace/.neko/.cache/resources/documents/doc_test/3.jpg',
          ],
          imageInfo: [
            {
              path: '/workspace/.neko/.cache/resources/documents/doc_test/1.jpg',
              width: 100,
              height: 200,
              mimeType: 'image/jpeg',
              byteSize: 10,
            },
            {
              path: '/workspace/.neko/.cache/resources/documents/doc_test/2.jpg',
              width: 110,
              height: 210,
              mimeType: 'image/jpeg',
              byteSize: 11,
            },
            {
              path: '/workspace/.neko/.cache/resources/documents/doc_test/3.jpg',
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
      max_images: 2,
      range: { locator: { kind: 'chapter', chapterHref: 'chapter-1', spineIndex: 0 } },
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        imageInfo: [
          expect.objectContaining({
            alias: 'image_1',
            portableForTransfer: false,
            width: 100,
            height: 200,
            mimeType: 'image/jpeg',
            byteSize: 10,
          }),
          expect.objectContaining({
            alias: 'image_2',
            portableForTransfer: false,
            width: 110,
            height: 210,
            mimeType: 'image/jpeg',
            byteSize: 11,
          }),
        ],
        excerpt: expect.not.objectContaining({
          imagePaths: expect.any(Array),
          imageInfo: expect.any(Array),
        }),
        metadata: expect.objectContaining({
          imageCount: 3,
          imagesTruncated: true,
        }),
      }),
    );
    expect(JSON.stringify(result.data)).not.toContain('/workspace/.neko/.cache/resources/');
    expect(JSON.stringify(result.data)).not.toContain('"path"');
    expect(JSON.stringify(result.data)).not.toContain('"runtimePath"');
    expect(JSON.stringify(result.data)).not.toContain('"runtimeKind"');
    expect(JSON.stringify(result.data)).not.toContain('"cacheResourceRef"');
  });

  it('hides image metadata when image paths are excluded', async () => {
    const reader = createReader({
      readRange: vi.fn(async () => ({
        source: { filePath: '/workspace/books/demo.epub', format: 'epub', fileId: 'book-1' },
        text: 'EPUB chapter range with 1 image pages',
        imagePaths: ['/workspace/.neko/.cache/resources/documents/doc_test/1.jpg'],
        imageInfo: [
          {
            path: '/workspace/.neko/.cache/resources/documents/doc_test/1.jpg',
            width: 100,
            height: 200,
            mimeType: 'image/jpeg',
            byteSize: 10,
          },
        ],
        excerpt: {
          contentKind: 'image',
          imagePaths: ['/workspace/.neko/.cache/resources/documents/doc_test/1.jpg'],
          imageInfo: [
            {
              path: '/workspace/.neko/.cache/resources/documents/doc_test/1.jpg',
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
      include_images: false,
      range: { locator: { kind: 'chapter', chapterHref: 'chapter-1', spineIndex: 0 } },
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.not.objectContaining({
        imagePaths: expect.any(Array),
        imageInfo: expect.any(Array),
      }),
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        excerpt: expect.not.objectContaining({
          imagePaths: expect.any(Array),
          imageInfo: expect.any(Array),
        }),
      }),
    );
    expect(JSON.stringify(result.data)).not.toContain('/workspace/.neko/.cache/resources/');
  });

  it('omits range manifests by default and honors include_metadata=false', async () => {
    const reader = createReader({
      readRange: vi.fn(async () => ({
        source: { filePath: '/workspace/books/demo.epub', format: 'epub', fileId: 'book-1' },
        locator: { kind: 'chapter', chapterHref: 'chapter-1', spineIndex: 0 },
        text: 'Chapter range',
        imagePaths: ['/workspace/.neko/.cache/resources/documents/doc_test/1.jpg'],
        imageInfo: [
          {
            path: '/workspace/.neko/.cache/resources/documents/doc_test/1.jpg',
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
        imageInfo: [
          expect.objectContaining({
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
    expect(JSON.stringify(result.data)).not.toContain('/workspace/.neko/.cache/resources/');
    expect(JSON.stringify(result.data)).not.toContain('"path"');
    expect(JSON.stringify(result.data)).not.toContain('"runtimeKind"');
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
      max_images: 2,
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
      max_images: 10,
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(reader.readRange).toHaveBeenCalledWith('/workspace/books/demo.epub', {
      locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 1 },
      endLocator: { kind: 'chapter', chapterHref: 'Page_10', spineIndex: 10 },
      limit: { maxChars: 20000, maxImages: 10 },
    });
  });

  it('normalizes nested chapter-range locator arguments from model tool calls', async () => {
    const reader = createReader();
    const tool = createReadDocumentTestTool({ reader });

    const result = (await tool.execute({
      file_path: '/workspace/books/demo.epub',
      mode: 'range',
      range: {
        locator: {
          kind: 'chapter-range',
          start: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 1 },
          end: { kind: 'chapter', chapterHref: 'Page_10', spineIndex: 10 },
        },
      },
      max_images: 10,
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
        imagePaths: ['/workspace/.neko/.cache/resources/documents/doc_test/page-1.jpg'],
        imageInfo: [
          {
            path: '/workspace/.neko/.cache/resources/documents/doc_test/page-1.jpg',
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
        imageInfo: [
          expect.objectContaining({
            alias: 'image_1',
            portableForTransfer: false,
            width: 100,
            height: 200,
          }),
        ],
        cursor: expect.objectContaining({ done: true }),
        metadata: expect.objectContaining({
          title: 'Book',
          imageCount: 1,
          imagesTruncated: false,
        }),
      }),
    );
    expect(result.data).not.toHaveProperty('manifest');
    expect(JSON.stringify(result.data)).not.toContain('/workspace/.neko/.cache/resources/');
    expect(JSON.stringify(result.data)).not.toContain('"path"');
    expect(JSON.stringify(result.data)).not.toContain('"runtimeKind"');
  });
});

function createContentAccessRuntime(): AgentContentAccessRuntime & {
  readonly resolveDocumentImages: ReturnType<typeof vi.fn>;
} {
  return {
    resolve: vi.fn(),
    resolveImageMetadata: vi.fn(),
    resolveDocumentContent: vi.fn(),
    resolveDocumentImages: vi.fn(
      async (input: { source: unknown; locators?: readonly unknown[] }) => ({
        status: 'ready' as const,
        source: input.source,
        diagnostics: [],
        images: (input.locators ?? []).map((documentResourceRef) => ({
          documentResourceRef,
          metadata: { status: 'ready' },
        })),
      }),
    ),
    loadProviderAsset: vi.fn(),
    projectResource: vi.fn(),
  } as unknown as AgentContentAccessRuntime & {
    readonly resolveDocumentImages: ReturnType<typeof vi.fn>;
  };
}
