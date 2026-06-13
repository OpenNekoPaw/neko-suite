import type { ToolCall } from '@/components/types';
import type {
  DocumentArchiveResourceRef,
  DocumentLocator,
  DocumentSourceRef,
  ResourceRef,
} from '@neko/shared';
import {
  isResourceRef,
  parseDocumentArchiveResourceRef,
  parseDocumentLocator,
  parseDocumentSourceRef,
} from '@neko/shared';
import {
  AUDIO_GENERATION_TOOLS,
  FILE_TOOLS,
  IMAGE_GENERATION_TOOLS,
  VIDEO_GENERATION_TOOLS,
  getToolSummary,
} from '@neko-agent/types';
export {
  AUDIO_GENERATION_TOOLS,
  FILE_TOOLS,
  IMAGE_GENERATION_TOOLS,
  VIDEO_GENERATION_TOOLS,
  getToolSummary,
} from '@neko-agent/types';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'] as const;
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.avi', '.mkv'] as const;
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.aac', '.flac', '.m4a'] as const;

export interface DocumentImageThumbnailProjection {
  id: string;
  index: number;
  filePath: string;
  source?: DocumentSourceRef;
  path: string;
  src?: string;
  width?: number;
  height?: number;
  byteSize?: number;
  mimeType?: string;
  locator?: DocumentLocator;
  resourceRef?: DocumentArchiveResourceRef;
  cacheResourceRef?: ResourceRef;
  label: string;
  referenceJson: string;
}

export interface ToolCallDisplayProjection {
  argsJson: string;
  resultJson: string | null;
  hasExpandableContent: boolean;
  isBackgroundMode: boolean;
  backgroundTaskId?: string;
  shouldShowMediaPreview: boolean;
  isImageTool: boolean;
  imageUrls: string[];
  isVideoTool: boolean;
  videoUrls: string[];
  isAudioTool: boolean;
  audioUrls: string[];
  localPaths: string[];
  documentThumbnails: DocumentImageThumbnailProjection[];
  copyText: string | null;
  isFileTool: boolean;
  filePath: string | null;
  summary: string;
  isPending: boolean;
  isSuccess: boolean;
  isFailed: boolean;
  needsConfirmation: boolean;
}

export function projectToolCallDisplayState(toolCall: ToolCall): ToolCallDisplayProjection {
  const argsJson = JSON.stringify(toolCall.arguments, null, 2);
  const resultJson =
    toolCall.result?.data !== undefined ? JSON.stringify(toolCall.result.data, null, 2) : null;
  const resultData = asRecord(toolCall.result?.data);
  const isBackgroundMode = resultData?.backgroundMode === true;
  const backgroundTaskStatus = readString(resultData, 'status');
  const shouldShowMediaPreview = !isBackgroundMode || backgroundTaskStatus === 'completed';
  const resultSuccess = toolCall.result?.success === true;
  const documentThumbnails = extractToolDocumentThumbnails(
    toolCall.name,
    toolCall.arguments,
    resultSuccess ? toolCall.result?.data : undefined,
  );
  const copyText = resultSuccess ? extractToolCopyText(toolCall.name, toolCall.result?.data) : null;

  return {
    argsJson,
    resultJson,
    hasExpandableContent:
      Object.keys(toolCall.arguments).length > 0 || (resultJson !== null && resultJson.length > 0),
    isBackgroundMode,
    backgroundTaskId: isBackgroundMode ? readString(resultData, 'taskId') : undefined,
    shouldShowMediaPreview,
    isImageTool: isImageGenerationTool(toolCall.name),
    imageUrls:
      resultSuccess && shouldShowMediaPreview ? extractToolImageUrls(toolCall.result?.data) : [],
    isVideoTool: isVideoGenerationTool(toolCall.name),
    videoUrls:
      resultSuccess && shouldShowMediaPreview ? extractToolVideoUrls(toolCall.result?.data) : [],
    isAudioTool: isAudioGenerationTool(toolCall.name),
    audioUrls:
      resultSuccess && shouldShowMediaPreview ? extractToolAudioUrls(toolCall.result?.data) : [],
    localPaths: resultSuccess ? extractToolLocalPaths(toolCall.result?.data) : [],
    documentThumbnails,
    copyText,
    isFileTool: isFileTool(toolCall.name),
    filePath: extractToolFilePath(toolCall.arguments) || extractToolFilePath(toolCall.result?.data),
    summary: getToolSummary(toolCall.name, toolCall.arguments),
    isPending: !toolCall.result,
    isSuccess: resultSuccess,
    isFailed: toolCall.result?.success === false,
    needsConfirmation: toolCall.pendingConfirmation === true,
  };
}

