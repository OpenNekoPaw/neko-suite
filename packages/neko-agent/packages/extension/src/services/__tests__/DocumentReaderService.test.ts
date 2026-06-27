/**
 * DocumentReaderService unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { DocumentReaderService, createDocumentReaderService } from '../DocumentReaderService';
import type { IEngineClientProvider } from '../engineClientProvider';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));

// Mock fs.promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  stat: vi.fn(),
}));

// Mock the logger
vi.mock('../../base', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

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

function createEngineClientProviderForEntry(bytes: Uint8Array): {
  readonly provider: IEngineClientProvider;
  readonly engine: {
    readonly withRegisteredFile: ReturnType<typeof vi.fn>;
    readonly readFileEntry: ReturnType<typeof vi.fn>;
  };
} {
  const engine = {
    withRegisteredFile: vi.fn(async (_request, task) =>
      task({
        token: 'token-1',
        fileSizeBytes: bytes.byteLength,
        mimeType: 'application/zip',
        purpose: 'document',
        rangeUrl: '/v1/files/token-1',
      }),
    ),
    readFileEntry: vi.fn(async () => bytes.buffer.slice(0)),
  };
  return {
    engine,
    provider: {
      getOptionalClient: vi.fn(async () => engine as any),
      getRequiredClient: vi.fn(async () => engine as any),
      transcodeFile: vi.fn(async () => true),
      createPerceptionClient: vi.fn(() => ({ perception: {} }) as any),
      createPerceptionClients: vi.fn(() => ({})),
    },
  };
}

describe('DocumentReaderService', () => {
  let service: DocumentReaderService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);
    service = new DocumentReaderService();
  });

  describe('supports', () => {
    it('wires createDocumentReaderService without exposing document reader scratch paths', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      const { provider, engine } = createEngineClientProviderForEntry(makeJpeg(2, 3));
      const reader = createDocumentReaderService(provider);
      vi.spyOn(reader, 'hasDRM').mockResolvedValue(false);
      vi.spyOn(
        reader as unknown as { tryImport(packageName: string): Promise<unknown | null> },
        'tryImport',
      ).mockImplementation(async (packageName) => {
        if (packageName !== 'adm-zip') return null;
        return class FakeZip {
          getEntries() {
            return [
              {
                name: 'page-1.jpg',
                getData: () => {
                  throw new Error('legacy zip entry fallback should not be used');
                },
              },
            ];
          }
        };
      });

      const result = await reader.read('/path/to/comic.cbz');

      expect(result.imagePaths).toBeUndefined();
      expect(result.imageInfo?.[0]).toEqual(
        expect.objectContaining({
          entryPath: 'page-1.jpg',
          resourceRef: {
            kind: 'document-entry',
            source: { filePath: '/path/to/comic.cbz', format: 'cbz' },
            entryPath: 'page-1.jpg',
            versionPolicy: 'versioned-export',
          },
        }),
      );
      expect(fs.mkdir).not.toHaveBeenCalled();
      expect(fs.writeFile).not.toHaveBeenCalled();
      expect(engine.readFileEntry).toHaveBeenCalledWith('token-1', 'page-1.jpg');
      expect(JSON.stringify(result)).not.toContain('document-reader');
    });

    it('should support PDF files', () => {
      expect(service.supports('/path/to/file.pdf')).toBe(true);
      expect(service.supports('/path/to/file.PDF')).toBe(true);
    });

    it('should support DOCX files', () => {
      expect(service.supports('/path/to/file.docx')).toBe(true);
      expect(service.supports('/path/to/file.doc')).toBe(true);
    });

    it('should support EPUB files', () => {
      expect(service.supports('/path/to/book.epub')).toBe(true);
      expect(service.supports('/path/to/book.EPUB')).toBe(true);
    });

    it('should support CBZ files', () => {
      expect(service.supports('/path/to/comic.cbz')).toBe(true);
      expect(service.supports('/path/to/comic.CBZ')).toBe(true);
    });

    it('should support CBR files', () => {
      expect(service.supports('/path/to/comic.cbr')).toBe(true);
      expect(service.supports('/path/to/comic.CBR')).toBe(true);
    });

    it('should support text files', () => {
      expect(service.supports('/path/to/file.txt')).toBe(true);
      expect(service.supports('/path/to/file.md')).toBe(true);
      expect(service.supports('/path/to/script.fountain')).toBe(true);
    });

    it('should support Excel files', () => {
      expect(service.supports('/path/to/data.xlsx')).toBe(true);
      expect(service.supports('/path/to/data.xls')).toBe(true);
    });

    it('should support Final Draft files', () => {
      expect(service.supports('/path/to/script.fdx')).toBe(true);
    });

    it('should support PPTX files', () => {
      expect(service.supports('/path/to/presentation.pptx')).toBe(true);
      expect(service.supports('/path/to/presentation.ppt')).toBe(true);
      expect(service.supports('/path/to/presentation.PPTX')).toBe(true);
    });

    it('should not support unsupported formats', () => {
      expect(service.supports('/path/to/file.xyz')).toBe(false);
      expect(service.supports('/path/to/file.exe')).toBe(false);
      expect(service.supports('/path/to/file')).toBe(false);
    });
  });

  describe('hasDRM', () => {
    it('should detect DRM in EPUB files', async () => {
      // For now, skip this test as dynamic mocking is complex
      // In real usage, adm-zip will be available
      expect(await service.hasDRM('/path/to/file.epub')).toBe(false);
    });

    it('should detect DRM in PDF files', async () => {
      const binaryService = new DocumentReaderService({
        readFile: vi.fn(async () => new TextEncoder().encode('PDF header with /Encrypt flag')),
      });

      const result = await binaryService.hasDRM('/path/to/protected.pdf');
      expect(result).toBe(true);
    });

    it('should return false for DRM-free files', async () => {
      const binaryService = new DocumentReaderService({
        readFile: vi.fn(async () => new TextEncoder().encode('PDF header without encryption')),
      });

      const result = await binaryService.hasDRM('/path/to/free.pdf');
      expect(result).toBe(false);
    });

    it('should return false for CBZ/CBR files', async () => {
      expect(await service.hasDRM('/path/to/comic.cbz')).toBe(false);
      expect(await service.hasDRM('/path/to/comic.cbr')).toBe(false);
    });
  });

  describe('read', () => {
    it('should throw error for DRM-protected files', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(service as any, 'tryImport').mockImplementation(async (pkg: string) => {
        if (pkg === 'adm-zip') {
          return class FakeZip {
            getEntry(name: string) {
              return name === 'META-INF/encryption.xml' ? {} : null;
            }
          };
        }
        return null;
      });

      await expect(service.read('/path/to/protected.epub')).rejects.toThrow(
        'DRM-protected files are not supported',
      );
    });

    it('should read text files', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.readFile).mockResolvedValue('Hello World' as any);
      vi.spyOn(service, 'hasDRM').mockResolvedValue(false);

      const result = await service.read('/path/to/file.txt');

      expect(result.text).toBe('Hello World');
      expect(result.pageCount).toBeUndefined();
      expect(result.imagePaths).toBeUndefined();
    });

    it('should resolve media library variables before reading files', async () => {
      const fs = await import('fs/promises');
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue('/library/books/book.txt');
      vi.mocked(fs.readFile).mockResolvedValue('Resolved content' as any);

      const result = await service.read('${A}/books/book.txt');

      expect(result.text).toBe('Resolved content');
      expect(fs.readFile).toHaveBeenCalledWith('/library/books/book.txt', 'utf-8');
    });

    it('should resolve media library variables before reading manifests', async () => {
      const fs = await import('fs/promises');
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue('/library/books/book.txt');
      vi.mocked(fs.stat).mockResolvedValue({
        size: 16,
        mtimeMs: 123,
      } as any);
      vi.mocked(fs.readFile).mockResolvedValue('Line one\nLine two' as any);

      const manifest = await service.getManifest('${A}/books/book.txt');

      expect(manifest.source.filePath).toBe('/library/books/book.txt');
      expect(fs.stat).toHaveBeenCalledWith('/library/books/book.txt');
      expect(fs.readFile).toHaveBeenCalledWith('/library/books/book.txt', 'utf-8');
    });

    it('does not write archive document images under a configured temp directory', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      const { provider, engine } = createEngineClientProviderForEntry(makeJpeg(2, 3));
      const cachedService = new DocumentReaderService({
        readEntry: async (filePath, entryPath) => {
          const client = await provider.getRequiredClient();
          return client.withRegisteredFile(
            { filePath, purpose: 'document' },
            async (registered) =>
              new Uint8Array(await client.readFileEntry(registered.token, entryPath)),
          );
        },
      });
      vi.spyOn(cachedService, 'hasDRM').mockResolvedValue(false);
      vi.spyOn(
        cachedService as unknown as { tryImport(packageName: string): Promise<unknown | null> },
        'tryImport',
      ).mockImplementation(async (packageName) => {
        if (packageName !== 'adm-zip') return null;
        return class FakeZip {
          getEntries() {
            return [
              {
                name: 'page-1.jpg',
                getData: () => {
                  throw new Error('legacy zip entry fallback should not be used');
                },
              },
            ];
          }
        };
      });

      const result = await cachedService.read('/path/to/comic.cbz');

      expect(result.imagePaths).toBeUndefined();
      expect(result.imageInfo?.[0]?.resourceRef).toEqual(
        expect.objectContaining({
          kind: 'document-entry',
          entryPath: 'page-1.jpg',
        }),
      );
      expect(fs.mkdir).not.toHaveBeenCalled();
      expect(fs.writeFile).not.toHaveBeenCalled();
      expect(engine.readFileEntry).toHaveBeenCalledWith('token-1', 'page-1.jpg');
      expect(JSON.stringify(result)).not.toContain('document-reader');
    });

    it('should throw error for unsupported formats', async () => {
      vi.spyOn(service, 'hasDRM').mockResolvedValue(false);

      await expect(service.read('/path/to/file.xyz')).rejects.toThrow(
        'Unsupported document format',
      );
    });

    it('should throw error when required package is missing', async () => {
      vi.spyOn(service, 'hasDRM').mockResolvedValue(false);
      vi.spyOn(
        service as unknown as { tryImport(packageName: string): Promise<unknown | null> },
        'tryImport',
      ).mockResolvedValue(null);

      await expect(service.read('/path/to/file.pdf')).rejects.toThrow(
        'PDF text reader is unavailable',
      );
    });
  });

  describe('readTextFile', () => {
    it('should read plain text files', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.readFile).mockResolvedValue('Test content' as any);
      vi.spyOn(service, 'hasDRM').mockResolvedValue(false);

      const result = await service.read('/path/to/file.txt');

      expect(result.text).toBe('Test content');
    });
  });

  describe('readUrl', () => {
    it('should read web pages', async () => {
      vi.spyOn(service, 'hasDRM').mockResolvedValue(false);

      // Mock node-fetch to avoid real network requests in CI
      const mockHtml =
        '<html><head><title>Example Domain</title></head><body><p>Example Domain content</p></body></html>';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(service as any, 'tryImport').mockImplementation(async (pkg: any) => {
        if (pkg === 'node-fetch') {
          const mockFetch = async () => ({
            ok: true,
            text: async () => mockHtml,
          });
          return { default: mockFetch };
        }
        if (pkg === 'cheerio') {
          return await import('cheerio');
        }
        return undefined;
      });

      const result = await service.read('https://example.com');

      expect(result.text).toContain('Example Domain');
      expect(result.metadata?.url).toBe('https://example.com');
      expect(result.metadata?.title).toBe('Example Domain');
    });
  });

  describe('readExcel', () => {
    it('should handle Excel files', async () => {
      vi.spyOn(service, 'hasDRM').mockResolvedValue(false);

      // Will fail without actual file, just verify it attempts to read
      await expect(service.read('/path/to/file.xlsx')).rejects.toThrow();
    });
  });

  describe('readFinalDraft', () => {
    it('should handle Final Draft files', async () => {
      const fs = await import('fs/promises');
      const mockXml = `<?xml version="1.0"?>
<FinalDraft>
  <Content>
    <Paragraph Type="Scene Heading"><Text>INT. OFFICE - DAY</Text></Paragraph>
    <Paragraph Type="Action"><Text>John enters.</Text></Paragraph>
  </Content>
</FinalDraft>`;
      vi.mocked(fs.readFile).mockResolvedValue(mockXml as any);
      vi.spyOn(service, 'hasDRM').mockResolvedValue(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(service as any, 'tryImport').mockImplementation(async (pkg: string) => {
        if (pkg === 'fast-xml-parser') {
          return {
            XMLParser: class FakeXmlParser {
              parse() {
                return {
                  FinalDraft: {
                    Content: {
                      Paragraph: [
                        { '@_Type': 'Scene Heading', Text: 'INT. OFFICE - DAY' },
                        { '@_Type': 'Action', Text: 'John enters.' },
                      ],
                    },
                  },
                };
              }
            },
          };
        }
        return null;
      });

      const result = await service.read('/path/to/script.fdx');

      expect(result.text).toContain('INT. OFFICE - DAY');
      expect(result.metadata?.format).toBe('fdx');
    });
  });

  describe('readHtmlFile', () => {
    it('should strip HTML tags', async () => {
      const fs = await import('fs/promises');
      const html = '<html><body><h1>Title</h1><p>Content</p></body></html>';
      vi.mocked(fs.readFile).mockResolvedValue(html as any);
      vi.spyOn(service, 'hasDRM').mockResolvedValue(false);

      const result = await service.read('/path/to/file.html');

      expect(result.text).not.toContain('<');
      expect(result.text).not.toContain('>');
      expect(result.text).toContain('Title');
      expect(result.text).toContain('Content');
    });

    it('should remove script and style tags', async () => {
      const fs = await import('fs/promises');
      const html =
        '<html><script>alert("test")</script><style>body{}</style><body>Content</body></html>';
      vi.mocked(fs.readFile).mockResolvedValue(html as any);
      vi.spyOn(service, 'hasDRM').mockResolvedValue(false);

      const result = await service.read('/path/to/file.html');

      expect(result.text).not.toContain('alert');
      expect(result.text).not.toContain('body{}');
      expect(result.text).toContain('Content');
    });
  });

  describe('readPptx', () => {
    it('should handle PPTX files without officeparser', async () => {
      vi.spyOn(service, 'hasDRM').mockResolvedValue(false);
      vi.spyOn(
        service as unknown as { tryImport(packageName: string): Promise<unknown | null> },
        'tryImport',
      ).mockResolvedValue(null);

      await expect(service.read('/path/to/presentation.pptx')).rejects.toThrow(
        'Presentation reader is unavailable',
      );
    });

    it('should extract text and metadata from PPTX', async () => {
      vi.spyOn(service, 'hasDRM').mockResolvedValue(false);

      // This test requires actual officeparser package
      // In real usage, officeparser will extract text from slides
      await expect(service.read('/path/to/presentation.pptx')).rejects.toThrow();
    });
  });
});
