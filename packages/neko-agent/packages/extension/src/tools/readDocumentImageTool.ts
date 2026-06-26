import {
  createTool,
  TOOL_NAMES_SYSTEM,
  type DocumentArchiveResourceRef,
  type DocumentImageInfo,
  type DocumentLocator,
  type DocumentSourceRef,
  type ResourceRef,
  type Tool,
  type ToolResult,
} from '@neko/shared';
import { createDocumentResourceRefFromArchiveRef } from '@neko/shared/vscode/extension';
import { createNoWorkspaceFileAccessPolicy, type CoreFileAccessPolicy } from '@neko/agent/tools';
import type { IDocumentReaderService } from '../services/DocumentReaderService';
import { resolveDocumentPath } from '../services/documentPathResolver';
import {
  READ_IMAGE_MODEL_ANALYSIS_UNSUPPORTED,
  executeReadImage,
  type ReadImageAnalysisKind,
  type ReadImageMode,
  type ReadImageToolDeps,
} from './readImageTool';

export const DEFAULT_READ_DOCUMENT_IMAGE_LIMIT = 4;
export const MAX_READ_DOCUMENT_IMAGE_LIMIT = 16;

export interface ReadDocumentImageToolDeps extends ReadImageToolDeps {
  readonly reader: IDocumentReaderService;
  readonly fileAccessPolicy?: CoreFileAccessPolicy;
  readonly resolveResourceScope?: () => ResourceRef['scope'];
}

interface SelectedDocumentImage {
  readonly info: DocumentImageInfo;
  readonly index: number;
}

type DocumentImageInfoWithManagedResourceRef = DocumentImageInfo & {
  readonly managedResourceRef?: ResourceRef;
};

type SanitizedDocumentImageInfo = Omit<
  DocumentImageInfoWithManagedResourceRef,
  'path' | 'managedResourceRef'
>;

export function createReadDocumentImageTool(deps: ReadDocumentImageToolDeps): Tool {
  return createTool({
    name: TOOL_NAMES_SYSTEM.READ_DOCUMENT_IMAGE,
    description:
      'Resolve selected image pages from a document and expose them as native multimodal Agent resources. ' +
      'Use this when you have document locators or page indexes and still need to expose them to the native multimodal turn. ' +
      'This is a document-page adapter over ReadImage; it does not call a separate vision model.',
    category: 'document',
    isReadOnly: true,
    isConcurrencySafe: true,
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Document path, or the same file_path used with ReadDocument.',
        },
        source: {
          type: 'object',
          description: 'Optional DocumentSourceRef returned by ReadDocument.',
        },
        page_indexes: {
          type: 'array',
          description: 'Zero-based image indexes from the selected document range.',
          items: { type: 'integer' },
        },
        locators: {
          type: 'array',
          description:
            'Document locators for image pages returned by ReadDocument manifest/range results.',
          items: { type: 'object' },
        },
        mode: {
          type: 'string',
          enum: ['metadata'],
          description:
            'metadata resolves document page images and exposes them to the native multimodal Agent turn.',
        },
        analysis: {
          type: 'string',
          enum: ['describe', 'ocr', 'panels', 'storyboard', 'custom'],
          description:
            'Optional hint for the next native multimodal Agent reasoning step. This tool does not perform model analysis.',
        },
        prompt: {
          type: 'string',
          description:
            'Optional hint for the next native multimodal Agent reasoning step. This tool does not perform model analysis.',
        },
        max_images: {
          type: 'integer',
          description: `Maximum document images to process. Default ${DEFAULT_READ_DOCUMENT_IMAGE_LIMIT}; max ${MAX_READ_DOCUMENT_IMAGE_LIMIT}.`,
          minimum: 1,
          maximum: MAX_READ_DOCUMENT_IMAGE_LIMIT,
        },
      },
      required: ['file_path'],
    },
    execute: async (args) => executeReadDocumentImage(deps, args),
  });
}

