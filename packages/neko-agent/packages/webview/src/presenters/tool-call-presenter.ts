import type { ToolCall } from '@/components/types';
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
    isFileTool: isFileTool(toolCall.name),
    filePath: extractToolFilePath(toolCall.arguments) || extractToolFilePath(toolCall.result?.data),
    summary: getToolSummary(toolCall.name, toolCall.arguments),
    isPending: !toolCall.result,
    isSuccess: resultSuccess,
    isFailed: toolCall.result?.success === false,
    needsConfirmation: toolCall.pendingConfirmation === true,
  };
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

function isOneOf<T extends readonly string[]>(value: string, values: T): boolean {
  return values.includes(value as T[number]);
}
