import type { WebviewGeneratedAsset } from '@neko/shared';
import {
  buildMediaTaskCreativeEntityContext,
  type MediaTaskCreativeEntityContext,
} from './media-task-creative-entity';
import type { MediaGenerationType, MediaOutput, MediaTask, MediaTaskStatus } from './types';

export type MediaBackgroundTaskType = 'image' | 'video' | 'audio';
export type MediaBackgroundTaskStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export function toMediaBackgroundTaskType(type: MediaGenerationType): MediaBackgroundTaskType {
  switch (type) {
    case 'text-to-video':
    case 'image-to-video':
    case 'video-to-video':
    case 'video-edit':
      return 'video';
    case 'text-to-audio':
    case 'text-to-music':
      return 'audio';
    case 'text-to-image':
    case 'image-to-image':
    case 'image-edit':
    case 'workflow':
      return 'image';
  }
}

export function toMediaBackgroundTaskStatus(status: MediaTaskStatus): MediaBackgroundTaskStatus {
  return status === 'pending' ? 'queued' : status;
}

export function filterLocalMediaPaths(urls: readonly string[]): string[] {
  return urls.filter((url) => url.startsWith('/') || /^[A-Za-z]:[\\/]/.test(url));
}

export function getMediaTaskConversationId(task: MediaTask | undefined): string | undefined {
  const value = task?.request.metadata?.conversationId;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function matchesMediaTaskConversation(
  task: MediaTask | undefined,
  conversationId: string,
): boolean {
  return getMediaTaskConversationId(task) === conversationId;
}

export interface MediaTaskActionCandidate {
  id: string;
  conversationId?: string;
  resultUrl?: string;
  creativeEntity?: MediaTaskCreativeEntityContext;
}

export function createMediaTaskActionCandidate(
  task: MediaTask | null | undefined,
): MediaTaskActionCandidate | null {
  if (!task) return null;

  const conversationId = getMediaTaskConversationId(task);
  const resultUrl = task.outputs?.find((output) => output.url.length > 0)?.url;
  const creativeEntity = buildMediaTaskCreativeEntityContext({ task });
  return {
    id: task.id,
    ...(conversationId ? { conversationId } : {}),
    ...(resultUrl ? { resultUrl } : {}),
    ...(creativeEntity ? { creativeEntity } : {}),
  };
}

export interface MediaTaskProgressViewInput {
  task: MediaTask;
  urls?: readonly string[];
  thumbnailUrl?: string;
  localPaths?: readonly string[];
  assets?: readonly WebviewGeneratedAsset[];
  creativeEntity?: MediaTaskCreativeEntityContext;
  now?: () => Date;
}

export interface MediaTaskProgressView {
  id: string;
  type: MediaBackgroundTaskType;
  status: MediaBackgroundTaskStatus;
  progress: number;
  result?: {
    urls: string[];
    thumbnailUrl?: string;
    localPaths?: string[];
    assets?: WebviewGeneratedAsset[];
    creativeEntity?: MediaTaskCreativeEntityContext;
  };
  error?: string;
  updatedAt: string;
}

export interface MediaTaskOutputView {
  url: string;
  width?: number;
  height?: number;
  duration?: number;
  thumbnailUrl?: string;
}

export interface MediaTaskResultView {
  urls: string[];
  localPaths?: string[];
  thumbnailUrl?: string;
  assets?: WebviewGeneratedAsset[];
  creativeEntity?: MediaTaskCreativeEntityContext;
}

export interface MediaTaskViewOptions {
  urls?: readonly string[];
  thumbnailUrl?: string;
  localPaths?: readonly string[];
  assets?: readonly WebviewGeneratedAsset[];
  creativeEntity?: MediaTaskCreativeEntityContext;
}

export interface MediaTaskView {
  id: string;
  type: MediaBackgroundTaskType;
  status: MediaBackgroundTaskStatus;
  progress: number;
  providerId: string;
  modelId: string;
  createdAt: string;
  updatedAt: string;
  outputs?: MediaTaskOutputView[];
  result?: MediaTaskResultView;
  error?: {
    code: string;
    message: string;
  };
  request: {
    prompt: string;
  };
}

export function createMediaTaskView(
  task: MediaTask,
  options: MediaTaskViewOptions = {},
): MediaTaskView {
  const outputs = task.outputs
    ?.map(toMediaTaskOutputView)
    .filter((output) => output.url.length > 0);
  const result = createMediaTaskResultView(task, options);

  return {
    id: task.id,
    type: toMediaBackgroundTaskType(task.type),
    status: toMediaBackgroundTaskStatus(task.status),
    progress: task.progress,
    providerId: task.providerId ?? '',
    modelId: task.modelId ?? '',
    createdAt: toIsoString(task.createdAt),
    updatedAt: toIsoString(task.updatedAt),
    ...(outputs && outputs.length > 0 ? { outputs } : {}),
    ...(result ? { result } : {}),
    ...(task.error
      ? {
          error: {
            code: task.error.code,
            message: task.error.message,
          },
        }
      : {}),
    request: {
      prompt: task.request?.prompt ?? '',
    },
  };
}

function createMediaTaskResultView(
  task: MediaTask,
  options: MediaTaskViewOptions,
): MediaTaskResultView | undefined {
  const urls = options.urls?.filter((url) => url.length > 0) ?? [];
  const localPaths = options.localPaths?.filter((filePath) => filePath.length > 0) ?? [];
  const assets = options.assets ?? [];
  const creativeEntity =
    options.creativeEntity ??
    buildMediaTaskCreativeEntityContext({
      task,
      assets,
    });

  if (urls.length === 0 && !creativeEntity) return undefined;

  return {
    urls: [...urls],
    ...(options.thumbnailUrl ? { thumbnailUrl: options.thumbnailUrl } : {}),
    ...(localPaths.length > 0 ? { localPaths: [...localPaths] } : {}),
    ...(assets.length > 0 ? { assets: [...assets] } : {}),
    ...(creativeEntity ? { creativeEntity } : {}),
  };
}

export function createMediaTaskProgressView(
  input: MediaTaskProgressViewInput,
): MediaTaskProgressView {
  const urls = input.urls?.filter((url) => url.length > 0) ?? [];
  const localPaths = input.localPaths?.filter((filePath) => filePath.length > 0) ?? [];
  const assets = input.assets ?? [];
  const creativeEntity =
    input.creativeEntity ??
    buildMediaTaskCreativeEntityContext({
      task: input.task,
      assets,
    });

  return {
    id: input.task.id,
    type: toMediaBackgroundTaskType(input.task.type),
    status: toMediaBackgroundTaskStatus(input.task.status),
    progress: input.task.progress,
    result:
      urls.length > 0 || creativeEntity
        ? {
            urls: [...urls],
            ...(input.thumbnailUrl ? { thumbnailUrl: input.thumbnailUrl } : {}),
            ...(localPaths.length > 0 ? { localPaths: [...localPaths] } : {}),
            ...(assets.length > 0 ? { assets: [...assets] } : {}),
            ...(creativeEntity ? { creativeEntity } : {}),
          }
        : undefined,
    error: input.task.error?.message,
    updatedAt: (input.now?.() ?? new Date()).toISOString(),
  };
}

function toMediaTaskOutputView(output: MediaOutput): MediaTaskOutputView {
  return {
    url: output.url,
    ...(output.width !== undefined ? { width: output.width } : {}),
    ...(output.height !== undefined ? { height: output.height } : {}),
    ...(output.duration !== undefined ? { duration: output.duration } : {}),
    ...(output.thumbnailUrl ? { thumbnailUrl: output.thumbnailUrl } : {}),
  };
}

function toIsoString(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}
