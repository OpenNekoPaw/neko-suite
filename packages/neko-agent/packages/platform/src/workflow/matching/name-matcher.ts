/**
 * L2 NameMatcher — fuzzy name / alias match.
 *
 * Algorithm: Dice coefficient on character bigrams, enhanced with exact-match
 * short-circuits. Threshold 0.8 for committable confidence.
 *
 * Alternatives considered:
 *   - Levenshtein: slower for long aliases, not needed for names.
 *   - Soundex/Metaphone: English-biased, poor with CJK.
 *   - ICU-level tokenisation: heavy dep.
 *
 * Dice has the best tradeoff for short multilingual names.
 *
 * See docs/architecture/cross-modal-matching.md §6.
 */

import type { AssetLibrary } from '../asset-library/types';
import type { BindingCandidate, EntityRef, IMatcher, MatchContext, Shot } from './types';

const MIN_CONFIDENCE = 0.8;

export const nameMatcher: IMatcher = {
  layer: 'L2',
  async match(
    ref: EntityRef,
    _shot: Shot,
    library: AssetLibrary,
    _context: MatchContext,
  ): Promise<BindingCandidate | undefined> {
    if (!ref.name) return undefined;

    const entity = library.resolveEntityByName(ref.name, slotToEntityKind(ref.slot));
    if (!entity) {
      // Fallback: fuzzy scan all entities of that kind
      const fuzzy = fuzzyFindEntity(library, ref.name, slotToEntityKind(ref.slot));
      if (!fuzzy) return undefined;
      const asset = pickAsset(library, fuzzy.entityId, ref.variant);
      if (!asset) return undefined;
      return {
        slot: ref.slot,
        entityId: fuzzy.entityId,
        assetId: asset.id,
        provenance: 'L2',
        confidence: Math.max(fuzzy.score, MIN_CONFIDENCE),
        reason: `Name match "${ref.name}" → ${fuzzy.entityId} (score ${fuzzy.score.toFixed(2)})`,
      };
    }

    const asset = pickAsset(library, entity.id, ref.variant);
    if (!asset) return undefined;
    // Canonical match is strong but less authoritative than L1 (explicit) or
    // L5 (user's prior confirmed intent). Pin under 0.9 so those layers win.
    return {
      slot: ref.slot,
      entityId: entity.id,
      assetId: asset.id,
      provenance: 'L2',
      confidence: 0.85,
      reason: `Name match "${ref.name}" → ${entity.canonicalName}`,
    };
  },
};

// =============================================================================
// Dice coefficient (bigrams)
// =============================================================================

/**
 * Dice coefficient on character bigrams. 1.0 = identical, 0.0 = no overlap.
 * Exposed for tests.
 */
export function dice(a: string, b: string): number {
  const sa = normalize(a);
  const sb = normalize(b);
  if (sa === sb) return 1;
  if (sa.length < 2 || sb.length < 2) return 0;

  const bigramsA = bigrams(sa);
  const bigramsB = bigrams(sb);
  let intersection = 0;
  const bMap = new Map<string, number>();
  for (const g of bigramsB) bMap.set(g, (bMap.get(g) ?? 0) + 1);
  for (const g of bigramsA) {
    const c = bMap.get(g);
    if (c && c > 0) {
      intersection++;
      bMap.set(g, c - 1);
    }
  }
  return (2 * intersection) / (bigramsA.length + bigramsB.length);
}

function bigrams(s: string): string[] {
  const result: string[] = [];
  for (let i = 0; i < s.length - 1; i++) {
    result.push(s.slice(i, i + 2));
  }
  return result;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

// =============================================================================
// Fuzzy scan over library entities
// =============================================================================

interface FuzzyHit {
  entityId: string;
  score: number;
}

function fuzzyFindEntity(
  library: AssetLibrary,
  name: string,
  kind?: ReturnType<typeof slotToEntityKind>,
): FuzzyHit | undefined {
  const entities = library.listEntities(kind);
  let best: FuzzyHit | undefined;
  for (const e of entities) {
    // Compare against canonical + all aliases; take max
    const candidates = [e.canonicalName, ...e.aliases];
    let max = 0;
    for (const c of candidates) {
      const d = dice(name, c);
      if (d > max) max = d;
    }
    if (max > (best?.score ?? 0)) {
      best = { entityId: e.id, score: max };
    }
  }
  if (!best || best.score < MIN_CONFIDENCE) return undefined;
  return best;
}

// =============================================================================
// Asset selection
// =============================================================================

function pickAsset(library: AssetLibrary, entityId: string, variant: string | undefined) {
  const candidates = library.findAssetsForEntity(entityId);
  if (candidates.length === 0) return undefined;
  if (!variant) return candidates[0];
  const withVariant = candidates.find((a) => {
    if (!a.variants) return false;
    return Object.values(a.variants).some(
      (v) => typeof v === 'string' && v.toLowerCase() === variant.toLowerCase(),
    );
  });
  return withVariant ?? candidates[0];
}

// =============================================================================
// Helpers
// =============================================================================

function slotToEntityKind(slot: EntityRef['slot']) {
  switch (slot) {
    case 'character':
      return 'character' as const;
    case 'scene':
      return 'scene' as const;
    case 'action':
      return 'action' as const;
    case 'prop':
      return 'prop' as const;
    case 'style':
      return 'style' as const;
  }
}
