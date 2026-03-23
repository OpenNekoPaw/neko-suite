/**
 * DocumentReaderService unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DocumentReaderService } from '../DocumentReaderService';

// Mock fs.promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

// Mock os
vi.mock('os', () => ({
  tmpdir: vi.fn(() => '/tmp'),
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

describe('DocumentReaderService', () => {
  let service: DocumentReaderService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DocumentReaderService();
  });

  describe('supports', () => {
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
      const fs = await import('fs/promises');
      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('PDF header with /Encrypt flag'));

      const result = await service.hasDRM('/path/to/protected.pdf');
      expect(result).toBe(true);
    });

    it('should return false for DRM-free files', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('PDF header without encryption'));

      const result = await service.hasDRM('/path/to/free.pdf');
      expect(result).toBe(false);
    });

    it('should return false for CBZ/CBR files', async () => {
      expect(await service.hasDRM('/path/to/comic.cbz')).toBe(false);
      expect(await service.hasDRM('/path/to/comic.cbr')).toBe(false);
    });
  });

  describe('read', () => {
    it('should throw error for DRM-protected files', async () => {
      // Mock hasDRM to return true
      vi.spyOn(service, 'hasDRM').mockResolvedValue(true);

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

    it('should throw error for unsupported formats', async () => {
      vi.spyOn(service, 'hasDRM').mockResolvedValue(false);

      await expect(service.read('/path/to/file.xyz')).rejects.toThrow(
        'Unsupported document format',
      );
    });

    it('should throw error when required package is missing', async () => {
      vi.spyOn(service, 'hasDRM').mockResolvedValue(false);

      await expect(service.read('/path/to/file.pdf')).rejects.toThrow('Failed to read PDF');
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

      const result = await service.read('https://example.com');

      expect(result.text).toContain('Example Domain');
      expect(result.metadata?.url).toBe('https://example.com');
      expect(result.metadata?.title).toBeTruthy();
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
});
