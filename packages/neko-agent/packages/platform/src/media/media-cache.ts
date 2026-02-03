/**
 * Media Cache - Download and caching utilities with retry support
 */

import type { MediaDownloadOptions } from '../types/media';
import type { RetryPolicy, BackoffStrategy } from '../types/error';
import { PlatformError } from '../provider/platform-error';
import { executeWithRetry, type RetryExecutorOptions } from '../provider/retry-executor';

/**
 * HTTP downloader options
 */
export interface HttpDownloaderOptions {
  /** Request timeout in ms */
  timeout?: number;
  /** Max retries */
  maxRetries?: number;
  /** Custom fetch function (for testing) */
  fetch?: typeof globalThis.fetch;
}

/**
 * Download result
 */
export interface DownloadResult {
  /** Downloaded content as Buffer or ArrayBuffer */
  content: ArrayBuffer;
  /** Content type from response */
  contentType?: string;
  /** Content length */
  contentLength: number;
}

/**
 * Create HTTP downloader with retry support
 */
export function createHttpDownloader(options: HttpDownloaderOptions = {}) {
  const {
    timeout = 60000,
    maxRetries = 3,
    fetch: fetchFn = globalThis.fetch,
  } = options;

  return async function download(
    url: string,
    downloadOptions?: MediaDownloadOptions
  ): Promise<DownloadResult> {
    const backoffStrategy: BackoffStrategy = {
      type: 'exponential',
      initialDelayMs: 1000,
      multiplier: 2,
      maxDelayMs: 30000,
    };

    const retryPolicy: RetryPolicy = {
      maxRetries,
      backoffStrategy,
      retryableCategories: ['timeout', 'rate_limit', 'server', 'network'],
    };

    const retryOptions: RetryExecutorOptions = {
      retryPolicy,
      timeoutPolicy: {
        requestTimeout: downloadOptions?.timeout || timeout,
      },
    };

    return executeWithRetry(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        downloadOptions?.timeout || timeout
      );

      try {
        const response = await fetchFn(url, {
          method: 'GET',
          headers: downloadOptions?.headers,
          signal: controller.signal,
        });

        if (!response.ok) {
          throw createDownloadError(response.status, url);
        }

        const contentType = response.headers.get('content-type') || undefined;
        const contentLengthHeader = response.headers.get('content-length');
        const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;

        // Stream with progress if callback provided
        if (downloadOptions?.onProgress && response.body && contentLength > 0) {
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let received = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            chunks.push(value);
            received += value.length;
            downloadOptions.onProgress(received / contentLength);
          }

          // Combine chunks
          const content = new Uint8Array(received);
          let offset = 0;
          for (const chunk of chunks) {
            content.set(chunk, offset);
            offset += chunk.length;
          }

          return {
            content: content.buffer,
            contentType,
            contentLength: received,
          };
        }

        // Simple download without progress
        const content = await response.arrayBuffer();
        downloadOptions?.onProgress?.(1);

        return {
          content,
          contentType,
          contentLength: content.byteLength,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    }, retryOptions);
  };
}

/**
 * Create download error based on HTTP status
 */
function createDownloadError(status: number, url: string): PlatformError {
  switch (status) {
    case 401:
    case 403:
      return new PlatformError({
        message: `Access denied for ${url}`,
        category: 'authentication',
        code: 'ACCESS_DENIED',
        retryable: false,
      });
    case 404:
      return new PlatformError({
        message: `Resource not found: ${url}`,
        category: 'not_found',
        code: 'NOT_FOUND',
        retryable: false,
      });
    case 429:
      return new PlatformError({
        message: `Rate limited for ${url}`,
        category: 'rate_limit',
        code: 'RATE_LIMITED',
        retryable: true,
      });
    case 500:
    case 502:
    case 503:
    case 504:
      return new PlatformError({
        message: `Server error for ${url}: ${status}`,
        category: 'server',
        code: 'SERVER_ERROR',
        retryable: true,
      });
    default:
      return new PlatformError({
        message: `Download failed for ${url}: HTTP ${status}`,
        category: 'network',
        code: 'DOWNLOAD_FAILED',
        retryable: status >= 500,
      });
  }
}

