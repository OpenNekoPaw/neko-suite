/**
 * L1 ExplicitMatcher — matches inline tags in script lines.
 *
 * Syntax: `@slot:entityId` (with optional `#variant`)
 *   e.g. `@character:alice`, `@scene:forest_day`, `@character:alice#formal`
 *
 * See docs/architecture/cross-modal-matching.md §5.
 */

import type { AssetLibrary } from '../asset-library/types';
import type { BindingCandidate, EntityRef, IMatcher, MatchContext, Shot } from './types';

/** Strict regex: slot and id must be [a-z0-9_-] (no spaces) to avoid grabbing too much */
const TAG_RE = /@([a-z]+):([a-z0-9_-]+)(?:#([a-z0-9_-]+))?/gi;

export const explicitMatcher: IMatcher = {
  layer: 'L1',
  async match(
    ref: EntityRef,
    _shot: Shot,
    library: AssetLibrary,
    _context: MatchContext,
  ): Promise<BindingCandidate | undefined> {
    // L1 trusts the caller: only fires when the ref already carries an entityId.
    if (!ref.entityId) return undefined;

    const entity = library.getEntity(ref.entityId);
    if (!entity) return undefined;

    // Prefer an asset that matches the variant hint if any
    const candidates = library.findAssetsForEntity(ref.entityId);
    if (candidates.length === 0) return undefined;

    const chosen = ref.variant
      ? (candidates.find((a) => assetMatchesVariant(a.variants, ref.variant!)) ?? candidates[0])
      : candidates[0];
    if (!chosen) return undefined;

    return {
      slot: ref.slot,
      entityId: entity.id,
      assetId: chosen.id,
      provenance: 'L1',
      confidence: 0.98,
      reason: ref.variant
        ? `Explicit tag @${ref.slot}:${entity.id}#${ref.variant}`
        : `Explicit tag @${ref.slot}:${entity.id}`,
    };
  },
};

/**
 * Parses @slot:id#variant markers out of a script line into EntityRefs.
 *
 * Pure helper; used by PlanBuilder to pre-populate Shot.entityRefs before
 * handing to MatchingEngine.
 */
export function parseExplicitRefs(scriptLine: string | undefined): EntityRef[] {
  if (!scriptLine) return [];
  const refs: EntityRef[] = [];
  const regex = new RegExp(TAG_RE.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = regex.exec(scriptLine)) !== null) {
    const rawSlot = m[1]!.toLowerCase();
    const entityId = m[2]!.toLowerCase();
    const variant = m[3]?.toLowerCase();
    const slot = normalizeSlot(rawSlot);
    if (!slot) continue;
    refs.push({
      slot,
      entityId,
      ...(variant !== undefined && { variant }),
    });
  }
  return refs;
}

function normalizeSlot(raw: string): import('../asset-library/types').BindingSlot | undefined {
  switch (raw) {
    case 'character':
    case 'char':
    case 'person':
      return 'character';
    case 'scene':
    case 'location':
    case 'setting':
      return 'scene';
    case 'action':
    case 'verb':
      return 'action';
    case 'prop':
    case 'object':
      return 'prop';
    case 'style':
    case 'mood':
      return 'style';
    default:
      return undefined;
  }
}

function assetMatchesVariant(
  variants: Readonly<Record<string, string | number | boolean>> | undefined,
  target: string,
): boolean {
  if (!variants) return false;
  for (const value of Object.values(variants)) {
    if (typeof value === 'string' && value.toLowerCase() === target) return true;
  }
  return false;
}
