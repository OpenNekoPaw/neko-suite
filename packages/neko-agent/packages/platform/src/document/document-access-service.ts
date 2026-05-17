import * as path from 'node:path';
import type {
  DocumentBatchCursor,
  DocumentFormat,
  DocumentLocator,
  DocumentManifest,
  DocumentManifestCapabilities,
  DocumentManifestUnit,
  DocumentRange,
  DocumentReadResult,
  DocumentSourceRef,
} from '@neko/shared';
import {
  type DocumentContent,
  type DocumentReaderRuntimeDeps,
  type IDocumentReader,
  isDocumentUrl,
  stripHtmlToText,
} from './document-reader';

export const DEFAULT_DOCUMENT_BATCH_MAX_CHARS = 20000;

export type DocumentAccessErrorCode =
  | 'unsupported-format'
  | 'unsupported-locator'
  | 'invalid-range'
  | 'stale-cursor'
  | 'engine-access-unavailable';

export class DocumentAccessError extends Error {
  constructor(
    readonly code: DocumentAccessErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DocumentAccessError';
  }
}

export interface DocumentLowLevelAccess {
  identify?(filePath: string): Promise<{ fileId?: string; sizeBytes?: number; mtimeMs?: number }>;
  readRange?(filePath: string, start: number, end: number): Promise<Uint8Array>;
  readEntry?(filePath: string, entryPath: string): Promise<Uint8Array>;
}

export interface IDocumentAccessService {
  supports(filePath: string): boolean;
  readContent(filePath: string): Promise<DocumentContent>;
  getManifest(source: DocumentSourceRef | string): Promise<DocumentManifest>;
  createBatchCursor(
    source: DocumentSourceRef | string,
    options?: { maxChars?: number },
  ): Promise<DocumentBatchCursor>;
  readRange(source: DocumentSourceRef | string, range: DocumentRange): Promise<DocumentReadResult>;
  readNext(cursor: DocumentBatchCursor): Promise<DocumentReadResult>;
}

export interface DocumentAccessServiceDeps {
  readonly reader: IDocumentReader;
  readonly runtime: DocumentReaderRuntimeDeps;
  readonly lowLevelAccess?: DocumentLowLevelAccess;
}

interface EpubChapterInfo {
  readonly id: string;
  readonly title?: string;
}

interface EpubManifestData {
  readonly source: DocumentSourceRef;
  readonly metadata?: Record<string, unknown>;
  readonly chapters: readonly EpubChapterInfo[];
}

interface ParsedEpubData extends EpubManifestData {
  readonly epub: EpubLike;
}

interface PdfParserWithPartial {
  getText(params?: { partial?: number[] }): Promise<{ text?: string; total?: number }>;
  getInfo(): Promise<{ total?: number; info?: Record<string, unknown> }>;
  destroy(): Promise<void>;
}

interface PdfParserConstructorWithPartial {
  new (options: { data: Uint8Array }): PdfParserWithPartial;
}

interface ZipEntryLike {
  readonly name: string;
  getData(): Uint8Array;
}

interface AdmZipLike {
  getEntries(): ZipEntryLike[];
}

interface AdmZipConstructorLike {
  new (filePath: string): AdmZipLike;
}

interface EpubChapterLike {
  readonly id: string;
  readonly title?: string;
  readonly href?: string;
}

interface EpubLike {
  readonly flow: readonly EpubChapterLike[];
  readonly metadata: {
    readonly title?: string;
    readonly creator?: string;
    readonly publisher?: string;
    readonly language?: string;
  };
  on(event: 'end', handler: () => void): void;
  on(event: 'error', handler: (error: Error) => void): void;
  getChapter(id: string, callback: (error: Error | null, content: string) => void): void;
  parse(): void;
}

interface EpubConstructorLike {
  new (filePath: string): EpubLike;
}

const COMIC_IMAGE_PATTERN = /\.(jpg|jpeg|png|gif|webp|bmp)$/i;

export class DocumentAccessService implements IDocumentAccessService {
  constructor(private readonly deps: DocumentAccessServiceDeps) {}

  supports(filePath: string): boolean {
    return this.deps.reader.supports(filePath);
  }

  readContent(filePath: string): Promise<DocumentContent> {
    return this.deps.reader.read(filePath);
  }

