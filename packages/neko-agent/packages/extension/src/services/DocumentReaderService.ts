/**
 * Document Reader Service — Extracts text from PDF, DOCX, PPTX, EPUB, CBZ, CBR and other document formats
 *
 * Runs in Extension Host (Node.js) where file system and native modules are available.
 * Used by the readDocument pipeline stage and ReadDocument agent tool.
 *
 * Legal Notice:
 * - Supports DRM-free content only
 * - Users must have legal rights to process files
 * - Do not use for pirated content
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { getLogger } from '../base';

const logger = getLogger('DocumentReaderService');

/** Extracted document content */
export interface DocumentContent {
  /** Full text content */
  text: string;
  /** Number of pages (for PDFs) */
  pageCount?: number;
  /** Document metadata (title, author, etc.) */
  metadata?: Record<string, unknown>;
  /** Image paths (for comic archives) */
  imagePaths?: string[];
}

/** Document reader interface */
export interface IDocumentReaderService {
  /** Read and extract text from a document file */
  read(filePath: string): Promise<DocumentContent>;
  /** Check if a file format is supported */
  supports(filePath: string): boolean;
  /** Check if a file has DRM protection */
  hasDRM(filePath: string): Promise<boolean>;
}

const SUPPORTED_EXTENSIONS = new Set([
  '.pdf',
  '.docx',
  '.doc',
  '.pptx',
  '.ppt',
  '.md',
  '.txt',
  '.fountain',
  '.html',
  '.htm',
  '.json',
  '.yaml',
  '.yml',
  '.epub',
  '.cbz',
  '.cbr',
  '.xlsx',
  '.xls',
  '.fdx',
]);

export class DocumentReaderService implements IDocumentReaderService {
  supports(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return SUPPORTED_EXTENSIONS.has(ext);
  }

  async read(filePath: string): Promise<DocumentContent> {
    // Handle URL
    if (this.isUrl(filePath)) {
      return this.readUrl(filePath);
    }

    const ext = path.extname(filePath).toLowerCase();

    // Check DRM protection
    if (await this.hasDRM(filePath)) {
      throw new Error(
        'DRM-protected files are not supported due to legal restrictions. ' +
          'Please use DRM-free versions of your content.',
      );
    }

    switch (ext) {
      case '.pdf':
        return this.readPdf(filePath);
      case '.docx':
      case '.doc':
        return this.readDocx(filePath);
      case '.pptx':
      case '.ppt':
        return this.readPptx(filePath);
      case '.epub':
        return this.readEpub(filePath);
      case '.cbz':
        return this.readCbz(filePath);
      case '.cbr':
        return this.readCbr(filePath);
      case '.xlsx':
      case '.xls':
        return this.readExcel(filePath);
      case '.fdx':
        return this.readFinalDraft(filePath);
      case '.md':
      case '.txt':
      case '.fountain':
      case '.json':
      case '.yaml':
      case '.yml':
        return this.readTextFile(filePath);
      case '.html':
      case '.htm':
        return this.readHtmlFile(filePath);
      default:
        throw new Error(`Unsupported document format: ${ext}`);
    }
  }

  private isUrl(input: string): boolean {
    return /^https?:\/\//i.test(input);
  }

  private async readTextFile(filePath: string): Promise<DocumentContent> {
    const text = await fs.readFile(filePath, 'utf-8');
    return { text };
  }

  private async readHtmlFile(filePath: string): Promise<DocumentContent> {
    const html = await fs.readFile(filePath, 'utf-8');
    // Strip HTML tags for plain text extraction
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return { text };
  }

