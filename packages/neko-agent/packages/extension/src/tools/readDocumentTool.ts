import {
  TOOL_NAMES_SYSTEM,
  createTool,
  isDocumentFormat,
  type Tool,
  type ToolResult,
} from '@neko/shared';
import { isDocumentUrl } from '@neko/platform/document';
import { createDocumentResourceRefFromArchiveRef } from '../services/documentResourceCacheProvider';
import type {
  DocumentBatchCursor,
  DocumentArchiveResourceRef,
  DocumentImageInfo,
  DocumentLocator,
  DocumentManifest,
  DocumentRange,
  DocumentReadResult,
  DocumentRegion,
  DocumentSourceRef,
  ResourceRef,
} from '@neko/shared';
import type { ResourceCacheService } from '@neko/shared/vscode/extension';
import type { DocumentContent, IDocumentReaderService } from '../services/DocumentReaderService';

export const DEFAULT_READ_DOCUMENT_MAX_CHARS = 20000;
export const MAX_READ_DOCUMENT_CHARS = 100000;
export const DEFAULT_READ_DOCUMENT_IMAGE_PATH_LIMIT = 50;
export const MAX_READ_DOCUMENT_IMAGE_PATH_LIMIT = 500;

export interface ReadDocumentToolDeps {
  readonly reader: IDocumentReaderService;
  readonly resourceCache?: ResourceCacheService;
  readonly resolveResourceScope?: () => ResourceRef['scope'];
}

interface ReadDocumentToolData {
  readonly filePath: string;
  readonly text: string;
  readonly totalTextChars: number;
  readonly returnedTextChars: number;
  readonly truncated: boolean;
  readonly pageCount?: number;
  readonly metadata?: Record<string, unknown>;
  readonly imagePaths?: readonly string[];
  readonly runtimeImagePaths?: readonly string[];
  readonly imageInfo?: readonly DocumentImageInfo[];
  readonly imagePathCount?: number;
  readonly imagePathsTruncated?: boolean;
}

type DocumentImageInfoWithCacheResourceRef = DocumentImageInfo & {
  readonly cacheResourceRef?: import('@neko/shared').ResourceRef;
};

interface ProjectedDocumentImages {
  readonly imagePaths: readonly string[];
  readonly runtimeImagePaths: readonly string[];
  readonly imageInfo: readonly DocumentImageInfoWithCacheResourceRef[];
}

type ReadDocumentMode = 'content' | 'manifest' | 'range' | 'next';

export function createReadDocumentTool(deps: ReadDocumentToolDeps): Tool {
  return createTool({
    name: TOOL_NAMES_SYSTEM.READ_DOCUMENT,
    description:
      'Read structured document content from a local file or URL. Supports EPUB, PDF, DOC/DOCX, PPT/PPTX, ' +
      'TXT/Markdown/Fountain, HTML, JSON/YAML, Excel, Final Draft, and comic archives. Use this instead of Read ' +
      'for EPUB/PDF/DOCX/PPTX/XLSX/CBZ/CBR files. Use mode="manifest" to inspect structure, mode="range" ' +
      'to read a page/chapter/entry/text range, and mode="next" to continue a cursor batch.',
    category: 'document',
    isReadOnly: true,
    isConcurrencySafe: true,
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Absolute path to the document file, or an HTTP/HTTPS URL to read.',
        },
        mode: {
          type: 'string',
          enum: ['content', 'manifest', 'range', 'next'],
          description:
            'Read mode. content returns full document text; manifest returns structure; range reads a semantic locator; next continues a batch cursor.',
        },
        source: {
          type: 'object',
          description:
            'Optional structured document source. If omitted, file_path is used to build one.',
        },
        range: {
          type: 'object',
          description:
            'Semantic document range for mode="range", e.g. { locator: { kind: "page", pageNumber: 1, pageIndex: 0 } } or chapter/text-range locators.',
        },
        cursor: {
          type: 'object',
          description: 'Document batch cursor returned by a prior manifest/range/next call.',
        },
        start_batch: {
          type: 'boolean',
          description:
            'When true with mode="manifest", also return the first manifest-order cursor for whole-document batch processing.',
        },
        max_chars: {
          type: 'integer',
          description: `Maximum number of text characters to return. Default ${DEFAULT_READ_DOCUMENT_MAX_CHARS}; max ${MAX_READ_DOCUMENT_CHARS}.`,
          minimum: 1000,
          maximum: MAX_READ_DOCUMENT_CHARS,
        },
        include_metadata: {
          type: 'boolean',
          description:
            'Whether to include extracted document metadata in content/range/next results. Default true.',
        },
        include_manifest: {
          type: 'boolean',
          description:
            'Whether range/next results should include the full document manifest. Default false; use mode="manifest" when structure is needed.',
        },
        include_image_paths: {
          type: 'boolean',
          description:
            'Whether to include extracted image page paths and matching image metadata when the reader produces them. Default true.',
        },
        image_path_limit: {
          type: 'integer',
          description: `Maximum image paths to return. Default ${DEFAULT_READ_DOCUMENT_IMAGE_PATH_LIMIT}; max ${MAX_READ_DOCUMENT_IMAGE_PATH_LIMIT}.`,
          minimum: 1,
          maximum: MAX_READ_DOCUMENT_IMAGE_PATH_LIMIT,
        },
      },
      required: ['file_path'],
    },
    execute: async (args) => executeReadDocument(deps, args),
  });
}

