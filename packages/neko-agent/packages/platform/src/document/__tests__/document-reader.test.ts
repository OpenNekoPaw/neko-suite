import { describe, expect, it, vi } from 'vitest';
import {
  createDocumentReaderRuntime,
  estimateSlideCount,
  isSupportedDocumentPath,
  stripHtmlToText,
  type DocumentReaderRuntimeDeps,
} from '../document-reader';
import { createDocumentAccessService } from '../document-access-service';

type ModuleLoader = DocumentReaderRuntimeDeps['loadModule'];

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