/**
 * Cache entry metadata
 */
export interface CacheEntry {
  /** Original URL */
  url: string;
  /** Local path */
  path: string;
  /** Content type */
  contentType?: string;
  /** Size in bytes */
  size: number;
  /** Cache timestamp */
  cachedAt: number;
  /** Last accessed timestamp */
  accessedAt: number;
  /** Expiry timestamp (optional) */
  expiresAt?: number;
}

/**
 * Cache storage interface
 */
export interface CacheStorage {
  /** Get cache entry by URL */
  get(url: string): Promise<CacheEntry | undefined>;
  /** Set cache entry */
  set(url: string, entry: CacheEntry): Promise<void>;
  /** Delete cache entry */
  delete(url: string): Promise<boolean>;
  /** List all entries */
  list(): Promise<CacheEntry[]>;
  /** Clear all entries */
  clear(): Promise<void>;
}

/**
 * In-memory cache storage (for testing)
 */
export class InMemoryCacheStorage implements CacheStorage {
  private entries = new Map<string, CacheEntry>();

  async get(url: string): Promise<CacheEntry | undefined> {
    const entry = this.entries.get(url);
    if (entry) {
      entry.accessedAt = Date.now();
    }
    return entry;
  }

  async set(url: string, entry: CacheEntry): Promise<void> {
    this.entries.set(url, entry);
  }

  async delete(url: string): Promise<boolean> {
    return this.entries.delete(url);
  }

  async list(): Promise<CacheEntry[]> {
    return Array.from(this.entries.values());
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }
}

/**
 * Media cache with LRU eviction
 */
export class MediaCache {
  private storage: CacheStorage;
  private maxSize: number;
  private maxAge: number;

  constructor(options: {
    storage?: CacheStorage;
    maxSize?: number;
    maxAge?: number;
  } = {}) {
    this.storage = options.storage || new InMemoryCacheStorage();
    this.maxSize = options.maxSize || 1024 * 1024 * 1024; // 1GB default
    this.maxAge = options.maxAge || 7 * 24 * 60 * 60 * 1000; // 7 days default
  }

  /**
   * Check if URL is cached and valid
   */
  async has(url: string): Promise<boolean> {
    const entry = await this.storage.get(url);
    if (!entry) return false;

    // Check expiry
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      await this.storage.delete(url);
      return false;
    }

    // Check max age
    if (Date.now() - entry.cachedAt > this.maxAge) {
      await this.storage.delete(url);
      return false;
    }

    return true;
  }

  /**
   * Get cached entry
   */
  async get(url: string): Promise<CacheEntry | undefined> {
    if (await this.has(url)) {
      return this.storage.get(url);
    }
    return undefined;
  }

  /**
   * Add entry to cache
   */
  async set(url: string, entry: Omit<CacheEntry, 'url' | 'cachedAt' | 'accessedAt'>): Promise<void> {
    const now = Date.now();
    await this.storage.set(url, {
      ...entry,
      url,
      cachedAt: now,
      accessedAt: now,
    });

    // Trigger cleanup if needed
    await this.maybeCleanup();
  }

  /**
   * Remove entry from cache
   */
  async delete(url: string): Promise<boolean> {
    return this.storage.delete(url);
  }

  /**
   * Clear entire cache
   */
  async clear(): Promise<void> {
    await this.storage.clear();
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ count: number; size: number }> {
    const entries = await this.storage.list();
    const size = entries.reduce((sum, e) => sum + e.size, 0);
    return { count: entries.length, size };
  }

  /**
   * Run cleanup if cache is over limit
   */
  private async maybeCleanup(): Promise<void> {
    const stats = await this.getStats();
    if (stats.size <= this.maxSize) return;

    // Get entries sorted by last access (LRU)
    const entries = await this.storage.list();
    entries.sort((a, b) => a.accessedAt - b.accessedAt);

    let currentSize = stats.size;
    for (const entry of entries) {
      if (currentSize <= this.maxSize * 0.8) break; // Clean to 80%

      await this.storage.delete(entry.url);
      currentSize -= entry.size;
    }
  }
}