async function executeReadDocument(
  deps: ReadDocumentToolDeps,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const { reader, resolveResourceScope } = deps;
  const filePath = readNonEmptyString(args['file_path']);
  if (!filePath) {
    return { success: false, error: 'Missing required field: file_path' };
  }

  if (!isDocumentUrl(filePath) && !reader.supports(filePath)) {
    return { success: false, error: `Unsupported document format: ${filePath}` };
  }

  const maxChars = readBoundedInteger(
    args['max_chars'],
    DEFAULT_READ_DOCUMENT_MAX_CHARS,
    1000,
    MAX_READ_DOCUMENT_CHARS,
  );
  const includeMetadata = readBoolean(args['include_metadata'], true);
  const includeManifest = readBoolean(args['include_manifest'], false);
  const includeImagePaths = readBoolean(args['include_image_paths'], true);
  const imagePathLimit = readBoundedInteger(
    args['image_path_limit'],
    DEFAULT_READ_DOCUMENT_IMAGE_PATH_LIMIT,
    1,
    MAX_READ_DOCUMENT_IMAGE_PATH_LIMIT,
  );
  const mode = readMode(args['mode']);
  const source = readDocumentSource(args['source']) ?? filePath;

  try {
    if (mode === 'manifest') {
      const manifest = await reader.getManifest(source);
      if (!readBoolean(args['start_batch'], false)) {
        return { success: true, data: manifest };
      }
      return {
        success: true,
        data: {
          manifest,
          cursor: await reader.createBatchCursor(manifest.source, { maxChars }),
        },
      };
    }

    if (mode === 'range') {
      const range =
        args['range'] === undefined
          ? createDefaultRangeFromManifest(await reader.getManifest(source), imagePathLimit)
          : readDocumentRange(args['range']);
      if (!range) {
        return { success: false, error: 'Missing or invalid required field for range mode: range' };
      }
      return {
        success: true,
        data: await formatDocumentReadResult(
          await reader.readRange(source, {
            ...range,
            limit: {
              ...range.limit,
              maxChars,
              maxImages: imagePathLimit,
            },
          }),
          {
            includeMetadata,
            includeManifest,
            includeImagePaths,
            imagePathLimit,
            resourceCache: deps.resourceCache,
            resolveResourceScope,
          },
        ),
      };
    }

    if (mode === 'next') {
      const cursor = readDocumentCursor(args['cursor']);
      if (!cursor) {
        return { success: false, error: 'Missing or invalid required field for next mode: cursor' };
      }
      return {
        success: true,
        data: await formatDocumentReadResult(await reader.readNext(cursor), {
          includeMetadata,
          includeManifest,
          includeImagePaths,
          imagePathLimit,
          resourceCache: deps.resourceCache,
          resolveResourceScope,
        }),
      };
    }

    const content = await reader.read(filePath);
    return {
      success: true,
      data: await formatReadDocumentData({
        content,
        filePath,
        maxChars,
        includeMetadata,
        includeImagePaths,
        imagePathLimit,
        resourceCache: deps.resourceCache,
        resolveResourceScope,
      }),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function formatDocumentReadResult(
  result: DocumentReadResult,
  options: {
    readonly includeMetadata: boolean;
    readonly includeManifest: boolean;
    readonly includeImagePaths: boolean;
    readonly imagePathLimit: number;
    readonly resourceCache?: ResourceCacheService;
    readonly resolveResourceScope?: () => ResourceRef['scope'];
  },
): Promise<DocumentReadResult> {
  const imagePaths = result.imagePaths ?? [];
  const visibleImagePaths = options.includeImagePaths
    ? imagePaths.slice(0, options.imagePathLimit)
    : [];
  const visibleImages = await projectVisibleDocumentImages(
    result.imageInfo,
    visibleImagePaths,
    options.imagePathLimit,
    options.resourceCache,
    options.resolveResourceScope,
  );

  const metadata =
    options.includeMetadata && (result.metadata || imagePaths.length > 0)
      ? {
          ...result.metadata,
          ...(imagePaths.length > 0
            ? {
                imagePathCount: imagePaths.length,
                imagePathsTruncated: visibleImagePaths.length < imagePaths.length,
              }
            : {}),
        }
      : undefined;

  const excerpt = result.excerpt
    ? stripUndefinedProperties({
        ...result.excerpt,
        ...(Object.prototype.hasOwnProperty.call(result.excerpt, 'imagePaths')
          ? { imagePaths: visibleImagePaths }
          : {}),
        imageInfo: undefined,
      })
    : result.excerpt;

  return stripUndefinedProperties({
    ...result,
    imagePaths: imagePaths.length > 0 ? visibleImages.imagePaths : undefined,
    runtimeImagePaths: imagePaths.length > 0 ? visibleImages.runtimeImagePaths : undefined,
    imageInfo: imagePaths.length > 0 ? visibleImages.imageInfo : undefined,
    excerpt,
    metadata,
    manifest: options.includeManifest ? result.manifest : undefined,
  });
}

async function projectVisibleDocumentImages(
  imageInfo: readonly DocumentImageInfo[] | undefined,
  visibleImagePaths: readonly string[],
  imagePathLimit: number,
  resourceCache: ResourceCacheService | undefined,
  resolveResourceScope: (() => ResourceRef['scope']) | undefined,
): Promise<ProjectedDocumentImages> {
  if (!imageInfo || imageInfo.length === 0 || visibleImagePaths.length === 0) {
    return { imagePaths: visibleImagePaths, runtimeImagePaths: visibleImagePaths, imageInfo: [] };
  }
  const visiblePathSet = new Set(visibleImagePaths);
  const byPath = imageInfo.filter((image) => visiblePathSet.has(image.path));
  const visible =
    byPath.length > 0
      ? byPath.slice(0, visibleImagePaths.length)
      : imageInfo.slice(0, Math.min(imagePathLimit, visibleImagePaths.length));
  const projectedInfo = await Promise.all(
    visible.map(async (image, index) =>
      enrichRuntimeDocumentImageInfo(
        await withCacheResourceRef(image, resourceCache, resolveResourceScope),
        index,
      ),
    ),
  );
  return {
    imagePaths: mergeProjectedImagePaths(visibleImagePaths, visible, projectedInfo),
    runtimeImagePaths: visibleImagePaths,
    imageInfo: projectedInfo,
  };
}

async function withCacheResourceRef(
  image: DocumentImageInfo,
  resourceCache: ResourceCacheService | undefined,
  resolveResourceScope: (() => ResourceRef['scope']) | undefined,
): Promise<DocumentImageInfoWithCacheResourceRef> {
  const archiveRef = normalizeDocumentArchiveResourceRef(image);
  if (!archiveRef) return image;
  const cacheResourceRef = createDocumentResourceRefFromArchiveRef(
    archiveRef,
    resolveResourceScope?.() ?? 'project',
  );
  const materializedPath = await materializeDocumentResource(
    resourceCache,
    cacheResourceRef,
    image,
  );
  const nextPath = materializedPath ?? image.path;
  const resourceRef = {
    ...archiveRef,
    ...(nextPath ? { cachePath: nextPath } : {}),
  };
  const nextCacheResourceRef =
    nextPath === image.path
      ? cacheResourceRef
      : createDocumentResourceRefFromArchiveRef(resourceRef, cacheResourceRef.scope);
  return {
    ...image,
    path: nextPath,
    runtimePath: image.runtimePath ?? image.path,
    runtimeKind: nextPath === image.path ? 'scratch-cache' : 'managed-cache',
    alias: image.alias ?? formatDocumentImageAlias(image.locator),
    aliasScope: image.aliasScope ?? formatDocumentAliasScope(archiveRef),
    sourceDocumentId: image.sourceDocumentId ?? formatDocumentSourceId(archiveRef.source),
    entryPath: image.entryPath ?? archiveRef.entryPath,
    portableForTransfer: nextCacheResourceRef.scope === 'project',
    ...(nextCacheResourceRef.scope === 'project'
      ? {}
      : { nonPortableReason: 'no-workspace-or-extension-private-scratch' }),
    resourceRef,
    cacheResourceRef: nextCacheResourceRef,
  };
}

async function materializeDocumentResource(
  resourceCache: ResourceCacheService | undefined,
  resourceRef: ResourceRef,
  image: DocumentImageInfo,
): Promise<string | undefined> {
  if (!resourceCache || resourceRef.scope !== 'project') {
    return undefined;
  }
  try {
    const result = await resourceCache.resolve(
      resourceRef,
      {
        role: 'document-entry',
        ...(image.mimeType ? { mimeType: image.mimeType } : {}),
        ...(image.width !== undefined ? { width: image.width } : {}),
        ...(image.height !== undefined ? { height: image.height } : {}),
      },
      { materializeIfMissing: true },
    );
    return result.status === 'ready' ? result.absolutePath : undefined;
  } catch {
    // The document result still carries the stable ref; Canvas can materialize it later.
    return undefined;
  }
}

function enrichRuntimeDocumentImageInfo(
  image: DocumentImageInfoWithCacheResourceRef,
  index: number,
): DocumentImageInfoWithCacheResourceRef {
  return stripUndefinedProperties({
    ...image,
    runtimePath: image.runtimePath ?? image.path,
    runtimeKind: image.runtimeKind ?? inferDocumentImageRuntimeKind(image),
    alias: image.alias ?? formatDocumentImageAlias(image.locator, index),
    aliasScope:
      image.aliasScope ??
      (image.resourceRef ? formatDocumentAliasScope(image.resourceRef) : undefined),
    sourceDocumentId:
      image.sourceDocumentId ??
      (image.resourceRef ? formatDocumentSourceId(image.resourceRef.source) : undefined),
    entryPath: image.entryPath ?? image.resourceRef?.entryPath,
    portableForTransfer: image.portableForTransfer ?? image.cacheResourceRef?.scope === 'project',
    ...(image.nonPortableReason
      ? { nonPortableReason: image.nonPortableReason }
      : image.cacheResourceRef && image.cacheResourceRef.scope !== 'project'
        ? { nonPortableReason: 'no-workspace-or-extension-private-scratch' }
        : {}),
  });
}

function normalizeDocumentArchiveResourceRef(
  image: DocumentImageInfo,
): DocumentArchiveResourceRef | undefined {
  if (!image.resourceRef) return undefined;
  return {
    ...image.resourceRef,
    ...(image.path ? { cachePath: image.resourceRef.cachePath ?? image.path } : {}),
    ...(image.locator && !image.resourceRef.locator ? { locator: image.locator } : {}),
  };
}

function inferDocumentImageRuntimeKind(
  image: DocumentImageInfoWithCacheResourceRef,
): NonNullable<DocumentImageInfo['runtimeKind']> {
  if (image.cacheResourceRef?.scope === 'project') return 'managed-cache';
  return 'scratch-cache';
}

function formatDocumentImageAlias(locator: DocumentLocator | undefined, defaultIndex = 0): string {
  if (!locator) return `image_${defaultIndex + 1}`;
  switch (locator.kind) {
    case 'page':
      return `page_${locator.pageNumber}`;
    case 'slide':
      return `slide_${locator.slideNumber}`;
    case 'chapter':
      return locator.spineIndex === undefined ? 'image_1' : `page_${locator.spineIndex + 1}`;
    case 'region':
      return `page_${locator.pageNumber}_region`;
    case 'text-range':
      return `image_${defaultIndex + 1}`;
  }
}

function formatDocumentAliasScope(resourceRef: DocumentArchiveResourceRef): string {
  return `document:${formatDocumentSourceId(resourceRef.source)}`;
}

function formatDocumentSourceId(source: DocumentSourceRef): string {
  return source.identity?.hash ?? source.identity?.fileId ?? source.fileId ?? source.filePath;
}

function createDefaultRangeFromManifest(
  manifest: DocumentManifest,
  imagePathLimit: number,
): DocumentRange | null {
  const firstUnit = manifest.units[0];
  if (!firstUnit) {
    return null;
  }

  const boundedUnitCount = Math.max(1, Math.min(imagePathLimit, manifest.units.length));
  const endUnit = manifest.units[boundedUnitCount - 1];
  const endLocator =
    endUnit && sameDocumentLocatorKind(firstUnit.locator, endUnit.locator)
      ? endUnit.locator
      : undefined;

  return {
    locator: firstUnit.locator,
    ...(endLocator && !sameDocumentLocator(firstUnit.locator, endLocator) ? { endLocator } : {}),
  };
}

function sameDocumentLocatorKind(left: DocumentLocator, right: DocumentLocator): boolean {
  return left.kind === right.kind;
}

function sameDocumentLocator(left: DocumentLocator, right: DocumentLocator): boolean {
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
  return false;
}

async function formatReadDocumentData(input: {
  readonly content: DocumentContent;
  readonly filePath: string;
  readonly maxChars: number;
  readonly includeMetadata: boolean;
  readonly includeImagePaths: boolean;
  readonly imagePathLimit: number;
  readonly resourceCache?: ResourceCacheService;
  readonly resolveResourceScope?: () => ResourceRef['scope'];
}): Promise<ReadDocumentToolData> {
  const text = input.content.text ?? '';
  const truncatedText = truncateText(text, input.maxChars);
  const imagePaths = input.content.imagePaths ?? [];
  const visibleImagePaths =
    input.includeImagePaths && imagePaths.length > 0
      ? imagePaths.slice(0, input.imagePathLimit)
      : [];
  const visibleImages = await projectVisibleDocumentImages(
    input.content.imageInfo,
    visibleImagePaths,
    input.imagePathLimit,
    input.resourceCache,
    input.resolveResourceScope,
  );

  return {
    filePath: input.filePath,
    text: truncatedText.text,
    totalTextChars: text.length,
    returnedTextChars: truncatedText.text.length,
    truncated: truncatedText.truncated,
    ...(input.content.pageCount !== undefined ? { pageCount: input.content.pageCount } : {}),
    ...(input.includeMetadata && input.content.metadata
      ? { metadata: input.content.metadata }
      : {}),
    ...(imagePaths.length > 0
      ? {
          imagePaths: visibleImages.imagePaths,
          runtimeImagePaths: visibleImages.runtimeImagePaths,
          ...(visibleImages.imageInfo.length > 0 ? { imageInfo: visibleImages.imageInfo } : {}),
          imagePathCount: imagePaths.length,
          imagePathsTruncated: visibleImagePaths.length < imagePaths.length,
        }
      : {}),
  };
}

function mergeProjectedImagePaths(
  visibleImagePaths: readonly string[],
  originalInfo: readonly DocumentImageInfo[],
  projectedInfo: readonly DocumentImageInfo[],
): readonly string[] {
  if (projectedInfo.length === 0) {
    return visibleImagePaths;
  }
  const byOriginalPath = new Map<string, string>();
  for (let index = 0; index < originalInfo.length; index += 1) {
    const originalPath = originalInfo[index]?.path;
    const projectedPath = projectedInfo[index]?.path;
    if (originalPath && projectedPath) {
      byOriginalPath.set(originalPath, projectedPath);
    }
  }
  return visibleImagePaths.map((imagePath, index) => {
    return byOriginalPath.get(imagePath) ?? projectedInfo[index]?.path ?? imagePath;
  });
}

function truncateText(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }

  return {
    text: `${text.slice(0, maxChars)}\n\n[ReadDocument truncated ${text.length - maxChars} characters]`,
    truncated: true,
  };
}

function stripUndefinedProperties<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readBoolean(value: unknown, defaultValue: boolean): boolean {
  return typeof value === 'boolean' ? value : defaultValue;
}

function readBoundedInteger(
  value: unknown,
  defaultValue: number,
  min: number,
  max: number,
): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return defaultValue;
  }
  return Math.max(min, Math.min(max, value));
}

