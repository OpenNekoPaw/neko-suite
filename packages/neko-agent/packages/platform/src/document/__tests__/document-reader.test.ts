import { describe, expect, it, vi } from 'vitest';
import {
  createDocumentReaderRuntime,
  estimateSlideCount,
  extractEpubImageEntryPaths,
  extractLocalImageReferences,
  isSupportedDocumentPath,
  resolveEpubEntryReference,
  stripHtmlToText,
  type DocumentReaderRuntimeDeps,
} from '../document-reader';
import { createDocumentAccessService } from '../document-access-service';

type ModuleLoader = DocumentReaderRuntimeDeps['loadModule'];

function makePng(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    0x00,
    0x00,
    0x00,
    0x0d,
    0x49,
    0x48,
    0x44,
    0x52,
    (width >>> 24) & 0xff,
    (width >>> 16) & 0xff,
    (width >>> 8) & 0xff,
    width & 0xff,
    (height >>> 24) & 0xff,
    (height >>> 16) & 0xff,
    (height >>> 8) & 0xff,
    height & 0xff,
  ]);
}

function makeJpeg(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x08,
    0x08,
    (height >>> 8) & 0xff,
    height & 0xff,
    (width >>> 8) & 0xff,
    width & 0xff,
    0x03,
    0xff,
    0xd9,
  ]);
}

function createDeps(overrides: Partial<DocumentReaderRuntimeDeps> = {}): DocumentReaderRuntimeDeps {
  return {
    readTextFile: vi.fn(async () => ''),
    readBinaryFile: vi.fn(async () => new Uint8Array()),
    writeBinaryFile: vi.fn(async () => undefined),
    makeDir: vi.fn(async () => undefined),
    tempDir: () => '/tmp',
    loadModule: vi.fn(async () => null),
    now: () => new Date('2026-04-27T00:00:00.000Z'),
    ...overrides,
  };
}

function createModuleLoader(loader: (packageName: string) => unknown): ModuleLoader {
  return async <T>(packageName: string): Promise<T | null> => {
    return loader(packageName) as T | null;
  };
}