  async getManifest(sourceInput: DocumentSourceRef | string): Promise<DocumentManifest> {
    const source = await this.resolveSource(sourceInput);
    const format = source.format;

    switch (format) {
      case 'pdf':
        return this.getPdfManifest(source);
      case 'epub':
        return this.getEpubManifest(source);
      case 'cbz':
        return this.getCbzManifest(source);
      case 'text':
      case 'markdown':
      case 'fountain':
      case 'json':
      case 'yaml':
      case 'html':
        return this.getTextManifest(source);
      case 'docx':
      case 'doc':
      case 'pptx':
      case 'ppt':
      case 'xlsx':
      case 'xls':
      case 'fdx':
      case 'url':
        return this.getContentBackedManifest(source);
      default:
        throw new DocumentAccessError(
          'unsupported-format',
          `Unsupported document format for manifest: ${format}`,
        );
    }
  }

  async createBatchCursor(
    sourceInput: DocumentSourceRef | string,
    options: { maxChars?: number } = {},
  ): Promise<DocumentBatchCursor> {
    const manifest = await this.getManifest(sourceInput);
    return createManifestBatchCursor(manifest, options);
  }

  async readRange(
    sourceInput: DocumentSourceRef | string,
    range: DocumentRange,
  ): Promise<DocumentReadResult> {
    const source = await this.resolveSource(sourceInput);

    switch (source.format) {
      case 'pdf':
        return this.readPdfRange(source, range);
      case 'epub':
        return this.readEpubRange(source, range);
      case 'cbz':
        return this.readCbzRange(source, range);
      case 'text':
      case 'markdown':
      case 'fountain':
      case 'json':
      case 'yaml':
      case 'html':
        return this.readTextRange(source, range);
      case 'docx':
      case 'doc':
      case 'pptx':
      case 'ppt':
      case 'xlsx':
      case 'xls':
      case 'fdx':
      case 'url':
        return this.readContentBackedRange(source, range);
      default:
        throw new DocumentAccessError(
          'unsupported-format',
          `Unsupported document format for range read: ${source.format}`,
        );
    }
  }

  async readNext(cursor: DocumentBatchCursor): Promise<DocumentReadResult> {
    const source = await this.resolveSource(cursor.source);
    if (cursor.fileId && source.fileId && cursor.fileId !== source.fileId) {
      throw new DocumentAccessError('stale-cursor', 'Document cursor identity is stale');
    }

    if (cursor.done || !cursor.next) {
      return {
        source,
        text: '',
        returnedTextChars: 0,
        truncated: false,
        cursor: { ...cursor, source, done: true },
      };
    }

    const result = await this.readRange(source, {
      locator: cursor.next,
      limit: { maxChars: cursor.maxChars ?? DEFAULT_DOCUMENT_BATCH_MAX_CHARS },
    });
    const manifest = result.manifest ?? (await this.getManifest(source));
    const currentIndex = findManifestUnitIndex(manifest.units, cursor.next);
    const nextUnit = currentIndex >= 0 ? manifest.units[currentIndex + 1] : undefined;

    return {
      ...result,
      manifest,
      cursor: {
        source,
        strategy: cursor.strategy,
        next: nextUnit?.locator,
        batchIndex: cursor.batchIndex + 1,
        done: !nextUnit,
        fileId: source.fileId,
        maxChars: cursor.maxChars,
      },
    };
  }

  private async resolveSource(input: DocumentSourceRef | string): Promise<DocumentSourceRef> {
    if (typeof input !== 'string') {
      return this.withIdentity({
        ...input,
        format: input.format ?? detectDocumentFormat(input.filePath),
      });
    }

    return this.withIdentity({
      filePath: input,
      format: detectDocumentFormat(input),
    });
  }

  private async withIdentity(source: DocumentSourceRef): Promise<DocumentSourceRef> {
    const identified = await this.deps.lowLevelAccess
      ?.identify?.(source.filePath)
      .catch(() => null);
    const identity = identified ?? source.identity;
    const fileId =
      identity?.fileId ??
      source.fileId ??
      (identity?.sizeBytes !== undefined || identity?.mtimeMs !== undefined
        ? `${source.filePath}:${identity.sizeBytes ?? 'unknown'}:${identity.mtimeMs ?? 'unknown'}`
        : source.filePath);

    return {
      ...source,
      fileId,
      ...(identity
        ? {
            identity: {
              fileId,
              sizeBytes: identity.sizeBytes,
              mtimeMs: identity.mtimeMs,
            },
          }
        : {}),
    };
  }

