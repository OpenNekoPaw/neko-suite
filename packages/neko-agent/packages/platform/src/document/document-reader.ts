import * as path from 'node:path';

export interface DocumentContent {
  text: string;
  pageCount?: number;
  metadata?: Record<string, unknown>;
  imagePaths?: string[];
}

export interface IDocumentReader {
  read(filePath: string): Promise<DocumentContent>;
  supports(filePath: string): boolean;
  hasDRM(filePath: string): Promise<boolean>;
}

export interface DocumentReaderLogger {
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
}

export interface DocumentReaderRuntimeDeps {
  readTextFile(filePath: string): Promise<string>;
  readBinaryFile(filePath: string): Promise<Uint8Array>;
  writeBinaryFile(filePath: string, data: Uint8Array): Promise<void>;
  makeDir(filePath: string, options: { recursive: boolean }): Promise<void>;
  tempDir(): string;
  loadModule<T>(packageName: string): Promise<T | null>;
  logger?: DocumentReaderLogger;
  now?: () => Date;
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

const COMIC_IMAGE_PATTERN = /\.(jpg|jpeg|png|gif|webp|bmp)$/i;

export function isDocumentUrl(input: string): boolean {
  return /^https?:\/\//i.test(input);
}

export function isSupportedDocumentPath(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function estimateSlideCount(text: string): number {
  return text.split('\n\n').filter((section) => section.trim().length > 0).length;
}

interface PdfParseResult {
  text: string;
  numpages: number;
  info?: Record<string, string>;
}

type PdfParse = (buffer: Uint8Array) => Promise<PdfParseResult>;

interface MammothModule {
  extractRawText(options: { path: string }): Promise<{ value: string }>;
}

interface OfficeParserModule {
  parseOfficeAsync(filePath: string): Promise<string>;
}

interface EpubChapter {
  id: string;
}

interface EpubMetadata {
  title?: string;
  creator?: string;
  publisher?: string;
  language?: string;
}

interface EpubInstance {
  flow: EpubChapter[];
  metadata: EpubMetadata;
  on(event: 'end', handler: () => void): void;
  on(event: 'error', handler: (error: Error) => void): void;
  getChapter(id: string, callback: (error: Error | null, content: string) => void): void;
  parse(): void;
}

interface EpubConstructor {
  new (filePath: string): EpubInstance;
}

interface ZipEntry {
  name: string;
  getData(): Uint8Array;
}

interface AdmZipInstance {
  getEntries(): ZipEntry[];
  getEntry(name: string): ZipEntry | null;
}

interface AdmZipConstructor {
  new (filePath: string): AdmZipInstance;
}

interface UnrarFileHeader {
  name: string;
}

interface UnrarExtractedFile {
  fileHeader: UnrarFileHeader;
  extract: [unknown, Uint8Array];
}

interface UnrarExtractor {
  getFileList(): { fileHeaders: UnrarFileHeader[] };
  extract(): { files: UnrarExtractedFile[] };
}

interface UnrarModule {
  createExtractorFromData(options: { data: Uint8Array }): UnrarExtractor;
}

interface FetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  text(): Promise<string>;
}

type FetchFn = (url: string) => Promise<FetchResponse>;

interface FetchModule {
  default?: FetchFn;
}

interface CheerioSelection {
  remove(): void;
  text(): string;
}

type CheerioRoot = (selector: string) => CheerioSelection;

interface CheerioModule {
  load(html: string): CheerioRoot;
}

interface XlsxSheet {
  [key: string]: unknown;
}

interface XlsxWorkbook {
  SheetNames: string[];
  Sheets: Record<string, XlsxSheet | undefined>;
}

interface XlsxModule {
  readFile(filePath: string): XlsxWorkbook;
  utils: {
    sheet_to_json(sheet: XlsxSheet, options: { header: 1 }): unknown[];
  };
}

interface XmlParser {
  parse(xml: string): unknown;
}

interface XmlParserConstructor {
  new (options: { ignoreAttributes: boolean; attributeNamePrefix: string }): XmlParser;
}

interface FastXmlParserModule {
  XMLParser?: XmlParserConstructor | null;
}

export class DocumentReaderRuntime implements IDocumentReader {
  constructor(private readonly deps: DocumentReaderRuntimeDeps) {}

