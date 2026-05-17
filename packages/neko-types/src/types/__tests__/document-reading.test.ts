import { describe, expect, it } from 'vitest';
import type {
  DocumentBatchCursor,
  DocumentContextData,
  DocumentLocator,
  DocumentManifest,
  DocumentReadResult,
  DocumentSourceRef,
} from '../document-reading';

describe('document reading contracts', () => {
  it('represents stable page, chapter, text, and region locators', () => {
    const locators: DocumentLocator[] = [
      { kind: 'page', pageNumber: 3, pageIndex: 2 },
      { kind: 'chapter', chapterHref: 'chapter-1.xhtml', spineIndex: 0, title: 'Chapter 1' },
      { kind: 'text-range', startLine: 10, endLine: 20 },
      {
        kind: 'region',
        pageNumber: 4,
        pageIndex: 3,
        region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      },
    ];

    expect(locators.map((locator) => locator.kind)).toEqual([
      'page',
      'chapter',
      'text-range',
      'region',
    ]);
  });

  it('keeps manifest structure separate from read results and cursors', () => {
    const source: DocumentSourceRef = {
      filePath: '/books/demo.epub',
      format: 'epub',
      fileId: 'demo-123',
    };
    const manifest: DocumentManifest = {
      source,
      format: 'epub',
      fileId: 'demo-123',
      chapterCount: 1,
      units: [
        {
          kind: 'chapter',
          locator: { kind: 'chapter', chapterHref: 'chapter-1.xhtml', spineIndex: 0 },
          title: 'Chapter 1',
        },
      ],
      capabilities: {
        supportsManifest: true,
        supportsRangeRead: true,
        supportsCursorRead: true,
        supportsChapterRange: true,
      },
    };
    const cursor: DocumentBatchCursor = {
      source,
      strategy: 'manifest-order',
      next: manifest.units[0]?.locator,
      batchIndex: 0,
      done: false,
      fileId: 'demo-123',
    };
    const result: DocumentReadResult = {
      source,
      manifest,
      cursor,
      text: 'Chapter text',
      returnedTextChars: 'Chapter text'.length,
      truncated: false,
    };

    expect(result.manifest?.units[0]?.kind).toBe('chapter');
    expect(result.cursor?.next?.kind).toBe('chapter');
    expect(result.returnedTextChars).toBe(12);
  });

  it('allows preview context to carry source locator and legacy excerpt data together', () => {
    const context: DocumentContextData = {
      filePath: '/docs/demo.pdf',
      text: 'Selected text',
      contentKind: 'text',
      source: { filePath: '/docs/demo.pdf', format: 'pdf', fileId: 'pdf-1' },
      locator: { kind: 'page', pageNumber: 1, pageIndex: 0 },
      excerpt: { contentKind: 'text', text: 'Selected text', truncated: false },
    };

    expect(context.source?.format).toBe('pdf');
    expect(context.locator?.kind).toBe('page');
    expect(context.text).toBe(context.excerpt?.text);
  });
});