  private async getPdfManifest(source: DocumentSourceRef): Promise<DocumentManifest> {
    const pdfModule = await this.deps.runtime.loadModule<unknown>('pdf-parse');
    const PdfParser = resolvePdfParserConstructor(pdfModule);
    if (!PdfParser) {
      return this.getContentBackedManifest(source);
    }

    const parser = new PdfParser({ data: await this.deps.runtime.readBinaryFile(source.filePath) });
    try {
      const info = await parser.getInfo();
      const pageCount = info.total ?? 0;
      return {
        source,
        format: source.format,
        fileId: source.fileId,
        title: readStringMetadata(info.info, 'Title') ?? readStringMetadata(info.info, 'title'),
        pageCount,
        units: Array.from({ length: pageCount }, (_, index) => ({
          kind: 'page',
          locator: { kind: 'page', pageNumber: index + 1, pageIndex: index },
          title: `Page ${index + 1}`,
        })),
        capabilities: makeCapabilities({ page: pageCount > 0 }),
        metadata: info.info,
      };
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }

  private makeEpubManifest(data: EpubManifestData): DocumentManifest {
    return {
      source: data.source,
      format: 'epub',
      fileId: data.source.fileId,
      title: readStringMetadata(data.metadata, 'title'),
      chapterCount: data.chapters.length,
      units: data.chapters.map((chapter, index) => ({
        kind: 'chapter',
        locator: {
          kind: 'chapter',
          chapterHref: chapter.id,
          spineIndex: index,
          title: chapter.title,
        },
        href: chapter.id,
        title: chapter.title,
      })),
      capabilities: makeCapabilities({ chapter: true }),
      metadata: data.metadata,
    };
  }

  private async getEpubManifest(source: DocumentSourceRef): Promise<DocumentManifest> {
    const data = await this.readEpubManifestData(source);
    return this.makeEpubManifest(data);
  }

  private async getCbzManifest(source: DocumentSourceRef): Promise<DocumentManifest> {
    const entries = await this.readCbzEntries(source.filePath);
    return {
      source,
      format: 'cbz',
      fileId: source.fileId,
      pageCount: entries.length,
      entryCount: entries.length,
      units: entries.map((entry, index) => ({
        kind: 'entry',
        locator: {
          kind: 'page',
          pageNumber: index + 1,
          pageIndex: index,
          entryName: entry.name,
        },
        entryName: entry.name,
        title: path.basename(entry.name),
      })),
      capabilities: makeCapabilities({ entry: true, region: true }),
      metadata: { format: 'cbz', fileName: path.basename(source.filePath) },
    };
  }

  private async getTextManifest(source: DocumentSourceRef): Promise<DocumentManifest> {
    const text = await this.readTextLikeSource(source);
    const lines = text.split(/\r?\n/);
    return {
      source,
      format: source.format,
      fileId: source.fileId,
      lineCount: lines.length,
      units: [
        {
          kind: 'text-range',
          locator: { kind: 'text-range', startLine: 1, endLine: lines.length },
          title: 'Full text',
          charCount: text.length,
          textPreview: text.slice(0, 200),
        },
      ],
      capabilities: makeCapabilities({ text: true }),
      metadata: { lineCount: lines.length },
    };
  }

  private async getContentBackedManifest(source: DocumentSourceRef): Promise<DocumentManifest> {
    const content = await this.deps.reader.read(source.filePath);
    const count = content.pageCount ?? 1;
    const unitKind = source.format === 'pptx' || source.format === 'ppt' ? 'slide' : 'section';
    const units = Array.from({ length: Math.max(count, 1) }, (_, index): DocumentManifestUnit => {
      const locator: DocumentLocator =
        unitKind === 'slide'
          ? { kind: 'slide', slideNumber: index + 1, slideIndex: index }
          : { kind: 'text-range', startChar: 0, endChar: content.text.length };
      return {
        kind: unitKind,
        locator,
        title: unitKind === 'slide' ? `Slide ${index + 1}` : 'Full content',
        charCount: unitKind === 'section' ? content.text.length : undefined,
      };
    });

    return {
      source,
      format: source.format,
      fileId: source.fileId,
      pageCount: content.pageCount,
      slideCount: unitKind === 'slide' ? count : undefined,
      units,
      capabilities: makeCapabilities({
        slide: unitKind === 'slide',
        text: unitKind !== 'slide',
        requiresFullExtraction: true,
      }),
      metadata: content.metadata,
    };
  }

  private async readPdfRange(
    source: DocumentSourceRef,
    range: DocumentRange,
  ): Promise<DocumentReadResult> {
    if (range.locator.kind !== 'page') {
      throw unsupportedLocator(range.locator, 'PDF range reads require a page locator');
    }

    const pdfModule = await this.deps.runtime.loadModule<unknown>('pdf-parse');
    const PdfParser = resolvePdfParserConstructor(pdfModule);
    if (!PdfParser) {
      return this.readContentBackedRange(source, range);
    }

    const parser = new PdfParser({ data: await this.deps.runtime.readBinaryFile(source.filePath) });
    try {
      const textResult = await parser.getText({ partial: [range.locator.pageNumber] });
      const info = await parser.getInfo().catch(() => undefined);
      const text = typeof textResult.text === 'string' ? textResult.text : '';
      return this.makeTextResult(source, range, text, range.limit?.maxChars, {
        pageCount: info?.total ?? textResult.total,
        metadata: info?.info,
      });
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }

  private async readEpubRange(
    source: DocumentSourceRef,
    range: DocumentRange,
  ): Promise<DocumentReadResult> {
    if (range.locator.kind !== 'chapter') {
      throw unsupportedLocator(range.locator, 'EPUB range reads require a chapter locator');
    }

    const locator = range.locator;
    const data = await this.parseEpubData(source);
    const chapter = data.chapters.find((item, index) => {
      return (
        item.id === locator.chapterHref ||
        (locator.spineIndex !== undefined && index === locator.spineIndex)
      );
    });
    if (!chapter) {
      throw new DocumentAccessError(
        'invalid-range',
        `EPUB chapter not found: ${locator.chapterHref}`,
      );
    }

    const text = await readEpubChapterText(data.epub, chapter.id);
    return {
      ...this.makeTextResult(source, range, text, range.limit?.maxChars, {
        metadata: data.metadata,
      }),
      manifest: this.makeEpubManifest(data),
    };
  }

  private async readCbzRange(
    source: DocumentSourceRef,
    range: DocumentRange,
  ): Promise<DocumentReadResult> {
    if (range.locator.kind !== 'page' && range.locator.kind !== 'region') {
      throw unsupportedLocator(range.locator, 'CBZ range reads require a page or region locator');
    }

    const entries = await this.readCbzEntries(source.filePath);
    const pageIndex =
      range.locator.kind === 'page'
        ? range.locator.pageIndex
        : Math.max(0, range.locator.pageNumber - 1);
    const entryName = range.locator.entryName ?? entries[pageIndex]?.name;
    const entry = entries.find((item) => item.name === entryName) ?? entries[pageIndex];
    if (!entry) {
      throw new DocumentAccessError('invalid-range', `CBZ page not found: ${pageIndex + 1}`);
    }

    const text = `Comic page ${pageIndex + 1}: ${entry.name}`;
    return {
      source,
      range,
      locator: range.locator,
      text,
      imagePaths: [entry.name],
      excerpt: {
        contentKind: 'image',
        imagePaths: [entry.name],
        truncated: false,
      },
      returnedTextChars: text.length,
      totalTextChars: text.length,
      truncated: false,
      pageCount: entries.length,
      metadata: { format: 'cbz', entryName: entry.name },
      manifest: await this.getCbzManifest(source),
    };
  }

  private async readTextRange(
    source: DocumentSourceRef,
    range: DocumentRange,
  ): Promise<DocumentReadResult> {
    if (range.locator.kind !== 'text-range') {
      throw unsupportedLocator(range.locator, 'Text range reads require a text-range locator');
    }

    const text = await this.readTextLikeSource(source);
    const selected = sliceTextByLocator(text, range.locator);
    return this.makeTextResult(source, range, selected, range.limit?.maxChars, {
      metadata: { totalTextChars: text.length },
    });
  }

  private async readContentBackedRange(
    source: DocumentSourceRef,
    range: DocumentRange,
  ): Promise<DocumentReadResult> {
    const content = await this.deps.reader.read(source.filePath);
    if (range.locator.kind === 'text-range') {
      return this.makeTextResult(
        source,
        range,
        sliceTextByLocator(content.text, range.locator),
        range.limit?.maxChars,
        { pageCount: content.pageCount, metadata: content.metadata },
      );
    }

    if (range.locator.kind === 'slide') {
      const chunks = splitTextIntoSections(content.text);
      const text = chunks[range.locator.slideIndex] ?? chunks.join('\n\n');
      return this.makeTextResult(source, range, text, range.limit?.maxChars, {
        pageCount: content.pageCount,
        metadata: content.metadata,
      });
    }

    return this.makeTextResult(source, range, content.text, range.limit?.maxChars, {
      pageCount: content.pageCount,
      metadata: content.metadata,
    });
  }

  private async readTextLikeSource(source: DocumentSourceRef): Promise<string> {
    if (source.format === 'html') {
      return stripHtmlToText(await this.deps.runtime.readTextFile(source.filePath));
    }
    return this.deps.runtime.readTextFile(source.filePath);
  }

  private async readEpubManifestData(source: DocumentSourceRef): Promise<EpubManifestData> {
    const data = await this.parseEpubData(source);
    return {
      source: data.source,
      metadata: data.metadata,
      chapters: data.chapters,
    };
  }

  private async parseEpubData(source: DocumentSourceRef): Promise<ParsedEpubData> {
    const EPub = resolveEpubConstructor(await this.deps.runtime.loadModule<unknown>('epub2'));
    if (!EPub) {
      throw new DocumentAccessError('unsupported-format', 'epub2 package is not available');
    }

    const epub = await parseEpub(source.filePath, EPub);
    return {
      source,
      epub,
      metadata: {
        title: epub.metadata.title,
        author: epub.metadata.creator,
        publisher: epub.metadata.publisher,
        language: epub.metadata.language,
      },
      chapters: epub.flow.map((chapter) => ({
        id: chapter.id,
        title: chapter.title ?? chapter.href ?? chapter.id,
      })),
    };
  }

  private async readCbzEntries(filePath: string): Promise<readonly ZipEntryLike[]> {
    const AdmZip = await this.deps.runtime.loadModule<AdmZipConstructorLike>('adm-zip');
    if (!AdmZip) {
      throw new DocumentAccessError('unsupported-format', 'adm-zip package is not available');
    }
    return new AdmZip(filePath)
      .getEntries()
      .filter((entry) => COMIC_IMAGE_PATTERN.test(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }

  private makeTextResult(
    source: DocumentSourceRef,
    range: DocumentRange,
    text: string,
    maxChars: number | undefined,
    extra: { pageCount?: number; metadata?: Record<string, unknown> } = {},
  ): DocumentReadResult {
    const limit = maxChars ?? text.length;
    const truncated = text.length > limit;
    const returnedText = truncated ? text.slice(0, limit) : text;
    return {
      source,
      range,
      locator: range.locator,
      text: returnedText,
      excerpt: {
        contentKind: 'text',
        text: returnedText,
        truncated,
      },
      totalTextChars: text.length,
      returnedTextChars: returnedText.length,
      truncated,
      pageCount: extra.pageCount,
      metadata: extra.metadata,
    };
  }
}

export function createDocumentAccessService(
  deps: DocumentAccessServiceDeps,
): IDocumentAccessService {
  return new DocumentAccessService(deps);
}

export function createManifestBatchCursor(
  manifest: DocumentManifest,
  options: { maxChars?: number } = {},
): DocumentBatchCursor {
  const firstUnit = manifest.units[0];
  return {
    source: manifest.source,
    strategy: 'manifest-order',
    next: firstUnit?.locator,
    batchIndex: 0,
    done: firstUnit === undefined,
    fileId: manifest.source.fileId ?? manifest.fileId,
    maxChars: options.maxChars,
  };
}

export function detectDocumentFormat(filePath: string): DocumentFormat {
  if (isDocumentUrl(filePath)) {
    return 'url';
  }

  switch (path.extname(filePath).toLowerCase()) {
    case '.pdf':
      return 'pdf';
    case '.epub':
      return 'epub';
    case '.cbz':
      return 'cbz';
    case '.cbr':
      return 'cbr';
    case '.docx':
      return 'docx';
    case '.doc':
      return 'doc';
    case '.pptx':
      return 'pptx';
    case '.ppt':
      return 'ppt';
    case '.md':
      return 'markdown';
    case '.txt':
      return 'text';
    case '.fountain':
      return 'fountain';
    case '.html':
    case '.htm':
      return 'html';
    case '.json':
      return 'json';
    case '.yaml':
    case '.yml':
      return 'yaml';
    case '.xlsx':
      return 'xlsx';
    case '.xls':
      return 'xls';
    case '.fdx':
      return 'fdx';
    default:
      return 'unknown';
  }
}

function makeCapabilities(input: {
  readonly page?: boolean;
  readonly chapter?: boolean;
  readonly entry?: boolean;
  readonly slide?: boolean;
  readonly text?: boolean;
  readonly region?: boolean;
  readonly requiresFullExtraction?: boolean;
}): DocumentManifestCapabilities {
  return {
    supportsManifest: true,
    supportsRangeRead: true,
    supportsCursorRead: true,
    supportsPageRange: input.page,
    supportsChapterRange: input.chapter,
    supportsEntryRange: input.entry,
    supportsSlideRange: input.slide,
    supportsTextRange: input.text,
    supportsRegion: input.region,
    requiresFullExtraction: input.requiresFullExtraction,
  };
}

function resolvePdfParserConstructor(moduleValue: unknown): PdfParserConstructorWithPartial | null {
  if (!hasPropertyBag(moduleValue)) {
    return null;
  }
  const constructorValue = moduleValue['PDFParse'];
  return typeof constructorValue === 'function'
    ? (constructorValue as unknown as PdfParserConstructorWithPartial)
    : null;
}

function resolveEpubConstructor(moduleValue: unknown): EpubConstructorLike | null {
  const constructorValue =
    typeof moduleValue === 'function'
      ? moduleValue
      : hasPropertyBag(moduleValue) &&
          (typeof moduleValue['EPub'] === 'function' ||
            typeof moduleValue['default'] === 'function')
        ? (moduleValue['EPub'] ?? moduleValue['default'])
        : null;

  return constructorValue ? (constructorValue as EpubConstructorLike) : null;
}

function parseEpub(filePath: string, EPub: EpubConstructorLike): Promise<EpubLike> {
  return new Promise((resolve, reject) => {
    const epub = new EPub(filePath);
    epub.on('end', () => resolve(epub));
    epub.on('error', reject);
    epub.parse();
  });
}

function readEpubChapterText(epub: EpubLike, chapterId: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    epub.getChapter(chapterId, (error, content) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stripHtmlToText(content));
    });
  });
}

