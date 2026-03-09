/**
 * Media URL extraction utilities for tool call results
 * Pure functions for extracting image/video/audio URLs and file paths from tool data
 */

// Valid extensions for media types
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.aac', '.flac', '.m4a'];

/**
 * Check if a URL is valid for display in webview
 */
function isValidMediaUrl(url: string, extensions: string[]): boolean {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('http://') || url.startsWith('https://')) return true;
  if (url.includes('vscode-webview-resource://') || url.includes('vscode-resource')) return true;
  if (url.startsWith('data:')) return true;
  if (url.startsWith('/') || /^[A-Za-z]:[\\/]/.test(url)) {
    const lowerUrl = url.toLowerCase();
    return extensions.some((ext) => lowerUrl.endsWith(ext));
  }
  return false;
}

export function isValidImageUrl(url: string): boolean {
  return isValidMediaUrl(url, IMAGE_EXTENSIONS);
}

export function isValidVideoUrl(url: string): boolean {
  return isValidMediaUrl(url, VIDEO_EXTENSIONS);
}

export function isValidAudioUrl(url: string): boolean {
  return isValidMediaUrl(url, AUDIO_EXTENSIONS);
}

/**
 * Check if a string is a valid file path
 */
export function isFilePath(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  if (str.startsWith('/') || /^[A-Za-z]:\\/.test(str)) return true;
  if (/\.\w{1,10}$/.test(str) && !str.includes('://')) return true;
  return false;
}

/**
 * Extract file path from tool arguments or results
 */
export function extractFilePath(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  const pathFields = ['path', 'filePath', 'file_path', 'file', 'filename'];
  for (const field of pathFields) {
    const value = obj[field];
    if (typeof value === 'string' && isFilePath(value)) {
      return value;
    }
  }
  return null;
}

/** Helper to collect URLs from common result fields */
function collectUrls(data: unknown, urlField: string, arrayField: string): Set<string> {
  if (!data || typeof data !== 'object') return new Set();
  const result = data as Record<string, unknown>;
  const urlSet = new Set<string>();

  if (typeof result.url === 'string') urlSet.add(result.url);
  if (typeof result[urlField] === 'string') urlSet.add(result[urlField] as string);
  if (Array.isArray(result.urls)) {
    for (const u of result.urls) {
      if (typeof u === 'string') urlSet.add(u);
    }
  }
  if (Array.isArray(result[arrayField])) {
    for (const item of result[arrayField] as unknown[]) {
      if (typeof item === 'string') urlSet.add(item);
      else if (
        item &&
        typeof item === 'object' &&
        typeof (item as Record<string, unknown>).url === 'string'
      ) {
        urlSet.add((item as Record<string, unknown>).url as string);
      }
    }
  }
  return urlSet;
}

export function extractImageUrls(data: unknown): string[] {
  return Array.from(collectUrls(data, 'imageUrl', 'images')).filter(isValidImageUrl);
}

export function extractVideoUrls(data: unknown): string[] {
  return Array.from(collectUrls(data, 'videoUrl', 'videos')).filter(isValidVideoUrl);
}

export function extractAudioUrls(data: unknown): string[] {
  return Array.from(collectUrls(data, 'audioUrl', 'audios')).filter(isValidAudioUrl);
}

/** Extract local path from result data (preserved during webview URI conversion) */
function extractLocalPath(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const result = data as Record<string, unknown>;
  if (typeof result.localPath === 'string') return result.localPath;
  if (typeof result.url === 'string') {
    const url = result.url;
    if (url.startsWith('/') || /^[A-Za-z]:[\\/]/.test(url)) return url;
  }
  return undefined;
}

/** Extract local paths array from result data */
export function extractLocalPaths(data: unknown): string[] {
  if (!data || typeof data !== 'object') return [];
  const result = data as Record<string, unknown>;

  if (Array.isArray(result.localPaths)) {
    return result.localPaths.filter((p): p is string => typeof p === 'string');
  }

  const singlePath = extractLocalPath(data);
  if (singlePath) return [singlePath];

  if (Array.isArray(result.urls)) {
    return result.urls.filter((u): u is string => {
      if (typeof u !== 'string') return false;
      return u.startsWith('/') || /^[A-Za-z]:[\\/]/.test(u);
    });
  }

  return [];
}