function readMode(value: unknown): ReadDocumentMode {
  return value === 'manifest' || value === 'range' || value === 'next' || value === 'content'
    ? value
    : 'content';
}

function readDocumentSource(value: unknown): DocumentSourceRef | null {
  if (!isRecord(value)) {
    return null;
  }
  const filePath = readNonEmptyString(value['filePath']) ?? readNonEmptyString(value['file_path']);
  const format = readNonEmptyString(value['format']);
  if (!filePath || !format || !isDocumentFormat(format)) {
    return null;
  }
  return {
    filePath,
    format,
    fileId: readNonEmptyString(value['fileId']) ?? undefined,
    uri: readNonEmptyString(value['uri']) ?? undefined,
    token: readNonEmptyString(value['token']) ?? undefined,
    rangeUrl: readNonEmptyString(value['rangeUrl']) ?? undefined,
    entryBaseUrl: readNonEmptyString(value['entryBaseUrl']) ?? undefined,
  };
}

function readDocumentRange(value: unknown): DocumentRange | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value['kind'] === 'chapterRange') {
    const start = readDocumentLocator(value['start']);
    const end = readDocumentLocator(value['end']);
    if (!start || start.kind !== 'chapter' || !end || end.kind !== 'chapter') {
      return null;
    }

    const limit = readDocumentLimit(value['limit']);
    if (limit === null) {
      return null;
    }

    return {
      locator: start,
      endLocator: end,
      ...(limit ? { limit } : {}),
    };
  }

  const locator = readDocumentLocator(value['locator']);
  if (!locator) {
    return null;
  }

  const endLocator =
    value['endLocator'] === undefined ? undefined : readDocumentLocator(value['endLocator']);
  if (value['endLocator'] !== undefined && !endLocator) {
    return null;
  }

  const limit = readDocumentLimit(value['limit']);
  if (limit === null) {
    return null;
  }

  return {
    locator,
    ...(endLocator ? { endLocator } : {}),
    ...(limit ? { limit } : {}),
  };
}

