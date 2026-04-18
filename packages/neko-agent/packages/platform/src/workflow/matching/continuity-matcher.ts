/**
 * L5 ContinuityMatcher — re-use the previous shot's binding when plausible.
 *
 * Rule: if a previous shot (in the same scene group, or the immediately
 * preceding shot) had a binding for this entity, prefer that same asset.
 *
 * Priority: L5 runs BEFORE L2 in the engine's pipeline — continuity beats
 * raw name-match because it reflects the user's earlier intent.
 *
 * See docs/architecture/cross-modal-matching.md §9.
 */

import type { AssetLibrary } from '../asset-library/types';
import type { BindingCandidate, EntityRef, IMatcher, MatchContext, Shot } from './types';

export const continuityMatcher: IMatcher = {
  layer: 'L5',
  async match(
    ref: EntityRef,
    shot: Shot,
    library: AssetLibrary,
    context: MatchContext,
  ): Promise<BindingCandidate | undefined> {
    // We need either an explicit entityId or a resolvable name to know which entity to track
    const entityId = resolveEntityId(ref, library);
    if (!entityId) return undefined;

    // Check for a scene-change tag that breaks continuity
    if (shot.tags?.includes('scene-change')) return undefined;

    const sceneGroupId = context.sceneGroupId ?? shot.sceneGroupId;

    // Look in the caller-supplied prior bindings first (most explicit)
    if (context.previousBindings && context.previousBindings.length > 0) {
      for (const b of context.previousBindings) {
        if (b.slot !== ref.slot) continue;
        if (b.entityId !== entityId) continue;
        if (sceneGroupId !== undefined && b.sceneGroupId !== sceneGroupId) continue;
        // Verify the asset still exists
        if (!library.getAsset(b.assetId)) continue;
        return {
          slot: ref.slot,
          entityId,
          assetId: b.assetId,
          provenance: 'L5',
          confidence: 0.9,
          reason: `Continuity reuse from shot ${b.shotId}`,
        };
      }
    }

    // Otherwise: query AssetLibrary's binding history directly
    const historic = library.findBindings({
      entityId,
      slot: ref.slot,
      ...(sceneGroupId !== undefined && { sceneGroupId }),
      limit: 1,
    });
    const latest = historic[0];
    if (!latest) return undefined;
    if (!library.getAsset(latest.assetId)) return undefined;

    return {
      slot: ref.slot,
      entityId,
      assetId: latest.assetId,
      provenance: 'L5',
      confidence: 0.88,
      reason: `Continuity reuse (history of shot ${latest.shotId})`,
    };
  },
};

// =============================================================================
// Helpers
// =============================================================================

function resolveEntityId(ref: EntityRef, library: AssetLibrary): string | undefined {
  if (ref.entityId) return ref.entityId;
  if (!ref.name) return undefined;
  return library.resolveEntityByName(ref.name)?.id;
}