  supports(filePath: string): boolean {
    return isSupportedDocumentPath(filePath);
  }

  async read(filePath: string): Promise<DocumentContent> {
    if (isDocumentUrl(filePath)) {
      return this.readUrl(filePath);
    }

    const ext = path.extname(filePath).toLowerCase();
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

  async hasDRM(filePath: string): Promise<boolean> {
    const ext = path.extname(filePath).toLowerCase();

    try {
      if (ext === '.epub') {
        const AdmZip = await this.deps.loadModule<AdmZipConstructor>('adm-zip');
        if (!AdmZip) return false;

        const zip = new AdmZip(filePath);
        return zip.getEntry('META-INF/encryption.xml') !== null;
      }

      if (ext === '.pdf') {
        const buffer = await this.deps.readBinaryFile(filePath);
        const header = new TextDecoder().decode(buffer.slice(0, 1024));
        return header.includes('/Encrypt');
      }

      return false;
    } catch (error) {
      this.deps.logger?.warn('Failed to check DRM', { path: filePath, error });
      return false;
    }
  }

  private async readTextFile(filePath: string): Promise<DocumentContent> {
    return { text: await this.deps.readTextFile(filePath) };
  }

  private async readHtmlFile(filePath: string): Promise<DocumentContent> {
    return { text: stripHtmlToText(await this.deps.readTextFile(filePath)) };
  }

  private async readPdf(filePath: string): Promise<DocumentContent> {
    try {
      const pdfParse = await this.deps.loadModule<PdfParse>('pdf-parse');
      if (!pdfParse) {
        throw new Error(
          'pdf-parse package not installed. Run: pnpm add pdf-parse -F @neko-agent/extension',
        );
      }

      const result = await pdfParse(await this.deps.readBinaryFile(filePath));
      return {
        text: result.text,
        pageCount: result.numpages,
        metadata: result.info,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('pdf-parse')) {
        throw error;
      }
      this.deps.logger?.error('Failed to read PDF', { path: filePath, error });
      throw new Error(
        `Failed to read PDF: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async readDocx(filePath: string): Promise<DocumentContent> {
    try {
      const mammoth = await this.deps.loadModule<MammothModule>('mammoth');
      if (!mammoth) {
        throw new Error(
          'mammoth package not installed. Run: pnpm add mammoth -F @neko-agent/extension',
        );
      }

      const result = await mammoth.extractRawText({ path: filePath });
      return { text: result.value };
    } catch (error) {
      if (error instanceof Error && error.message.includes('mammoth')) {
        throw error;
      }
      this.deps.logger?.error('Failed to read DOCX', { path: filePath, error });
      throw new Error(
        `Failed to read DOCX: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async readPptx(filePath: string): Promise<DocumentContent> {
    try {
      const officeParser = await this.deps.loadModule<OfficeParserModule>('officeparser');
      if (!officeParser) {
        throw new Error(
          'officeparser package not installed. Run: pnpm add officeparser -F @neko-agent/extension',
        );
      }

      const text = await officeParser.parseOfficeAsync(filePath);
      const slideCount = estimateSlideCount(text);
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
      this.deps.logger?.error('Failed to read PPTX', { path: filePath, error });
      throw new Error(
        `Failed to read PPTX: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async readEpub(filePath: string): Promise<DocumentContent> {
    try {
      const EPub = await this.deps.loadModule<EpubConstructor>('epub2');
      if (!EPub) {
        throw new Error(
          'epub2 package not installed. Run: pnpm add epub2 -F @neko-agent/extension',
        );
      }

      return new Promise((resolve, reject) => {
        const epub = new EPub(filePath);

        epub.on('end', async () => {
          try {
            const texts: string[] = [];
            for (const chapter of epub.flow) {
              const text = await new Promise<string>((res) => {
                epub.getChapter(chapter.id, (err, content) => {
                  res(err ? '' : stripHtmlToText(content));
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
      this.deps.logger?.error('Failed to read EPUB', { path: filePath, error });
      throw new Error(
        `Failed to read EPUB: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async readCbz(filePath: string): Promise<DocumentContent> {
    try {
      const AdmZip = await this.deps.loadModule<AdmZipConstructor>('adm-zip');
      if (!AdmZip) {
        throw new Error(
          'adm-zip package not installed. Run: pnpm add adm-zip -F @neko-agent/extension',
        );
      }

      const entries = new AdmZip(filePath)
        .getEntries()
        .filter((entry) => COMIC_IMAGE_PATTERN.test(entry.name))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

      const tmpDir = path.join(
        this.deps.tempDir(),
        `neko_cbz_${this.deps.now?.().getTime() ?? Date.now()}`,
      );
      await this.deps.makeDir(tmpDir, { recursive: true });

      const imagePaths: string[] = [];
      for (const entry of entries) {
        const imgPath = path.join(tmpDir, path.basename(entry.name));
        await this.deps.writeBinaryFile(imgPath, entry.getData());
        imagePaths.push(imgPath);
      }

      this.deps.logger?.info('Extracted CBZ archive', { pages: entries.length, tmpDir });
      return this.createComicContent('cbz', filePath, entries.length, tmpDir, imagePaths);
    } catch (error) {
      if (error instanceof Error && error.message.includes('adm-zip')) {
        throw error;
      }
      this.deps.logger?.error('Failed to read CBZ', { path: filePath, error });
      throw new Error(
        `Failed to read CBZ: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async readCbr(filePath: string): Promise<DocumentContent> {
    try {
      const unrar = await this.deps.loadModule<UnrarModule>('node-unrar-js');
      if (!unrar) {
        throw new Error(
          'node-unrar-js package not installed. Run: pnpm add node-unrar-js -F @neko-agent/extension',
        );
      }

      const extractor = unrar.createExtractorFromData({
        data: await this.deps.readBinaryFile(filePath),
      });
      const imageFiles = extractor
        .getFileList()
        .fileHeaders.filter((file) => COMIC_IMAGE_PATTERN.test(file.name))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

      const tmpDir = path.join(
        this.deps.tempDir(),
        `neko_cbr_${this.deps.now?.().getTime() ?? Date.now()}`,
      );
      await this.deps.makeDir(tmpDir, { recursive: true });

      const imagePaths: string[] = [];
      for (const file of extractor.extract().files) {
        if (COMIC_IMAGE_PATTERN.test(file.fileHeader.name)) {
          const imgPath = path.join(tmpDir, path.basename(file.fileHeader.name));
          await this.deps.writeBinaryFile(imgPath, file.extract[1]);
          imagePaths.push(imgPath);
        }
      }

      this.deps.logger?.info('Extracted CBR archive', { pages: imageFiles.length, tmpDir });
      return this.createComicContent('cbr', filePath, imageFiles.length, tmpDir, imagePaths);
    } catch (error) {
      if (error instanceof Error && error.message.includes('node-unrar-js')) {
        throw error;
      }
      this.deps.logger?.error('Failed to read CBR', { path: filePath, error });
      throw new Error(
        `Failed to read CBR: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async readUrl(url: string): Promise<DocumentContent> {
    try {
      const fetchModule = await this.deps.loadModule<FetchModule | FetchFn>('node-fetch');
      const cheerio = await this.deps.loadModule<CheerioModule>('cheerio');
      const fetch = typeof fetchModule === 'function' ? fetchModule : fetchModule?.default;

      if (!fetch || !cheerio) {
        throw new Error(
          'URL support requires node-fetch and cheerio. Run: pnpm add node-fetch cheerio -F @neko-agent/extension',
        );
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      $('script, style, nav, aside, footer, header, .ad, .advertisement').remove();

      const mainContent =
        $('article').text() || $('main').text() || $('.content').text() || $('body').text();

      return {
        text: mainContent.replace(/\s+/g, ' ').trim(),
        metadata: {
          url,
          title: $('title').text().trim(),
          fetchedAt: (this.deps.now?.() ?? new Date()).toISOString(),
        },
      };
    } catch (error) {
      this.deps.logger?.error('Failed to read URL', { url, error });
      throw new Error(
        `Failed to read URL: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async readExcel(filePath: string): Promise<DocumentContent> {
    try {
      const xlsx = await this.deps.loadModule<XlsxModule>('xlsx');
      if (!xlsx) {
        throw new Error('Excel support requires xlsx. Run: pnpm add xlsx -F @neko-agent/extension');
      }

      const workbook = xlsx.readFile(filePath);
      const sheets: string[] = [];
      const allData: unknown[][] = [];

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;

        const data = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
        allData.push(...data);
        sheets.push(`Sheet: ${sheetName}\n${data.map((row) => row.join('\t')).join('\n')}`);
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
      this.deps.logger?.error('Failed to read Excel', { path: filePath, error });
      throw new Error(
        `Failed to read Excel: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async readFinalDraft(filePath: string): Promise<DocumentContent> {
    try {
      const fastXmlParser = await this.deps.loadModule<FastXmlParserModule>('fast-xml-parser');
      const XMLParser = fastXmlParser?.XMLParser;
      if (!XMLParser) {
        throw new Error(
          'Final Draft support requires fast-xml-parser. Run: pnpm add fast-xml-parser -F @neko-agent/extension',
        );
      }

      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
      });
      const doc = parser.parse(await this.deps.readTextFile(filePath));
      const scenes = extractFDXScenes(doc);

      return {
        text: scenes.map((scene) => scene.text).join('\n\n'),
        pageCount: scenes.length,
        metadata: {
          format: 'fdx',
          sceneCount: scenes.length,
          title:
            readNestedValue(doc, ['FinalDraft', 'Content', 'TitlePage', 'Content']) ?? 'Untitled',
        },
      };
    } catch (error) {
      this.deps.logger?.error('Failed to read Final Draft', { path: filePath, error });
      throw new Error(
        `Failed to read Final Draft: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private createComicContent(
    format: 'cbz' | 'cbr',
    filePath: string,
    pageCount: number,
    tmpDir: string,
    imagePaths: string[],
  ): DocumentContent {
    return {
      text: `Comic archive with ${pageCount} pages`,
      pageCount,
      imagePaths,
      metadata: {
        format,
        fileName: path.basename(filePath),
        tmpDir,
      },
    };
  }
}

function extractFDXScenes(doc: unknown): Array<{ text: string }> {
  const scenes: Array<{ text: string }> = [];
  try {
    const content = readNestedValue(doc, ['FinalDraft', 'Content', 'Paragraph']);
    if (!Array.isArray(content)) return scenes;

    let currentScene = '';
    for (const para of content) {
      if (!isRecord(para)) continue;
      const type = typeof para['@_Type'] === 'string' ? para['@_Type'] : undefined;
      const rawText = para['Text'];
      const text = Array.isArray(rawText)
        ? rawText.join(' ')
        : typeof rawText === 'string'
          ? rawText
          : '';

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
  } catch {
    return [{ text: 'Failed to parse FDX content' }];
  }

  return scenes.length > 0 ? scenes : [{ text: 'Failed to parse FDX content' }];
}

function readNestedValue(value: unknown, pathSegments: string[]): unknown {
  let current = value;
  for (const segment of pathSegments) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function createDocumentReaderRuntime(deps: DocumentReaderRuntimeDeps): IDocumentReader {
  return new DocumentReaderRuntime(deps);
}