export function extractDocumentImageThumbnails(data: unknown): DocumentImageThumbnailProjection[] {
  const result = asRecord(data);
  if (!result) return [];

  const filePath = extractDocumentFilePath(result);
  if (!filePath) return [];

  const source = parseDocumentSourceRef(result.source);
  const imageInfo = Array.isArray(result.imageInfo) ? result.imageInfo : [];
  const imagePaths = Array.isArray(result.imagePaths) ? result.imagePaths : [];
  const imagePathWebviewUris = Array.isArray(result.imagePathWebviewUris)
    ? result.imagePathWebviewUris
    : [];

  const thumbnails: DocumentImageThumbnailProjection[] = [];
  const maxLength = Math.max(imageInfo.length, imagePaths.length);
  for (let index = 0; index < maxLength; index += 1) {
    const info = asRecord(imageInfo[index]);
    const path = readString(info, 'path') ?? readStringFromArray(imagePaths, index);
    const src = readString(info, 'webviewUri') ?? readStringFromArray(imagePathWebviewUris, index);
    if (!path) continue;

    const locator = parseDocumentLocator(info?.locator);
    const width = readFiniteNumber(info, 'width');
    const height = readFiniteNumber(info, 'height');
    const byteSize = readFiniteNumber(info, 'byteSize');
    const mimeType = readString(info, 'mimeType');
    const resourceRef = parseDocumentArchiveResourceRef(info?.resourceRef);
    const cacheResourceRef = isResourceRef(info?.cacheResourceRef)
      ? info.cacheResourceRef
      : undefined;
    const documentFilePath = resolveDocumentThumbnailFilePath(filePath, resourceRef);
    const documentSource = resolveDocumentThumbnailSource(source, resourceRef);
    thumbnails.push({
      id: `${path}:${index}`,
      index,
      filePath: documentFilePath,
      ...(documentSource ? { source: documentSource } : {}),
      path,
      src,
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      ...(byteSize !== undefined ? { byteSize } : {}),
      ...(mimeType ? { mimeType } : {}),
      ...(locator ? { locator } : {}),
      ...(resourceRef ? { resourceRef } : {}),
      ...(cacheResourceRef ? { cacheResourceRef } : {}),
      label: formatDocumentThumbnailLabel(locator, index),
      referenceJson: formatDocumentImageReferenceJson({
        filePath: documentFilePath,
        source: documentSource,
        path,
        src,
        index,
        width,
        height,
        byteSize,
        mimeType,
        locator,
        resourceRef,
        cacheResourceRef,
      }),
    });
  }

  return thumbnails;
}

