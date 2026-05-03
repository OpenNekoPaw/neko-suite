/**
 * Task view projection for observable background work.
 *
 * Extension hosts should provide only environment adapters, such as converting
 * local file paths into webview-safe URIs. Display and routing rules live here.
 */

import type { Task, TaskStatus } from '@neko/shared';
import type { AgentBackgroundTask } from '@neko-agent/types';

export type BackgroundTaskViewType = 'image' | 'video' | 'audio';
export type BackgroundTaskViewStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface BackgroundTaskView {
  id: string;
  type: BackgroundTaskViewType;
  name: string;
  prompt: string;
  providerId: string;
  providerName: string;
  status: BackgroundTaskViewStatus;
  progress: number;
  createdAt: string;
  updatedAt: string;
  result?: AgentBackgroundTask['result'];
  error?: string;
}

export interface BackgroundTaskViewProjectorOptions {
  resolveLocalPath?: (path: string) => string | undefined;
}

export interface BackgroundTaskToolResultProjectionOptions {
  now?: () => number;
}

export interface BackgroundTaskProgressPatch {
  id: string;
  type?: BackgroundTaskViewType;
  status?: BackgroundTaskViewStatus;
  progress?: number;
  result?: AgentBackgroundTask['result'];
  error?: string;
  updatedAt?: string;
}

export interface BackgroundTaskFailureUpdateOptions extends BackgroundTaskViewProjectorOptions {
  now?: () => number;
}

export function getTaskConversationId(task: Task | undefined): string | undefined {
  const payload = task?.input.payload;
  const direct = getStringValue(payload, 'conversationId');
  if (direct) return direct;

  const request = isRecord(payload?.request) ? payload.request : undefined;
  const metadata = isRecord(request?.metadata) ? request.metadata : undefined;
  return getStringValue(metadata, 'conversationId');
}

export function matchesTaskConversation(task: Task, conversationId: string): boolean {
  return getTaskConversationId(task) === conversationId;
}

export function filterTasksForConversation(tasks: readonly Task[], conversationId: string): Task[] {
  return tasks.filter((task) => matchesTaskConversation(task, conversationId));
}

export function toBackgroundTaskView(
  task: Task,
  options: BackgroundTaskViewProjectorOptions = {},
): BackgroundTaskView {
  const payload = task.input.payload;
  const prompt = getStringValue(payload, 'prompt');

  return {
    id: task.id,
    type: toBackgroundTaskViewType(task),
    name: getDisplayName(task, payload, prompt),
    prompt: prompt ?? '',
    providerId: getStringValue(payload, 'providerId') ?? '',
    providerName: getStringValue(payload, 'providerName') ?? '',
    status: toBackgroundTaskViewStatus(task.status),
    progress: task.progress,
    createdAt: new Date(task.createdAt).toISOString(),
    updatedAt: new Date(task.updatedAt).toISOString(),
    result: projectTaskResult(task.output?.data, options),
    error: task.error,
  };
}

export function toBackgroundTaskViewType(task: Task): BackgroundTaskViewType {
  if (task.type === 'video_generation') return 'video';
  if (task.type === 'audio_generation') return 'audio';

  const typeHint = getStringValue(task.input.payload, 'type') ?? '';
  if (typeHint.includes('video')) return 'video';
  if (typeHint.includes('audio') || typeHint.includes('music')) return 'audio';
  return 'image';
}

export function toBackgroundTaskViewStatus(status: TaskStatus): BackgroundTaskViewStatus {
  switch (status) {
    case 'pending':
      return 'queued';
    case 'running':
      return 'processing';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
  }
}

export function getTaskResultUrl(task: Task | undefined): string | undefined {
  const data = task?.output?.data;
  if (!isRecord(data)) return undefined;

  const firstUrl = getStringArray(data, 'urls')[0];
  if (firstUrl) return firstUrl;

  return getStringValue(data, 'url');
}

