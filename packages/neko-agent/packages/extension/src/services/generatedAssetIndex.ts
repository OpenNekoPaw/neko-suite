// =============================================================================
// GeneratedAssetIndex — In-memory index with disk persistence (ADR-4)
//
// Tracks all AI-generated assets in `.neko/generated/index.json`.
// Assets are stored as JSON references; binary data lives on disk.
//
// - In-memory Map for fast lookups
// - Debounced atomic flush to disk (write .tmp → rename)
// - Filter by type, model, time range
// =============================================================================

import * as fs from 'fs';
import * as path from 'path';
import type { GeneratedAsset, GeneratedAssetType, GENERATED_ASSET_DIRS } from '@neko/shared';

/** Filter criteria for listing assets */
export interface AssetFilter {
  type?: GeneratedAssetType;
  model?: string;
  /** Only assets generated after this ISO timestamp */
  after?: string;
  /** Only assets generated before this ISO timestamp */
  before?: string;
  /** Max number of results (newest first) */
  limit?: number;
}

/** On-disk JSON structure */
interface IndexFile {
  version: 1;
  assets: GeneratedAsset[];
}

const FLUSH_DELAY_MS = 300;
const INDEX_FILE_NAME = 'index.json';

export class GeneratedAssetIndex {
  private readonly assets = new Map<string, GeneratedAsset>();
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly indexPath: string;

  /**
   * @param generatedDir Absolute path to `.neko/generated/` directory
   */
  constructor(private readonly generatedDir: string) {
    this.indexPath = path.join(generatedDir, INDEX_FILE_NAME);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Load index from disk. Safe to call multiple times (idempotent). */
  load(): void {
    this.assets.clear();
    try {
      const raw = fs.readFileSync(this.indexPath, 'utf-8');
      const data = JSON.parse(raw) as IndexFile;
      if (data.version === 1 && Array.isArray(data.assets)) {
        for (const asset of data.assets) {
          if (asset.id && asset.type) {
            this.assets.set(asset.id, asset);
          }
        }
      }
    } catch {
      // File doesn't exist or is malformed — start with empty index
    }
  }

  /** Flush any pending writes and clear timers. Call on deactivate. */
  dispose(): void {
    if (this.flushTimer !== undefined) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    if (this.dirty) {
      this.flushSync();
    }
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  /** Register a newly generated asset. Triggers debounced flush. */
  add(asset: GeneratedAsset): void {
    this.assets.set(asset.id, asset);
    this.scheduleDirtyFlush();
  }

  /** Retrieve an asset by ID, or undefined if not found. */
  get(id: string): GeneratedAsset | undefined {
    return this.assets.get(id);
  }

  /** Remove an asset reference (does NOT delete the file). */
  remove(id: string): boolean {
    const existed = this.assets.delete(id);
    if (existed) {
      this.scheduleDirtyFlush();
    }
    return existed;
  }

  /** List assets matching the given filter, ordered newest-first. */
  list(filter?: AssetFilter): GeneratedAsset[] {
    let results = Array.from(this.assets.values());

    if (filter?.type) {
      results = results.filter((a) => a.type === filter.type);
    }
    if (filter?.model) {
      results = results.filter((a) => a.model === filter.model);
    }
    if (filter?.after) {
      const threshold = filter.after;
      results = results.filter((a) => a.generatedAt >= threshold);
    }
    if (filter?.before) {
      const threshold = filter.before;
      results = results.filter((a) => a.generatedAt < threshold);
    }

    // Sort newest first
    results.sort((a, b) => (b.generatedAt > a.generatedAt ? 1 : -1));

    if (filter?.limit !== undefined && filter.limit > 0) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  /** Total number of tracked assets */
  get size(): number {
    return this.assets.size;
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  private scheduleDirtyFlush(): void {
    this.dirty = true;
    if (this.flushTimer !== undefined) {
      clearTimeout(this.flushTimer);
    }
    this.flushTimer = setTimeout(() => {
      this.flushSync();
    }, FLUSH_DELAY_MS);
  }

  /** Atomic write: .tmp → rename */
  private flushSync(): void {
    if (!this.dirty) return;
    try {
      fs.mkdirSync(this.generatedDir, { recursive: true });

      const data: IndexFile = {
        version: 1,
        assets: Array.from(this.assets.values()),
      };
      const json = JSON.stringify(data, null, 2);
      const tmpPath = `${this.indexPath}.tmp`;

      fs.writeFileSync(tmpPath, json, 'utf-8');
      fs.renameSync(tmpPath, this.indexPath);
      this.dirty = false;
    } catch {
      // Swallow write errors — index is reconstructible from disk files
    }
  }
}

// =============================================================================
// Factory helper
// =============================================================================

/**
 * Resolve the standard `.neko/generated/` directory for a workspace.
 * Creates the directory tree if it doesn't exist.
 */
export function resolveGeneratedDir(workspaceRoot: string): string {
  const dir = path.join(workspaceRoot, '.neko', 'generated');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Resolve a sub-directory for a specific asset type.
 * Creates the directory if it doesn't exist.
 */
export function resolveAssetSubDir(
  generatedDir: string,
  subDir: (typeof GENERATED_ASSET_DIRS)[keyof typeof GENERATED_ASSET_DIRS],
): string {
  const dir = path.join(generatedDir, subDir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Build a `GeneratedAsset`-compatible unique file name.
 * Format: `{id}.{ext}` where id is a UUID.
 */
export function generateAssetId(): string {
  return crypto.randomUUID();
}