export function extractReadDocumentImageThumbnails(
  data: unknown,
): DocumentImageThumbnailProjection[] {
  const result = asRecord(data);
  if (!result) return [];

  const filePath = extractDocumentFilePath(result);
  if (!filePath) return [];

  const source = parseDocumentSourceRef(result.source);
  const images = Array.isArray(result.images) ? result.images : [];

  return images.flatMap((value, index) => {
    const image = asRecord(value);
    if (!image) return [];

    const documentImage = asRecord(image.documentImage);
    const metadata = asRecord(image.metadata);
    const path = readString(image, 'path') ?? readString(documentImage, 'path');
    const src = readString(image, 'webviewUri') ?? readString(documentImage, 'webviewUri');

    const locator =
      parseDocumentLocator(metadata?.locator) ?? parseDocumentLocator(documentImage?.locator);
    const width = readFiniteNumber(image, 'width') ?? readFiniteNumber(documentImage, 'width');
    const height = readFiniteNumber(image, 'height') ?? readFiniteNumber(documentImage, 'height');
    const byteSize =
      readFiniteNumber(image, 'byteSize') ?? readFiniteNumber(documentImage, 'byteSize');
    const mimeType = readString(image, 'mimeType') ?? readString(documentImage, 'mimeType');
    const resourceRef =
      parseDocumentArchiveResourceRef(documentImage?.resourceRef) ??
      parseDocumentArchiveResourceRef(image.resourceRef);
    const cacheResourceRef = isResourceRef(documentImage?.cacheResourceRef)
      ? documentImage.cacheResourceRef
      : isResourceRef(image.cacheResourceRef)
        ? image.cacheResourceRef
        : undefined;
    if (!path || (!src && !resourceRef && !cacheResourceRef)) return [];

    const documentFilePath = resolveDocumentThumbnailFilePath(filePath, resourceRef);
    const documentSource = resolveDocumentThumbnailSource(source, resourceRef);
    const label = readString(image, 'label') ?? formatDocumentThumbnailLabel(locator, index);

    return [
      {
        id: `${path}:${index}`,
        index,
        filePath: documentFilePath,
        ...(documentSource ? { source: documentSource } : {}),
        path,
        src,
        ...(width !== undefined ? { width } : {}),
        ...(height !== undefined ? { height } : {}),
        ...(byteSize !== undefined ? { byteSize } : {}),
        ...(mimeType ? { mimeType } : {}),
        ...(locator ? { locator } : {}),
        ...(resourceRef ? { resourceRef } : {}),
        ...(cacheResourceRef ? { cacheResourceRef } : {}),
        label,
        referenceJson: formatDocumentImageReferenceJson({
          filePath: documentFilePath,
          source: documentSource,
          path,
          src,
          index,
          width,
          height,
          byteSize,
          mimeType,
          locator,
          resourceRef,
          cacheResourceRef,
        }),
      },
    ];
  });
}

function extractReadImageThumbnails(data: unknown): DocumentImageThumbnailProjection[] {
  const result = asRecord(data);
  if (!result) return [];

  const filePath = extractDocumentFilePath(result);
  const source = parseDocumentSourceRef(result.source);
  const imagePathWebviewUris = readStringArray(result, 'imagePathWebviewUris');
  const snakeCaseImagePaths = readStringArray(result, 'image_paths');
  const imagePaths =
    snakeCaseImagePaths.length > 0 ? snakeCaseImagePaths : readStringArray(result, 'imagePaths');
  const locators = Array.isArray(result.locators) ? result.locators : [];
  const images = Array.isArray(result.images) ? result.images : [];

  if (images.length > 0) {
    return images.flatMap((value, index) => {
      const image = asRecord(value);
      if (!image) return [];

      const documentImage = asRecord(image.documentImage);
      const metadata = asRecord(image.metadata);
      const path =
        readString(image, 'path') ??
        readString(documentImage, 'path') ??
        readStringFromArray(imagePaths, index);
      const src =
        readString(image, 'webviewUri') ??
        readString(documentImage, 'webviewUri') ??
        readStringFromArray(imagePathWebviewUris, index) ??
        readRenderableImageSrc(path);

      const locator =
        parseDocumentLocator(metadata?.locator) ??
        parseDocumentLocator(documentImage?.locator) ??
        parseDocumentLocator(locators[index]);
      const width = readFiniteNumber(image, 'width') ?? readFiniteNumber(documentImage, 'width');
      const height = readFiniteNumber(image, 'height') ?? readFiniteNumber(documentImage, 'height');
      const byteSize =
        readFiniteNumber(image, 'byteSize') ?? readFiniteNumber(documentImage, 'byteSize');
      const mimeType = readString(image, 'mimeType') ?? readString(documentImage, 'mimeType');
      const resourceRef =
        parseDocumentArchiveResourceRef(documentImage?.resourceRef) ??
        parseDocumentArchiveResourceRef(image.resourceRef);
      const cacheResourceRef = isResourceRef(documentImage?.cacheResourceRef)
        ? documentImage.cacheResourceRef
        : isResourceRef(image.cacheResourceRef)
          ? image.cacheResourceRef
          : undefined;
      if (!path || (!src && !resourceRef && !cacheResourceRef)) return [];

      const thumbnailFilePath = resolveDocumentThumbnailFilePath(filePath ?? path, resourceRef);
      const thumbnailSource = resolveDocumentThumbnailSource(source, resourceRef);
      const label = readString(image, 'label') ?? formatDocumentThumbnailLabel(locator, index);

      return [
        {
          id: `${path}:${index}`,
          index,
          filePath: thumbnailFilePath,
          ...(thumbnailSource ? { source: thumbnailSource } : {}),
          path,
          src,
          ...(width !== undefined ? { width } : {}),
          ...(height !== undefined ? { height } : {}),
          ...(byteSize !== undefined ? { byteSize } : {}),
          ...(mimeType ? { mimeType } : {}),
          ...(locator ? { locator } : {}),
          ...(resourceRef ? { resourceRef } : {}),
          ...(cacheResourceRef ? { cacheResourceRef } : {}),
          label,
          referenceJson: formatDocumentImageReferenceJson({
            filePath: thumbnailFilePath,
            source: thumbnailSource,
            path,
            src,
            index,
            width,
            height,
            byteSize,
            mimeType,
            locator,
            resourceRef,
            cacheResourceRef,
          }),
        },
      ];
    });
  }

  return imagePaths.flatMap((path, index) => {
    const src = readStringFromArray(imagePathWebviewUris, index) ?? readRenderableImageSrc(path);
    if (!src) return [];

    const locator = parseDocumentLocator(locators[index]);
    const thumbnailFilePath = filePath ?? path;
    const label = formatDocumentThumbnailLabel(locator, index);

    return [
      {
        id: `${path}:${index}`,
        index,
        filePath: thumbnailFilePath,
        ...(source ? { source } : {}),
        path,
        src,
        ...(locator ? { locator } : {}),
        label,
        referenceJson: formatDocumentImageReferenceJson({
          filePath: thumbnailFilePath,
          source,
          path,
          src,
          index,
          locator,
        }),
      },
    ];
  });
}