function sliceTextByLocator(
  text: string,
  locator: Extract<DocumentLocator, { kind: 'text-range' }>,
): string {
  if (locator.startLine !== undefined || locator.endLine !== undefined) {
    const lines = text.split(/\r?\n/);
    const start = Math.max(0, (locator.startLine ?? 1) - 1);
    const end = Math.min(lines.length, locator.endLine ?? lines.length);
    return lines.slice(start, end).join('\n');
  }

  const start = Math.max(0, locator.startChar ?? 0);
  const end = Math.min(text.length, locator.endChar ?? text.length);
  if (end < start) {
    throw new DocumentAccessError('invalid-range', `Invalid text character range: ${start}-${end}`);
  }
  return text.slice(start, end);
}

function splitTextIntoSections(text: string): readonly string[] {
  return text
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .filter((section) => section.length > 0);
}

function findManifestUnitIndex(
  units: readonly DocumentManifestUnit[],
  locator: DocumentLocator,
): number {
  return units.findIndex((unit) => sameLocator(unit.locator, locator));
}

function sameLocator(left: DocumentLocator, right: DocumentLocator): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case 'page':
      return right.kind === 'page' && left.pageIndex === right.pageIndex;
    case 'chapter':
      return right.kind === 'chapter' && left.chapterHref === right.chapterHref;
    case 'slide':
      return right.kind === 'slide' && left.slideIndex === right.slideIndex;
    case 'text-range':
      return (
        right.kind === 'text-range' &&
        left.startChar === right.startChar &&
        left.endChar === right.endChar &&
        left.startLine === right.startLine &&
        left.endLine === right.endLine
      );
    case 'region':
      return right.kind === 'region' && left.pageNumber === right.pageNumber;
  }
}

function unsupportedLocator(locator: DocumentLocator, message: string): DocumentAccessError {
  return new DocumentAccessError('unsupported-locator', `${message}; received ${locator.kind}`);
}

function readStringMetadata(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function hasPropertyBag(value: unknown): value is Record<string, unknown> {
  return (typeof value === 'object' || typeof value === 'function') && value !== null;
}
