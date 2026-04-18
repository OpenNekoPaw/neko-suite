/**
 * MatchingEngine facade — composes L1/L2/L5 matchers (Phase 1 MVP).
 *
 * Priority order (highest confidence first):
 *   L1 ExplicitMatcher  — inline tags like `@character:alice`
 *   L5 ContinuityMatcher — re-use prior shot's binding (same scene group)
 *   L2 NameMatcher       — fuzzy name/alias
 *   (L3 SemanticMatcher  — Phase 4, CLIP)
 *   (L4 LLMMatcher       — Phase 4, Haiku fallback)
 *
 * Contract:
 *   - Returns one ShotBindings per input shot
 *   - Primary candidate per slot is the highest-confidence survivor
 *   - Alternatives carry up to 3 runner-ups (from other layers)
 *   - Unmatched slots are listed for the UI to highlight red
 */

import type { AssetLibrary, Binding, BindingSlot } from '../asset-library/types';
import type {
  BindingCandidate,
  EntityRef,
  IMatcher,
  MatchContext,
  MatchingEngine,
  MatchLayer,
  Shot,
  ShotBindings,
} from './types';

import { continuityMatcher } from './continuity-matcher';
import { explicitMatcher, parseExplicitRefs } from './explicit-matcher';
import { nameMatcher } from './name-matcher';

// =============================================================================
// Default matcher chain
// =============================================================================

const DEFAULT_CHAIN: IMatcher[] = [
  explicitMatcher, // L1 — strongest
  continuityMatcher, // L5 — prior intent beats raw name match
  nameMatcher, // L2 — fuzzy fallback
];

// =============================================================================
// Facade
// =============================================================================

export class MatchingEngineImpl implements MatchingEngine {
  constructor(private readonly chain: ReadonlyArray<IMatcher> = DEFAULT_CHAIN) {}

  async matchShot(
    shot: Shot,
    library: AssetLibrary,
    context: MatchContext = {},
  ): Promise<ShotBindings> {
    const refs = collectRefs(shot);
    const enable = new Set<MatchLayer>(context.enableLayers ?? ['L1', 'L2', 'L5']);

    const primary: Partial<Record<BindingSlot, BindingCandidate>> = {};
    const alternatives: Partial<Record<BindingSlot, BindingCandidate[]>> = {};
    const unmatched: BindingSlot[] = [];

    for (const ref of refs) {
      const candidates = await runChain(ref, shot, library, context, this.chain, enable);
      if (candidates.length === 0) {
        if (!unmatched.includes(ref.slot)) unmatched.push(ref.slot);
        continue;
      }
      // Sort by confidence (desc); primary = top
      candidates.sort((a, b) => b.confidence - a.confidence);
      const top = candidates[0];
      if (!top) continue;
      // If a different slot ref already claimed this slot, keep the higher confidence
      const existing = primary[ref.slot];
      if (!existing || existing.confidence < top.confidence) {
        primary[ref.slot] = top;
      }
      const others = candidates.slice(1, 4);
      if (others.length > 0) {
        alternatives[ref.slot] = (alternatives[ref.slot] ?? []).concat(others);
      }
    }

    return {
      shotId: shot.id,
      primary,
      alternatives: freezeAlternatives(alternatives),
      unmatched,
    };
  }

  async matchShots(
    shots: ReadonlyArray<Shot>,
    library: AssetLibrary,
    context: Omit<MatchContext, 'previousBindings'> = {},
  ): Promise<ReadonlyArray<ShotBindings>> {
    const results: ShotBindings[] = [];
    const runningPrev: Binding[] = [];

    for (const shot of shots) {
      const bindings = await this.matchShot(shot, library, {
        ...context,
        previousBindings: [...runningPrev].reverse(),
      });
      results.push(bindings);

      // Feed primaries back into the running "previous bindings" for subsequent shots
      for (const [slot, c] of Object.entries(bindings.primary) as [
        BindingSlot,
        BindingCandidate,
      ][]) {
        runningPrev.push({
          id: `running_${shot.id}_${slot}`,
          shotId: shot.id,
          slot,
          entityId: c.entityId,
          assetId: c.assetId,
          provenance: c.provenance,
          confidence: c.confidence,
          userConfirmed: false,
          timestamp: Date.now(),
          ...(shot.sceneGroupId !== undefined && { sceneGroupId: shot.sceneGroupId }),
        });
      }
    }

    return results;
  }
}

export function createMatchingEngine(chain?: ReadonlyArray<IMatcher>): MatchingEngine {
  return new MatchingEngineImpl(chain);
}

// =============================================================================
// Internal helpers
// =============================================================================

async function runChain(
  ref: EntityRef,
  shot: Shot,
  library: AssetLibrary,
  context: MatchContext,
  chain: ReadonlyArray<IMatcher>,
  enable: Set<MatchLayer>,
): Promise<BindingCandidate[]> {
  const candidates: BindingCandidate[] = [];
  for (const matcher of chain) {
    if (!enable.has(matcher.layer)) continue;
    try {
      const c = await matcher.match(ref, shot, library, context);
      if (c) candidates.push(c);
    } catch {
      // Matcher failures shouldn't abort the chain — log and keep going.
      // (No logger injected here; we swallow defensively.)
    }
  }
  return candidates;
}

function collectRefs(shot: Shot): EntityRef[] {
  const fromField = shot.entityRefs ?? [];
  const fromLine = parseExplicitRefs(shot.scriptLine);
  // De-dupe by (slot, entityId|name)
  const seen = new Set<string>();
  const refs: EntityRef[] = [];
  for (const r of [...fromField, ...fromLine]) {
    const key = `${r.slot}:${r.entityId ?? r.name ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(r);
  }
  return refs;
}

function freezeAlternatives(
  alts: Partial<Record<BindingSlot, BindingCandidate[]>>,
): Readonly<Partial<Record<BindingSlot, ReadonlyArray<BindingCandidate>>>> {
  const result: Partial<Record<BindingSlot, ReadonlyArray<BindingCandidate>>> = {};
  for (const [slot, list] of Object.entries(alts) as [BindingSlot, BindingCandidate[]][]) {
    // Keep unique (assetId, provenance) tuples
    const seen = new Set<string>();
    const unique: BindingCandidate[] = [];
    for (const c of list) {
      const key = `${c.provenance}:${c.assetId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(c);
    }
    result[slot] = unique;
  }
  return result;
}

// =============================================================================
// Re-exports
// =============================================================================

export type {
  BindingCandidate,
  EntityRef,
  IMatcher,
  MatchContext,
  MatchLayer,
  MatchingEngine,
  Shot,
  ShotBindings,
} from './types';
export { explicitMatcher, parseExplicitRefs } from './explicit-matcher';
export { nameMatcher, dice } from './name-matcher';
export { continuityMatcher } from './continuity-matcher';
