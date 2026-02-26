/**
 * Media Manager - Core media management
 */

import type {
  MediaItem,
  MediaType,
  MediaStatus,
  MediaMetadata,
  MediaDownloadOptions,
  ThumbnailOptions,
  MediaCacheConfig,
  IMediaManager,
} from '../types/media';
import {
  detectMediaType as detectAssetMediaType,
  isSubtitleFile,
} from '@neko/shared';

/**
 * Generate unique media ID
 */
function generateMediaId(): string {
  return `media_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Detect media type from source.
 * Maps unified AssetMediaType to neko-agent's MediaType (which includes 'subtitle').
 */
function detectMediaType(source: string): MediaType {
  // Check subtitle first (neko-agent-specific type)
  if (isSubtitleFile(source)) return 'subtitle';

  const assetType = detectAssetMediaType(source);
  if (assetType === 'video') return 'video';
  if (assetType === 'audio') return 'audio';
  if (assetType === 'image') return 'image';

  return 'video'; // Default for agent
}

/**
 * Extract filename from source
 */
function extractFilename(source: string): string {
  // Handle URLs
  try {
    const url = new URL(source);
    const pathname = url.pathname;
    return pathname.split('/').pop() || source;
  } catch {
    // Handle local paths
    return source.split(/[/\\]/).pop() || source;
  }
}

/**
 * Media download function type
 */
export type MediaDownloader = (
  source: string,
  destPath: string,
  options?: MediaDownloadOptions
) => Promise<void>;

/**
 * Thumbnail generator function type
 */
export type ThumbnailGenerator = (
  sourcePath: string,
  destPath: string,
  options?: ThumbnailOptions
) => Promise<void>;

/**
 * Metadata extractor function type
 */
export type MetadataExtractor = (sourcePath: string) => Promise<MediaMetadata>;

/**
 * File system interface for media operations
 */
export interface MediaFileSystem {
  /** Check if file exists */
  exists(path: string): Promise<boolean>;
  /** Create directory */
  mkdir(path: string): Promise<void>;
  /** Delete file */
  delete(path: string): Promise<void>;
  /** Get file size */
  getSize(path: string): Promise<number>;
  /** List files in directory */
  readdir(path: string): Promise<string[]>;
  /** Copy file */
  copy(source: string, dest: string): Promise<void>;
}

/**
 * Media manager configuration
 */
export interface MediaManagerConfig extends MediaCacheConfig {
  /** Custom downloader */
  downloader?: MediaDownloader;
  /** Custom thumbnail generator */
  thumbnailGenerator?: ThumbnailGenerator;
  /** Custom metadata extractor */
  metadataExtractor?: MetadataExtractor;
  /** File system interface */
  fileSystem?: MediaFileSystem;
}

/**
 * Default in-memory file system (for testing)
 */
class InMemoryFileSystem implements MediaFileSystem {
  private files = new Map<string, { size: number }>();

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async mkdir(_path: string): Promise<void> {
    // No-op for in-memory
  }

  async delete(path: string): Promise<void> {
    this.files.delete(path);
  }

  async getSize(path: string): Promise<number> {
    return this.files.get(path)?.size || 0;
  }

  async readdir(path: string): Promise<string[]> {
    const result: string[] = [];
    for (const key of this.files.keys()) {
      if (key.startsWith(path)) {
        result.push(key);
      }
    }
    return result;
  }

  async copy(source: string, dest: string): Promise<void> {
    const file = this.files.get(source);
    if (file) {
      this.files.set(dest, { ...file });
    }
  }

  // For testing
  addFile(path: string, size: number): void {
    this.files.set(path, { size });
  }
}

/**
 * Media Manager implementation
 */
export class MediaManager implements IMediaManager {
  private items = new Map<string, MediaItem>();
  private config: MediaManagerConfig;
  private fileSystem: MediaFileSystem;
  private downloader?: MediaDownloader;
  private thumbnailGenerator?: ThumbnailGenerator;
  private metadataExtractor?: MetadataExtractor;

  constructor(config: MediaManagerConfig) {
    this.config = config;
    this.fileSystem = config.fileSystem || new InMemoryFileSystem();
    this.downloader = config.downloader;
    this.thumbnailGenerator = config.thumbnailGenerator;
    this.metadataExtractor = config.metadataExtractor;
  }

  /**
   * Import media from URL or path
   */
  async import(source: string, options?: MediaDownloadOptions): Promise<MediaItem> {
    const id = generateMediaId();
    const name = extractFilename(source);
    const type = detectMediaType(source);

    // Create media item
    const item: MediaItem = {
      id,
      name,
      type,
      source,
      status: 'pending',
      createdAt: Date.now(),
    };

    this.items.set(id, item);

    // Check if source is local or remote
    const isRemote = source.startsWith('http://') || source.startsWith('https://');

    if (isRemote) {
      // Download remote media
      await this.downloadMedia(item, options);
    } else {
      // Copy local file to cache
      await this.cacheLocalMedia(item);
    }

    return this.items.get(id)!;
  }

  /**
   * Download remote media
   */
  private async downloadMedia(
    item: MediaItem,
    options?: MediaDownloadOptions
  ): Promise<void> {
    // Update status
    item.status = 'downloading';
    this.items.set(item.id, item);

    const destPath = `${this.config.cacheDir}/${item.id}/${item.name}`;

    try {
      // Ensure directory exists
      await this.fileSystem.mkdir(`${this.config.cacheDir}/${item.id}`);

      if (this.downloader) {
        await this.downloader(item.source, destPath, options);
      } else {
        // Simulate download for testing
        await this.simulateDownload(item.source, destPath, options);
      }

      // Update item with cached path
      item.cachedPath = destPath;
      item.status = 'cached';
      item.lastAccessedAt = Date.now();

      // Extract metadata if extractor available
      if (this.metadataExtractor) {
        try {
          item.metadata = await this.metadataExtractor(destPath);
        } catch {
          // Metadata extraction is optional
        }
      }

      this.items.set(item.id, item);
    } catch (error) {
      item.status = 'failed';
      item.error = error instanceof Error ? error.message : String(error);
      this.items.set(item.id, item);
      throw error;
    }
  }

  /**
   * Simulate download (for testing without real network)
   */
  private async simulateDownload(
    _source: string,
    destPath: string,
    options?: MediaDownloadOptions
  ): Promise<void> {
    // Simulate progress
    if (options?.onProgress) {
      for (let i = 0; i <= 100; i += 20) {
        options.onProgress(i / 100);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    // Add file to in-memory fs
    if (this.fileSystem instanceof InMemoryFileSystem) {
      this.fileSystem.addFile(destPath, 1024 * 1024); // 1MB simulated
    }
  }

  /**
   * Cache local media file
   */
  private async cacheLocalMedia(item: MediaItem): Promise<void> {
    const exists = await this.fileSystem.exists(item.source);

    if (!exists) {
      item.status = 'failed';
      item.error = 'Source file not found';
      this.items.set(item.id, item);
      throw new Error('Source file not found');
    }

    const destPath = `${this.config.cacheDir}/${item.id}/${item.name}`;

    try {
      await this.fileSystem.mkdir(`${this.config.cacheDir}/${item.id}`);
      await this.fileSystem.copy(item.source, destPath);

      item.cachedPath = destPath;
      item.status = 'cached';
      item.lastAccessedAt = Date.now();

      // Extract metadata if extractor available
      if (this.metadataExtractor) {
        try {
          item.metadata = await this.metadataExtractor(destPath);
        } catch {
          // Metadata extraction is optional
        }
      }

      this.items.set(item.id, item);
    } catch (error) {
      item.status = 'failed';
      item.error = error instanceof Error ? error.message : String(error);
      this.items.set(item.id, item);
      throw error;
    }
  }

  /**
   * Get media by ID
   */
  async get(id: string): Promise<MediaItem | undefined> {
    const item = this.items.get(id);
    if (item) {
      item.lastAccessedAt = Date.now();
      this.items.set(id, item);
    }
    return item;
  }

  /**
   * List all media items
   */
  async list(filter?: { type?: MediaType; status?: MediaStatus }): Promise<MediaItem[]> {
    let items = Array.from(this.items.values());

    if (filter?.type) {
      items = items.filter((item) => item.type === filter.type);
    }

    if (filter?.status) {
      items = items.filter((item) => item.status === filter.status);
    }

    return items;
  }

  /**
   * Delete media
   */
  async delete(id: string): Promise<boolean> {
    const item = this.items.get(id);
    if (!item) {
      return false;
    }

    // Delete cached file
    if (item.cachedPath) {
      try {
        await this.fileSystem.delete(item.cachedPath);
      } catch {
        // Ignore delete errors
      }
    }

    // Delete thumbnail
    if (item.thumbnailPath) {
      try {
        await this.fileSystem.delete(item.thumbnailPath);
      } catch {
        // Ignore delete errors
      }
    }

    this.items.delete(id);
    return true;
  }

  /**
   * Get or generate thumbnail
   */
  async getThumbnail(id: string, options?: ThumbnailOptions): Promise<string | undefined> {
    const item = this.items.get(id);
    if (!item || item.status !== 'cached' || !item.cachedPath) {
      return undefined;
    }

    // Return existing thumbnail if available
    if (item.thumbnailPath) {
      const exists = await this.fileSystem.exists(item.thumbnailPath);
      if (exists) {
        return item.thumbnailPath;
      }
    }

    // Generate thumbnail
    if (!this.thumbnailGenerator) {
      return undefined;
    }

    const format = options?.format || 'jpeg';
    const thumbnailPath = `${this.config.cacheDir}/${id}/thumbnail.${format}`;

    try {
      await this.thumbnailGenerator(item.cachedPath, thumbnailPath, options);
      item.thumbnailPath = thumbnailPath;
      this.items.set(id, item);
      return thumbnailPath;
    } catch {
      return undefined;
    }
  }

  /**
   * Get media metadata
   */
  async getMetadata(id: string): Promise<MediaMetadata | undefined> {
    const item = this.items.get(id);
    if (!item) {
      return undefined;
    }

    // Return cached metadata
    if (item.metadata) {
      return item.metadata;
    }

    // Extract metadata if possible
    if (this.metadataExtractor && item.cachedPath) {
      try {
        item.metadata = await this.metadataExtractor(item.cachedPath);
        this.items.set(id, item);
        return item.metadata;
      } catch {
        return undefined;
      }
    }

    return undefined;
  }

  /**
   * Clear cache
   */
  async clearCache(): Promise<void> {
    for (const item of this.items.values()) {
      if (item.cachedPath) {
        try {
          await this.fileSystem.delete(item.cachedPath);
        } catch {
          // Ignore errors
        }
      }
      if (item.thumbnailPath) {
        try {
          await this.fileSystem.delete(item.thumbnailPath);
        } catch {
          // Ignore errors
        }
      }
    }
    this.items.clear();
  }

  /**
   * Get cache stats
   */
  async getCacheStats(): Promise<{ size: number; count: number }> {
    let totalSize = 0;
    let count = 0;

    for (const item of this.items.values()) {
      if (item.cachedPath && item.status === 'cached') {
        try {
          const size = await this.fileSystem.getSize(item.cachedPath);
          totalSize += size;
          count++;
        } catch {
          // Ignore errors
        }
      }
    }

    return { size: totalSize, count };
  }

  /**
   * Run cache cleanup based on maxSize and maxAge
   */
  async cleanup(): Promise<number> {
    const { maxSize, maxAge } = this.config;
    let freedSpace = 0;
    const now = Date.now();

    // Get all cached items sorted by last access time
    const cachedItems = Array.from(this.items.values())
      .filter((item) => item.status === 'cached' && item.cachedPath)
      .sort((a, b) => (a.lastAccessedAt || 0) - (b.lastAccessedAt || 0));

    // Remove expired items
    if (maxAge) {
      for (const item of cachedItems) {
        const age = now - (item.lastAccessedAt || item.createdAt);
        if (age > maxAge) {
          const size = item.cachedPath
            ? await this.fileSystem.getSize(item.cachedPath).catch(() => 0)
            : 0;
          await this.delete(item.id);
          freedSpace += size;
        }
      }
    }

    // Remove oldest items if over max size
    if (maxSize) {
      const stats = await this.getCacheStats();
      let currentSize = stats.size;

      for (const item of cachedItems) {
        if (currentSize <= maxSize) break;
        if (!this.items.has(item.id)) continue; // Already deleted

        const size = item.cachedPath
          ? await this.fileSystem.getSize(item.cachedPath).catch(() => 0)
          : 0;
        await this.delete(item.id);
        currentSize -= size;
        freedSpace += size;
      }
    }

    return freedSpace;
  }
}
