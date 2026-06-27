import {
  TOOL_NAMES_SYSTEM,
  createTool,
  isDocumentFormat,
  type Tool,
  type ToolResult,
} from '@neko/shared';
import { isDocumentUrl } from '@neko/platform/document';
import { createDocumentResourceRefFromArchiveRef } from '@neko/shared/vscode/extension';
import { resolveDocumentPath } from '../services/documentPathResolver';
import type {
  DocumentBatchCursor,
  DocumentArchiveResourceRef,
  DocumentExcerpt,
  DocumentImageInfo,
  DocumentLocator,
  DocumentManifest,
  DocumentRange,
  DocumentReadResult,
  DocumentRegion,
  DocumentSourceRef,
  ResourceRef,
} from '@neko/shared';
import { createNoWorkspaceFileAccessPolicy, type CoreFileAccessPolicy } from '@neko/agent/tools';
import type { AgentContentAccessRuntime } from '@neko/agent/runtime';
import type { DocumentContent, IDocumentReaderService } from '../services/DocumentReaderService';

export const DEFAULT_READ_DOCUMENT_MAX_CHARS = 20000;
export const MAX_READ_DOCUMENT_CHARS = 100000;
export const DEFAULT_READ_DOCUMENT_IMAGE_LIMIT = 50;
export const MAX_READ_DOCUMENT_IMAGE_LIMIT = 500;

export interface ReadDocumentToolDeps {
  readonly reader: IDocumentReaderService;
  readonly contentAccessRuntime?: AgentContentAccessRuntime;
  readonly fileAccessPolicy?: CoreFileAccessPolicy;
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
  readonly imageInfo?: readonly SanitizedDocumentImageInfo[];
  readonly imageCount?: number;
  readonly imagesTruncated?: boolean;
}

type DocumentImageInfoWithManagedResourceRef = DocumentImageInfo & {
  readonly managedResourceRef?: import('@neko/shared').ResourceRef;
};

type SanitizedDocumentImageInfo = Omit<
  DocumentImageInfoWithManagedResourceRef,
  'path' | 'managedResourceRef'
>;

type SanitizedDocumentExcerpt = Omit<DocumentExcerpt, 'imagePaths' | 'imageInfo'>;

type SanitizedDocumentReadResult = Omit<
  DocumentReadResult,
  'imagePaths' | 'imageInfo' | 'excerpt'
> & {
  readonly imageInfo?: readonly SanitizedDocumentImageInfo[];
  readonly excerpt?: SanitizedDocumentExcerpt;
};

interface ProjectedDocumentImages {
  readonly imageInfo: readonly SanitizedDocumentImageInfo[];
}

