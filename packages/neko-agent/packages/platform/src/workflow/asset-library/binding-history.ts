/**
 * BindingHistory — the only writer in AssetLibrary.
 *
 * Persists user-confirmed (and algorithm-proposed) shot-asset bindings to
 * `<workDir>/.neko/.cache/bindings.json` as an append-only JSON log.
 *
 * Features:
 * - LRU cap (default 500 entries per entity) to prevent unbounded growth
 * - Debounced write (50ms) to coalesce rapid updates
 * - Injectable FileIOAdapter for testability
 *
 * See docs/architecture/asset-knowledge-graph.md §9 for the design rationale.
 */

import type { Binding, BindingQuery, BindingSlot, FileIOAdapter } from './types';

// =============================================================================
// File schema
// =============================================================================

const FILE_VERSION = 1 as const;

interface BindingFile {
  readonly version: typeof FILE_VERSION;
  /** All bindings in chronological order (oldest first) */
  readonly bindings: readonly Binding[];
}

// =============================================================================
// Implementation
// =============================================================================

export interface BindingHistoryOptions {
  /** Absolute path to bindings.json */
  filePath: string;
  /** FileIO adapter (defaults to fs/promises in Node) */
  fileIO: FileIOAdapter;
  /** Max bindings per (entity, slot) before LRU trim. Default 500. */
  maxPerEntitySlot?: number;
  /** Debounce window for writes in ms. Default 50. */
  debounceMs?: number;
}

export class BindingHistory {
  private bindings: Binding[] = [];
  private loaded = false;
  private pendingWrite: NodeJS.Timeout | undefined;
  private readonly maxPerEntitySlot: number;
  private readonly debounceMs: number;

