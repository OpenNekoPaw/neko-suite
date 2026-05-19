import { describe, expect, it, vi } from 'vitest';
import { TOOL_NAMES_SYSTEM, type ToolResult } from '@neko/shared';
import { createReadDocumentImageTool } from '../readDocumentImageTool';
import type { IDocumentReaderService } from '../../services/DocumentReaderService';

const PNG_1X1 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);

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
        },
        {
          path: '/cache/page-2.png',
          width: 1,
          height: 1,
          mimeType: 'image/png',
          byteSize: PNG_1X1.byteLength,
          locator: { kind: 'chapter', chapterHref: 'Page_2', spineIndex: 1 },
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
  });

  it('resolves a document page image and delegates to ReadImage metadata flow', async () => {
    const reader = createReader();
    const tool = createReadDocumentImageTool({
      reader,
      readFile: vi.fn(async () => PNG_1X1),
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
            path: '/cache/page-2.png',
            documentImage: expect.objectContaining({
              locator: { kind: 'chapter', chapterHref: 'Page_2', spineIndex: 1 },
            }),
          }),
        ],
      }),
    );
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
});
