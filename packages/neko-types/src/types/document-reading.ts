// =============================================================================
// Document Reading Contracts
// =============================================================================

export type DocumentFormat =
  | 'pdf'
  | 'epub'
  | 'cbz'
  | 'cbr'
  | 'docx'
  | 'doc'
  | 'pptx'
  | 'ppt'
  | 'text'
  | 'markdown'
  | 'fountain'
  | 'html'
  | 'json'
  | 'yaml'
  | 'xlsx'
  | 'xls'
  | 'fdx'
  | 'url'
  | 'unknown';

export interface DocumentFileIdentity {
  readonly fileId: string;
  readonly sizeBytes?: number;
  readonly mtimeMs?: number;
  readonly hash?: string;
}

export interface DocumentSourceRef {
  readonly filePath: string;
  readonly format: DocumentFormat;
  readonly fileId?: string;
  readonly identity?: DocumentFileIdentity;
  readonly uri?: string;
  readonly token?: string;
  readonly rangeUrl?: string;
  readonly entryBaseUrl?: string;
}

export interface DocumentRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DocumentPageLocator {
  readonly kind: 'page';
  readonly pageNumber: number;
  readonly pageIndex: number;
  readonly entryName?: string;
}

export interface DocumentChapterLocator {
  readonly kind: 'chapter';
  readonly chapterHref: string;
  readonly spineIndex?: number;
  readonly title?: string;
  readonly cfi?: string;
}

export interface DocumentSlideLocator {
  readonly kind: 'slide';
  readonly slideNumber: number;
  readonly slideIndex: number;
}

export interface DocumentTextRangeLocator {
  readonly kind: 'text-range';
  readonly startChar?: number;
  readonly endChar?: number;
  readonly startLine?: number;
  readonly endLine?: number;
  readonly paragraphIndex?: number;
  readonly heading?: string;
}

export interface DocumentRegionLocator {
  readonly kind: 'region';
  readonly pageNumber: number;
  readonly pageIndex?: number;
  readonly entryName?: string;
  readonly region: DocumentRegion;
}

export type DocumentLocator =
  | DocumentPageLocator
  | DocumentChapterLocator
  | DocumentSlideLocator
  | DocumentTextRangeLocator
  | DocumentRegionLocator;

export interface DocumentReadLimit {
  readonly maxChars?: number;
  readonly maxImages?: number;
}

export interface DocumentRange {
  readonly locator: DocumentLocator;
  readonly endLocator?: DocumentLocator;
  readonly limit?: DocumentReadLimit;
}

export type DocumentContentKind = 'text' | 'image' | 'mixed';

export interface DocumentExcerpt {
  readonly text?: string;
  readonly imageData?: string;
  readonly imagePaths?: readonly string[];
  readonly contentKind: DocumentContentKind;
  readonly truncated?: boolean;
}

export type DocumentManifestUnitKind =
  | 'page'
  | 'chapter'
  | 'entry'
  | 'slide'
  | 'section'
  | 'line'
  | 'text-range';

export interface DocumentManifestUnit {
  readonly kind: DocumentManifestUnitKind;
  readonly locator: DocumentLocator;
  readonly title?: string;
  readonly href?: string;
  readonly entryName?: string;
  readonly textPreview?: string;
  readonly charCount?: number;
}

export interface DocumentManifestCapabilities {
  readonly supportsManifest: boolean;
  readonly supportsRangeRead: boolean;
  readonly supportsCursorRead: boolean;
  readonly supportsPageRange?: boolean;
  readonly supportsChapterRange?: boolean;
  readonly supportsEntryRange?: boolean;
  readonly supportsSlideRange?: boolean;
  readonly supportsTextRange?: boolean;
  readonly supportsRegion?: boolean;
  readonly requiresFullExtraction?: boolean;
}

export interface DocumentManifest {
  readonly source: DocumentSourceRef;
  readonly format: DocumentFormat;
  readonly fileId?: string;
  readonly title?: string;
  readonly pageCount?: number;
  readonly chapterCount?: number;
  readonly slideCount?: number;
  readonly entryCount?: number;
  readonly lineCount?: number;
  readonly units: readonly DocumentManifestUnit[];
  readonly capabilities: DocumentManifestCapabilities;
  readonly metadata?: Record<string, unknown>;
}

export type DocumentBatchStrategy = 'manifest-order';

export interface DocumentBatchCursor {
  readonly source: DocumentSourceRef;
  readonly strategy: DocumentBatchStrategy;
  readonly next?: DocumentLocator;
  readonly batchIndex: number;
  readonly done: boolean;
  readonly fileId?: string;
  readonly maxChars?: number;
}

export interface DocumentReadResult {
  readonly source: DocumentSourceRef;
  readonly range?: DocumentRange;
  readonly locator?: DocumentLocator;
  readonly text?: string;
  readonly imagePaths?: readonly string[];
  readonly excerpt?: DocumentExcerpt;
  readonly manifest?: DocumentManifest;
  readonly cursor?: DocumentBatchCursor;
  readonly totalTextChars?: number;
  readonly returnedTextChars?: number;
  readonly truncated?: boolean;
  readonly pageCount?: number;
  readonly metadata?: Record<string, unknown>;
}

export interface DocumentContextData {
  readonly filePath?: string;
  readonly text?: string;
  readonly imageData?: string;
  readonly contentKind?: DocumentContentKind;
  readonly context?: {
    readonly page?: number;
    readonly chapter?: string;
    readonly region?: DocumentRegion;
  };
  readonly source?: DocumentSourceRef;
  readonly locator?: DocumentLocator;
  readonly range?: DocumentRange;
  readonly excerpt?: DocumentExcerpt;
}
