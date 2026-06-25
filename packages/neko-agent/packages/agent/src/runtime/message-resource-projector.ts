import type { Message, ToolCall } from '@neko-agent/types';

const MEDIA_FILE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.svg',
  '.mp4',
  '.webm',
  '.mov',
  '.avi',
  '.mkv',
  '.mp3',
  '.wav',
  '.ogg',
  '.aac',
  '.flac',
  '.m4a',
] as const;

const SINGLE_URL_KEYS = new Set(['url', 'uri', 'thumbnailUrl', 'imageUrl', 'videoUrl', 'audioUrl']);
const LOCAL_MEDIA_PATH_KEYS = new Set(['path']);
const LOCAL_MEDIA_PATH_ARRAY_WEBVIEW_URI_KEYS: ReadonlyMap<string, string> = new Map([
  ['imagePaths', 'imagePathWebviewUris'],
  ['image_paths', 'imagePathWebviewUris'],
]);

export interface MessageResourceProjectionOptions {
  resolveLocalMediaPath?: (path: string) => string | undefined;
}

export interface MessageResourceUpdateResult {
  messages: Message[];
  updated: boolean;
}

export function isLocalMediaFilePath(value: string): boolean {
  if (!isAbsolutePath(value)) return false;

  const normalized = value.toLowerCase();
  return MEDIA_FILE_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

export function projectMessagesForResourceDisplay(
  messages: readonly Message[],
  options: MessageResourceProjectionOptions = {},
): Message[] {
  return messages.map((message) => projectMessageForResourceDisplay(message, options));
}

export function projectMessageForResourceDisplay(
  message: Message,
  options: MessageResourceProjectionOptions = {},
): Message {
  const projectedMessage = { ...message } as Message & { toolCalls?: ToolCall[] };

  if (hasToolCallArray(message)) {
    projectedMessage.toolCalls = message.toolCalls.map((toolCall) =>
      projectToolCallForResourceDisplay(toolCall, options),
    );
  }

  if (message.contentBlocks && message.contentBlocks.length > 0) {
    projectedMessage.contentBlocks = message.contentBlocks.map((block) => {
      const toolCall = block.type === 'tool_call' ? block.toolCall : undefined;
      if (!toolCall) {
        return block;
      }

      return {
        ...block,
        toolCall: projectToolCallForResourceDisplay(toolCall, options),
      };
    });
  }

  return projectedMessage;
}

function hasToolCallArray(message: Message): message is Message & { toolCalls: ToolCall[] } {
  const value = (message as { toolCalls?: unknown }).toolCalls;
  return Array.isArray(value);
}

function projectToolCallForResourceDisplay(
  toolCall: ToolCall,
  options: MessageResourceProjectionOptions,
): ToolCall {
  const projectedArguments = projectResourceValue(toolCall.arguments, options);
  const projectedResultData = toolCall.result?.data
    ? projectResourceValue(toolCall.result.data, options)
    : undefined;
  const projectedResultAttachments = toolCall.result?.attachments
    ? projectResourceValue(toolCall.result.attachments, options)
    : undefined;
  const projectedResultPerceptionCards = toolCall.result?.perceptionCards
    ? projectResourceValue(toolCall.result.perceptionCards, options)
    : undefined;
  const hasProjectedResult =
    projectedResultData !== undefined ||
    projectedResultAttachments !== undefined ||
    projectedResultPerceptionCards !== undefined;

  return {
    ...toolCall,
    arguments: isRecord(projectedArguments) ? projectedArguments : toolCall.arguments,
    ...(hasProjectedResult && toolCall.result
      ? {
          result: {
            ...toolCall.result,
            ...(projectedResultData !== undefined ? { data: projectedResultData } : {}),
            ...(projectedResultAttachments !== undefined
              ? {
                  attachments: projectedResultAttachments as typeof toolCall.result.attachments,
                }
              : {}),
            ...(projectedResultPerceptionCards !== undefined
              ? {
                  perceptionCards:
                    projectedResultPerceptionCards as typeof toolCall.result.perceptionCards,
                }
              : {}),
          },
        }
      : {}),
  };
}

export function projectResourceValue(
  value: unknown,
  options: MessageResourceProjectionOptions = {},
): unknown {
  return projectResourceValueInternal(value, options, new WeakSet<object>());
}

export function updateBackgroundTaskToolResultUrls(
  messages: readonly Message[],
  taskId: string,
  urls: readonly string[],
): MessageResourceUpdateResult {
  let updated = false;

  const nextMessages = messages.map((message) => {
    if (!message.contentBlocks) return message;

    const projectedMessage = { ...message };

    if (message.contentBlocks) {
      projectedMessage.contentBlocks = message.contentBlocks.map((block) => {
        if (block.type !== 'tool_call' || !block.toolCall) {
          return block;
        }

        const result = block.toolCall.result;
        if (!result || !isMatchingBackgroundTaskData(result.data, taskId)) {
          return block;
        }

        updated = true;
        return {
          ...block,
          toolCall: {
            ...block.toolCall,
            result: {
              ...result,
              data: completeBackgroundTaskData(result.data, urls),
            },
          },
        };
      });
    }

    return projectedMessage;
  });

  return { messages: nextMessages, updated };
}

function projectResourceValueInternal(
  value: unknown,
  options: MessageResourceProjectionOptions,
  visited: WeakSet<object>,
): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return isLocalMediaFilePath(value) ? resolveLocalMediaPath(value, options) : value;
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const projected = projectResourceValueInternal(item, options, visited);
      return projected === undefined ? [] : [projected];
    });
  }

  if (typeof value !== 'object') return value;

  if (visited.has(value)) return value;
  visited.add(value);

  const projected: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (isRuntimeOnlyLocalPathKey(key)) {
      projected[key] = item;
      continue;
    }

    if (LOCAL_MEDIA_PATH_KEYS.has(key) && typeof item === 'string' && isLocalMediaFilePath(item)) {
      const resolved = resolveLocalMediaPath(item, options);
      projected[key] = item;
      if (resolved && !projected['webviewUri']) {
        projected['webviewUri'] = resolved;
      } else if (!resolved) {
        appendProjectionDiagnostic(projected, item, key);
      }
      continue;
    }

    const webviewUriArrayKey = LOCAL_MEDIA_PATH_ARRAY_WEBVIEW_URI_KEYS.get(key);
    if (webviewUriArrayKey && Array.isArray(item)) {
      let hasLocalMediaPath = false;
      let hasResolvedWebviewUri = false;
      const webviewUris = item.map((path) => {
        if (typeof path === 'string' && isLocalMediaFilePath(path)) {
          hasLocalMediaPath = true;
          const resolved = resolveLocalMediaPath(path, options);
          if (resolved) {
            hasResolvedWebviewUri = true;
          } else {
            appendProjectionDiagnostic(projected, path, key);
          }
          return resolved;
        }
        return undefined;
      });
      projected[key] = [...item];
      if (
        hasLocalMediaPath &&
        hasResolvedWebviewUri &&
        !Object.prototype.hasOwnProperty.call(value, webviewUriArrayKey) &&
        !projected[webviewUriArrayKey]
      ) {
        projected[webviewUriArrayKey] = webviewUris;
      }
      continue;
    }

    if (SINGLE_URL_KEYS.has(key) && typeof item === 'string' && isLocalMediaFilePath(item)) {
      const resolved = resolveLocalMediaPath(item, options);
      if (resolved) {
        projected[key] = resolved;
        if (!projected['localPath']) {
          projected['localPath'] = item;
        }
      } else {
        appendProjectionDiagnostic(projected, item, key);
      }
      continue;
    }

    if (key === 'urls' && Array.isArray(item)) {
      const localPaths: string[] = [];
      projected[key] = item.flatMap((url) => {
        if (typeof url === 'string' && isLocalMediaFilePath(url)) {
          localPaths.push(url);
          const resolved = resolveLocalMediaPath(url, options);
          if (!resolved) appendProjectionDiagnostic(projected, url, key);
          return resolved ? [resolved] : [];
        }
        return [url];
      });
      if (localPaths.length > 0 && !projected['localPaths']) {
        projected['localPaths'] = localPaths;
      }
      continue;
    }

    projected[key] = projectResourceValueInternal(item, options, visited);
  }

  return projected;
}

