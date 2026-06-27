import type {
  PerceptionCard,
  ToolResultArtifactTransfer,
  ToolResultAttachment,
} from '@neko/shared';

export interface SanitizableToolResult {
  readonly data?: unknown;
  readonly attachments?: readonly ToolResultAttachment[];
  readonly perceptionCards?: readonly PerceptionCard[];
  readonly artifacts?: readonly ToolResultArtifactTransfer[];
}

export interface SanitizedToolResultFields {
  readonly data?: unknown;
  readonly attachments?: readonly ToolResultAttachment[];
  readonly perceptionCards?: readonly PerceptionCard[];
  readonly artifacts?: readonly ToolResultArtifactTransfer[];
}

export function sanitizeToolCallArgumentsForHistory(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized = sanitizeToolCallArgumentValueInternal(value, new WeakSet<object>());
  return isRecord(sanitized) ? sanitized : {};
}

export function sanitizeToolResultFieldsForHistory(
  result: SanitizableToolResult,
): SanitizedToolResultFields {
  return {
    data: sanitizeToolResultValueForHistory(result.data),
    attachments: sanitizeToolResultValueForHistory(result.attachments) as
      | readonly ToolResultAttachment[]
      | undefined,
    perceptionCards: sanitizeToolResultValueForHistory(result.perceptionCards) as
      | readonly PerceptionCard[]
      | undefined,
    artifacts: sanitizeToolResultValueForHistory(result.artifacts) as
      | readonly ToolResultArtifactTransfer[]
      | undefined,
  };
}

export function sanitizeToolResultValueForHistory(value: unknown): unknown {
  return sanitizeToolResultValueInternal(value, new WeakSet<object>());
}

function sanitizeToolCallArgumentValueInternal(value: unknown, visited: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return shouldHideRuntimePathString(value) ? undefined : value;
  }
  if (typeof value !== 'object') return value;
  if (visited.has(value)) return undefined;
  visited.add(value);

  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const sanitized = sanitizeToolCallArgumentValueInternal(item, visited);
      return sanitized === undefined ? [] : [sanitized];
    });
  }

  const record = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) {
    if (isToolCallHiddenRuntimeKey(key)) {
      continue;
    }
    const next = sanitizeToolCallArgumentValueInternal(item, visited);
    if (next !== undefined) {
      sanitized[key] = next;
    }
  }
  return sanitized;
}

function sanitizeToolResultValueInternal(value: unknown, visited: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return shouldHideRuntimePathString(value) ? undefined : value;
  }
  if (typeof value !== 'object') return value;
  if (visited.has(value)) return undefined;
  visited.add(value);

  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const sanitized = sanitizeToolResultValueInternal(item, visited);
      return sanitized === undefined ? [] : [sanitized];
    });
  }

  const record = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) {
    if (isHistoryHiddenPathKey(key)) {
      continue;
    }
    if (key === 'uri' && typeof item === 'string' && shouldHideUri(item, record)) {
      continue;
    }
    const next = sanitizeToolResultValueInternal(item, visited);
    if (next !== undefined) {
      sanitized[key] = next;
    }
  }
  return sanitized;
}

function isToolCallHiddenRuntimeKey(key: string): boolean {
  return (
    key === 'cachePath' ||
    key === 'cacheResourceRef' ||
    key === 'runtimePath' ||
    key === 'runtimeImagePaths' ||
    key === 'runtimeKind' ||
    key === 'webviewUri' ||
    key === 'webviewUris' ||
    key === 'imagePathWebviewUris'
  );
}

function isHistoryHiddenPathKey(key: string): boolean {
  return (
    key === 'path' ||
    key === 'paths' ||
    key === 'imagePath' ||
    key === 'imagePaths' ||
    key === 'image_paths' ||
    key === 'runtimePath' ||
    key === 'runtimeImagePaths' ||
    key === 'runtimeKind' ||
    key === 'cachePath' ||
    key === 'cacheResourceRef' ||
    key === 'localPath' ||
    key === 'localPaths' ||
    key === 'webviewUri' ||
    key === 'webviewUris' ||
    key === 'imagePathWebviewUris'
  );
}

function shouldHideUri(uri: string, owner: Record<string, unknown>): boolean {
  if (uri.startsWith('data:') || uri.startsWith('http://') || uri.startsWith('https://')) {
    return false;
  }
  return (
    owner['resourceRef'] !== undefined ||
    owner['documentResourceRef'] !== undefined ||
    shouldHideRuntimePathString(uri)
  );
}

function shouldHideRuntimePathString(value: string): boolean {
  const normalized = value.replace(/\\/g, '/').toLowerCase();
  return (
    normalized.includes('/.neko/.cache/') ||
    normalized.startsWith('.neko/.cache/') ||
    normalized.includes('/document-image-cache/') ||
    normalized.includes('/document-reader/') ||
    normalized.includes('/neko_epub_')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
