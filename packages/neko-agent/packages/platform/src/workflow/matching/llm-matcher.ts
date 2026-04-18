/**
 * L4 LLMMatcher — Haiku-class model tie-breaker when L1/L2/L5 failed.
 *
 * Phase 4 stub.  The matcher surfaces a `LLMMatchBroker` contract that the
 * extension can implement against whatever LLM provider is configured; the
 * stub ships with a Disabled broker so the chain silently skips when the
 * feature flag is off.
 *
 * See docs/architecture/cross-modal-matching.md §8.
 */

import type { AssetLibrary, Asset } from '../asset-library/types';
import type { BindingCandidate, EntityRef, IMatcher, MatchContext, Shot } from './types';

// =============================================================================
// Broker contract
// =============================================================================

export interface LLMMatchBrokerRequest {
  readonly shot: Shot;
  readonly ref: EntityRef;
  /** Cap on how many candidates to present to the model. */
  readonly candidates: ReadonlyArray<{
    readonly id: string;
    readonly entityId?: string;
    readonly kind: Asset['kind'];
    readonly path: string;
    readonly name?: string;
    readonly variants?: Readonly<Record<string, string | number | boolean>>;
  }>;
  /** Soft wall-clock budget in ms; implementations should honour via AbortSignal. */
  readonly budgetMs?: number;
  readonly signal?: AbortSignal;
}

export interface LLMMatchDecision {
  /** Asset id the model picked — must be in `candidates` or `undefined`. */
  readonly assetId?: string;
  readonly confidence?: number;
  readonly reason?: string;
}

export interface LLMMatchBroker {
  choose(request: LLMMatchBrokerRequest): Promise<LLMMatchDecision>;
}

/** No-op broker — always returns no decision.  Used as default / when off. */
export const DisabledLLMMatchBroker: LLMMatchBroker = {
  async choose(): Promise<LLMMatchDecision> {
    return {};
  },
};

// =============================================================================
// Config
// =============================================================================

export interface LLMMatcherOptions {
  readonly broker: LLMMatchBroker;
  /** Minimum returned confidence required to emit a candidate. */
  readonly minConfidence?: number;
  /** Max candidate assets presented to the LLM per ref. */
  readonly maxCandidates?: number;
  /** Budget, propagated into broker requests. */
  readonly budgetMs?: number;
  readonly logger?: Pick<Console, 'warn'>;
}

const DEFAULT_MIN_CONFIDENCE = 0.5;
const DEFAULT_MAX_CANDIDATES = 8;
const DEFAULT_BUDGET_MS = 5000;

// =============================================================================
// Implementation
// =============================================================================

export function createLLMMatcher(options: LLMMatcherOptions): IMatcher {
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const maxCandidates = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;

  return {
    layer: 'L4',
    async match(
      ref: EntityRef,
      shot: Shot,
      library: AssetLibrary,
      _context: MatchContext,
    ): Promise<BindingCandidate | undefined> {
      const candidates = collectCandidates(ref, library, maxCandidates);
      if (candidates.length === 0) return undefined;

      const request: LLMMatchBrokerRequest = {
        shot,
        ref,
        candidates: candidates.map((a) => ({
          id: a.id,
          ...(a.entityId !== undefined && { entityId: a.entityId }),
          kind: a.kind,
          path: a.path,
          ...(a.name !== undefined && { name: a.name }),
          ...(a.variants !== undefined && { variants: a.variants }),
        })),
        budgetMs,
      };

      let decision: LLMMatchDecision;
      try {
        decision = await options.broker.choose(request);
      } catch (err) {
        options.logger?.warn('[LLMMatcher] broker error — skipping', err);
        return undefined;
      }

      if (!decision.assetId) return undefined;
      const asset = candidates.find((a) => a.id === decision.assetId);
      if (!asset) {
        options.logger?.warn('[LLMMatcher] broker returned unknown assetId', decision.assetId);
        return undefined;
      }
      const entityId = asset.entityId ?? ref.entityId;
      if (!entityId) return undefined;

      const confidence = clampConfidence(decision.confidence ?? minConfidence);
      if (confidence < minConfidence) return undefined;

      return {
        slot: ref.slot,
        entityId,
        assetId: asset.id,
        provenance: 'L4',
        confidence,
        reason: decision.reason ?? 'LLM tie-breaker',
      };
    },
  };
}

// =============================================================================
// Helpers (pure)
// =============================================================================

function collectCandidates(ref: EntityRef, library: AssetLibrary, maxCandidates: number): Asset[] {
  const pool = ref.entityId ? library.findAssetsForEntity(ref.entityId) : library.listAssets();
  if (maxCandidates > 0 && pool.length > maxCandidates) {
    return pool.slice(0, maxCandidates);
  }
  return pool;
}

function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
