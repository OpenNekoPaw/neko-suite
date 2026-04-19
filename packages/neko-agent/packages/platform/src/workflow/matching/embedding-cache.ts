/**
 * EmbeddingCache contract — keyed Float32Array storage for CLIP image embeddings.
 *
 * Cache key contract:
 *   - Callers provide a stable key like `sha256(assetPath + mtime)`
 *   - Cache is responsible for hit/miss bookkeeping; recomputation is the
 *     caller's job (cache does not pull on ClipProvider)
 *
 * Two implementations ship:
 *   - InMemoryEmbeddingCache — zero-I/O, for tests or short-lived sessions
 *   - NodeEmbeddingCache     — Phase 4.3, persists to a single JSON index
 *     with base64-packed Float32 payload (sub-100 KB / 500 entries typical)
 *
 * The JSON format is intentionally simple — a future binary mmap impl can
 * replace it without breaking the public contract.  See
 * docs/architecture/clip-ts-binding.md.
 */

import type { FileIOAdapter } from '../asset-library/types';
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

// =============================================================================
// Node / disk-backed implementation (Phase 4.3)
// =============================================================================

/**
 * File payload layout.  One JSON document per cache, loaded on first call
 * and flushed on every mutation.  Keyed by `key` so the writer can rewrite
 * in place without diffing.  LRU order is determined by `lastUsed`.
 */
interface EmbeddingCacheFile {
  readonly version: 1;
  /** CLIP embedding dimensionality — new puts are rejected when it differs. */
  readonly dim: number;
  readonly entries: readonly EmbeddingCacheEntry[];
}

interface EmbeddingCacheEntry {
  readonly key: string;
  readonly lastUsed: number;
  /** Base64-encoded little-endian Float32Array. */
  readonly data: string;
}

export interface NodeEmbeddingCacheOptions {
  /** Path (absolute, platform-native) where the JSON index is written. */
  readonly filePath: string;
  /** Expected embedding dim; puts with a different size are rejected. */
  readonly dim?: number;
  /** Hard upper bound on entries; overflow evicts the least-recently-used. */
  readonly maxEntries?: number;
  /** FileIO adapter — the asset-library `FileIOAdapter` works here. */
  readonly fileIO: FileIOAdapter;
  /** Clock override for tests. */
  readonly now?: () => number;
}

/**
 * Disk-backed cache.  Loads lazily on the first operation and flushes the
 * entire index after every put / delete / clear.  Fine for 500-ish entries;
 * past that a binary mmap layout becomes worthwhile (TODO, tracked in ADR).
 *
 * The class is single-process — concurrent writers from separate sessions
 * will clobber each other.  Caller is expected to serialise access.
 */
export class NodeEmbeddingCache implements EmbeddingCache {
  private readonly filePath: string;
  private readonly fileIO: FileIOAdapter;
  private readonly maxEntries: number;
  private readonly expectedDim: number | undefined;
  private readonly now: () => number;

  /** In-memory mirror kept in insertion-recency order (oldest → newest). */
  private entries: Map<string, { lastUsed: number; data: ClipEmbedding }> | undefined;
  /** Dimensionality observed in the last load — pinned once to keep puts uniform. */
  private dim: number | undefined;
  /** Chain of pending flushes; await before returning from mutators. */
  private flush: Promise<void> = Promise.resolve();

  constructor(options: NodeEmbeddingCacheOptions) {
    this.filePath = options.filePath;
    this.fileIO = options.fileIO;
    const max = options.maxEntries ?? 5000;
    this.maxEntries = max > 0 ? max : 5000;
    this.expectedDim = options.dim;
    this.now = options.now ?? (() => Date.now());
  }

  async get(key: string): Promise<ClipEmbedding | undefined> {
    const entries = await this.ensureLoaded();
    const hit = entries.get(key);
    if (!hit) return undefined;
    // Refresh LRU order: re-insert so iteration moves the key to the end.
    hit.lastUsed = this.now();
    entries.delete(key);
    entries.set(key, hit);
    // Writing back for an LRU-only touch would thrash the disk; skip — the
    // order persists on the next real mutation or on dispose via `save()`.
    return hit.data;
  }

