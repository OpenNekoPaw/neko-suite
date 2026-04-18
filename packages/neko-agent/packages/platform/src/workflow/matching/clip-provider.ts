/**
 * ClipProvider contract — TS-side surface for CLIP image/text encoding.
 *
 * Phase 4 stub.  The production implementation will live on the engine side
 * (host-napi + host-api), wrapping `runtime-ml/src/ml/clip.rs`.  This file
 * only defines the contract so:
 *   - MatchingEngine L3 can be written + tested against a fake provider now
 *   - The engine binding (Rust→napi→TS) can be built against a frozen shape
 *   - Feature flag `neko.workflow.matching.semantic.enabled` has a concrete
 *     dependency to gate on
 *
 * Design notes:
 *   - Embeddings are Float32Array (512-dim for CLIP-ViT-B/32) — see
 *     [clip.rs](../../../../neko-engine/packages/runtime-ml/src/ml/clip.rs)
 *   - Text is provided as UTF-8 strings; the engine binding owns tokenisation
 *     (BPE) to avoid shipping a JS tokeniser + vocab to every webview
 *   - Image input is a path (engine reads from disk) — avoids base64 round-trip
 *
 * Related ADR: docs/architecture/clip-ts-binding.md
 */

// =============================================================================
// Public types
// =============================================================================

/** Fixed-size embedding vector (CLIP-ViT-B/32 → 512 floats). */
export type ClipEmbedding = Float32Array;

/** Options passed to image/text encoders. */
export interface ClipEncodeOptions {
  /** Abort the inference early — honoured at the napi boundary. */
  signal?: AbortSignal;
}

export interface ClipProvider {
  /** Encode an image file path into a CLIP embedding. */
  encodeImage(imagePath: string, options?: ClipEncodeOptions): Promise<ClipEmbedding>;
  /** Encode a natural-language prompt into a CLIP embedding. */
  encodeText(text: string, options?: ClipEncodeOptions): Promise<ClipEmbedding>;
  /** Dimensionality (typically 512). */
  readonly embeddingDim: number;
}

// =============================================================================
// Cosine similarity helper (pure)
// =============================================================================

/**
 * Cosine similarity in [-1, 1].  Mirrors `cosine_similarity` in
 * runtime-ml/src/ml/clip.rs so TS-side and Rust-side computations agree.
 */
export function cosineSimilarity(a: ClipEmbedding, b: ClipEmbedding): number {
  if (a.length !== b.length) {
    throw new Error(`cosineSimilarity: length mismatch (a=${a.length}, b=${b.length})`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

// =============================================================================
// Default "unimplemented" provider
// =============================================================================

/**
 * Placeholder provider used when the engine binding is not wired up.
 * Any call throws — L3 SemanticMatcher checks for this and skips.
 */
export class UnimplementedClipProvider implements ClipProvider {
  readonly embeddingDim = 512;

  async encodeImage(): Promise<ClipEmbedding> {
    throw new ClipUnavailableError('CLIP encodeImage is not implemented');
  }

  async encodeText(): Promise<ClipEmbedding> {
    throw new ClipUnavailableError('CLIP encodeText is not implemented');
  }
}

/** Sentinel error — L3 catches this to downgrade gracefully. */
export class ClipUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClipUnavailableError';
  }
}

// =============================================================================
// In-memory test provider
// =============================================================================

/**
 * Test provider that returns deterministic embeddings from a user-supplied map.
 * Lookup key is `image:<path>` or `text:<lowercased text>`; missing keys fall
 * back to a zeroed vector (cosine similarity 0).
 */
export class InMemoryClipProvider implements ClipProvider {
  readonly embeddingDim: number;
  private readonly store: Map<string, ClipEmbedding>;

  constructor(
    store?: ReadonlyMap<string, ClipEmbedding> | Record<string, ClipEmbedding>,
    dim = 512,
  ) {
    this.embeddingDim = dim;
    this.store = new Map();
    if (store) {
      const entries =
        store instanceof Map
          ? store.entries()
          : (Object.entries(store) as [string, ClipEmbedding][]);
      for (const [k, v] of entries) this.store.set(k, v);
    }
  }

  async encodeImage(imagePath: string): Promise<ClipEmbedding> {
    return this.store.get(`image:${imagePath}`) ?? new Float32Array(this.embeddingDim);
  }

  async encodeText(text: string): Promise<ClipEmbedding> {
    return this.store.get(`text:${text.toLowerCase()}`) ?? new Float32Array(this.embeddingDim);
  }
}
