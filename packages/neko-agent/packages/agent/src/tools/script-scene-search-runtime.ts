export type EmbedFn = (texts: string[]) => Promise<number[][]>;

export interface SceneTextInput {
  readonly id: string;
  readonly heading: string;
  readonly line_start: number;
  readonly line_end: number;
  readonly text: string;
}

export interface ScriptSceneSpan {
  readonly id: string;
  readonly heading: string;
  readonly line_start: number;
  readonly line_end: number;
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
  readonly score: number;
  readonly line_start: number;
  readonly line_end: number;
}

export interface ScriptSceneSearchInput {
  readonly uri: string;
  readonly totalLines: number;
  readonly sceneTexts: readonly SceneTextInput[];
  readonly query: string;
  readonly topK?: number;
  readonly embedFn?: EmbedFn;
}

export type ScriptSceneSearchResult =
  | {
      readonly results: SearchResult[];
      readonly mode?: 'vector' | 'tfidf';
      readonly note?: string;
      readonly message?: string;
    }
  | {
      readonly error: string;
    };

interface FileCacheEntry {
  readonly total_lines: number;
  readonly scenes: readonly SceneEmbedding[];
}

export class ScriptEmbeddingIndex {
  private readonly cache = new Map<string, FileCacheEntry>();
  private readonly pending = new Map<string, Promise<readonly SceneEmbedding[]>>();

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
    return scored.slice(0, normalizeScriptSceneTopK(topK));
  }

  async searchScenes(input: ScriptSceneSearchInput): Promise<ScriptSceneSearchResult> {
    return searchScriptScenes(input, this);
  }

  invalidate(uri: string): void {
    this.cache.delete(uri);
  }

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

    const texts = sceneTexts.map((scene) => scene.text);
    const embeddingVectors = await embedFn(texts);

    const scenes: SceneEmbedding[] = sceneTexts.map((scene, index) => ({
      id: scene.id,
      heading: scene.heading,
      line_start: scene.line_start,
      line_end: scene.line_end,
      embedding: embeddingVectors[index] ?? [],
    }));

    this.cache.set(uri, { total_lines: totalLines, scenes });
    return scenes;
  }
}

export function buildScriptSceneTextInputs(
  scenes: readonly ScriptSceneSpan[],
  lines: readonly string[],
): SceneTextInput[] {
  return scenes.map((scene) => ({
    id: scene.id,
    heading: scene.heading,
    line_start: scene.line_start,
    line_end: scene.line_end,
    text: lines
      .slice(scene.line_start, scene.line_end + 1)
      .join('\n')
      .trim(),
  }));
}

export async function searchScriptScenes(
  input: ScriptSceneSearchInput,
  index = new ScriptEmbeddingIndex(),
): Promise<ScriptSceneSearchResult> {
  const topK = normalizeScriptSceneTopK(input.topK);
  if (input.sceneTexts.length === 0) {
    return { results: [], message: 'No scenes found in this screenplay.' };
  }

  if (input.embedFn) {
    let cachedEmbeddings: readonly SceneEmbedding[];
    try {
      cachedEmbeddings = await index.ensureIndexed(
        input.uri,
        input.totalLines,
        input.sceneTexts,
        input.embedFn,
      );
    } catch (error) {
      return { error: `Embedding failed: ${String(error)}` };
    }

    let queryEmbedding: number[];
    try {
      const result = await input.embedFn([input.query]);
      queryEmbedding = result[0] ?? [];
    } catch (error) {
      return { error: `Failed to embed query: ${String(error)}` };
    }

    return {
      results: index.search(queryEmbedding, cachedEmbeddings, topK),
      mode: 'vector',
    };
  }

  const queryTokens = tokenizeScriptSceneQuery(input.query);
  if (queryTokens.length === 0) {
    return { results: [], message: 'Query produced no searchable tokens.' };
  }

  return {
    results: keywordSearchScriptScenes(input.sceneTexts, queryTokens, topK),
    mode: 'tfidf',
    note: 'Configure an embedding provider for semantic search.',
  };
}

export function tokenizeScriptSceneQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\W+/)
    .filter((token) => token.length > 1);
}

export function keywordSearchScriptScenes(
  sceneTexts: readonly SceneTextInput[],
  queryTokens: readonly string[],
  topK: number,
): SearchResult[] {
  const scored = sceneTexts.map((scene) => {
    const heading = scene.heading.toLowerCase();
    const haystack = `${scene.heading} ${scene.text}`.toLowerCase();
    let score = 0;

    for (const token of queryTokens) {
      const headingHit = heading.includes(token);
      const bodyCount = countOccurrences(haystack, token);
      score += headingHit ? bodyCount + 2 : bodyCount;
    }

    return {
      scene_id: scene.id,
      score: Number((score / queryTokens.length).toFixed(3)),
      line_start: scene.line_start,
      line_end: scene.line_end,
      heading: scene.heading,
    };
  });

  return scored
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, normalizeScriptSceneTopK(topK));
}

export function normalizeScriptSceneTopK(topK: number | undefined): number {
  return Math.min(topK ?? 5, 20);
}

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

function countOccurrences(text: string, token: string): number {
  let count = 0;
  let fromIndex = 0;

  while (fromIndex < text.length) {
    const index = text.indexOf(token, fromIndex);
    if (index === -1) break;
    count++;
    fromIndex = index + token.length;
  }

  return count;
}
