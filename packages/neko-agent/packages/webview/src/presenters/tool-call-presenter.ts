import type { ToolCall } from '@/components/types';
import type { DocumentLocator, DocumentSourceRef } from '@neko/shared';
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
  src: string;
  width?: number;
  height?: number;
  byteSize?: number;
  mimeType?: string;
  locator?: DocumentLocator;
  label: string;
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
  const documentThumbnails =
    resultSuccess && toolCall.name === 'ReadDocument'
      ? extractDocumentImageThumbnails(toolCall.result?.data)
      : [];

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

  const source = asDocumentSourceRef(result.source);
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
    if (!path || !src) continue;

    const locator = asDocumentLocator(info?.locator);
    const width = readFiniteNumber(info, 'width');
    const height = readFiniteNumber(info, 'height');
    const byteSize = readFiniteNumber(info, 'byteSize');
    const mimeType = readString(info, 'mimeType');
    thumbnails.push({
      id: `${path}:${index}`,
      index,
      filePath,
      ...(source ? { source } : {}),
      path,
      src,
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      ...(byteSize !== undefined ? { byteSize } : {}),
      ...(mimeType ? { mimeType } : {}),
      ...(locator ? { locator } : {}),
      label: formatDocumentThumbnailLabel(locator, index),
    });
  }

  return thumbnails;
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

function readStringFromArray(values: unknown[], index: number): string | undefined {
  const value = values[index];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
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
  return readString(result, 'filePath') ?? readString(source, 'filePath') ?? null;
}

function asDocumentSourceRef(value: unknown): DocumentSourceRef | undefined {
  const source = asRecord(value);
  const filePath = readString(source, 'filePath');
  const format = readString(source, 'format');
  if (!filePath || !format) return undefined;
  return source as unknown as DocumentSourceRef;
}

function asDocumentLocator(value: unknown): DocumentLocator | undefined {
  const locator = asRecord(value);
  if (!locator || typeof locator.kind !== 'string') return undefined;
  return locator as unknown as DocumentLocator;
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
