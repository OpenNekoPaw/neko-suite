/**
 * Media Library Search Service
 *
 * Provides search across all configured media libraries with:
 * - L0 persistent file index (FileSystemWatcher-driven incremental updates)
 * - Type filtering (video/audio/image/document/text)
 * - Configurable result limit (default 200, up from 50)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { isMediaFile, isDocumentFile, detectMediaType, type AssetMediaType } from '@neko/shared';
import type { MediaFileMetadata } from '@neko/shared';
import type { MediaLibrarySettingsService } from './MediaLibrarySettingsService';
import type { MediaMetadataCache } from './MediaMetadataCache';
import { getLogger } from '../utils/logger';

const logger = getLogger('MediaLibrarySearch');

const MAX_RESULTS = 200;
const INDEX_VERSION = 1;

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

export interface SearchOptions {
  /** Filter by media type(s). If empty or undefined, match all types. */
  types?: AssetMediaType[];
  /** Maximum results to return (default MAX_RESULTS) */
  limit?: number;
}

interface IndexEntry {
  filePath: string;
  fileName: string;
  fileNameLower: string;
  libraryName: string;
  mediaType: AssetMediaType;
}

interface PersistedIndex {
  version: number;
  updatedAt: string;
  entries: Array<{
    filePath: string;
    fileName: string;
    libraryName: string;
    mediaType: AssetMediaType;
  }>;
}

// =============================================================================
// Implementation
// =============================================================================