function readDocumentCursor(value: unknown): DocumentBatchCursor | null {
  if (!isRecord(value)) {
    return null;
  }

  const source = readDocumentSource(value['source']);
  const batchIndex = readNonNegativeInteger(value['batchIndex']);
  const done = value['done'];
  const next = value['next'] === undefined ? undefined : readDocumentLocator(value['next']);
  const maxChars = readOptionalPositiveInteger(value['maxChars']);

  if (
    !source ||
    value['strategy'] !== 'manifest-order' ||
    batchIndex === null ||
    typeof done !== 'boolean' ||
    (value['next'] !== undefined && !next) ||
    (!done && !next) ||
    maxChars === null
  ) {
    return null;
  }

  return {
    source,
    strategy: 'manifest-order',
    batchIndex,
    done,
    ...(next ? { next } : {}),
    fileId: readNonEmptyString(value['fileId']) ?? undefined,
    maxChars,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readDocumentLocator(value: unknown): DocumentLocator | null {
  if (!isRecord(value)) {
    return null;
  }

  switch (value['kind']) {
    case 'page': {
      const pageNumber = readPositiveInteger(value['pageNumber']);
      const pageIndex = readNonNegativeInteger(value['pageIndex']);
      if (pageNumber === null || pageIndex === null) {
        return null;
      }
      return {
        kind: 'page',
        pageNumber,
        pageIndex,
        entryName: readNonEmptyString(value['entryName']) ?? undefined,
      };
    }
    case 'chapter': {
      const chapterHref =
        readNonEmptyString(value['chapterHref']) ?? readNonEmptyString(value['href']);
      const spineIndex = readOptionalNonNegativeInteger(value['spineIndex']);
      if (!chapterHref || spineIndex === null) {
        return null;
      }
      return {
        kind: 'chapter',
        chapterHref,
        spineIndex,
        title: readNonEmptyString(value['title']) ?? undefined,
        cfi: readNonEmptyString(value['cfi']) ?? undefined,
      };
    }
    case 'slide': {
      const slideNumber = readPositiveInteger(value['slideNumber']);
      const slideIndex = readNonNegativeInteger(value['slideIndex']);
      if (slideNumber === null || slideIndex === null) {
        return null;
      }
      return { kind: 'slide', slideNumber, slideIndex };
    }
    case 'text-range': {
      const startChar = readOptionalNonNegativeInteger(value['startChar']);
      const endChar = readOptionalNonNegativeInteger(value['endChar']);
      const startLine = readOptionalPositiveInteger(value['startLine']);
      const endLine = readOptionalPositiveInteger(value['endLine']);
      const paragraphIndex = readOptionalNonNegativeInteger(value['paragraphIndex']);
      if (
        startChar === null ||
        endChar === null ||
        startLine === null ||
        endLine === null ||
        paragraphIndex === null ||
        (startChar !== undefined && endChar !== undefined && endChar < startChar) ||
        (startLine !== undefined && endLine !== undefined && endLine < startLine)
      ) {
        return null;
      }
      return {
        kind: 'text-range',
        startChar,
        endChar,
        startLine,
        endLine,
        paragraphIndex,
        heading: readNonEmptyString(value['heading']) ?? undefined,
      };
    }
    case 'region': {
      const pageNumber = readPositiveInteger(value['pageNumber']);
      const pageIndex = readOptionalNonNegativeInteger(value['pageIndex']);
      const region = readDocumentRegion(value['region']);
      if (pageNumber === null || pageIndex === null || !region) {
        return null;
      }
      return {
        kind: 'region',
        pageNumber,
        pageIndex,
        entryName: readNonEmptyString(value['entryName']) ?? undefined,
        region,
      };
    }
    default:
      return null;
  }
}

function readDocumentRegion(value: unknown): DocumentRegion | null {
  if (!isRecord(value)) {
    return null;
  }
  const x = readFiniteNumber(value['x']);
  const y = readFiniteNumber(value['y']);
  const width = readPositiveNumber(value['width']);
  const height = readPositiveNumber(value['height']);
  if (x === null || y === null || width === null || height === null) {
    return null;
  }
  return { x, y, width, height };
}

function readDocumentLimit(value: unknown): DocumentRange['limit'] | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    return null;
  }
  const maxChars = readOptionalPositiveInteger(value['maxChars']);
  const maxImages = readOptionalPositiveInteger(value['maxImages']);
  if (maxChars === null || maxImages === null) {
    return null;
  }
  return {
    maxChars,
    maxImages,
  };
}

function readPositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : null;
}

function readNonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function readOptionalPositiveInteger(value: unknown): number | null | undefined {
  return value === undefined ? undefined : readPositiveInteger(value);
}

function readOptionalNonNegativeInteger(value: unknown): number | null | undefined {
  return value === undefined ? undefined : readNonNegativeInteger(value);
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readPositiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}
