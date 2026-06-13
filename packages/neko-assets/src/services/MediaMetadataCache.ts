/**
 * Media Metadata Cache
 *
 * Persists media file metadata to disk so that engine probe is not
 * required on every VSCode restart. Uses PathResolver for portable
 * cache keys that survive project relocation and machine changes.
 *
 * Cache key strategy:
 * - External library files: ${FOOTAGE}/scene01/clip.mp4 (variable path)
 * - Project files: relative path from workspace root
 *
 * Invalidation: mtime-based — if fs.stat().mtimeMs differs, entry is stale.
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PathResolver, type MediaFileMetadata } from '@neko/shared';
import { getLogger } from '../utils/logger';

const logger = getLogger('MediaMetadataCache');

const FLUSH_DEBOUNCE_MS = 2000;

// =============================================================================
// Types
// =============================================================================

interface CacheEntry {
  metadata: MediaFileMetadata;
  /** File modification time in ms (for invalidation) */
  mtime: number;
}

interface CacheData {
  version: 1;
  entries: Record<string, CacheEntry>;
}

// =============================================================================
// Implementation
// =============================================================================

export class MediaMetadataCache implements vscode.Disposable {
  private entries = new Map<string, CacheEntry>();
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly cachePath: string,
    private readonly pathResolver: PathResolver,
  ) {}

  /**
   * Load cache data from disk.
   */
  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.cachePath, 'utf-8');
      const data: unknown = JSON.parse(content);
      if (this.isValidCacheData(data)) {
        for (const [key, entry] of Object.entries(data.entries)) {
          this.entries.set(key, entry);
        }
        logger.info(`Loaded ${this.entries.size} cached metadata entries`);
      }
    } catch {
      // File doesn't exist or is invalid — start fresh
      logger.debug('No existing metadata cache, starting fresh');
    }
  }

  /**
   * Get cached metadata for a file.
   *
   * Returns null if:
   * - No cache entry exists
   * - File mtime has changed (stale)
   * - File is not accessible
   */
  async get(filePath: string): Promise<MediaFileMetadata | null> {
    const key = this.toKey(filePath);
    const entry = this.entries.get(key);
    if (!entry) return null;

    try {
      const stat = await fs.stat(filePath);
      if (Math.abs(stat.mtimeMs - entry.mtime) < 1) {
        return entry.metadata;
      }
      // mtime changed — stale
      this.entries.delete(key);
      this.markDirty();
      return null;
    } catch {
      // File not accessible — don't delete entry (may come back online)
      return null;
    }
  }

  /**
   * Store metadata for a file.
   */
  async set(filePath: string, metadata: MediaFileMetadata): Promise<void> {
    const key = this.toKey(filePath);

    try {
      const stat = await fs.stat(filePath);
      this.entries.set(key, { metadata, mtime: stat.mtimeMs });
      this.markDirty();
    } catch {
      // Can't stat — don't cache
    }
  }

  /**
   * Flush pending changes to disk.
   */
  async flush(): Promise<void> {
    if (!this.dirty) return;

    try {
      const dir = path.dirname(this.cachePath);
      await fs.mkdir(dir, { recursive: true });

      const data: CacheData = {
        version: 1,
        entries: Object.fromEntries(this.entries),
      };
      await fs.writeFile(this.cachePath, JSON.stringify(data), 'utf-8');
      this.dirty = false;
      logger.debug(`Flushed ${this.entries.size} metadata entries to disk`);
    } catch (error) {
      logger.error('Failed to flush metadata cache:', error);
    }
  }

  dispose(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    // Synchronous best-effort flush — fire and forget
    if (this.dirty) {
      void this.flush();
    }
  }

  // =========================================================================
  // Private
  // =========================================================================

  /**
   * Convert absolute file path to portable cache key.
   * Uses PathResolver.contract() to replace absolute prefixes with ${VAR}.
   */
  private toKey(filePath: string): string {
    return this.pathResolver.contract(filePath);
  }

  private markDirty(): void {
    this.dirty = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    this.flushTimer = setTimeout(() => {
      void this.flush();
    }, FLUSH_DEBOUNCE_MS);
  }

  private isValidCacheData(data: unknown): data is CacheData {
    if (typeof data !== 'object' || data === null) return false;
    const d = data as Record<string, unknown>;
    return d['version'] === 1 && typeof d['entries'] === 'object' && d['entries'] !== null;
  }
}
