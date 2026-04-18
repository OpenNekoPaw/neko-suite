/**
 * L3 SemanticMatcher — CLIP image × text cosine similarity.
 *
 * Phase 4 stub.  The matcher logic is complete; it only fires when a
 * ClipProvider is injected.  Without a provider (the default) the matcher
 * returns undefined so the chain falls through to L4/UserAsk.
 *
 * See docs/architecture/cross-modal-matching.md §7.
 */

import type { AssetLibrary, Asset } from '../asset-library/types';
import {
  ClipUnavailableError,
  cosineSimilarity,
  type ClipEmbedding,
  type ClipProvider,
} from './clip-provider';
import type { EmbeddingCache } from './embedding-cache';
import type { BindingCandidate, EntityRef, IMatcher, MatchContext, Shot } from './types';

// =============================================================================
// Config
// =============================================================================

export interface SemanticMatcherOptions {
  readonly clip: ClipProvider;
  readonly cache?: EmbeddingCache;
  /** Minimum cosine similarity required to emit a candidate (0..1). */
  readonly minConfidence?: number;
  /** Cap on candidate assets scanned per ref.  0 = unlimited. */
  readonly maxAssetsPerRef?: number;
  /** Optional logger.  Errors from ClipProvider are caught and logged. */
  readonly logger?: Pick<Console, 'warn'>;
}

const DEFAULT_MIN_CONFIDENCE = 0.22;
const DEFAULT_MAX_ASSETS = 32;

// =============================================================================
// Implementation
// =============================================================================

export function createSemanticMatcher(options: SemanticMatcherOptions): IMatcher {
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const maxAssets = options.maxAssetsPerRef ?? DEFAULT_MAX_ASSETS;

  return {
    layer: 'L3',
    async match(
      ref: EntityRef,
      shot: Shot,
      library: AssetLibrary,
      _context: MatchContext,
    ): Promise<BindingCandidate | undefined> {
      const query = buildQueryText(ref, shot);
      if (!query) return undefined;

      const candidates = collectCandidates(ref, library, maxAssets);
      if (candidates.length === 0) return undefined;

      let textEmbedding: ClipEmbedding;
      try {
        textEmbedding = await options.clip.encodeText(query);
      } catch (err) {
        handleClipError(err, options.logger);
        return undefined;
      }

      let best: { asset: Asset; score: number } | undefined;
      for (const asset of candidates) {
        const imgEmbedding = await resolveImageEmbedding(asset, options);
        if (!imgEmbedding) continue;
        const score = cosineSimilarity(textEmbedding, imgEmbedding);
        if (!best || score > best.score) best = { asset, score };
      }
      if (!best) return undefined;

      // Map cosine similarity (−1..1) to a [0, 1] confidence plateauing at ~0.85
      // so L3 rarely outranks L1/L5 but beats a failed L2 fuzzy match.
      const confidence = Math.min(0.85, Math.max(0, (best.score + 1) / 2));
      if (confidence < minConfidence) return undefined;

      const entity = best.asset.entityId ?? ref.entityId;
      if (!entity) return undefined;

      return {
        slot: ref.slot,
        entityId: entity,
        assetId: best.asset.id,
        provenance: 'L3',
        confidence,
        reason: `CLIP cosine=${best.score.toFixed(3)} for "${truncate(query, 60)}"`,
      };
    },
  };
}

// =============================================================================
// Helpers (pure)
// =============================================================================

function buildQueryText(ref: EntityRef, shot: Shot): string | undefined {
  const parts: string[] = [];
  if (ref.name) parts.push(ref.name);
  if (ref.variant) parts.push(ref.variant);
  if (shot.scriptLine) parts.push(shot.scriptLine);
  const joined = parts.join(' ').trim();
  return joined.length > 0 ? joined : undefined;
}

function collectCandidates(ref: EntityRef, library: AssetLibrary, maxAssets: number): Asset[] {
  const pool = ref.entityId
    ? library.findAssetsForEntity(ref.entityId)
    : library.listAssets({ kind: 'image' });
  const imgOnly = pool.filter(isImageAsset);
  if (maxAssets > 0 && imgOnly.length > maxAssets) {
    return imgOnly.slice(0, maxAssets);
  }
  return imgOnly;
}

function isImageAsset(a: Asset): boolean {
  return a.kind === 'image' || a.kind === 'sequence';
}

async function resolveImageEmbedding(
  asset: Asset,
  options: SemanticMatcherOptions,
): Promise<ClipEmbedding | undefined> {
  // Prefer an embedding baked into the Asset (loaded at import time).
  if (asset.embeddings?.clip) return asset.embeddings.clip;

  // Otherwise consult the cache (keyed by assetId for the stub — production
  // impl will key by sha256(path+mtime)).
  const cacheKey = asset.id;
  if (options.cache) {
    const cached = await options.cache.get(cacheKey);
    if (cached) return cached;
  }

  // Last resort: ask the provider.  Errors bubble up — caller logs + skips.
  let embedding: ClipEmbedding;
  try {
    embedding = await options.clip.encodeImage(asset.path);
  } catch (err) {
    handleClipError(err, options.logger);
    return undefined;
  }
  if (options.cache) {
    try {
      await options.cache.put(cacheKey, embedding);
    } catch {
      // Cache writes are best-effort — a failure here must not abort matching.
    }
  }
  return embedding;
}

function handleClipError(err: unknown, logger?: Pick<Console, 'warn'>): void {
  if (err instanceof ClipUnavailableError) {
    // Expected when the stub provider is still active — no log spam.
    return;
  }
  logger?.warn('[SemanticMatcher] CLIP error — skipping', err);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