function extractToolDocumentThumbnails(
  toolName: string,
  args: unknown,
  resultData: unknown,
): DocumentImageThumbnailProjection[] {
  if (toolName === 'ReadDocumentImage') {
    const resultThumbnails = resultData ? extractReadDocumentImageThumbnails(resultData) : [];
    return resultThumbnails.length > 0 ? resultThumbnails : extractReadImageThumbnails(args);
  }

  if (toolName === 'ReadImage') {
    const resultThumbnails = resultData ? extractReadImageThumbnails(resultData) : [];
    return resultThumbnails.length > 0 ? resultThumbnails : extractReadImageThumbnails(args);
  }

  return [];
}

function formatDocumentImageReferenceJson(input: {
  readonly filePath: string;
  readonly source?: DocumentSourceRef;
  readonly path: string;
  readonly src?: string;
  readonly index: number;
  readonly width?: number;
  readonly height?: number;
  readonly byteSize?: number;
  readonly mimeType?: string;
  readonly locator?: DocumentLocator;
  readonly resourceRef?: DocumentArchiveResourceRef;
  readonly cacheResourceRef?: ResourceRef;
}): string {
  return JSON.stringify(
    {
      kind: 'document-image-reference',
      document: {
        filePath: input.filePath,
        ...(input.source ? { source: input.source } : {}),
        ...(input.locator ? { locator: input.locator } : {}),
        ...(input.resourceRef ? { resourceRef: input.resourceRef } : {}),
        ...(input.cacheResourceRef ? { cacheResourceRef: input.cacheResourceRef } : {}),
      },
      image: {
        path: input.path,
        index: input.index,
        ...(input.src ? { webviewUri: input.src } : {}),
        ...(input.width !== undefined ? { width: input.width } : {}),
        ...(input.height !== undefined ? { height: input.height } : {}),
        ...(input.byteSize !== undefined ? { byteSize: input.byteSize } : {}),
        ...(input.mimeType ? { mimeType: input.mimeType } : {}),
        ...(input.resourceRef ? { resourceRef: input.resourceRef } : {}),
        ...(input.cacheResourceRef ? { cacheResourceRef: input.cacheResourceRef } : {}),
      },
    },
    null,
    2,
  );
}

