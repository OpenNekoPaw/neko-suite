/**
 * ImageCacheManager - 图片缓存管理器
 * 负责图片的加载、缓存和生命周期管理
 */

import type { ImageCacheEntry } from './types';
import {
  DEFAULT_IMAGE_CACHE_SIZE,
  MAX_IMAGE_FILE_SIZE,
} from './constants';

/**
 * 图片缓存管理器
 */
export class ImageCacheManager {
  private _cache = new Map<string, ImageCacheEntry>();
  private _maxSize: number;

  constructor(maxSize: number = DEFAULT_IMAGE_CACHE_SIZE) {
    this._maxSize = maxSize;
  }

  get size(): number {
    return this._cache.size;
  }

  /**
   * 获取缓存的图片
   */
  get(imageUrl: string): ImageCacheEntry | undefined {
    const cached = this._cache.get(imageUrl);
    if (cached) {
      cached.lastAccess = Date.now();
    }
    return cached;
  }

  /**
   * 加载并缓存图片
   */
  async load(imageUrl: string, resolvedUrl: string): Promise<ImageBitmap | null> {
    // Check cache first
    const cached = this.get(imageUrl);
    if (cached) {
      return createImageBitmap(cached.bitmap);
    }

    try {
      // Check file size with HEAD request
      const fileSize = await this._checkFileSize(resolvedUrl);
      if (fileSize && fileSize > MAX_IMAGE_FILE_SIZE) {
        console.warn(
          `[ImageCacheManager] Image too large (${(fileSize / 1024 / 1024).toFixed(1)}MB): ${imageUrl}`
        );
        return null;
      }

      // Load image
      const response = await fetch(resolvedUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);

      // Evict if needed
      if (this._cache.size >= this._maxSize) {
        this._evictOldest();
      }

      // Add to cache
      this._cache.set(imageUrl, {
        bitmap,
        url: imageUrl,
        lastAccess: Date.now(),
      });

      // Return clone to protect cached bitmap
      return createImageBitmap(bitmap);
    } catch (error) {
      console.error(`[ImageCacheManager] Error loading image ${imageUrl}:`, error);
      return null;
    }
  }

  /**
   * 检查文件大小
   */
  private async _checkFileSize(url: string): Promise<number | null> {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) {
        const contentLength = response.headers.get('content-length');
        if (contentLength) {
          return parseInt(contentLength, 10);
        }
      }
    } catch {
      // HEAD request failed
    }
    return null;
  }

  /**
   * 驱逐最旧的图片
   */
  private _evictOldest(): void {
    let oldestUrl: string | null = null;
    let oldestTime = Infinity;

    for (const [url, entry] of this._cache) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestUrl = url;
      }
    }

    if (oldestUrl) {
      const entry = this._cache.get(oldestUrl);
      if (entry) {
        entry.bitmap.close();
        this._cache.delete(oldestUrl);
      }
    }
  }

  /**
   * 清空缓存
   */
  clear(): void {
    for (const entry of this._cache.values()) {
      entry.bitmap.close();
    }
    this._cache.clear();
  }
}
