/**
 * Media Library Search Service
 *
 * Provides full-text search across all configured media libraries.
 * Builds an in-memory file index on first search, then filters from cache.
 * Index is invalidated when library settings change.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { isMediaFile, isDocumentFile, detectMediaType, type AssetMediaType } from '@neko/shared';
import type { MediaFileMetadata } from '@neko/shared';
import type { MediaLibrarySettingsService } from './MediaLibrarySettingsService';
import type { MediaMetadataCache } from './MediaMetadataCache';
import { getLogger } from '../utils/logger';

const logger = getLogger('MediaLibrarySearch');

const MAX_RESULTS = 50;

// =============================================================================
// Types
// =============================================================================

export interface MediaSearchResult {
  /** Absolute file path */
  filePath: string;
  /** File name (basename) */
  fileName: string;
  /** Library display name */
  libraryName: string;
  /** Detected media type */
  mediaType: AssetMediaType;
  /** Cached metadata (if available, not extracted on-demand) */
  metadata?: MediaFileMetadata;
}

interface IndexEntry {
  filePath: string;
  fileName: string;
  fileNameLower: string;
  libraryName: string;
}

// =============================================================================
// Implementation
// =============================================================================

export class MediaLibrarySearchService {
  /** Indexed file list per library root path */
  private fileIndex: IndexEntry[] | null = null;

  constructor(
    private readonly settingsService: MediaLibrarySettingsService,
    private readonly metadataCache: MediaMetadataCache,
  ) {
    // Invalidate index when libraries change
    settingsService.onDidChange(() => {
      this.fileIndex = null;
    });
  }

  /**
   * Search media files across all libraries by file name.
   *
   * First call builds the file index (recursive directory walk).
   * Subsequent calls filter from cached index.
   */
  async search(keyword: string): Promise<MediaSearchResult[]> {
    if (!this.fileIndex) {
      this.fileIndex = await this.buildIndex();
    }

    const lower = keyword.toLowerCase();
    const results: MediaSearchResult[] = [];

    for (const entry of this.fileIndex) {
      if (!entry.fileNameLower.includes(lower)) continue;

      const metadata = await this.metadataCache.get(entry.filePath);

      results.push({
        filePath: entry.filePath,
        fileName: entry.fileName,
        libraryName: entry.libraryName,
        mediaType: detectMediaType(entry.filePath),
        metadata: metadata ?? undefined,
      });

      if (results.length >= MAX_RESULTS) break;
    }

    return results;
  }

  /**
   * Clear the file index (forces rebuild on next search).
   */
  invalidateIndex(): void {
    this.fileIndex = null;
  }

  // =========================================================================
  // Private
  // =========================================================================

  private async buildIndex(): Promise<IndexEntry[]> {
    const libraries = await this.settingsService.getResolvedLibraries();
    const entries: IndexEntry[] = [];

    for (const lib of libraries) {
      if (!lib.enabled || !lib.accessible) continue;

      try {
        await this.walkDirectory(lib.resolvedPath, lib.name, entries);
      } catch (error) {
        logger.debug(`Failed to index library ${lib.name}:`, error);
      }
    }

    logger.info(
      `Built search index: ${entries.length} files across ${libraries.filter((l) => l.enabled && l.accessible).length} libraries`,
    );
    return entries;
  }

  private async walkDirectory(
    dirPath: string,
    libraryName: string,
    entries: IndexEntry[],
  ): Promise<void> {
    let names: string[];
    try {
      names = await fs.readdir(dirPath);
    } catch {
      return; // Skip inaccessible directories
    }

    for (const name of names) {
      if (name.startsWith('.')) continue; // Skip hidden

      const fullPath = path.join(dirPath, name);

      let stat;
      try {
        stat = await fs.stat(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        await this.walkDirectory(fullPath, libraryName, entries);
      } else if (stat.isFile() && (isMediaFile(name) || isDocumentFile(name))) {
        entries.push({
          filePath: fullPath,
          fileName: name,
          fileNameLower: name.toLowerCase(),
          libraryName,
        });
      }
    }
  }
}