  constructor(private readonly options: BindingHistoryOptions) {
    this.maxPerEntitySlot = options.maxPerEntitySlot ?? 500;
    this.debounceMs = options.debounceMs ?? 50;
  }

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const content = await this.options.fileIO.read(this.options.filePath);
      if (content) {
        const parsed = JSON.parse(content) as BindingFile;
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          'version' in parsed &&
          parsed.version === FILE_VERSION &&
          Array.isArray(parsed.bindings)
        ) {
          this.bindings = [...parsed.bindings];
        }
      }
    } catch {
      // Corrupt or missing file → start fresh. We never throw on load failure
      // since a broken cache shouldn't break the whole app.
      this.bindings = [];
    }
    this.loaded = true;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  find(query: BindingQuery): Binding[] {
    const results = this.bindings.filter((b) => matchesQuery(b, query));
    // Sort by recency (newest first) — most consumers want latest
    results.sort((a, b) => b.timestamp - a.timestamp);
    if (query.limit !== undefined && query.limit > 0) {
      return results.slice(0, query.limit);
    }
    return results;
  }

  /**
   * Find bindings from shots in the same sceneGroupId as the given shot.
   * Returns bindings from OTHER shots (not the query shot itself).
   */
  findSiblings(shotId: string): Binding[] {
    // First locate the shot's sceneGroupId from any binding
    const anchor = this.bindings.find((b) => b.shotId === shotId);
    if (!anchor?.sceneGroupId) return [];
    return this.bindings
      .filter((b) => b.sceneGroupId === anchor.sceneGroupId && b.shotId !== shotId)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------

  async upsert(
    input: Omit<Binding, 'id' | 'timestamp'> & {
      id?: string;
      timestamp?: number;
    },
  ): Promise<Binding> {
    if (!this.loaded) await this.load();

    const binding: Binding = {
      id: input.id ?? generateBindingId(input.shotId, input.slot),
      shotId: input.shotId,
      slot: input.slot,
      entityId: input.entityId,
      assetId: input.assetId,
      provenance: input.provenance,
      confidence: input.confidence,
      userConfirmed: input.userConfirmed,
      timestamp: input.timestamp ?? Date.now(),
      ...(input.sceneGroupId !== undefined && { sceneGroupId: input.sceneGroupId }),
      ...(input.planId !== undefined && { planId: input.planId }),
    };

    // Remove any existing binding for the same (shotId, slot) — newest wins
    this.bindings = this.bindings.filter(
      (b) => !(b.shotId === binding.shotId && b.slot === binding.slot),
    );
    this.bindings.push(binding);

    // LRU trim per (entityId, slot)
    this.trimForKey(binding.entityId, binding.slot);

    this.scheduleWrite();
    return binding;
  }

  // ---------------------------------------------------------------------------
  // Flush / dispose
  // ---------------------------------------------------------------------------

  /** Force-flush pending writes. Safe to call multiple times. */
  async flush(): Promise<void> {
    if (this.pendingWrite) {
      clearTimeout(this.pendingWrite);
      this.pendingWrite = undefined;
    }
    await this.writeNow();
  }

  dispose(): void {
    if (this.pendingWrite) {
      clearTimeout(this.pendingWrite);
      this.pendingWrite = undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private trimForKey(entityId: string, slot: BindingSlot): void {
    const key = (b: Binding) => b.entityId === entityId && b.slot === slot;
    const matching = this.bindings.filter(key);
    if (matching.length <= this.maxPerEntitySlot) return;
    // Sort oldest first; keep last N
    matching.sort((a, b) => a.timestamp - b.timestamp);
    const toRemove = matching.slice(0, matching.length - this.maxPerEntitySlot);
    const removeIds = new Set(toRemove.map((b) => b.id));
    this.bindings = this.bindings.filter((b) => !removeIds.has(b.id));
  }

  private scheduleWrite(): void {
    if (this.pendingWrite) clearTimeout(this.pendingWrite);
    this.pendingWrite = setTimeout(() => {
      this.pendingWrite = undefined;
      // Swallow errors; caller can use flush() for error-sensitive paths.
      this.writeNow().catch(() => undefined);
    }, this.debounceMs);
    // Ensure the timer doesn't keep Node alive
    if (typeof this.pendingWrite.unref === 'function') {
      this.pendingWrite.unref();
    }
  }

  private async writeNow(): Promise<void> {
    const file: BindingFile = {
      version: FILE_VERSION,
      bindings: [...this.bindings],
    };
    const dir = dirname(this.options.filePath);
    await this.options.fileIO.mkdirp(dir);
    await this.options.fileIO.write(this.options.filePath, JSON.stringify(file, replacer, 2));
  }
}

// =============================================================================
// Helpers
// =============================================================================

function matchesQuery(b: Binding, q: BindingQuery): boolean {
  if (q.entityId !== undefined && b.entityId !== q.entityId) return false;
  if (q.slot !== undefined && b.slot !== q.slot) return false;
  if (q.sceneGroupId !== undefined && b.sceneGroupId !== q.sceneGroupId) return false;
  if (q.planId !== undefined && b.planId !== q.planId) return false;
  return true;
}

function generateBindingId(shotId: string, slot: BindingSlot): string {
  return `bind_${shotId}_${slot}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function dirname(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i === -1 ? '.' : p.slice(0, i);
}

/** JSON replacer that skips Float32Array-like embedding fields to keep file small */
function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Float32Array) {
    // Don't persist embeddings in bindings.json; they live in embedding-cache
    return undefined;
  }
  return value;
}

// =============================================================================
// Default FileIO adapter (Node)
// =============================================================================

/**
 * Factory for a default fs/promises-backed FileIOAdapter.
 * Lazy-require so non-Node environments (e.g. browser tests) can swap this.
 */
export async function createNodeFileIO(): Promise<FileIOAdapter> {
  const fsMod = await import('node:fs/promises');
  const fs = fsMod.default ?? fsMod;
  return {
    async read(path: string): Promise<string | undefined> {
      try {
        return await fs.readFile(path, 'utf-8');
      } catch (err: unknown) {
        if (isErrnoException(err) && err.code === 'ENOENT') return undefined;
        throw err;
      }
    },
    async write(path: string, content: string): Promise<void> {
      await fs.writeFile(path, content, 'utf-8');
    },
    async mkdirp(dir: string): Promise<void> {
      await fs.mkdir(dir, { recursive: true });
    },
  };
}

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return typeof err === 'object' && err !== null && 'code' in err;
}

/**
 * In-memory FileIOAdapter — useful for tests.
 */
export function createMemoryFileIO(): FileIOAdapter & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    async read(path: string) {
      return store.get(path);
    },
    async write(path: string, content: string) {
      store.set(path, content);
    },
    async mkdirp() {
      // No-op for in-memory
    },
  };
}