export function extractToolFilePath(data: unknown): string | null {
  const obj = asRecord(data);
  if (!obj) return null;

  for (const field of ['path', 'filePath', 'file_path', 'file', 'filename']) {
    const value = obj[field];
    if (typeof value === 'string' && isFilePath(value)) {
      return value;
    }
  }
  return null;
}

export function extractToolImageUrls(data: unknown): string[] {
  return Array.from(collectUrls(data, 'imageUrl', 'images')).filter(isValidImageUrl);
}

export function extractToolVideoUrls(data: unknown): string[] {
  return Array.from(collectUrls(data, 'videoUrl', 'videos')).filter(isValidVideoUrl);
}

export function extractToolAudioUrls(data: unknown): string[] {
  return Array.from(collectUrls(data, 'audioUrl', 'audios')).filter(isValidAudioUrl);
}

export function extractToolLocalPaths(data: unknown): string[] {
  const result = asRecord(data);
  if (!result) return [];

  if (Array.isArray(result.localPaths)) {
    return result.localPaths.filter((path): path is string => typeof path === 'string');
  }

  const singlePath = extractToolLocalPath(data);
  if (singlePath) return [singlePath];

  if (Array.isArray(result.urls)) {
    return result.urls.filter(
      (url): url is string => typeof url === 'string' && isAbsolutePath(url),
    );
  }

  return [];
}

export function extractToolCopyText(toolName: string, data: unknown): string | null {
  if (toolName !== 'ReadDocument') return null;
  return formatReadDocumentCopyText(data);
}

export function isImageGenerationTool(toolName: string): boolean {
  return isOneOf(toolName, IMAGE_GENERATION_TOOLS);
}

export function isVideoGenerationTool(toolName: string): boolean {
  return isOneOf(toolName, VIDEO_GENERATION_TOOLS);
}

export function isAudioGenerationTool(toolName: string): boolean {
  return isOneOf(toolName, AUDIO_GENERATION_TOOLS);
}

export function isFileTool(toolName: string): boolean {
  return isOneOf(toolName, FILE_TOOLS);
}

function collectUrls(data: unknown, urlField: string, arrayField: string): Set<string> {
  const result = asRecord(data);
  const urlSet = new Set<string>();
  if (!result) return urlSet;

  if (typeof result.url === 'string') urlSet.add(result.url);
  if (typeof result[urlField] === 'string') urlSet.add(result[urlField]);
  if (Array.isArray(result.urls)) {
    for (const url of result.urls) {
      if (typeof url === 'string') urlSet.add(url);
    }
  }
  if (Array.isArray(result[arrayField])) {
    for (const item of result[arrayField]) {
      if (typeof item === 'string') {
        urlSet.add(item);
      } else {
        const record = asRecord(item);
        const url = readString(record, 'url');
        if (url) urlSet.add(url);
      }
    }
  }
  return urlSet;
}

function isValidImageUrl(url: string): boolean {
  return isValidMediaUrl(url, IMAGE_EXTENSIONS);
}

function isValidVideoUrl(url: string): boolean {
  return isValidMediaUrl(url, VIDEO_EXTENSIONS);
}

function isValidAudioUrl(url: string): boolean {
  return isValidMediaUrl(url, AUDIO_EXTENSIONS);
}

function isValidMediaUrl(url: string, extensions: readonly string[]): boolean {
  if (!url) return false;
  if (url.startsWith('http://') || url.startsWith('https://')) return true;
  if (url.includes('vscode-webview-resource://') || url.includes('vscode-resource')) return true;
  if (url.startsWith('webview://')) return true;
  if (url.startsWith('data:')) return true;
  if (isAbsolutePath(url)) {
    const lowerUrl = url.toLowerCase();
    return extensions.some((ext) => lowerUrl.endsWith(ext));
  }
  return false;
}

function extractToolLocalPath(data: unknown): string | undefined {
  const result = asRecord(data);
  if (!result) return undefined;
  const localPath = readString(result, 'localPath');
  if (localPath) return localPath;
  const url = readString(result, 'url');
  return url && isAbsolutePath(url) ? url : undefined;
}