export class MediaLibrarySearchService implements vscode.Disposable {
  private fileIndex: IndexEntry[] | null = null;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly watchers = new Map<string, vscode.FileSystemWatcher>();
  private rebuildTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly settingsService: MediaLibrarySettingsService,
    private readonly metadataCache: MediaMetadataCache,
    private readonly indexPath?: string,
  ) {
    // Invalidate index when libraries change
    this.disposables.push(
      settingsService.onDidChange(() => {
        this.fileIndex = null;
        this.disposeWatchers();
      }),
    );
  }

  dispose(): void {
    this.disposeWatchers();
    this.disposables.forEach((d) => d.dispose());
    if (this.rebuildTimer) clearTimeout(this.rebuildTimer);
  }

  /**
   * Search media files across all libraries by file name.
   *
   * On first call, attempts to load persisted index from disk.
   * Falls back to full directory walk if persisted index is missing.
   */
  async search(keyword: string, options?: SearchOptions): Promise<MediaSearchResult[]> {
    if (!this.fileIndex) {
      this.fileIndex = await this.loadOrBuildIndex();
      this.setupWatchers();
    }

    const lower = keyword.toLowerCase();
    const typeFilter = options?.types?.length ? new Set(options.types) : null;
    const limit = options?.limit ?? MAX_RESULTS;
    const results: MediaSearchResult[] = [];

    for (const entry of this.fileIndex) {
      if (!entry.fileNameLower.includes(lower)) continue;
      if (typeFilter && !typeFilter.has(entry.mediaType)) continue;

      const metadata = await this.metadataCache.get(entry.filePath);

      results.push({
        filePath: entry.filePath,
        fileName: entry.fileName,
        libraryName: entry.libraryName,
        mediaType: entry.mediaType,
        metadata: metadata ?? undefined,
      });

      if (results.length >= limit) break;
    }

    return results;
  }

  /**
   * Clear the file index (forces rebuild on next search).
   */
  invalidateIndex(): void {
    this.fileIndex = null;
  }

  /**
   * Get count of indexed files (for diagnostics).
   */
  get indexSize(): number {
    return this.fileIndex?.length ?? 0;
  }

  // =========================================================================
  // Persistent index (L0)
  // =========================================================================

  private async loadOrBuildIndex(): Promise<IndexEntry[]> {
    // Try loading persisted index first
    if (this.indexPath) {
      try {
        const raw = await fs.readFile(this.indexPath, 'utf-8');
        const data: PersistedIndex = JSON.parse(raw);
        if (data.version === INDEX_VERSION && Array.isArray(data.entries)) {
          logger.info(`Loaded persisted search index: ${data.entries.length} entries`);
          return data.entries.map((e) => ({
            ...e,
            fileNameLower: e.fileName.toLowerCase(),
          }));
        }
      } catch {
        // Index missing or corrupt — rebuild
      }
    }

    return this.buildAndPersistIndex();
  }

  private async buildAndPersistIndex(): Promise<IndexEntry[]> {
    const entries = await this.buildIndex();

    // Persist to disk in background
    if (this.indexPath) {
      const data: PersistedIndex = {
        version: INDEX_VERSION,
        updatedAt: new Date().toISOString(),
        entries: entries.map((e) => ({
          filePath: e.filePath,
          fileName: e.fileName,
          libraryName: e.libraryName,
          mediaType: e.mediaType,
        })),
      };

      try {
        await fs.mkdir(path.dirname(this.indexPath), { recursive: true });
        await fs.writeFile(this.indexPath, JSON.stringify(data), 'utf-8');
        logger.debug(`Persisted search index to ${this.indexPath}`);
      } catch (err) {
        logger.warn('Failed to persist search index:', err);
      }
    }

    return entries;
  }

  // =========================================================================
  // FileSystemWatcher (incremental updates)
  // =========================================================================

  private async setupWatchers(): Promise<void> {
    this.disposeWatchers();

    const libraries = await this.settingsService.getResolvedLibraries();
    for (const lib of libraries) {
      if (!lib.enabled || !lib.accessible) continue;

      const pattern = new vscode.RelativePattern(lib.resolvedPath, '**/*');
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);

      watcher.onDidCreate((uri) => this.handleFileEvent('create', uri, lib.name));
      watcher.onDidDelete((uri) => this.handleFileEvent('delete', uri, lib.name));

      this.watchers.set(lib.resolvedPath, watcher);
    }
  }

  private handleFileEvent(type: 'create' | 'delete', uri: vscode.Uri, libraryName: string): void {
    const filePath = uri.fsPath;
    const fileName = path.basename(filePath);

    if (fileName.startsWith('.')) return;
    if (!isMediaFile(fileName) && !isDocumentFile(fileName)) return;
    if (!this.fileIndex) return;

    if (type === 'create') {
      // Avoid duplicates
      if (!this.fileIndex.some((e) => e.filePath === filePath)) {
        this.fileIndex.push({
          filePath,
          fileName,
          fileNameLower: fileName.toLowerCase(),
          libraryName,
          mediaType: detectMediaType(filePath),
        });
      }
    } else {
      const idx = this.fileIndex.findIndex((e) => e.filePath === filePath);
      if (idx >= 0) this.fileIndex.splice(idx, 1);
    }

    // Debounce persist
    this.schedulePersist();
  }

  private schedulePersist(): void {
    if (this.rebuildTimer) clearTimeout(this.rebuildTimer);
    this.rebuildTimer = setTimeout(() => {
      if (this.fileIndex && this.indexPath) {
        void this.persistIndex(this.fileIndex);
      }
    }, 2000);
  }

  private async persistIndex(entries: IndexEntry[]): Promise<void> {
    if (!this.indexPath) return;

    const data: PersistedIndex = {
      version: INDEX_VERSION,
      updatedAt: new Date().toISOString(),
      entries: entries.map((e) => ({
        filePath: e.filePath,
        fileName: e.fileName,
        libraryName: e.libraryName,
        mediaType: e.mediaType,
      })),
    };

    try {
      await fs.writeFile(this.indexPath, JSON.stringify(data), 'utf-8');
    } catch {
      // Silently fail
    }
  }

  private disposeWatchers(): void {
    for (const watcher of this.watchers.values()) {
      watcher.dispose();
    }
    this.watchers.clear();
  }

  // =========================================================================
  // Full directory walk (initial build)
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
      return;
    }

    for (const name of names) {
      if (name.startsWith('.')) continue;

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
          mediaType: detectMediaType(fullPath),
        });
      }
    }
  }
}
