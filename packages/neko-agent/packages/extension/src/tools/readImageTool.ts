import * as fs from 'fs/promises';
import * as path from 'path';
import {
  createTool,
  getMimeType,
  isDocumentArchiveResourceRef,
  isResourceRef,
  parseDocumentArchiveResourceRef,
  TOOL_NAMES_SYSTEM,
  type DocumentArchiveResourceRef,
  type PerceptionCard,
  type PerceptualAssetRef,
  type ResourceRef,
  type Tool,
  type ToolResult,
} from '@neko/shared';
import type { ResourceCacheService } from '@neko/shared/vscode/extension';
import { createNoWorkspaceFileAccessPolicy, type CoreFileAccessPolicy } from '@neko/agent/tools';
import { probeImageMetadata, type ImageMetadata } from '@neko/platform/document';
import { resolveDocumentPath } from '../services/documentPathResolver';

export const DEFAULT_READ_IMAGE_LIMIT = 4;
export const MAX_READ_IMAGE_LIMIT = 16;
export const MAX_READ_IMAGE_BYTES = 20 * 1024 * 1024;
export const READ_IMAGE_MODEL_ANALYSIS_UNSUPPORTED =
  'ReadImage no longer performs model-backed vision analysis. Use metadata mode to expose image resources, then let the selected chat model analyze them through the native multimodal Agent turn. Future external vision-model tools must use a separate tool name.';

export interface ReadImageToolDeps {
  readonly readFile?: (filePath: string) => Promise<Uint8Array>;
  readonly resourceCache?: ResourceCacheService;
  readonly fileAccessPolicy?: CoreFileAccessPolicy;
  readonly now?: () => number;
}

export interface ReadImageInputImage {
  readonly path: string;
  readonly runtimePath?: string;
  readonly runtimeKind?: 'local-path' | 'webview-uri' | 'scratch-cache' | 'managed-cache';
  readonly alias?: string;
  readonly aliasScope?: string;
  readonly sourceDocumentId?: string;
  readonly entryPath?: string;
  readonly portableForTransfer?: boolean;
  readonly nonPortableReason?: string;
  readonly label?: string;
  readonly metadata?: Record<string, unknown>;
  readonly resourceRef?: DocumentArchiveResourceRef;
  readonly cacheResourceRef?: ResourceRef;
}

export interface ReadImageResultImage {
  readonly path: string;
  readonly runtimePath?: string;
  readonly runtimeKind?: 'local-path' | 'webview-uri' | 'scratch-cache' | 'managed-cache';
  readonly alias?: string;
  readonly aliasScope?: string;
  readonly sourceDocumentId?: string;
  readonly entryPath?: string;
  readonly portableForTransfer?: boolean;
  readonly nonPortableReason?: string;
  readonly label?: string;
  readonly width?: number;
  readonly height?: number;
  readonly mimeType?: string;
  readonly byteSize: number;
  readonly metadata?: Record<string, unknown>;
  readonly resourceRef?: DocumentArchiveResourceRef;
  readonly cacheResourceRef?: ResourceRef;
}

export interface ReadImageResultData {
  readonly mode: ReadImageMode;
  readonly analysis?: ReadImageAnalysisKind;
  readonly images: readonly ReadImageResultImage[];
  readonly imageCount: number;
  readonly imagePathsTruncated: boolean;
}

export type ReadImageMode = 'metadata' | 'vision';
export type ReadImageAnalysisKind = 'describe' | 'ocr' | 'panels' | 'storyboard' | 'custom';

interface LoadedImage {
  readonly input: ReadImageInputImage;
  readonly resolvedPath: string;
  readonly bytes: Uint8Array;
  readonly metadata: ImageMetadata;
}