describe('document-reader runtime', () => {
  it('检测支持的文档扩展名', () => {
    expect(isSupportedDocumentPath('/doc/story.pdf')).toBe(true);
    expect(isSupportedDocumentPath('/doc/story.FDX')).toBe(true);
    expect(isSupportedDocumentPath('/doc/story.exe')).toBe(false);
  });

  it('清洗 HTML 文本并移除脚本样式', () => {
    const text = stripHtmlToText(
      '<html><style>.x{}</style><script>alert(1)</script><body><h1>标题</h1><p>正文</p></body></html>',
    );

    expect(text).toBe('标题 正文');
  });

  it('估算 PPT 页数', () => {
    expect(estimateSlideCount('slide 1\n\nslide 2\n\n')).toBe(2);
  });

  it('通过平台运行时依赖检测 PDF DRM', async () => {
    const reader = createDocumentReaderRuntime(
      createDeps({
        readBinaryFile: vi.fn(async () => new TextEncoder().encode('PDF /Encrypt metadata')),
      }),
    );

    await expect(reader.hasDRM('/doc/protected.pdf')).resolves.toBe(true);
  });

  it('解析 Final Draft 场景结构', async () => {
    class FakeXmlParser {
      parse(): unknown {
        return {
          FinalDraft: {
            Content: {
              TitlePage: { Content: 'Demo' },
              Paragraph: [
                { '@_Type': 'Scene Heading', Text: 'INT. OFFICE - DAY' },
                { '@_Type': 'Action', Text: 'John enters.' },
              ],
            },
          },
        };
      }
    }

    const reader = createDocumentReaderRuntime(
      createDeps({
        readTextFile: vi.fn(async () => '<xml />'),
        loadModule: createModuleLoader((packageName) => {
          if (packageName === 'fast-xml-parser') {
            return { XMLParser: FakeXmlParser };
          }
          return null;
        }),
      }),
    );

    const result = await reader.read('/doc/script.fdx');

    expect(result.text).toContain('INT. OFFICE - DAY');
    expect(result.metadata?.['format']).toBe('fdx');
    expect(result.metadata?.['title']).toBe('Demo');
  });

  it('兼容 pdf-parse v2 的 PDFParse class 导出', async () => {
    let destroyed = false;
    class FakePdfParser {
      constructor(_options: { data: Uint8Array }) {}

      async getText(): Promise<{ text: string; total: number }> {
        return { text: 'PDF body', total: 3 };
      }

      async getInfo(): Promise<{ total: number; info: Record<string, unknown> }> {
        return { total: 3, info: { Title: 'Demo PDF' } };
      }

      async destroy(): Promise<void> {
        destroyed = true;
      }
    }

    const reader = createDocumentReaderRuntime(
      createDeps({
        readBinaryFile: vi.fn(async () => new TextEncoder().encode('%PDF demo')),
        loadModule: createModuleLoader((packageName) =>
          packageName === 'pdf-parse' ? { PDFParse: FakePdfParser } : null,
        ),
      }),
    );

    const result = await reader.read('/doc/story.pdf');

    expect(result.text).toBe('PDF body');
    expect(result.pageCount).toBe(3);
    expect(result.metadata?.['Title']).toBe('Demo PDF');
    expect(destroyed).toBe(true);
  });

  it('兼容 officeparser v6 的 parseOffice AST 导出', async () => {
    const reader = createDocumentReaderRuntime(
      createDeps({
        loadModule: createModuleLoader((packageName) =>
          packageName === 'officeparser'
            ? {
                parseOffice: async () => ({
                  type: 'pptx',
                  metadata: { title: 'Deck' },
                  toText: () => 'slide 1\n\nslide 2',
                }),
              }
            : null,
        ),
      }),
    );

    const result = await reader.read('/doc/deck.pptx');

    expect(result.text).toBe('slide 1\n\nslide 2');
    expect(result.pageCount).toBe(2);
    expect(result.metadata?.['format']).toBe('pptx');
    expect(result.metadata?.['title']).toBe('Deck');
  });

  it('兼容 epub2 的 EPub 命名导出', async () => {
    class FakeEpub {
      readonly flow = [{ id: 'chapter-1' }, { id: 'chapter-2' }];
      readonly metadata = {
        title: 'Book',
        creator: 'Author',
        publisher: 'Publisher',
        language: 'zh',
      };
      private readonly handlers = new Map<string, (...args: never[]) => void>();

      on(event: 'end' | 'error', handler: (...args: never[]) => void): void {
        this.handlers.set(event, handler);
      }

      getChapter(id: string, callback: (error: Error | null, content: string) => void): void {
        callback(null, `<h1>${id}</h1><p>正文</p>`);
      }

      parse(): void {
        this.handlers.get('end')?.();
      }
    }

    const reader = createDocumentReaderRuntime(
      createDeps({
        loadModule: createModuleLoader((packageName) =>
          packageName === 'epub2' ? { EPub: FakeEpub } : null,
        ),
      }),
    );

    const result = await reader.read('/doc/book.epub');

    expect(result.text).toContain('chapter-1 正文');
    expect(result.text).toContain('chapter-2 正文');
    expect(result.metadata?.['title']).toBe('Book');
    expect(result.metadata?.['author']).toBe('Author');
  });

  it('extracts EPUB image entry paths relative to chapter HTML', () => {
    const html = `
      <img src="../image/page-1.jpg" />
      <image xlink:href="../image/page-2.png" />
      <img srcset="../image/page-3.webp 1x, ../image/page-3@2x.webp 2x" />
    `;

    expect(extractEpubImageEntryPaths(html, 'html/page-1.xhtml')).toEqual([
      'image/page-1.jpg',
      'image/page-2.png',
      'image/page-3.webp',
      'image/page-3@2x.webp',
    ]);
    expect(resolveEpubEntryReference('OPS/html/page.xhtml', '../images/a.jpg')).toBe(
      'OPS/images/a.jpg',
    );
    expect(resolveEpubEntryReference('html/page.xhtml', '/images/image/page-4.jpg')).toBe(
      'image/page-4.jpg',
    );
  });

  it('extracts local image references from HTML and Markdown', () => {
    expect(
      extractLocalImageReferences(`
        <img src="./a.png?size=1" />
        ![cover](images/cover.jpg)
        <img src="data:image/png;base64,abc" />
      `),
    ).toEqual(['./a.png', 'images/cover.jpg']);
  });

  it('extracts image-only EPUB chapters to temporary image paths', async () => {
    const writes: Array<{ path: string; data: Uint8Array }> = [];
    class FakeEpub {
      readonly flow = [{ id: 'page-1', title: 'html/page-1.xhtml' }];
      readonly metadata = { title: 'Comic', creator: 'Author' };
      private readonly handlers = new Map<string, (...args: never[]) => void>();

      on(event: 'end' | 'error', handler: (...args: never[]) => void): void {
        this.handlers.set(event, handler);
      }

      getChapter(id: string, callback: (error: Error | null, content: string) => void): void {
        callback(null, `<html><body><img src="../image/${id}.jpg" /></body></html>`);
      }

      parse(): void {
        this.handlers.get('end')?.();
      }
    }
    class FakeZip {
      constructor(_filePath: string) {}

      getEntry(name: string): { getData(): Uint8Array } | null {
        return name === 'image/page-1.jpg' ? { getData: () => makeJpeg(1494, 2133) } : null;
      }
    }

    const reader = createDocumentReaderRuntime(
      createDeps({
        loadModule: createModuleLoader((packageName) => {
          if (packageName === 'epub2') return { EPub: FakeEpub };
          if (packageName === 'adm-zip') return FakeZip;
          return null;
        }),
        makeDir: vi.fn(async () => undefined),
        writeBinaryFile: vi.fn(async (filePath, data) => {
          writes.push({ path: filePath, data });
        }),
      }),
    );

    const result = await reader.read('/doc/comic.epub');

    expect(result.text).toBe('EPUB image document with 1 image pages');
    expect(result.pageCount).toBe(1);
    const pagePath = result.imagePaths?.[0];
    expect(pagePath).toMatch(/^\/tmp\/neko_epub_[a-z0-9]+\/0001_page-1\.jpg$/);
    expect(result.imageInfo).toEqual([
      {
        path: pagePath,
        width: 1494,
        height: 2133,
        mimeType: 'image/jpeg',
        byteSize: makeJpeg(1494, 2133).length,
        resourceRef: {
          kind: 'document-entry',
          source: { filePath: '/doc/comic.epub', format: 'epub' },
          entryPath: 'image/page-1.jpg',
          cachePath: pagePath,
          versionPolicy: 'versioned-export',
        },
      },
    ]);
    expect(result.metadata?.['imageCount']).toBe(1);
    expect(writes).toEqual([
      {
        path: pagePath,
        data: makeJpeg(1494, 2133),
      },
    ]);
  });

  it('extracts DOCX embedded images when present', async () => {
    const writes: Array<{ path: string; data: Uint8Array }> = [];
    class FakeZip {
      constructor(_filePath: string) {}

      getEntries(): Array<{ name: string; getData(): Uint8Array }> {
        return [
          { name: 'word/media/image2.png', getData: () => makePng(800, 600) },
          { name: 'word/media/image1.jpg', getData: () => makeJpeg(320, 240) },
          { name: 'docProps/thumbnail.jpeg', getData: () => new Uint8Array([9]) },
        ];
      }
    }

    const reader = createDocumentReaderRuntime(
      createDeps({
        loadModule: createModuleLoader((packageName) => {
          if (packageName === 'mammoth') return { extractRawText: async () => ({ value: 'Body' }) };
          if (packageName === 'adm-zip') return FakeZip;
          return null;
        }),
        writeBinaryFile: vi.fn(async (filePath, data) => {
          writes.push({ path: filePath, data });
        }),
      }),
    );

    const result = await reader.read('/doc/report.docx');

    expect(result.text).toBe('Body');
    const firstPath = result.imagePaths?.[0];
    const secondPath = result.imagePaths?.[1];
    expect(firstPath).toMatch(/^\/tmp\/neko_docx_[a-z0-9]+\/0001_image1\.jpg$/);
    expect(secondPath).toMatch(/^\/tmp\/neko_docx_[a-z0-9]+\/0002_image2\.png$/);
    expect(result.imageInfo).toEqual([
      {
        path: firstPath,
        width: 320,
        height: 240,
        mimeType: 'image/jpeg',
        byteSize: makeJpeg(320, 240).length,
        resourceRef: {
          kind: 'document-entry',
          source: { filePath: '/doc/report.docx', format: 'docx' },
          entryPath: 'word/media/image1.jpg',
          cachePath: firstPath,
          versionPolicy: 'versioned-export',
        },
      },
      {
        path: secondPath,
        width: 800,
        height: 600,
        mimeType: 'image/png',
        byteSize: makePng(800, 600).length,
        resourceRef: {
          kind: 'document-entry',
          source: { filePath: '/doc/report.docx', format: 'docx' },
          entryPath: 'word/media/image2.png',
          cachePath: secondPath,
          versionPolicy: 'versioned-export',
        },
      },
    ]);
    expect(result.metadata?.['imageCount']).toBe(2);
    expect(writes).toHaveLength(2);
  });

  it('extracts PPTX and XLSX embedded media images', async () => {
    class FakeZip {
      constructor(private readonly filePath: string) {}

      getEntries(): Array<{ name: string; getData(): Uint8Array }> {
        const mediaDir = this.filePath.endsWith('.pptx') ? 'ppt/media' : 'xl/media';
        return [{ name: `${mediaDir}/image1.png`, getData: () => makePng(1024, 768) }];
      }
    }

    const reader = createDocumentReaderRuntime(
      createDeps({
        loadModule: createModuleLoader((packageName) => {
          if (packageName === 'officeparser') {
            return { parseOfficeAsync: async () => 'Slide text' };
          }
          if (packageName === 'xlsx') {
            return {
              readFile: () => ({ SheetNames: ['Sheet1'], Sheets: { Sheet1: {} } }),
              utils: { sheet_to_json: () => [['A1']] },
            };
          }
          if (packageName === 'adm-zip') return FakeZip;
          return null;
        }),
      }),
    );

    const pptx = await reader.read('/doc/deck.pptx');
    const xlsx = await reader.read('/doc/sheet.xlsx');

    const pptxPath = pptx.imagePaths?.[0];
    const xlsxPath = xlsx.imagePaths?.[0];
    expect(pptxPath).toMatch(/^\/tmp\/neko_pptx_[a-z0-9]+\/0001_image1\.png$/);
    expect(xlsxPath).toMatch(/^\/tmp\/neko_xlsx_[a-z0-9]+\/0001_image1\.png$/);
    expect(pptx.imageInfo?.[0]).toEqual({
      path: pptxPath,
      width: 1024,
      height: 768,
      mimeType: 'image/png',
      byteSize: makePng(1024, 768).length,
      resourceRef: {
        kind: 'document-entry',
        source: { filePath: '/doc/deck.pptx', format: 'pptx' },
        entryPath: 'ppt/media/image1.png',
        cachePath: pptxPath,
        versionPolicy: 'versioned-export',
      },
    });
    expect(xlsx.imageInfo?.[0]).toEqual({
      path: xlsxPath,
      width: 1024,
      height: 768,
      mimeType: 'image/png',
      byteSize: makePng(1024, 768).length,
      resourceRef: {
        kind: 'document-entry',
        source: { filePath: '/doc/sheet.xlsx', format: 'xlsx' },
        entryPath: 'xl/media/image1.png',
        cachePath: xlsxPath,
        versionPolicy: 'versioned-export',
      },
    });
  });
});

