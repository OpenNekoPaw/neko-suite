/**
 * EmbeddingCache contract — keyed Float32Array storage for CLIP image embeddings.
 *
 * Phase 4 stub.  The production implementation will persist to
 * `<workDir>/.neko/.cache/embeddings.idx` (mmap-style Float32 file) but the
 * write path can ship later.  Today we only commit the interface + an
 * in-memory default impl so L3 SemanticMatcher can be wired + tested.
 *
 * Cache key contract:
 *   - Callers provide a stable key like `sha256(assetPath + mtime)`
 *   - Cache is responsible for hit/miss bookkeeping; recomputation is the
 *     caller's job (cache does not pull on ClipProvider)
 *
 * Related ADR: docs/architecture/clip-ts-binding.md
 */

import type { ClipEmbedding } from './clip-provider';

export interface EmbeddingCache {
  /** Look up a cached embedding; returns undefined on miss. */
  get(key: string): Promise<ClipEmbedding | undefined>;
  /** Store an embedding.  Implementations may dedupe / LRU-evict. */
  put(key: string, embedding: ClipEmbedding): Promise<void>;
  /** Remove a single entry.  No-op on miss. */
  delete(key: string): Promise<void>;
  /** Drop every entry.  Used when the CLIP model version changes. */
  clear(): Promise<void>;
  /** Number of entries currently resident. */
  size(): Promise<number>;
}

// =============================================================================
// In-memory default
// =============================================================================

/**
 * Map-backed cache.  Adequate for tests and small asset libraries.
 * Persistent disk-backed impl will land in Phase 4 Rust binding PR.
 */
export class InMemoryEmbeddingCache implements EmbeddingCache {
  private readonly store = new Map<string, ClipEmbedding>();
  private readonly maxEntries: number;

  constructor(opts?: { maxEntries?: number }) {
    const max = opts?.maxEntries ?? 5000;
    this.maxEntries = max > 0 ? max : 5000;
  }

  async get(key: string): Promise<ClipEmbedding | undefined> {
    return this.store.get(key);
  }

  async put(key: string, embedding: ClipEmbedding): Promise<void> {
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      // Evict the oldest insertion (Map iteration order = insertion order).
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, embedding);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async size(): Promise<number> {
    return this.store.size;
  }
}