export function createReadImageTool(deps: ReadImageToolDeps = {}): Tool {
  return createTool({
    name: TOOL_NAMES_SYSTEM.READ_IMAGE,
    description:
      'Read local image metadata and expose selected images as native multimodal Agent resources. ' +
      'Use this for image files from ReadDocument imagePaths, media libraries, generated assets, screenshots, and attachments. ' +
      'When ReadDocument already returned image_paths/imagePaths, use this tool directly instead of ReadDocumentImage. ' +
      'The selected chat model performs visual analysis in the next Agent reasoning step; this tool does not call a separate vision model.',
    category: 'analysis',
    isReadOnly: true,
    isConcurrencySafe: true,
    parameters: {
      type: 'object',
      properties: {
        image_paths: {
          type: 'array',
          description: 'Local image paths to inspect or analyze.',
          items: { type: 'string' },
        },
        images: {
          type: 'array',
          description:
            'Optional structured image inputs from ReadDocument.imageInfo. Prefer this over image_paths when resourceRef/cacheResourceRef, aliases, or page labels are available so stable document image references are preserved.',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              runtimePath: { type: 'string' },
              runtimeKind: {
                type: 'string',
                enum: ['local-path', 'webview-uri', 'scratch-cache', 'managed-cache'],
              },
              label: { type: 'string' },
              alias: { type: 'string' },
              aliasScope: { type: 'string' },
              sourceDocumentId: { type: 'string' },
              entryPath: { type: 'string' },
              portableForTransfer: { type: 'boolean' },
              nonPortableReason: { type: 'string' },
              metadata: {
                type: 'object',
                description: 'Optional metadata copied from ReadDocument.imageInfo.',
              },
              resourceRef: {
                type: 'object',
                description:
                  'Stable DocumentArchiveResourceRef copied from ReadDocument.imageInfo.',
              },
              cacheResourceRef: {
                type: 'object',
                description: 'Stable ResourceRef copied from ReadDocument.imageInfo.',
              },
            },
            required: ['path'],
          },
        },
        mode: {
          type: 'string',
          enum: ['metadata'],
          description:
            'metadata reads local file/image metadata and exposes images to the native multimodal Agent turn.',
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
          description: `Maximum number of images to process. Default ${DEFAULT_READ_IMAGE_LIMIT}; max ${MAX_READ_IMAGE_LIMIT}.`,
          minimum: 1,
          maximum: MAX_READ_IMAGE_LIMIT,
        },
      },
    },
    execute: async (args) => executeReadImage(deps, args),
  });
}