  private async readPdf(filePath: string): Promise<DocumentContent> {
    try {
      // Dynamic import to avoid hard dependency
      const pdfParse = await this.tryImport<
        (buffer: Buffer) => Promise<{
          text: string;
          numpages: number;
          info?: Record<string, string>;
        }>
      >('pdf-parse');

      if (!pdfParse) {
        throw new Error(
          'pdf-parse package not installed. Run: pnpm add pdf-parse -F @neko-agent/extension',
        );
      }

      const buffer = await fs.readFile(filePath);
      const result = await pdfParse(buffer);

      return {
        text: result.text,
        pageCount: result.numpages,
        metadata: result.info,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('pdf-parse')) {
        throw error;
      }
      logger.error('Failed to read PDF', { path: filePath, error });
      throw new Error(
        `Failed to read PDF: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async readDocx(filePath: string): Promise<DocumentContent> {
    try {
      // Dynamic import to avoid hard dependency
      const mammoth = await this.tryImport<{
        extractRawText: (options: { path: string }) => Promise<{ value: string }>;
      }>('mammoth');

      if (!mammoth) {
        throw new Error(
          'mammoth package not installed. Run: pnpm add mammoth -F @neko-agent/extension',
        );
      }

      const result = await mammoth.extractRawText({ path: filePath });

      return {
        text: result.value,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('mammoth')) {
        throw error;
      }
      logger.error('Failed to read DOCX', { path: filePath, error });
      throw new Error(
        `Failed to read DOCX: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async readPptx(filePath: string): Promise<DocumentContent> {
    try {
      // Dynamic import to avoid hard dependency
      const officeParser = await this.tryImport<{
        parseOfficeAsync: (filePath: string) => Promise<string>;
      }>('officeparser');

      if (!officeParser) {
        throw new Error(
          'officeparser package not installed. Run: pnpm add officeparser -F @neko-agent/extension',
        );
      }

      const text = await officeParser.parseOfficeAsync(filePath);

      // Estimate slide count by splitting on double newlines (rough heuristic)
      const slideCount = text.split('\n\n').filter((s) => s.trim().length > 0).length;

      return {
        text,
        pageCount: slideCount,
        metadata: {
          format: 'pptx',
          slideCount,
        },
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('officeparser')) {
        throw error;
      }
      logger.error('Failed to read PPTX', { path: filePath, error });
      throw new Error(
        `Failed to read PPTX: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async readEpub(filePath: string): Promise<DocumentContent> {
    try {
      const EPub = await this.tryImport<typeof import('epub2')>('epub2');

      if (!EPub) {
        throw new Error(
          'epub2 package not installed. Run: pnpm add epub2 -F @neko-agent/extension',
        );
      }

      return new Promise((resolve, reject) => {
        const epub = new EPub(filePath);

        epub.on('end', async () => {
          try {
            const chapters = epub.flow.map((c: { id: string }) => c.id);
            const texts: string[] = [];

            for (const id of chapters) {
              const text = await new Promise<string>((res) => {
                epub.getChapter(id, (err: Error | null, content: string) => {
                  if (err) return res('');
                  // Strip HTML tags
                  const clean = content
                    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                  res(clean);
                });
              });
              texts.push(text);
            }

            resolve({
              text: texts.join('\n\n'),
              metadata: {
                title: epub.metadata.title,
                author: epub.metadata.creator,
                publisher: epub.metadata.publisher,
                language: epub.metadata.language,
              },
            });
          } catch (error) {
            reject(error);
          }
        });

        epub.on('error', reject);
        epub.parse();
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('epub2')) {
        throw error;
      }
      logger.error('Failed to read EPUB', { path: filePath, error });
      throw new Error(
        `Failed to read EPUB: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async readCbz(filePath: string): Promise<DocumentContent> {
    try {
      const AdmZip = await this.tryImport<typeof import('adm-zip')>('adm-zip');

      if (!AdmZip) {
        throw new Error(
          'adm-zip package not installed. Run: pnpm add adm-zip -F @neko-agent/extension',
        );
      }

      const zip = new AdmZip(filePath);
      const entries = zip
        .getEntries()
        .filter((e) => /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(e.name))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

      // Extract images to temporary directory
      const tmpDir = path.join(os.tmpdir(), `neko_cbz_${Date.now()}`);
      await fs.mkdir(tmpDir, { recursive: true });

      const imagePaths: string[] = [];
      for (const entry of entries) {
        const imgPath = path.join(tmpDir, path.basename(entry.name));
        await fs.writeFile(imgPath, entry.getData());
        imagePaths.push(imgPath);
      }

      logger.info('Extracted CBZ archive', { pages: entries.length, tmpDir });

      return {
        text: `Comic archive with ${entries.length} pages`,
        pageCount: entries.length,
        imagePaths,
        metadata: {
          format: 'cbz',
          fileName: path.basename(filePath),
          tmpDir,
        },
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('adm-zip')) {
        throw error;
      }
      logger.error('Failed to read CBZ', { path: filePath, error });
      throw new Error(
        `Failed to read CBZ: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async readCbr(filePath: string): Promise<DocumentContent> {
    try {
      const unrar = await this.tryImport<typeof import('node-unrar-js')>('node-unrar-js');

      if (!unrar) {
        throw new Error(
          'node-unrar-js package not installed. Run: pnpm add node-unrar-js -F @neko-agent/extension',
        );
      }

      const buffer = await fs.readFile(filePath);
      const extractor = unrar.createExtractorFromData({ data: buffer });
      const list = extractor.getFileList();

      const imageFiles = list.fileHeaders
        .filter((f) => /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(f.name))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

      const tmpDir = path.join(os.tmpdir(), `neko_cbr_${Date.now()}`);
      await fs.mkdir(tmpDir, { recursive: true });

      const imagePaths: string[] = [];
      const extracted = extractor.extract();

      for (const file of extracted.files) {
        if (/\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(file.fileHeader.name)) {
          const imgPath = path.join(tmpDir, path.basename(file.fileHeader.name));
          await fs.writeFile(imgPath, file.extract[1]);
          imagePaths.push(imgPath);
        }
      }

      logger.info('Extracted CBR archive', { pages: imageFiles.length, tmpDir });

      return {
        text: `Comic archive with ${imageFiles.length} pages`,
        pageCount: imageFiles.length,
        imagePaths,
        metadata: {
          format: 'cbr',
          fileName: path.basename(filePath),
          tmpDir,
        },
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('node-unrar-js')) {
        throw error;
      }
      logger.error('Failed to read CBR', { path: filePath, error });
      throw new Error(
        `Failed to read CBR: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async readUrl(url: string): Promise<DocumentContent> {
    try {
      const fetch = await this.tryImport<typeof import('node-fetch')>('node-fetch');
      const cheerio = await this.tryImport<typeof import('cheerio')>('cheerio');

      if (!fetch || !cheerio) {
        throw new Error(
          'URL support requires node-fetch and cheerio. Run: pnpm add node-fetch cheerio -F @neko-agent/extension',
        );
      }

      const response = await fetch.default(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Remove non-content elements
      $('script, style, nav, aside, footer, header, .ad, .advertisement').remove();

      // Extract main content
      const mainContent =
        $('article').text() || $('main').text() || $('.content').text() || $('body').text();

      const text = mainContent.replace(/\s+/g, ' ').trim();

      return {
        text,
        metadata: {
          url,
          title: $('title').text().trim(),
          fetchedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      logger.error('Failed to read URL', { url, error });
      throw new Error(
        `Failed to read URL: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async readExcel(filePath: string): Promise<DocumentContent> {
    try {
      const xlsx = await this.tryImport<typeof import('xlsx')>('xlsx');

      if (!xlsx) {
        throw new Error('Excel support requires xlsx. Run: pnpm add xlsx -F @neko-agent/extension');
      }

      const workbook = xlsx.readFile(filePath);
      const sheets: string[] = [];
      const allData: unknown[][] = [];

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        allData.push(...(data as unknown[][]));

        // Convert to readable text
        const sheetText = (data as unknown[][]).map((row) => row.join('\t')).join('\n');
        sheets.push(`Sheet: ${sheetName}\n${sheetText}`);
      }

      return {
        text: sheets.join('\n\n'),
        metadata: {
          format: 'xlsx',
          sheetCount: workbook.SheetNames.length,
          sheets: workbook.SheetNames,
          rowCount: allData.length,
        },
      };
    } catch (error) {
      logger.error('Failed to read Excel', { path: filePath, error });
      throw new Error(
        `Failed to read Excel: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async readFinalDraft(filePath: string): Promise<DocumentContent> {
    try {
      const { XMLParser } = await this.tryImport<typeof import('fast-xml-parser')>(
        'fast-xml-parser',
      ).then((mod) => mod || { XMLParser: null });

      if (!XMLParser) {
        throw new Error(
          'Final Draft support requires fast-xml-parser. Run: pnpm add fast-xml-parser -F @neko-agent/extension',
        );
      }

      const xml = await fs.readFile(filePath, 'utf-8');
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
      });
      const doc = parser.parse(xml);

      // Extract scenes from FDX structure
      const scenes = this.extractFDXScenes(doc);
      const text = scenes.map((s) => s.text).join('\n\n');

      return {
        text,
        pageCount: scenes.length,
        metadata: {
          format: 'fdx',
          sceneCount: scenes.length,
          title: doc.FinalDraft?.Content?.TitlePage?.Content || 'Untitled',
        },
      };
    } catch (error) {
      logger.error('Failed to read Final Draft', { path: filePath, error });
      throw new Error(
        `Failed to read Final Draft: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private extractFDXScenes(doc: Record<string, unknown>): Array<{ text: string }> {
    const scenes: Array<{ text: string }> = [];
    try {
      const content = (doc as { FinalDraft?: { Content?: { Paragraph?: unknown[] } } }).FinalDraft
        ?.Content?.Paragraph;
      if (!Array.isArray(content)) return scenes;

      let currentScene = '';
      for (const para of content) {
        const p = para as { '@_Type'?: string; Text?: string | string[] };
        const type = p['@_Type'];
        const text = Array.isArray(p.Text) ? p.Text.join(' ') : p.Text || '';

        if (type === 'Scene Heading') {
          if (currentScene) {
            scenes.push({ text: currentScene.trim() });
          }
          currentScene = `${text}\n`;
        } else if (type === 'Action' || type === 'Character' || type === 'Dialogue') {
          currentScene += `${text}\n`;
        }
      }

      if (currentScene) {
        scenes.push({ text: currentScene.trim() });
      }
    } catch (error) {
      logger.warn('Failed to parse FDX structure', { error });
    }

    return scenes.length > 0 ? scenes : [{ text: 'Failed to parse FDX content' }];
  }

  async hasDRM(filePath: string): Promise<boolean> {
    const ext = path.extname(filePath).toLowerCase();

    try {
      if (ext === '.epub') {
        // Check for META-INF/encryption.xml
        const AdmZip = await this.tryImport<typeof import('adm-zip')>('adm-zip');
        if (!AdmZip) return false;

        const zip = new AdmZip(filePath);
        const encryptionEntry = zip.getEntry('META-INF/encryption.xml');
        return encryptionEntry !== null;
      }

      if (ext === '.pdf') {
        // Check for encryption flag in PDF header
        const buffer = await fs.readFile(filePath);
        const header = buffer.toString('utf-8', 0, 1024);
        return header.includes('/Encrypt');
      }

      // CBZ/CBR/DOCX don't typically have DRM
      return false;
    } catch (error) {
      logger.warn('Failed to check DRM', { path: filePath, error });
      return false;
    }
  }

  /**
   * Try to dynamically import a package, return null if not installed
   */
  private async tryImport<T>(packageName: string): Promise<T | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(packageName) as T;
      return mod;
    } catch {
      return null;
    }
  }
}

/**
 * Create a document reader service instance
 */
export function createDocumentReaderService(): IDocumentReaderService {
  return new DocumentReaderService();
}
