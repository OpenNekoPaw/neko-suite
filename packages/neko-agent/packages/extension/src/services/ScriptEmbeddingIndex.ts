/**
 * ScriptEmbeddingIndex - In-memory semantic vector index for Fountain screenplay scenes.
 *
 * Caches scene embeddings per file (invalidated when total_lines changes).
 * Provides cosine similarity search returning top-K scenes with their
 * line_start/line_end metadata for downstream Read() access.
 */

// -- Types -------------------------------------------------------------------

export type EmbedFn = (texts: string[]) => Promise<number[][]>;

export interface SceneTextInput {
  readonly id: string;
  readonly heading: string;
  readonly line_start: number;
  readonly line_end: number;
  readonly text: string; // Full scene body (heading line + content lines)
}

export interface SceneEmbedding {
  readonly id: string;
  readonly heading: string;
  readonly line_start: number;
  readonly line_end: number;
  readonly embedding: readonly number[];
}

export interface SearchResult {
  readonly scene_id: string;
  readonly heading: string;
  readonly score: number; // Cosine similarity [0, 1]
  readonly line_start: number;
  readonly line_end: number;
}

// -- Cache entry (keyed by uri, invalidated when total_lines changes) ---------

interface FileCacheEntry {
  readonly total_lines: number;
  readonly scenes: readonly SceneEmbedding[];
}

// -- ScriptEmbeddingIndex ----------------------------------------------------

/**
 * Per-extension-lifecycle singleton.
 * Thread-safety: ensureIndexed() guards concurrent calls with a pending Promise.
 */
export class ScriptEmbeddingIndex {
  private readonly cache = new Map<string, FileCacheEntry>();
  // Prevent duplicate concurrent embedding calls for the same file
  private readonly pending = new Map<string, Promise<readonly SceneEmbedding[]>>();

  /**
   * Returns cached embeddings for `uri`, re-embedding if `total_lines` has changed.
   * `sceneTexts` must be ordered by scene appearance; text should include both
   * the heading line and the body so embeddings capture semantic content.
   */
  async ensureIndexed(
    uri: string,
    totalLines: number,
    sceneTexts: readonly SceneTextInput[],
    embedFn: EmbedFn,
  ): Promise<readonly SceneEmbedding[]> {
    const cached = this.cache.get(uri);
    if (cached && cached.total_lines === totalLines) {
      return cached.scenes;
    }

    // Deduplicate concurrent calls for the same file
    const existingPending = this.pending.get(uri);
    if (existingPending) {
      return existingPending;
    }

    const promise = this.embedScenes(uri, totalLines, sceneTexts, embedFn);
    this.pending.set(uri, promise);
    try {
      return await promise;
    } finally {
      this.pending.delete(uri);
    }
  }

  /**
   * Cosine similarity search over cached scene embeddings.
   * `queryEmbedding` must already be normalized to unit length
   * (or raw — normalization is handled internally).
   */
  search(
    queryEmbedding: readonly number[],
    scenes: readonly SceneEmbedding[],
    topK: number,
  ): SearchResult[] {
    const scored = scenes.map((scene) => ({
      scene_id: scene.id,
      heading: scene.heading,
      score: cosineSimilarity(queryEmbedding, scene.embedding),
      line_start: scene.line_start,
      line_end: scene.line_end,
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /** Invalidate cache for a URI (call when file is deleted or reset). */
  invalidate(uri: string): void {
    this.cache.delete(uri);
  }

  // -- Internal --------------------------------------------------------------

  private async embedScenes(
    uri: string,
    totalLines: number,
    sceneTexts: readonly SceneTextInput[],
    embedFn: EmbedFn,
  ): Promise<readonly SceneEmbedding[]> {
    if (sceneTexts.length === 0) {
      const empty: FileCacheEntry = { total_lines: totalLines, scenes: [] };
      this.cache.set(uri, empty);
      return [];
    }

    const texts = sceneTexts.map((s) => s.text);
    const embeddingVectors = await embedFn(texts);

    const scenes: SceneEmbedding[] = sceneTexts.map((s, i) => ({
      id: s.id,
      heading: s.heading,
      line_start: s.line_start,
      line_end: s.line_end,
      embedding: embeddingVectors[i] ?? [],
    }));

    this.cache.set(uri, { total_lines: totalLines, scenes });
    return scenes;
  }
}

// -- Math --------------------------------------------------------------------

/**
 * Cosine similarity between two vectors (unnormalized input is fine).
 * Returns 0 if either vector is zero.
 */
function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