export async function executeReadImage(
  deps: ReadImageToolDeps,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const mode = readMode(args['mode']);
  const analysis = readAnalysisKind(args['analysis']);
  if (mode === 'vision') {
    return { success: false, error: READ_IMAGE_MODEL_ANALYSIS_UNSUPPORTED };
  }
  const maxImages = readBoundedInteger(
    args['max_images'],
    DEFAULT_READ_IMAGE_LIMIT,
    1,
    MAX_READ_IMAGE_LIMIT,
  );
  const images = readInputImages(args);
  if (images.length === 0) {
    return { success: false, error: 'Missing required field: image_paths or images' };
  }

  const selected = images.slice(0, maxImages);
  try {
    const loaded = await Promise.all(selected.map((image) => loadImage(deps, image)));
    const results: ReadImageResultImage[] = loaded.map((image) => ({
      path: image.resolvedPath,
      runtimePath: image.input.runtimePath ?? image.resolvedPath,
      runtimeKind: image.input.runtimeKind ?? inferReadImageRuntimeKind(image.input),
      ...(image.input.alias ? { alias: image.input.alias } : {}),
      ...(image.input.aliasScope ? { aliasScope: image.input.aliasScope } : {}),
      ...(image.input.sourceDocumentId ? { sourceDocumentId: image.input.sourceDocumentId } : {}),
      ...(image.input.entryPath ? { entryPath: image.input.entryPath } : {}),
      portableForTransfer:
        image.input.portableForTransfer ?? image.input.cacheResourceRef?.scope === 'project',
      ...(image.input.nonPortableReason
        ? { nonPortableReason: image.input.nonPortableReason }
        : image.input.cacheResourceRef && image.input.cacheResourceRef.scope !== 'project'
          ? { nonPortableReason: 'no-workspace-or-extension-private-scratch' }
          : {}),
      ...(image.input.label ? { label: image.input.label } : {}),
      ...(image.metadata.width !== undefined ? { width: image.metadata.width } : {}),
      ...(image.metadata.height !== undefined ? { height: image.metadata.height } : {}),
      ...(image.metadata.mimeType ? { mimeType: image.metadata.mimeType } : {}),
      byteSize: image.metadata.byteSize,
      ...(image.input.metadata ? { metadata: image.input.metadata } : {}),
      ...(image.input.resourceRef ? { resourceRef: image.input.resourceRef } : {}),
      ...(image.input.cacheResourceRef ? { cacheResourceRef: image.input.cacheResourceRef } : {}),
    }));
    const perceptionCards = results.map((image, index) =>
      createReadImagePerceptionCard({
        image,
        loaded: loaded[index]!,
        createdAt: deps.now?.() ?? Date.now(),
        index,
      }),
    );

    return {
      success: true,
      data: {
        mode,
        analysis,
        images: results,
        imageCount: images.length,
        imagePathsTruncated: selected.length < images.length,
      } satisfies ReadImageResultData,
      attachments: results.map((image, index) => ({
        type: 'image' as const,
        path: image.path,
        ...(image.mimeType ? { mimeType: image.mimeType } : {}),
        assetRef: perceptionCards[index]!.perceptual!.keyframeRefs![0]!,
      })),
      perceptionCards,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function loadImage(
  deps: ReadImageToolDeps,
  input: ReadImageInputImage,
): Promise<LoadedImage> {
  const resolvedPath = await resolveDocumentPath(input.path);
  const fileAccessPolicy = deps.fileAccessPolicy ?? createNoWorkspaceFileAccessPolicy();
  const authorization = fileAccessPolicy.authorize(resolvedPath, 'read');
  if (!authorization.allowed) {
    throw new Error(authorization.message ?? `Unauthorized image path: ${resolvedPath}`);
  }
  const readablePath = authorization.path;
  const bytes = deps.readFile ? await deps.readFile(readablePath) : await fs.readFile(readablePath);
  if (bytes.byteLength > MAX_READ_IMAGE_BYTES) {
    throw new Error(`Image is too large for ReadImage: ${readablePath}`);
  }
  const metadata = probeImageMetadata(bytes);
  if (!metadata) {
    throw new Error(`Unsupported or unreadable image file: ${readablePath}`);
  }
  return {
    input: await restoreCacheResourceRefs(deps.resourceCache, input, readablePath),
    resolvedPath: readablePath,
    bytes,
    metadata,
  };
}

async function restoreCacheResourceRefs(
  resourceCache: ResourceCacheService | undefined,
  input: ReadImageInputImage,
  resolvedPath: string,
): Promise<ReadImageInputImage> {
  if (!resourceCache || input.resourceRef || input.cacheResourceRef) {
    return input;
  }

  const match = await resourceCache.findByLocalPath(resolvedPath).catch(() => undefined);
  const cacheResourceRef = match?.ref;
  const documentResourceRef = cacheResourceRef
    ? createDocumentArchiveRefFromCacheResource(cacheResourceRef)
    : undefined;
  if (!cacheResourceRef && !documentResourceRef) {
    return input;
  }

  return {
    ...input,
    ...(documentResourceRef ? { resourceRef: documentResourceRef } : {}),
    ...(cacheResourceRef ? { cacheResourceRef } : {}),
    ...(documentResourceRef
      ? { alias: input.alias ?? formatDocumentImageAlias(documentResourceRef) }
      : {}),
    ...(documentResourceRef
      ? { aliasScope: input.aliasScope ?? formatDocumentAliasScope(documentResourceRef) }
      : {}),
    ...(documentResourceRef
      ? { sourceDocumentId: input.sourceDocumentId ?? formatDocumentSourceId(documentResourceRef) }
      : {}),
    ...(documentResourceRef?.entryPath
      ? { entryPath: input.entryPath ?? documentResourceRef.entryPath }
      : {}),
    runtimeKind: input.runtimeKind ?? 'managed-cache',
    portableForTransfer: input.portableForTransfer ?? cacheResourceRef?.scope === 'project',
  };
}

function createDocumentArchiveRefFromCacheResource(
  ref: ResourceRef,
): DocumentArchiveResourceRef | undefined {
  if (ref.kind !== 'document' || ref.source.kind !== 'document' || !ref.source.document) {
    return undefined;
  }
  const locator = ref.locator?.kind === 'document' ? ref.locator.locator : undefined;
  const entryPath = ref.locator?.kind === 'document' ? ref.locator.entryPath : undefined;
  const candidate = {
    kind: 'document-entry' as const,
    source: ref.source.document,
    ...(entryPath ? { entryPath } : {}),
    ...(locator ? { locator } : {}),
    versionPolicy: 'versioned-export' as const,
  };
  return isDocumentArchiveResourceRef(candidate) ? candidate : undefined;
}

function readInputImages(args: Record<string, unknown>): ReadImageInputImage[] {
  const structured = args['images'];
  if (Array.isArray(structured)) {
    return structured.flatMap((item) => {
      if (!isRecord(item)) return [];
      const path = readString(item['path']);
      const runtimePath = readString(item['runtimePath']);
      const runtimeKind = readRuntimeKind(item['runtimeKind']);
      const alias = readString(item['alias']);
      const aliasScope = readString(item['aliasScope']);
      const sourceDocumentId = readString(item['sourceDocumentId']);
      const entryPath = readString(item['entryPath']);
      const portableForTransfer = readBoolean(item['portableForTransfer']);
      const nonPortableReason = readString(item['nonPortableReason']);
      const label = readString(item['label']);
      const metadata = isRecord(item['metadata']) ? item['metadata'] : undefined;
      const resourceRef = stripDocumentArchiveCachePath(
        parseDocumentArchiveResourceRef(item['resourceRef']),
      );
      const cacheResourceRef = isResourceRef(item['cacheResourceRef'])
        ? item['cacheResourceRef']
        : undefined;
      return path
        ? [
            {
              path,
              ...(runtimePath ? { runtimePath } : {}),
              ...(runtimeKind ? { runtimeKind } : {}),
              ...(alias ? { alias } : {}),
              ...(aliasScope ? { aliasScope } : {}),
              ...(sourceDocumentId ? { sourceDocumentId } : {}),
              ...(entryPath ? { entryPath } : {}),
              ...(portableForTransfer !== undefined ? { portableForTransfer } : {}),
              ...(nonPortableReason ? { nonPortableReason } : {}),
              ...(label ? { label } : {}),
              ...(metadata ? { metadata } : {}),
              ...(resourceRef ? { resourceRef } : {}),
              ...(cacheResourceRef ? { cacheResourceRef } : {}),
            },
          ]
        : [];
    });
  }

  const paths = args['image_paths'];
  if (!Array.isArray(paths)) return [];
  return paths.flatMap((path) =>
    typeof path === 'string' && path.trim() ? [{ path: path.trim() }] : [],
  );
}

function stripDocumentArchiveCachePath(
  ref: DocumentArchiveResourceRef | undefined,
): DocumentArchiveResourceRef | undefined {
  if (!ref) return undefined;
  const { cachePath: _cachePath, ...stableRef } = ref;
  return stableRef;
}

function readMode(value: unknown): ReadImageMode {
  return value === 'vision' ? 'vision' : 'metadata';
}

function inferReadImageRuntimeKind(
  image: ReadImageInputImage,
): NonNullable<ReadImageResultImage['runtimeKind']> {
  if (image.runtimeKind) return image.runtimeKind;
  if (image.cacheResourceRef?.scope === 'project') return 'managed-cache';
  return 'local-path';
}

function formatDocumentImageAlias(resourceRef: DocumentArchiveResourceRef): string {
  if (resourceRef.locator?.kind === 'page') return `page_${resourceRef.locator.pageNumber}`;
  if (resourceRef.locator?.kind === 'slide') return `slide_${resourceRef.locator.slideNumber}`;
  if (resourceRef.locator?.kind === 'chapter' && resourceRef.locator.spineIndex !== undefined) {
    return `page_${resourceRef.locator.spineIndex + 1}`;
  }
  const entryMatch = /(?:^|[^\d])(\d{1,4})(?:[^\d]|$)/.exec(resourceRef.entryPath ?? '');
  return entryMatch?.[1] ? `page_${Number.parseInt(entryMatch[1], 10)}` : 'image_1';
}

function formatDocumentAliasScope(resourceRef: DocumentArchiveResourceRef): string {
  return `document:${formatDocumentSourceId(resourceRef)}`;
}

function formatDocumentSourceId(resourceRef: DocumentArchiveResourceRef): string {
  const source = resourceRef.source;
  return source.identity?.hash ?? source.identity?.fileId ?? source.fileId ?? source.filePath;
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

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function readRuntimeKind(
  value: unknown,
): NonNullable<ReadImageInputImage['runtimeKind']> | undefined {
  return value === 'local-path' ||
    value === 'webview-uri' ||
    value === 'scratch-cache' ||
    value === 'managed-cache'
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function createReadImagePerceptionCard(input: {
  readonly image: ReadImageResultImage;
  readonly loaded: LoadedImage;
  readonly createdAt: number;
  readonly index: number;
}): PerceptionCard {
  const mimeType =
    input.image.mimeType ??
    input.loaded.metadata.mimeType ??
    getMimeType(input.loaded.resolvedPath);
  const assetId = createReadImageAssetId(input.image, input.loaded.resolvedPath, input.index);
  const assetRef: PerceptualAssetRef = {
    assetId,
    uri: selectPerceptualAssetUri(input.image),
    mimeType,
    ...(input.image.label ? { label: input.image.label } : {}),
  };

  return {
    version: 1,
    assetId,
    modality: 'image',
    createdAt: input.createdAt,
    layerStatus: {
      layer0: 'complete',
      layer1: 'skipped',
      layer2: 'complete',
    },
    structural: {
      format: inferImageFormat(mimeType, input.loaded.resolvedPath),
      mimeType,
      byteSize: input.image.byteSize,
      ...(input.image.width !== undefined ? { width: input.image.width } : {}),
      ...(input.image.height !== undefined ? { height: input.image.height } : {}),
    },
    perceptual: {
      keyframeRefs: [assetRef],
      thumbnailRef: assetRef,
    },
    cacheKey: input.image.cacheResourceRef?.id ?? input.loaded.resolvedPath,
  };
}

function createReadImageAssetId(
  image: ReadImageResultImage,
  resolvedPath: string,
  index: number,
): string {
  const source = image.sourceDocumentId
    ? `${image.sourceDocumentId}-${image.entryPath ?? image.alias ?? index + 1}`
    : (image.alias ?? path.basename(resolvedPath) ?? `image-${index + 1}`);
  return `read-image-${sanitizeAssetIdPart(source)}`;
}

function sanitizeAssetIdPart(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'asset';
}

function selectPerceptualAssetUri(image: ReadImageResultImage): string {
  if (image.runtimeKind === 'webview-uri') {
    return image.path;
  }
  return image.path;
}

function inferImageFormat(mimeType: string, filePath: string): string {
  if (mimeType.startsWith('image/')) {
    return mimeType.slice('image/'.length);
  }
  const extension = path.extname(filePath).replace(/^\./, '');
  return extension || 'image';
}