describe('document access service', () => {
  it('builds text manifests and reads line ranges without preview state', async () => {
    const runtime = createDocumentReaderRuntime(
      createDeps({
        readTextFile: vi.fn(async () => 'line 1\nline 2\nline 3'),
      }),
    );
    const service = createDocumentAccessService({
      reader: runtime,
      runtime: createDeps({
        readTextFile: vi.fn(async () => 'line 1\nline 2\nline 3'),
      }),
      lowLevelAccess: {
        identify: vi.fn(async () => ({ fileId: 'notes-1', sizeBytes: 20, mtimeMs: 1 })),
      },
    });

    const manifest = await service.getManifest('/doc/notes.txt');
    const cursor = await service.createBatchCursor('/doc/notes.txt', { maxChars: 1000 });
    const result = await service.readRange('/doc/notes.txt', {
      locator: { kind: 'text-range', startLine: 2, endLine: 3 },
    });

    expect(manifest.fileId).toBe('notes-1');
    expect(manifest.capabilities.supportsTextRange).toBe(true);
    expect(cursor.next).toEqual({ kind: 'text-range', startLine: 1, endLine: 3 });
    expect(cursor.maxChars).toBe(1000);
    expect(result.text).toBe('line 2\nline 3');
  });

  it('reads PDF page ranges using pdf-parse partial pages when available', async () => {
    class FakePdfParser {
      constructor(_options: { data: Uint8Array }) {}

      async getText(params?: { partial?: number[] }): Promise<{ text: string; total: number }> {
        return { text: `page ${params?.partial?.[0] ?? 'all'}`, total: 5 };
      }

      async getInfo(): Promise<{ total: number; info: Record<string, unknown> }> {
        return { total: 5, info: { Title: 'Demo PDF' } };
      }

      async destroy(): Promise<void> {}
    }

    const deps = createDeps({
      readBinaryFile: vi.fn(async () => new TextEncoder().encode('%PDF')),
      loadModule: createModuleLoader((packageName) =>
        packageName === 'pdf-parse' ? { PDFParse: FakePdfParser } : null,
      ),
    });
    const runtime = createDocumentReaderRuntime(deps);
    const service = createDocumentAccessService({ reader: runtime, runtime: deps });

    const result = await service.readRange('/doc/story.pdf', {
      locator: { kind: 'page', pageNumber: 3, pageIndex: 2 },
    });

    expect(result.text).toBe('page 3');
    expect(result.pageCount).toBe(5);
    expect(result.metadata?.['Title']).toBe('Demo PDF');
  });

  it('builds PDF manifests from metadata without extracting full text', async () => {
    const getText = vi.fn(async () => ({ text: 'full PDF body', total: 5 }));
    const destroy = vi.fn(async () => undefined);
    class FakePdfParser {
      constructor(_options: { data: Uint8Array }) {}

      getText = getText;

      async getInfo(): Promise<{ total: number; info: Record<string, unknown> }> {
        return { total: 5, info: { Title: 'Demo PDF' } };
      }

      destroy = destroy;
    }

    const deps = createDeps({
      readBinaryFile: vi.fn(async () => new TextEncoder().encode('%PDF')),
      loadModule: createModuleLoader((packageName) =>
        packageName === 'pdf-parse' ? { PDFParse: FakePdfParser } : null,
      ),
    });
    const runtime = createDocumentReaderRuntime(deps);
    const service = createDocumentAccessService({ reader: runtime, runtime: deps });

    const manifest = await service.getManifest('/doc/story.pdf');

    expect(manifest.pageCount).toBe(5);
    expect(manifest.title).toBe('Demo PDF');
    expect(manifest.units).toHaveLength(5);
    expect(getText).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalled();
  });

  it('builds EPUB chapter manifests and reads one chapter by locator', async () => {
    let parseCount = 0;
    class FakeEpub {
      readonly flow = [{ id: 'chapter-1' }, { id: 'chapter-2' }];
      readonly metadata = { title: 'Book', creator: 'Author' };
      private readonly handlers = new Map<string, (...args: never[]) => void>();

      on(event: 'end' | 'error', handler: (...args: never[]) => void): void {
        this.handlers.set(event, handler);
      }

      getChapter(id: string, callback: (error: Error | null, content: string) => void): void {
        callback(null, `<h1>${id}</h1><p>正文</p>`);
      }

      parse(): void {
        parseCount += 1;
        this.handlers.get('end')?.();
      }
    }

    const deps = createDeps({
      loadModule: createModuleLoader((packageName) =>
        packageName === 'epub2' ? { EPub: FakeEpub } : null,
      ),
    });
    const runtime = createDocumentReaderRuntime(deps);
    const service = createDocumentAccessService({ reader: runtime, runtime: deps });

    const manifest = await service.getManifest('/doc/book.epub');
    const result = await service.readRange('/doc/book.epub', {
      locator: { kind: 'chapter', chapterHref: 'chapter-2', spineIndex: 1 },
    });

    expect(manifest.chapterCount).toBe(2);
    expect(manifest.units[1]?.locator.kind).toBe('chapter');
    expect(result.text).toContain('chapter-2 正文');
    expect(parseCount).toBe(2);
  });

  it('reads EPUB ranges with a single parse pass', async () => {
    let parseCount = 0;
    class FakeEpub {
      readonly flow = [{ id: 'chapter-1' }, { id: 'chapter-2' }];
      readonly metadata = { title: 'Book', creator: 'Author' };
      private readonly handlers = new Map<string, (...args: never[]) => void>();

      on(event: 'end' | 'error', handler: (...args: never[]) => void): void {
        this.handlers.set(event, handler);
      }

      getChapter(id: string, callback: (error: Error | null, content: string) => void): void {
        callback(null, `<h1>${id}</h1><p>正文</p>`);
      }

      parse(): void {
        parseCount += 1;
        this.handlers.get('end')?.();
      }
    }

    const deps = createDeps({
      loadModule: createModuleLoader((packageName) =>
        packageName === 'epub2' ? { EPub: FakeEpub } : null,
      ),
    });
    const runtime = createDocumentReaderRuntime(deps);
    const service = createDocumentAccessService({ reader: runtime, runtime: deps });

    const result = await service.readRange('/doc/book.epub', {
      locator: { kind: 'chapter', chapterHref: 'chapter-2', spineIndex: 1 },
    });

    expect(result.text).toContain('chapter-2 正文');
    expect(result.manifest?.chapterCount).toBe(2);
    expect(parseCount).toBe(1);
  });

  it('reads EPUB chapter ranges with image entry paths', async () => {
    const writes: Array<{ path: string; data: Uint8Array }> = [];
    class FakeEpub {
      readonly flow = [
        { id: 'Page_1', title: 'html/page-1.xhtml' },
        { id: 'Page_2', title: 'html/page-2.xhtml' },
      ];
      readonly metadata = { title: 'Comic', creator: 'Author' };
      private readonly handlers = new Map<string, (...args: never[]) => void>();

      on(event: 'end' | 'error', handler: (...args: never[]) => void): void {
        this.handlers.set(event, handler);
      }

      getChapter(id: string, callback: (error: Error | null, content: string) => void): void {
        callback(null, `<html><body><img src="../image/${id}.jpg" /></body></html>`);
      }

      parse(): void {
        this.handlers.get('end')?.();
      }
    }
    class FakeZip {
      constructor(_filePath: string) {}

      getEntry(name: string): { name: string; getData(): Uint8Array } | null {
        return name.startsWith('image/') ? { name, getData: () => makeJpeg(1494, 2133) } : null;
      }

      getEntries(): Array<{ name: string; getData(): Uint8Array }> {
        return [];
      }
    }

    const deps = createDeps({
      loadModule: createModuleLoader((packageName) => {
        if (packageName === 'epub2') return { EPub: FakeEpub };
        if (packageName === 'adm-zip') return FakeZip;
        return null;
      }),
      writeBinaryFile: vi.fn(async (filePath, data) => {
        writes.push({ path: filePath, data });
      }),
    });
    const runtime = createDocumentReaderRuntime(deps);
    const service = createDocumentAccessService({ reader: runtime, runtime: deps });

    const result = await service.readRange('/doc/comic.epub', {
      locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 0 },
      endLocator: { kind: 'chapter', chapterHref: 'Page_2', spineIndex: 1 },
      limit: { maxImages: 1 },
    });

    expect(result.text).toBe('EPUB chapter range with 1 image pages');
    const pagePath = result.imagePaths?.[0];
    expect(pagePath).toMatch(/^\/tmp\/neko_epub_[a-z0-9]+\/0001_Page_1\.jpg$/);
    expect(result.imageInfo).toEqual([
      {
        path: pagePath,
        width: 1494,
        height: 2133,
        mimeType: 'image/jpeg',
        byteSize: makeJpeg(1494, 2133).length,
        locator: {
          kind: 'chapter',
          chapterHref: 'Page_1',
          spineIndex: 0,
          title: 'html/page-1.xhtml',
        },
        resourceRef: {
          kind: 'document-entry',
          source: {
            filePath: '/doc/comic.epub',
            format: 'epub',
            fileId: '/doc/comic.epub',
          },
          entryPath: 'image/Page_1.jpg',
          locator: {
            kind: 'chapter',
            chapterHref: 'Page_1',
            spineIndex: 0,
            title: 'html/page-1.xhtml',
          },
          cachePath: pagePath,
          versionPolicy: 'versioned-export',
        },
      },
    ]);
    expect(result.excerpt).toEqual(
      expect.objectContaining({
        contentKind: 'image',
        imagePaths: [pagePath],
        imageInfo: [
          expect.objectContaining({
            width: 1494,
            height: 2133,
            mimeType: 'image/jpeg',
          }),
        ],
      }),
    );
    expect(writes).toEqual([
      {
        path: pagePath,
        data: makeJpeg(1494, 2133),
      },
    ]);
  });

  it('passes content-backed image paths through range reads', async () => {
    const deps = createDeps();
    const reader = createDocumentReaderRuntime(deps);
    const service = createDocumentAccessService({
      reader: {
        ...reader,
        read: vi.fn(async () => ({
          text: 'Slide text',
          pageCount: 1,
          imagePaths: ['/tmp/slide.png'],
          imageInfo: [
            {
              path: '/tmp/slide.png',
              width: 1024,
              height: 768,
              mimeType: 'image/png',
              byteSize: 24,
            },
          ],
        })),
      },
      runtime: deps,
    });

    const result = await service.readRange('/doc/deck.pptx', {
      locator: { kind: 'slide', slideNumber: 1, slideIndex: 0 },
    });

    expect(result.imagePaths).toEqual(['/tmp/slide.png']);
    expect(result.imageInfo).toEqual([
      {
        path: '/tmp/slide.png',
        width: 1024,
        height: 768,
        mimeType: 'image/png',
        byteSize: 24,
      },
    ]);
    expect(result.excerpt).toEqual(
      expect.objectContaining({
        contentKind: 'mixed',
        imagePaths: ['/tmp/slide.png'],
        imageInfo: [
          expect.objectContaining({
            width: 1024,
            height: 768,
          }),
        ],
      }),
    );
  });

  it('reads CBZ page ranges as local temporary images', async () => {
    const writes: Array<{ path: string; data: Uint8Array }> = [];
    class FakeZip {
      constructor(_filePath: string) {}

      getEntry(name: string): { name: string; getData(): Uint8Array } | null {
        return this.getEntries().find((entry) => entry.name === name) ?? null;
      }

      getEntries(): Array<{ name: string; getData(): Uint8Array }> {
        return [
          { name: '002.jpg', getData: () => makeJpeg(1002, 2002) },
          { name: '001.jpg', getData: () => makeJpeg(1001, 2001) },
          { name: 'notes.txt', getData: () => new Uint8Array([9]) },
        ];
      }
    }

    const deps = createDeps({
      loadModule: createModuleLoader((packageName) => (packageName === 'adm-zip' ? FakeZip : null)),
      writeBinaryFile: vi.fn(async (filePath, data) => {
        writes.push({ path: filePath, data });
      }),
    });
    const runtime = createDocumentReaderRuntime(deps);
    const service = createDocumentAccessService({ reader: runtime, runtime: deps });

    const result = await service.readRange('/doc/comic.cbz', {
      locator: { kind: 'page', pageNumber: 1, pageIndex: 0 },
      endLocator: { kind: 'page', pageNumber: 2, pageIndex: 1 },
      limit: { maxImages: 2 },
    });

    expect(result.text).toBe('CBZ page range 1-2: 2 image pages');
    const firstPath = result.imagePaths?.[0];
    const secondPath = result.imagePaths?.[1];
    expect(firstPath).toMatch(/^\/tmp\/neko_cbz_[a-z0-9]+\/0001_001\.jpg$/);
    expect(secondPath).toMatch(/^\/tmp\/neko_cbz_[a-z0-9]+\/0002_002\.jpg$/);
    expect(result.imageInfo).toEqual([
      {
        path: firstPath,
        width: 1001,
        height: 2001,
        mimeType: 'image/jpeg',
        byteSize: makeJpeg(1001, 2001).length,
        locator: { kind: 'page', pageNumber: 1, pageIndex: 0, entryName: '001.jpg' },
        resourceRef: {
          kind: 'document-entry',
          source: {
            filePath: '/doc/comic.cbz',
            format: 'cbz',
            fileId: '/doc/comic.cbz',
          },
          entryPath: '001.jpg',
          locator: { kind: 'page', pageNumber: 1, pageIndex: 0, entryName: '001.jpg' },
          cachePath: firstPath,
          versionPolicy: 'versioned-export',
        },
      },
      {
        path: secondPath,
        width: 1002,
        height: 2002,
        mimeType: 'image/jpeg',
        byteSize: makeJpeg(1002, 2002).length,
        locator: { kind: 'page', pageNumber: 2, pageIndex: 1, entryName: '002.jpg' },
        resourceRef: {
          kind: 'document-entry',
          source: {
            filePath: '/doc/comic.cbz',
            format: 'cbz',
            fileId: '/doc/comic.cbz',
          },
          entryPath: '002.jpg',
          locator: { kind: 'page', pageNumber: 2, pageIndex: 1, entryName: '002.jpg' },
          cachePath: secondPath,
          versionPolicy: 'versioned-export',
        },
      },
    ]);
    expect(writes).toHaveLength(2);
  });

  it('reuses stable extraction paths for the same document entries', async () => {
    class FakeZip {
      constructor(_filePath: string) {}

      getEntry(name: string): { name: string; getData(): Uint8Array } | null {
        return this.getEntries().find((entry) => entry.name === name) ?? null;
      }

      getEntries(): Array<{ name: string; getData(): Uint8Array }> {
        return [{ name: '001.jpg', getData: () => makeJpeg(1001, 2001) }];
      }
    }

    const createService = (now: Date) => {
      const deps = createDeps({
        now: () => now,
        loadModule: createModuleLoader((packageName) =>
          packageName === 'adm-zip' ? FakeZip : null,
        ),
      });
      const runtime = createDocumentReaderRuntime(deps);
      return createDocumentAccessService({ reader: runtime, runtime: deps });
    };

    const first = await createService(new Date('2026-01-01T00:00:00.000Z')).readRange(
      '/doc/comic.cbz',
      { locator: { kind: 'page', pageNumber: 1, pageIndex: 0 } },
    );
    const second = await createService(new Date('2026-01-02T00:00:00.000Z')).readRange(
      '/doc/comic.cbz',
      { locator: { kind: 'page', pageNumber: 1, pageIndex: 0 } },
    );

    expect(first.imagePaths?.[0]).toBe(second.imagePaths?.[0]);
  });

  it('builds CBR manifests and reads one page by locator as a local temporary image', async () => {
    const deps = createDeps({
      readBinaryFile: vi.fn(async () => new Uint8Array([1, 2])),
      loadModule: createModuleLoader((packageName) =>
        packageName === 'node-unrar-js'
          ? {
              createExtractorFromData: () => ({
                getFileList: () => ({
                  fileHeaders: [{ name: '002.jpg' }, { name: '001.jpg' }, { name: 'notes.txt' }],
                }),
                extract: () => ({
                  files: [
                    {
                      fileHeader: { name: '002.jpg' },
                      extract: [undefined, makeJpeg(1002, 2002)] as const,
                    },
                    {
                      fileHeader: { name: '001.jpg' },
                      extract: [undefined, makeJpeg(1001, 2001)] as const,
                    },
                  ],
                }),
              }),
            }
          : null,
      ),
    });
    const runtime = createDocumentReaderRuntime(deps);
    const service = createDocumentAccessService({ reader: runtime, runtime: deps });

    const manifest = await service.getManifest('/doc/comic.cbr');
    const result = await service.readRange('/doc/comic.cbr', {
      locator: { kind: 'page', pageNumber: 2, pageIndex: 1 },
    });

    expect(manifest.entryCount).toBe(2);
    const pagePath = result.imagePaths?.[0];
    expect(pagePath).toMatch(/^\/tmp\/neko_cbr_[a-z0-9]+\/0001_002\.jpg$/);
    expect(result.imageInfo).toEqual([
      {
        path: pagePath,
        width: 1002,
        height: 2002,
        mimeType: 'image/jpeg',
        byteSize: makeJpeg(1002, 2002).length,
        locator: { kind: 'page', pageNumber: 2, pageIndex: 1, entryName: '002.jpg' },
        resourceRef: {
          kind: 'document-entry',
          source: {
            filePath: '/doc/comic.cbr',
            format: 'cbr',
            fileId: '/doc/comic.cbr',
          },
          entryPath: '002.jpg',
          locator: { kind: 'page', pageNumber: 2, pageIndex: 1, entryName: '002.jpg' },
          cachePath: pagePath,
          versionPolicy: 'versioned-export',
        },
      },
    ]);
    expect(result.metadata?.['format']).toBe('cbr');
  });

  it('continues cursor batches in manifest order and marks completion', async () => {
    const deps = createDeps({
      readTextFile: vi.fn(async () => 'a\nb\nc'),
    });
    const runtime = createDocumentReaderRuntime(deps);
    const service = createDocumentAccessService({
      reader: runtime,
      runtime: deps,
      lowLevelAccess: {
        identify: vi.fn(async () => ({ fileId: 'notes-1', sizeBytes: 5, mtimeMs: 1 })),
      },
    });

    const result = await service.readNext({
      source: { filePath: '/doc/notes.txt', format: 'text', fileId: 'notes-1' },
      strategy: 'manifest-order',
      next: { kind: 'text-range', startLine: 1, endLine: 3 },
      batchIndex: 0,
      done: false,
      fileId: 'notes-1',
    });

    expect(result.text).toBe('a\nb\nc');
    expect(result.cursor?.done).toBe(true);
    expect(result.cursor?.batchIndex).toBe(1);
  });

  it('rejects stale cursors when file identity changes', async () => {
    const deps = createDeps({
      readTextFile: vi.fn(async () => 'text'),
    });
    const runtime = createDocumentReaderRuntime(deps);
    const service = createDocumentAccessService({
      reader: runtime,
      runtime: deps,
      lowLevelAccess: {
        identify: vi.fn(async () => ({ fileId: 'new-id', sizeBytes: 4, mtimeMs: 2 })),
      },
    });

    await expect(
      service.readNext({
        source: { filePath: '/doc/notes.txt', format: 'text', fileId: 'old-id' },
        strategy: 'manifest-order',
        next: { kind: 'text-range', startLine: 1, endLine: 1 },
        batchIndex: 0,
        done: false,
        fileId: 'old-id',
      }),
    ).rejects.toThrow('Document cursor identity is stale');
  });
});