function isRuntimeOnlyLocalPathKey(key: string): boolean {
  return (
    key === 'localPath' ||
    key === 'localPaths' ||
    key === 'runtimePath' ||
    key === 'runtimeImagePaths' ||
    key === 'cachePath'
  );
}

function appendProjectionDiagnostic(
  projected: Record<string, unknown>,
  source: string,
  field: string,
): void {
  const diagnostics = Array.isArray(projected['resourceProjectionDiagnostics'])
    ? [...projected['resourceProjectionDiagnostics']]
    : [];
  diagnostics.push({
    code: 'resource-projection-denied',
    severity: 'error',
    field,
    source,
    message:
      'Local media path could not be projected for Webview display. Use ResourceRef, source refs, workspace-relative paths, or managed resource cache output.',
  });
  projected['resourceProjectionDiagnostics'] = diagnostics;
}

function resolveLocalMediaPath(
  path: string,
  options: MessageResourceProjectionOptions,
): string | undefined {
  try {
    return options.resolveLocalMediaPath?.(path);
  } catch {
    return undefined;
  }
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);
}

function isMatchingBackgroundTaskData(
  data: unknown,
  taskId: string,
): data is Record<string, unknown> {
  return isRecord(data) && data.taskId === taskId && data.backgroundMode === true;
}

function completeBackgroundTaskData(
  data: Record<string, unknown>,
  urls: readonly string[],
): Record<string, unknown> {
  return {
    ...data,
    status: 'completed',
    url: urls[0],
    urls,
    localPath: urls[0],
    localPaths: urls,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