export async function executeReadDocumentImage(
  deps: ReadDocumentImageToolDeps,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const filePath = readString(args['file_path']);
  if (!filePath) {
    return { success: false, error: 'Missing required field: file_path' };
  }
  if (Object.prototype.hasOwnProperty.call(args, 'image_paths')) {
    return {
      success: false,
      error:
        'ReadDocumentImage image_paths was removed. Use page_indexes, locators, or ReadDocument imageInfo.resourceRef.',
    };
  }
  const authorization = await authorizeLocalDocumentPath(deps.fileAccessPolicy, filePath);
  if (!authorization.allowed) {
    return { success: false, error: authorization.error };
  }
  const resolvedFilePath = authorization.path;
  if (!deps.reader.supports(resolvedFilePath)) {
    return { success: false, error: `Unsupported document format: ${resolvedFilePath}` };
  }

  const maxImages = readBoundedInteger(
    args['max_images'],
    DEFAULT_READ_DOCUMENT_IMAGE_LIMIT,
    1,
    MAX_READ_DOCUMENT_IMAGE_LIMIT,
  );
  const mode = readMode(args['mode']);
  const analysis = readAnalysisKind(args['analysis']);
  if (mode === 'vision') {
    return { success: false, error: READ_IMAGE_MODEL_ANALYSIS_UNSUPPORTED };
  }

  try {
    const source = await authorizeDocumentImageSource(
      deps.fileAccessPolicy,
      readDocumentSource(args['source']) ?? resolvedFilePath,
    );
    const selected = await selectImagesFromDocument(deps.reader, source, args, maxImages);

    if (selected.length === 0) {
      return {
        success: false,
        error:
          'No matching document images found. Provide page_indexes or locators from ReadDocument.',
      };
    }
    const projectedSelected = await Promise.all(
      selected.map(async (image) => ({
        ...image,
        info: withManagedResourceRef(image.info, deps.resolveResourceScope),
      })),
    );

    const readImageResult = await executeReadImage(deps, {
      images: projectedSelected.map((image) => ({
        alias: image.info.alias ?? formatDocumentImageAlias(image.info.locator, image.index),
        ...(image.info.aliasScope ? { aliasScope: image.info.aliasScope } : {}),
        ...(image.info.sourceDocumentId ? { sourceDocumentId: image.info.sourceDocumentId } : {}),
        ...(image.info.entryPath ? { entryPath: image.info.entryPath } : {}),
        ...(image.info.width !== undefined ? { width: image.info.width } : {}),
        ...(image.info.height !== undefined ? { height: image.info.height } : {}),
        ...(image.info.mimeType ? { mimeType: image.info.mimeType } : {}),
        ...(image.info.portableForTransfer !== undefined
          ? { portableForTransfer: image.info.portableForTransfer }
          : {}),
        ...(image.info.nonPortableReason
          ? { nonPortableReason: image.info.nonPortableReason }
          : {}),
        label: formatDocumentImageLabel(image.info.locator, image.index),
        metadata: {
          documentIndex: image.index,
          ...(image.info.locator ? { locator: image.info.locator } : {}),
        },
        ...(image.info.resourceRef ? { resourceRef: image.info.resourceRef } : {}),
      })),
      mode,
      analysis,
      ...(readString(args['prompt']) ? { prompt: readString(args['prompt']) } : {}),
      max_images: maxImages,
    });

    if (!readImageResult.success) {
      return readImageResult;
    }

    return {
      success: true,
      data: {
        source: typeof source === 'string' ? { filePath: source } : source,
        mode,
        analysis,
        images: await Promise.all(
          extractImagesFromReadImageData(readImageResult.data).map(async (image, index) => {
            const documentImage = projectedSelected[index]?.info;
            return {
              ...image,
              ...(documentImage
                ? { documentImage: selectTransferDocumentImageInfo(documentImage) }
                : {}),
            };
          }),
        ),
        imageCount: selected.length,
      },
      attachments: readImageResult.attachments,
      perceptionCards: readImageResult.perceptionCards,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function selectTransferDocumentImageInfo(
  image: DocumentImageInfoWithManagedResourceRef,
): SanitizedDocumentImageInfo {
  return {
    width: image.width,
    height: image.height,
    mimeType: image.mimeType,
    byteSize: image.byteSize,
    locator: image.locator,
    alias: image.alias,
    aliasScope: image.aliasScope,
    sourceDocumentId: image.sourceDocumentId,
    entryPath: image.entryPath,
    portableForTransfer: image.portableForTransfer,
    nonPortableReason: image.nonPortableReason,
    resourceRef: image.resourceRef,
  };
}

async function authorizeLocalDocumentPath(
  fileAccessPolicy: CoreFileAccessPolicy | undefined,
  filePath: string,
): Promise<
  | { readonly allowed: true; readonly path: string }
  | { readonly allowed: false; readonly error: string }
> {
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

async function authorizeDocumentImageSource(
  fileAccessPolicy: CoreFileAccessPolicy | undefined,
  source: DocumentSourceRef | string,
): Promise<DocumentSourceRef | string> {
  if (typeof source === 'string') {
    const authorization = await authorizeLocalDocumentPath(fileAccessPolicy, source);
    if (!authorization.allowed) {
      throw new Error(authorization.error);
    }
    return authorization.path;
  }
  const authorization = await authorizeLocalDocumentPath(fileAccessPolicy, source.filePath);
  if (!authorization.allowed) {
    throw new Error(authorization.error);
  }
  return { ...source, filePath: authorization.path };
}

async function selectImagesFromDocument(
  reader: IDocumentReaderService,
  source: DocumentSourceRef | string,
  args: Record<string, unknown>,
  maxImages: number,
): Promise<SelectedDocumentImage[]> {
  const pageIndexes = new Set(readNonNegativeIntegerArray(args['page_indexes']));
  const locators = readLocatorArray(args['locators']);
  const manifest = await reader.getManifest(source);
  const highestRequestedPageIndex =
    pageIndexes.size > 0 ? Math.max(...Array.from(pageIndexes)) : -1;
  const highestRequestedLocatorSpineIndex = locators.reduce(
    (max, locator) =>
      locator.kind === 'chapter' && locator.spineIndex !== undefined
        ? Math.max(max, locator.spineIndex)
        : max,
    -1,
  );
  const range = await reader.readRange(manifest.source, {
    locator: manifest.units[0]?.locator ?? { kind: 'page', pageNumber: 1, pageIndex: 0 },
    limit: {
      maxImages: Math.max(
        maxImages,
        pageIndexes.size,
        highestRequestedPageIndex + 1,
        highestRequestedLocatorSpineIndex + 1,
        1,
      ),
    },
  });
  const imageInfo = range.imageInfo ?? [];

  const selected = imageInfo
    .map((info, index) => ({ info, index }))
    .filter((image) => {
      if (pageIndexes.size === 0 && locators.length === 0) return true;
      return (
        pageIndexes.has(image.index) ||
        locators.some((locator) => sameLocator(locator, image.info.locator))
      );
    })
    .slice(0, maxImages);

  if (selected.length > 0) {
    return selected;
  }

  return [];
}

function extractImagesFromReadImageData(data: unknown): readonly Record<string, unknown>[] {
  return isRecord(data) && Array.isArray(data['images']) ? data['images'].filter(isRecord) : [];
}

function withManagedResourceRef(
  image: DocumentImageInfo,
  resolveResourceScope: (() => ResourceRef['scope']) | undefined,
): DocumentImageInfoWithManagedResourceRef {
  if (!image.resourceRef) return image;
  const archiveRef: DocumentArchiveResourceRef = {
    kind: 'document-entry',
    source: image.resourceRef.source,
    ...(image.resourceRef.entryPath ? { entryPath: image.resourceRef.entryPath } : {}),
    ...(image.locator && !image.resourceRef.locator ? { locator: image.locator } : {}),
    ...(image.resourceRef.locator ? { locator: image.resourceRef.locator } : {}),
    ...(image.resourceRef.versionPolicy ? { versionPolicy: image.resourceRef.versionPolicy } : {}),
  };
  const managedResourceRef = createDocumentResourceRefFromArchiveRef(
    archiveRef,
    resolveResourceScope?.() ?? 'project',
  );
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

function readDocumentSource(value: unknown): DocumentSourceRef | null {
  if (!isRecord(value)) return null;
  const filePath = readString(value['filePath']) ?? readString(value['file_path']);
  const format = readString(value['format']);
  if (!filePath || !format) return null;
  return {
    filePath,
    format: format as DocumentSourceRef['format'],
    ...(readString(value['fileId']) ? { fileId: readString(value['fileId']) } : {}),
  };
}

function readLocatorArray(value: unknown): DocumentLocator[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isDocumentLocator);
}

function isDocumentLocator(value: unknown): value is DocumentLocator {
  return isRecord(value) && typeof value['kind'] === 'string';
}

function sameLocator(left: DocumentLocator, right: DocumentLocator | undefined): boolean {
  if (!right || left.kind !== right.kind) return false;
  switch (left.kind) {
    case 'page':
      return right.kind === 'page' && left.pageIndex === right.pageIndex;
    case 'chapter':
      return right.kind === 'chapter' && left.chapterHref === right.chapterHref;
    case 'slide':
      return right.kind === 'slide' && left.slideIndex === right.slideIndex;
    case 'text-range':
      return false;
    case 'region':
      return right.kind === 'region' && left.pageNumber === right.pageNumber;
  }
}

function formatDocumentImageLabel(locator: DocumentLocator | undefined, index: number): string {
  if (!locator) return `image-${index + 1}`;
  switch (locator.kind) {
    case 'page':
      return `page-${locator.pageNumber}`;
    case 'chapter':
      return locator.spineIndex === undefined ? locator.chapterHref : `spine-${locator.spineIndex}`;
    case 'slide':
      return `slide-${locator.slideNumber}`;
    case 'region':
      return `page-${locator.pageNumber}-region`;
    case 'text-range':
      return `image-${index + 1}`;
  }
}

function formatDocumentImageAlias(locator: DocumentLocator | undefined, index = 0): string {
  if (!locator) return `image_${index + 1}`;
  switch (locator.kind) {
    case 'page':
      return `page_${locator.pageNumber}`;
    case 'chapter':
      return locator.spineIndex === undefined ? 'image_1' : `page_${locator.spineIndex + 1}`;
    case 'slide':
      return `slide_${locator.slideNumber}`;
    case 'region':
      return `page_${locator.pageNumber}_region`;
    case 'text-range':
      return `image_${index + 1}`;
  }
}

function formatDocumentAliasScope(resourceRef: DocumentArchiveResourceRef): string {
  return `document:${formatDocumentSourceId(resourceRef.source)}`;
}

function formatDocumentSourceId(source: DocumentSourceRef): string {
  return source.identity?.hash ?? source.identity?.fileId ?? source.fileId ?? source.filePath;
}

function readNonNegativeIntegerArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is number => typeof item === 'number' && Number.isInteger(item) && item >= 0,
  );
}

function readMode(value: unknown): ReadImageMode {
  return value === 'vision' ? 'vision' : 'metadata';
}

function readAnalysisKind(value: unknown): ReadImageAnalysisKind {
  return value === 'ocr' || value === 'panels' || value === 'storyboard' || value === 'custom'
    ? value
    : 'describe';
}

function readBoundedInteger(
  value: unknown,
  defaultValue: number,
  min: number,
  max: number,
): number {
  return typeof value === 'number' && Number.isInteger(value)
    ? Math.max(min, Math.min(max, value))
    : defaultValue;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