  async put(key: string, embedding: ClipEmbedding): Promise<void> {
    const entries = await this.ensureLoaded();
    if (this.dim === undefined) this.dim = embedding.length;
    if (embedding.length !== this.dim) {
      throw new Error(
        `NodeEmbeddingCache: embedding dim ${embedding.length} doesn't match pinned dim ${this.dim}`,
      );
    }
    if (this.expectedDim !== undefined && embedding.length !== this.expectedDim) {
      throw new Error(
        `NodeEmbeddingCache: embedding dim ${embedding.length} doesn't match expected ${this.expectedDim}`,
      );
    }
    // Eviction: drop oldest when overflowing AND the key isn't already present.
    if (!entries.has(key) && entries.size >= this.maxEntries) {
      const oldest = entries.keys().next().value;
      if (oldest !== undefined) entries.delete(oldest);
    }
    entries.delete(key); // re-set to push to end
    entries.set(key, { lastUsed: this.now(), data: embedding });
    await this.save();
  }

  async delete(key: string): Promise<void> {
    const entries = await this.ensureLoaded();
    if (entries.delete(key)) {
      await this.save();
    }
  }

  async clear(): Promise<void> {
    this.entries = new Map();
    this.dim = this.expectedDim;
    await this.save();
  }

  async size(): Promise<number> {
    const entries = await this.ensureLoaded();
    return entries.size;
  }

  /** Flush any pending LRU reorder without mutating entries. Useful on dispose. */
  async flushPending(): Promise<void> {
    await this.save();
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async ensureLoaded(): Promise<Map<string, { lastUsed: number; data: ClipEmbedding }>> {
    if (this.entries) return this.entries;
    const raw = await this.fileIO.read(this.filePath);
    if (raw === undefined) {
      this.entries = new Map();
      if (this.dim === undefined) this.dim = this.expectedDim;
      return this.entries;
    }
    try {
      const doc = JSON.parse(raw) as Partial<EmbeddingCacheFile>;
      const map = new Map<string, { lastUsed: number; data: ClipEmbedding }>();
      if (doc.version !== 1 || typeof doc.dim !== 'number' || !Array.isArray(doc.entries)) {
        this.entries = map;
        return map;
      }
      this.dim = doc.dim;
      // Iterate in ascending `lastUsed` order so Map iteration mirrors LRU.
      const sorted = [...doc.entries].sort((a, b) => a.lastUsed - b.lastUsed);
      for (const entry of sorted) {
        if (typeof entry.key !== 'string' || typeof entry.data !== 'string') continue;
        const buf = decodeFloat32(entry.data);
        if (!buf || buf.length !== doc.dim) continue;
        map.set(entry.key, { lastUsed: entry.lastUsed, data: buf });
      }
      this.entries = map;
      return map;
    } catch {
      // Corrupt cache file — treat as empty; caller will rehydrate via puts.
      this.entries = new Map();
      return this.entries;
    }
  }

  private async save(): Promise<void> {
    const entries = this.entries ?? new Map();
    if (this.dim === undefined) this.dim = this.expectedDim ?? 0;
    const doc: EmbeddingCacheFile = {
      version: 1,
      dim: this.dim ?? 0,
      entries: [...entries].map(([key, value]) => ({
        key,
        lastUsed: value.lastUsed,
        data: encodeFloat32(value.data),
      })),
    };
    const serialised = JSON.stringify(doc);
    const dir = dirnameOf(this.filePath);
    this.flush = this.flush.then(async () => {
      await this.fileIO.mkdirp(dir);
      await this.fileIO.write(this.filePath, serialised);
    });
    await this.flush;
  }
}

// =============================================================================
// Base64 <-> Float32 helpers (pure)
// =============================================================================

function encodeFloat32(view: ClipEmbedding): string {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  // Node: Buffer.from(bytes).toString('base64'); browser/jsdom: btoa
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function decodeFloat32(b64: string): ClipEmbedding | undefined {
  let bytes: Uint8Array;
  if (typeof Buffer !== 'undefined') {
    bytes = new Uint8Array(Buffer.from(b64, 'base64'));
  } else {
    try {
      const bin = atob(b64);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } catch {
      return undefined;
    }
  }
  if (bytes.byteLength % 4 !== 0) return undefined;
  // Copy into a fresh, correctly-aligned buffer — browsers reject
  // `new Float32Array` over an offset that isn't 4-byte-aligned.
  const aligned = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(aligned).set(bytes);
  return new Float32Array(aligned);
}

function dirnameOf(p: string): string {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return idx > 0 ? p.slice(0, idx) : '.';
}