function formatReadDocumentCopyText(data: unknown): string | null {
  const result = asRecord(data);
  if (!result) return null;

  const lines: string[] = [];
  const filePath = extractDocumentFilePath(result);
  if (filePath) lines.push(`Document: ${filePath}`);

  const locator = parseDocumentLocator(result.locator);
  if (locator) lines.push(`Location: ${formatDocumentLocator(locator)}`);

  const text = readString(result, 'text');
  if (text) lines.push(text);

  const thumbnails = extractDocumentImageThumbnails(data);
  if (thumbnails.length > 0) {
    lines.push(
      ...thumbnails.map((thumbnail) => {
        const dimensions = formatDimensions(thumbnail.width, thumbnail.height);
        const byteSize = formatByteSize(thumbnail.byteSize);
        return [thumbnail.label, dimensions, byteSize, thumbnail.path].filter(Boolean).join(' · ');
      }),
    );
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

function formatDocumentLocator(locator: DocumentLocator): string {
  switch (locator.kind) {
    case 'page':
      return `page:${locator.pageNumber}`;
    case 'region':
      return `page:${locator.pageNumber}:region`;
    case 'chapter':
      return locator.spineIndex !== undefined
        ? `chapter:${locator.chapterHref}@${locator.spineIndex}`
        : `chapter:${locator.chapterHref}`;
    case 'slide':
      return `slide:${locator.slideNumber}`;
    case 'text-range':
      if (locator.startLine !== undefined || locator.endLine !== undefined) {
        return `lines:${locator.startLine ?? '?'}-${locator.endLine ?? '?'}`;
      }
      return `chars:${locator.startChar ?? '?'}-${locator.endChar ?? '?'}`;
  }
}

function formatDimensions(width: number | undefined, height: number | undefined): string {
  return width !== undefined && height !== undefined ? `${width} x ${height}` : '';
}

function formatByteSize(byteSize: number | undefined): string {
  if (byteSize === undefined) return '';
  if (byteSize < 1024) return `${byteSize} B`;
  if (byteSize < 1024 * 1024) return `${Math.round(byteSize / 1024)} KB`;
  return `${(byteSize / 1024 / 1024).toFixed(1)} MB`;
}

function isFilePath(value: string): boolean {
  if (!value) return false;
  if (isAbsolutePath(value)) return true;
  return /\.\w{1,10}$/.test(value) && !value.includes('://');
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);
}

function readString(obj: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = obj?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readStringArray(obj: Record<string, unknown> | undefined, key: string): string[] {
  const value = obj?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function readStringFromArray(values: unknown[], index: number): string | undefined {
  const value = values[index];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readRenderableImageSrc(value: string | undefined): string | undefined {
  return value && isValidImageUrl(value) && !isAbsolutePath(value) ? value : undefined;
}

function readFiniteNumber(
  obj: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = obj?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

function extractDocumentFilePath(result: Record<string, unknown>): string | null {
  const source = asRecord(result.source);
  return (
    readString(result, 'filePath') ??
    readString(result, 'file_path') ??
    readString(source, 'filePath') ??
    readString(source, 'file_path') ??
    null
  );
}

function resolveDocumentThumbnailFilePath(
  defaultFilePath: string,
  resourceRef: DocumentArchiveResourceRef | undefined,
): string {
  return resourceRef?.source.filePath ?? defaultFilePath;
}

function resolveDocumentThumbnailSource(
  source: DocumentSourceRef | undefined,
  resourceRef: DocumentArchiveResourceRef | undefined,
): DocumentSourceRef | undefined {
  return resourceRef?.source ?? source;
}

function formatDocumentThumbnailLabel(locator: DocumentLocator | undefined, index: number): string {
  if (!locator) return `#${index + 1}`;
  if (locator.kind === 'page' || locator.kind === 'region') return `P${locator.pageNumber}`;
  if (locator.kind === 'chapter') {
    return locator.spineIndex !== undefined ? `C${locator.spineIndex + 1}` : `C${index + 1}`;
  }
  if (locator.kind === 'slide') return `S${locator.slideNumber}`;
  return `#${index + 1}`;
}

function isOneOf<T extends readonly string[]>(value: string, values: T): boolean {
  return values.includes(value as T[number]);
}