interface ProjectDocumentImagesOptions {
  readonly imageInfo: readonly DocumentImageInfo[] | undefined;
  readonly imageLimit: number;
  readonly contentAccessRuntime?: AgentContentAccessRuntime;
  readonly resolveResourceScope?: () => ResourceRef['scope'];
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
            'Semantic document range for mode="range". Use { locator: <DocumentLocator>, endLocator?: <DocumentLocator> } or { kind: "chapterRange", start: <chapter locator>, end: <chapter locator> }. Do not nest a chapter range inside range.locator.',
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
        include_images: {
          type: 'boolean',
          description:
            'Whether to include extracted document image metadata and stable document resource refs when available. Default true.',
        },
        max_images: {
          type: 'integer',
          description: `Maximum document images to return. Default ${DEFAULT_READ_DOCUMENT_IMAGE_LIMIT}; max ${MAX_READ_DOCUMENT_IMAGE_LIMIT}.`,
          minimum: 1,
          maximum: MAX_READ_DOCUMENT_IMAGE_LIMIT,
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
  const authorizedFilePath = await authorizeDocumentPath(deps.fileAccessPolicy, filePath);
  if (!authorizedFilePath.allowed) {
    return { success: false, error: authorizedFilePath.error };
  }
  const resolvedFilePath = authorizedFilePath.path;

  if (!isDocumentUrl(resolvedFilePath) && !reader.supports(resolvedFilePath)) {
    return { success: false, error: `Unsupported document format: ${resolvedFilePath}` };
  }

  const maxChars = readBoundedInteger(
    args['max_chars'],
    DEFAULT_READ_DOCUMENT_MAX_CHARS,
    1000,
    MAX_READ_DOCUMENT_CHARS,
  );
  const includeMetadata = readBoolean(args['include_metadata'], true);
  const includeManifest = readBoolean(args['include_manifest'], false);
  if (Object.prototype.hasOwnProperty.call(args, 'include_image_paths')) {
    return {
      success: false,
      error:
        'ReadDocument include_image_paths was removed. Use include_images with structured imageInfo refs.',
    };
  }
  if (Object.prototype.hasOwnProperty.call(args, 'image_path_limit')) {
    return {
      success: false,
      error: 'ReadDocument image_path_limit was removed. Use max_images.',
    };
  }
  const includeImages = readBoolean(args['include_images'], true);
  const imageLimit = readBoundedInteger(
    args['max_images'],
    DEFAULT_READ_DOCUMENT_IMAGE_LIMIT,
    1,
    MAX_READ_DOCUMENT_IMAGE_LIMIT,
  );
  const mode = readMode(args['mode']);

  try {
    const source = await authorizeDocumentSource(
      deps.fileAccessPolicy,
      readDocumentSource(args['source']) ?? resolvedFilePath,
    );

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
          ? createDefaultRangeFromManifest(await reader.getManifest(source), imageLimit)
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
              maxImages: imageLimit,
            },
          }),
          {
            includeMetadata,
            includeManifest,
            includeImages,
            imageLimit,
            contentAccessRuntime: deps.contentAccessRuntime,
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
      const authorizedCursor = await authorizeDocumentCursor(deps.fileAccessPolicy, cursor);
      return {
        success: true,
        data: await formatDocumentReadResult(await reader.readNext(authorizedCursor), {
          includeMetadata,
          includeManifest,
          includeImages,
          imageLimit,
          contentAccessRuntime: deps.contentAccessRuntime,
          resolveResourceScope,
        }),
      };
    }

    const content = await reader.read(resolvedFilePath);
    return {
      success: true,
      data: await formatReadDocumentData({
        content,
        filePath: resolvedFilePath,
        maxChars,
        includeMetadata,
        includeImages,
        imageLimit,
        contentAccessRuntime: deps.contentAccessRuntime,
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

async function authorizeDocumentPath(
  fileAccessPolicy: CoreFileAccessPolicy | undefined,
  filePath: string,
): Promise<
  | { readonly allowed: true; readonly path: string }
  | { readonly allowed: false; readonly error: string }
> {
  if (isDocumentUrl(filePath)) {
    return { allowed: true, path: filePath };
  }
  const resolvedFilePath = await resolveDocumentPath(filePath);
  const authorization = (fileAccessPolicy ?? createNoWorkspaceFileAccessPolicy()).authorize(
    resolvedFilePath,
    'read',
  );
  if (!authorization.allowed) {
    return {
      allowed: false,
      error: authorization.message ?? `Unauthorized document path: ${resolvedFilePath}`,
    };
  }
  return { allowed: true, path: authorization.path };
}

async function authorizeDocumentSource(
  fileAccessPolicy: CoreFileAccessPolicy | undefined,
  source: DocumentSourceRef | string,
): Promise<DocumentSourceRef | string> {
  if (typeof source === 'string') {
    const authorization = await authorizeDocumentPath(fileAccessPolicy, source);
    if (!authorization.allowed) {
      throw new Error(authorization.error);
    }
    return authorization.path;
  }
  const authorization = await authorizeDocumentPath(fileAccessPolicy, source.filePath);
  if (!authorization.allowed) {
    throw new Error(authorization.error);
  }
  return { ...source, filePath: authorization.path };
}

async function authorizeDocumentCursor(
  fileAccessPolicy: CoreFileAccessPolicy | undefined,
  cursor: DocumentBatchCursor,
): Promise<DocumentBatchCursor> {
  return {
    ...cursor,
    source: (await authorizeDocumentSource(fileAccessPolicy, cursor.source)) as DocumentSourceRef,
  };
}

async function formatDocumentReadResult(
  result: DocumentReadResult,
  options: {
    readonly includeMetadata: boolean;
    readonly includeManifest: boolean;
    readonly includeImages: boolean;
    readonly imageLimit: number;
    readonly contentAccessRuntime?: AgentContentAccessRuntime;
    readonly resolveResourceScope?: () => ResourceRef['scope'];
  },
): Promise<SanitizedDocumentReadResult> {
  const imageCount = Math.max(result.imagePaths?.length ?? 0, result.imageInfo?.length ?? 0);
  const visibleImages = options.includeImages
    ? await projectVisibleDocumentImages({
        imageInfo: result.imageInfo,
        imageLimit: options.imageLimit,
        contentAccessRuntime: options.contentAccessRuntime,
        resolveResourceScope: options.resolveResourceScope,
      })
    : { imageInfo: [] };

  const metadata =
    options.includeMetadata && (result.metadata || imageCount > 0)
      ? {
          ...result.metadata,
          ...(imageCount > 0
            ? {
                imageCount,
                imagesTruncated: visibleImages.imageInfo.length < imageCount,
              }
            : {}),
        }
      : undefined;

  const excerpt = result.excerpt
    ? stripUndefinedProperties({
        ...result.excerpt,
        imagePaths: undefined,
        imageInfo: undefined,
      })
    : result.excerpt;

  return stripUndefinedProperties({
    ...result,
    imagePaths: undefined,
    imageInfo: visibleImages.imageInfo.length > 0 ? visibleImages.imageInfo : undefined,
    excerpt,
    metadata,
    manifest: options.includeManifest ? result.manifest : undefined,
  });
}

async function projectVisibleDocumentImages(
  options: ProjectDocumentImagesOptions,
): Promise<ProjectedDocumentImages> {
  const { imageInfo, imageLimit, contentAccessRuntime, resolveResourceScope } = options;
  if (!imageInfo || imageInfo.length === 0) {
    return { imageInfo: [] };
  }
  const visible = imageInfo.slice(0, imageLimit);
  const projectedInfo = await Promise.all(
    visible.map(async (image, index) =>
      enrichRuntimeDocumentImageInfo(
        await withManagedResourceRef(image, contentAccessRuntime, resolveResourceScope),
        index,
      ),
    ),
  );
  return {
    imageInfo: projectedInfo,
  };
}

async function withManagedResourceRef(
  image: DocumentImageInfo,
  contentAccessRuntime: AgentContentAccessRuntime | undefined,
  resolveResourceScope: (() => ResourceRef['scope']) | undefined,
): Promise<DocumentImageInfoWithManagedResourceRef> {
  const archiveRef = normalizeDocumentArchiveResourceRef(image);
  if (!archiveRef) return image;
  const managedResourceRef = createDocumentResourceRefFromArchiveRef(
    archiveRef,
    resolveResourceScope?.() ?? 'project',
  );
  await prewarmDocumentImageResource(contentAccessRuntime, archiveRef, image);
  return {
    ...image,
    alias: image.alias ?? formatDocumentImageAlias(image.locator),
    aliasScope: image.aliasScope ?? formatDocumentAliasScope(archiveRef),
    sourceDocumentId: image.sourceDocumentId ?? formatDocumentSourceId(archiveRef.source),
    entryPath: image.entryPath ?? archiveRef.entryPath,
    portableForTransfer: managedResourceRef.scope === 'project',
    ...(managedResourceRef.scope === 'project'
      ? {}
      : { nonPortableReason: 'no-workspace-or-extension-private-scratch' }),
    resourceRef: archiveRef,
    managedResourceRef,
  };
}

async function prewarmDocumentImageResource(
  contentAccessRuntime: AgentContentAccessRuntime | undefined,
  archiveRef: DocumentArchiveResourceRef,
  image: DocumentImageInfo,
): Promise<void> {
  if (!contentAccessRuntime) {
    throw new Error(
      'Document images must be resolved through AgentContentAccessRuntime before use.',
    );
  }
  const result = await contentAccessRuntime.resolveDocumentImages({
    caller: 'read-document',
    source: {
      kind: 'document',
      source: {
        kind: 'document',
        filePath: archiveRef.source.filePath,
        document: archiveRef.source,
      },
      entryPath: archiveRef.entryPath,
      locator: {
        kind: 'document',
        ...(archiveRef.entryPath ? { entryPath: archiveRef.entryPath } : {}),
        ...(archiveRef.locator ? { locator: archiveRef.locator } : {}),
      },
    },
    locators: [archiveRef],
    variant: {
      role: 'document-entry',
      ...(image.mimeType ? { mimeType: image.mimeType } : {}),
      ...(image.width !== undefined ? { width: image.width } : {}),
      ...(image.height !== undefined ? { height: image.height } : {}),
    },
  });
  if (result.status !== 'ready') {
    throw new Error(
      result.diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message ??
        `Document image resource could not be resolved through content access: ${result.status}`,
    );
  }
}

function enrichRuntimeDocumentImageInfo(
  image: DocumentImageInfoWithManagedResourceRef,
  index: number,
): SanitizedDocumentImageInfo {
  return stripUndefinedProperties({
    width: image.width,
    height: image.height,
    mimeType: image.mimeType,
    byteSize: image.byteSize,
    locator: image.locator,
    alias: image.alias ?? formatDocumentImageAlias(image.locator, index),
    aliasScope:
      image.aliasScope ??
      (image.resourceRef ? formatDocumentAliasScope(image.resourceRef) : undefined),
    sourceDocumentId:
      image.sourceDocumentId ??
      (image.resourceRef ? formatDocumentSourceId(image.resourceRef.source) : undefined),
    entryPath: image.entryPath ?? image.resourceRef?.entryPath,
    portableForTransfer: image.portableForTransfer ?? image.managedResourceRef?.scope === 'project',
    ...(image.nonPortableReason
      ? { nonPortableReason: image.nonPortableReason }
      : image.managedResourceRef && image.managedResourceRef.scope !== 'project'
        ? { nonPortableReason: 'no-workspace-or-extension-private-scratch' }
        : {}),
    ...(image.resourceRef ? { resourceRef: image.resourceRef } : {}),
  });
}

function normalizeDocumentArchiveResourceRef(
  image: DocumentImageInfo,
): DocumentArchiveResourceRef | undefined {
  if (!image.resourceRef) return undefined;
  return {
    kind: 'document-entry',
    source: image.resourceRef.source,
    ...(image.resourceRef.entryPath ? { entryPath: image.resourceRef.entryPath } : {}),
    ...(image.locator && !image.resourceRef.locator ? { locator: image.locator } : {}),
    ...(image.resourceRef.locator ? { locator: image.resourceRef.locator } : {}),
    ...(image.resourceRef.versionPolicy ? { versionPolicy: image.resourceRef.versionPolicy } : {}),
  };
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
  imageLimit: number,
): DocumentRange | null {
  const firstUnit = manifest.units[0];
  if (!firstUnit) {
    return null;
  }

  const boundedUnitCount = Math.max(1, Math.min(imageLimit, manifest.units.length));
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
  readonly includeImages: boolean;
  readonly imageLimit: number;
  readonly contentAccessRuntime?: AgentContentAccessRuntime;
  readonly resolveResourceScope?: () => ResourceRef['scope'];
}): Promise<ReadDocumentToolData> {
  const text = input.content.text ?? '';
  const truncatedText = truncateText(text, input.maxChars);
  const imageCount = Math.max(
    input.content.imagePaths?.length ?? 0,
    input.content.imageInfo?.length ?? 0,
  );
  const visibleImages = input.includeImages
    ? await projectVisibleDocumentImages({
        imageInfo: input.content.imageInfo,
        imageLimit: input.imageLimit,
        contentAccessRuntime: input.contentAccessRuntime,
        resolveResourceScope: input.resolveResourceScope,
      })
    : { imageInfo: [] };

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
    ...(imageCount > 0
      ? {
          ...(visibleImages.imageInfo.length > 0 ? { imageInfo: visibleImages.imageInfo } : {}),
          imageCount,
          imagesTruncated: visibleImages.imageInfo.length < imageCount,
        }
      : {}),
  };
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

  const nestedRangeLocator = value['locator'];
  if (
    isRecord(nestedRangeLocator) &&
    (nestedRangeLocator['kind'] === 'chapter-range' ||
      nestedRangeLocator['kind'] === 'chapterRange')
  ) {
    return readChapterRangeShorthand(nestedRangeLocator, value['limit']);
  }

  if (value['kind'] === 'chapterRange') {
    return readChapterRangeShorthand(value, value['limit']);
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

function readChapterRangeShorthand(
  value: Record<string, unknown>,
  limitValue: unknown,
): DocumentRange | null {
  const start = readDocumentLocator(value['start']);
  const end = readDocumentLocator(value['end']);
  if (!start || start.kind !== 'chapter' || !end || end.kind !== 'chapter') {
    return null;
  }

  const limit = readDocumentLimit(limitValue);
  if (limit === null) {
    return null;
  }

  return {
    locator: start,
    endLocator: end,
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
