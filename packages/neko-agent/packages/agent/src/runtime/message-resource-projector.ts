import type { Message } from '@neko-agent/types';

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

const SINGLE_URL_KEYS = new Set(['url', 'thumbnailUrl', 'imageUrl', 'videoUrl', 'audioUrl']);

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
  const projectedMessage = { ...message };

  if (message.toolCalls && message.toolCalls.length > 0) {
    projectedMessage.toolCalls = message.toolCalls.map((toolCall) => {
      if (!toolCall.result?.data) return toolCall;

      return {
        ...toolCall,
        result: {
          ...toolCall.result,
          data: projectResourceValue(toolCall.result.data, options),
        },
      };
    });
  }

  if (message.contentBlocks && message.contentBlocks.length > 0) {
    projectedMessage.contentBlocks = message.contentBlocks.map((block) => {
      if (block.type !== 'tool_call' || !block.toolCall?.result?.data) {
        return block;
      }

      return {
        ...block,
        toolCall: {
          ...block.toolCall,
          result: {
            ...block.toolCall.result,
            data: projectResourceValue(block.toolCall.result.data, options),
          },
        },
      };
    });
  }

  return projectedMessage;
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
    if (!message.toolCalls && !message.contentBlocks) return message;

    const projectedMessage = { ...message };

    if (message.toolCalls) {
      projectedMessage.toolCalls = message.toolCalls.map((toolCall) => {
        if (!toolCall.result?.data || !isMatchingBackgroundTaskData(toolCall.result.data, taskId)) {
          return toolCall;
        }

        updated = true;
        return {
          ...toolCall,
          result: {
            ...toolCall.result,
            data: completeBackgroundTaskData(toolCall.result.data, urls),
          },
        };
      });
    }

    if (message.contentBlocks) {
      projectedMessage.contentBlocks = message.contentBlocks.map((block) => {
        const data = block.toolCall?.result?.data;
        if (block.type !== 'tool_call' || !data || !isMatchingBackgroundTaskData(data, taskId)) {
          return block;
        }

        updated = true;
        return {
          ...block,
          toolCall: {
            ...block.toolCall,
            result: {
              ...block.toolCall.result,
              data: completeBackgroundTaskData(data, urls),
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
    return value.map((item) => projectResourceValueInternal(item, options, visited));
  }

  if (typeof value !== 'object') return value;

  if (visited.has(value)) return value;
  visited.add(value);

  const projected: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'localPath' || key === 'localPaths') {
      projected[key] = item;
      continue;
    }

    if (SINGLE_URL_KEYS.has(key) && typeof item === 'string' && isLocalMediaFilePath(item)) {
      projected[key] = resolveLocalMediaPath(item, options);
      if (!projected['localPath']) {
        projected['localPath'] = item;
      }
      continue;
    }

    if (key === 'urls' && Array.isArray(item)) {
      const localPaths: string[] = [];
      projected[key] = item.map((url) => {
        if (typeof url === 'string' && isLocalMediaFilePath(url)) {
          localPaths.push(url);
          return resolveLocalMediaPath(url, options);
        }
        return url;
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

function resolveLocalMediaPath(path: string, options: MessageResourceProjectionOptions): string {
  try {
    return options.resolveLocalMediaPath?.(path) ?? path;
  } catch {
    return path;
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