export function createBackgroundTaskViewFromToolResultData(
  data: unknown,
  options: BackgroundTaskToolResultProjectionOptions = {},
): BackgroundTaskView | null {
  if (!isRecord(data) || data.backgroundMode !== true || typeof data.taskId !== 'string') {
    return null;
  }

  const type = toBackgroundTaskViewTypeHint(getStringValue(data, 'type'));
  const message = getStringValue(data, 'message') ?? '';
  const routedTo = isRecord(data.routedTo) ? data.routedTo : undefined;
  const provider = getStringValue(routedTo, 'provider');
  const timestamp = new Date(options.now?.() ?? Date.now()).toISOString();

  return {
    id: data.taskId,
    type,
    name: message.slice(0, 50) || `${type} generation`,
    prompt: message,
    providerId: provider ?? 'unknown',
    providerName: provider ?? 'AI Provider',
    status: 'queued',
    progress: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function mergeBackgroundTaskProgressView(
  task: BackgroundTaskView,
  progress: BackgroundTaskProgressPatch,
): BackgroundTaskView {
  if (progress.id !== task.id) {
    return task;
  }

  return {
    ...task,
    type: progress.type ?? task.type,
    status: progress.status ?? task.status,
    progress: progress.progress ?? task.progress,
    result: progress.result ?? task.result,
    error: progress.error ?? task.error,
    updatedAt: progress.updatedAt ?? task.updatedAt,
  };
}

export function buildBackgroundTaskFailureUpdateView(
  task: Task,
  error: unknown,
  options: BackgroundTaskFailureUpdateOptions = {},
): BackgroundTaskView {
  return {
    ...toBackgroundTaskView(task, options),
    status: 'failed',
    error: formatTaskFailureMessage(error),
    updatedAt: new Date(options.now?.() ?? Date.now()).toISOString(),
  };
}

function toBackgroundTaskViewTypeHint(typeHint: string | undefined): BackgroundTaskViewType {
  if (typeHint === 'video') return 'video';
  if (typeHint === 'audio') return 'audio';
  return 'image';
}

function getDisplayName(
  task: Task,
  payload: Record<string, unknown>,
  prompt: string | undefined,
): string {
  if (prompt && prompt.length > 0) {
    return prompt.length > 50 ? `${prompt.slice(0, 47)}...` : prompt;
  }

  const name = getStringValue(payload, 'name');
  if (name) return name;

  const content = getStringValue(payload, 'content');
  if (content) return content;

  return formatTaskType(task.type);
}

function projectTaskResult(
  resultData: unknown,
  options: BackgroundTaskViewProjectorOptions,
): AgentBackgroundTask['result'] | undefined {
  if (!isRecord(resultData)) return undefined;

  const localPaths = getStringArray(resultData, 'localPaths');
  const urls = localPaths
    .map((path) => resolveLocalPath(path, options.resolveLocalPath))
    .filter((url): url is string => typeof url === 'string' && url.length > 0);
  const persistedUrls = getStringArray(resultData, 'urls');
  const singleUrl = getStringValue(resultData, 'url');
  const outputUrls = urls.length > 0 ? urls : persistedUrls.length > 0 ? persistedUrls : [];
  if (singleUrl && outputUrls.length === 0) {
    outputUrls.push(singleUrl);
  }

  const thumbnailPath = localPaths[0];
  const resolvedThumbnailUrl =
    thumbnailPath !== undefined
      ? resolveLocalPath(thumbnailPath, options.resolveLocalPath)
      : undefined;
  const thumbnailUrl = resolvedThumbnailUrl ?? getStringValue(resultData, 'thumbnailUrl');
  const width = getNumberValue(resultData, 'width');
  const height = getNumberValue(resultData, 'height');
  const duration = getNumberValue(resultData, 'duration');
  const assets = getWebviewGeneratedAssets(resultData, 'assets');

  return {
    urls: outputUrls,
    ...(localPaths.length > 0 ? { localPaths } : {}),
    ...(thumbnailUrl !== undefined ? { thumbnailUrl } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(duration !== undefined ? { duration } : {}),
    ...(assets !== undefined ? { assets } : {}),
  };
}

function resolveLocalPath(
  path: string,
  resolveLocalPathFn: BackgroundTaskViewProjectorOptions['resolveLocalPath'],
): string | undefined {
  if (!resolveLocalPathFn) return undefined;

  try {
    return resolveLocalPathFn(path);
  } catch {
    return undefined;
  }
}

function formatTaskType(type: string): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatTaskFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Retry failed: ${message}`;
}

function getStringValue(
  record: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' ? value : undefined;
}

function getStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function getNumberValue(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' ? value : undefined;
}

function getWebviewGeneratedAssets(
  record: Record<string, unknown>,
  key: string,
): NonNullable<AgentBackgroundTask['result']>['assets'] | undefined {
  const value = record[key];
  if (!Array.isArray(value)) return undefined;

  const assets = value.filter(isWebviewGeneratedAsset);
  return assets.length > 0 ? assets : undefined;
}

function isWebviewGeneratedAsset(
  value: unknown,
): value is NonNullable<NonNullable<AgentBackgroundTask['result']>['assets']>[number] {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.type === 'string' &&
    typeof value.path === 'string' &&
    typeof value.mimeType === 'string' &&
    typeof value.generatedAt === 'string' &&
    typeof value.webviewUri === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
