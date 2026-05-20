import {
  createTool,
  TOOL_NAMES_SYSTEM,
  type DocumentImageInfo,
  type DocumentLocator,
  type DocumentSourceRef,
  type Tool,
  type ToolResult,
} from '@neko/shared';
import type { Platform } from '@neko/platform';
import type { IDocumentReaderService } from '../services/DocumentReaderService';
import {
  MAX_READ_IMAGE_JPEG_QUALITY,
  MAX_READ_IMAGE_LONG_EDGE,
  MIN_READ_IMAGE_JPEG_QUALITY,
  MIN_READ_IMAGE_LONG_EDGE,
  executeReadImage,
  type ReadImageAnalysisKind,
  type ReadImageMode,
  type ReadImageToolDeps,
} from './readImageTool';

export const DEFAULT_READ_DOCUMENT_IMAGE_LIMIT = 4;
export const MAX_READ_DOCUMENT_IMAGE_LIMIT = 16;

export interface ReadDocumentImageToolDeps extends ReadImageToolDeps {
  readonly reader: IDocumentReaderService;
  readonly platform?: Platform;
}

interface SelectedDocumentImage {
  readonly info: DocumentImageInfo;
  readonly index: number;
}

export function createReadDocumentImageTool(deps: ReadDocumentImageToolDeps): Tool {
  return createTool({
    name: TOOL_NAMES_SYSTEM.READ_DOCUMENT_IMAGE,
    description:
      'Resolve selected image pages from a document and read or visually analyze them. ' +
      'Use after ReadDocument when the user asks to inspect page images by page index, locator, or returned image path. ' +
      'This is a document-page adapter over ReadImage; use ReadImage directly for generic standalone images.',
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
        image_paths: {
          type: 'array',
          description:
            'Optional specific image paths returned by ReadDocument. When present, these are used directly.',
          items: { type: 'string' },
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
          enum: ['metadata', 'vision'],
          description:
            'metadata reads image metadata only. vision sends selected pages to the chat model.',
        },
        analysis: {
          type: 'string',
          enum: ['describe', 'ocr', 'panels', 'storyboard', 'custom'],
          description: 'Requested vision analysis style for selected document images.',
        },
        prompt: {
          type: 'string',
          description: 'Optional custom instruction for vision mode.',
        },
        max_images: {
          type: 'integer',
          description: `Maximum document images to process. Default ${DEFAULT_READ_DOCUMENT_IMAGE_LIMIT}; max ${MAX_READ_DOCUMENT_IMAGE_LIMIT}.`,
          minimum: 1,
          maximum: MAX_READ_DOCUMENT_IMAGE_LIMIT,
        },
        preprocess: {
          type: 'string',
          enum: ['auto', 'none'],
          description:
            'Vision mode only. auto (default) downscales oversized page images and normalizes model payloads to JPEG; none sends original bytes.',
        },
        max_long_edge: {
          type: 'integer',
          description:
            'Vision mode preprocessing target for the longest page-image edge. Used with preprocess="auto".',
          minimum: MIN_READ_IMAGE_LONG_EDGE,
          maximum: MAX_READ_IMAGE_LONG_EDGE,
        },
        quality: {
          type: 'integer',
          description:
            'Vision mode JPEG quality used by preprocessing. Used with preprocess="auto".',
          minimum: MIN_READ_IMAGE_JPEG_QUALITY,
          maximum: MAX_READ_IMAGE_JPEG_QUALITY,
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
  if (!deps.reader.supports(filePath)) {
    return { success: false, error: `Unsupported document format: ${filePath}` };
  }

  const maxImages = readBoundedInteger(
    args['max_images'],
    DEFAULT_READ_DOCUMENT_IMAGE_LIMIT,
    1,
    MAX_READ_DOCUMENT_IMAGE_LIMIT,
  );
  const mode = readMode(args['mode']);
  const analysis = readAnalysisKind(args['analysis']);
  const directImagePaths = readStringArray(args['image_paths']);

  try {
    const source = readDocumentSource(args['source']) ?? filePath;
    const selected =
      directImagePaths.length > 0
        ? directImagePaths.slice(0, maxImages).map((path, index) => ({
            index,
            info: { path },
          }))
        : await selectImagesFromDocument(deps.reader, source, args, maxImages);

    if (selected.length === 0) {
      return {
        success: false,
        error:
          'No matching document images found. Provide image_paths, page_indexes, or locators from ReadDocument.',
      };
    }

    const readImageResult = await executeReadImage(deps, {
      images: selected.map((image) => ({
        path: image.info.path,
        label: formatDocumentImageLabel(image.info.locator, image.index),
        metadata: {
          documentIndex: image.index,
          ...(image.info.locator ? { locator: image.info.locator } : {}),
        },
      })),
      mode,
      analysis,
      ...(readString(args['prompt']) ? { prompt: readString(args['prompt']) } : {}),
      ...(readString(args['preprocess']) ? { preprocess: readString(args['preprocess']) } : {}),
      ...(readNumber(args['max_long_edge']) !== undefined
        ? { max_long_edge: readNumber(args['max_long_edge']) }
        : {}),
      ...(readNumber(args['quality']) !== undefined
        ? { quality: readNumber(args['quality']) }
        : {}),
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
        images: extractImagesFromReadImageData(readImageResult.data).map((image, index) => ({
          ...image,
          documentImage: selected[index]?.info,
        })),
        imageCount: selected.length,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
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

  return (range.imagePaths ?? [])
    .map((path, index) => ({ index, info: imageInfo[index] ?? { path } }))
    .slice(0, maxImages);
}

function extractImagesFromReadImageData(data: unknown): readonly Record<string, unknown>[] {
  return isRecord(data) && Array.isArray(data['images']) ? data['images'].filter(isRecord) : [];
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

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
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

function readBoundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isInteger(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
