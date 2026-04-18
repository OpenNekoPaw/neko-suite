/**
 * MatchingEngine Types — see docs/architecture/cross-modal-matching.md
 *
 * Layer: Horizontal subsystem (consumed by Plan layer's PlanBuilder)
 */

import type { AssetLibrary, Binding, BindingSlot } from '../asset-library/types';

// =============================================================================
// Shot / Entity reference
// =============================================================================

/**
 * Minimal shot descriptor MatchingEngine needs.
 * Intentionally decoupled from canvas ShotCanvasNode — only what matching needs.
 */
export interface Shot {
  readonly id: string;
  /** Script line / description text (used by L1/L2/L3 matchers) */
  readonly scriptLine?: string;
  /** Pre-extracted entity references (e.g., from NekoStoryAPI) */
  readonly entityRefs?: ReadonlyArray<EntityRef>;
  /** Scene group for continuity grouping */
  readonly sceneGroupId?: string;
  /** Shot index in the story/canvas (for sequential continuity) */
  readonly index?: number;
  /** Optional free-form tags (e.g., 'scene-change' breaks continuity) */
  readonly tags?: ReadonlyArray<string>;
}

/**
 * A reference to an entity extracted from the script line.
 *
 * Either a direct entityId (when L1 explicit tags are present)
 * or a name (looked up via AssetLibrary.resolveEntityByName).
 */
export interface EntityRef {
  readonly slot: BindingSlot;
  readonly entityId?: string;
  readonly name?: string;
  /** Optional variant hint ("dawn", "casual") */
  readonly variant?: string;
}

// =============================================================================
// Match result
// =============================================================================

export interface BindingCandidate {
  readonly slot: BindingSlot;
  readonly entityId: string;
  readonly assetId: string;
  /**
   * 'L1'..'L5' — MatchingEngine layer that proposed this candidate.
   * 'user' — candidate introduced by a user edit (matrix override).
   */
  readonly provenance: 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'user';
  readonly confidence: number;
  readonly reason?: string;
}

export interface ShotBindings {
  readonly shotId: string;
  /** Primary candidate per slot (may be undefined when no candidate found) */
  readonly primary: Readonly<Partial<Record<BindingSlot, BindingCandidate>>>;
  /** Alternative candidates per slot (sorted by confidence desc) */
  readonly alternatives: Readonly<Partial<Record<BindingSlot, ReadonlyArray<BindingCandidate>>>>;
  /** Slots that had an entity ref but no candidate */
  readonly unmatched: ReadonlyArray<BindingSlot>;
}

// =============================================================================
// Match context
// =============================================================================

export type MatchLayer = 'L1' | 'L2' | 'L3' | 'L4' | 'L5';

export interface MatchContext {
  /** Previous shot bindings (for L5 continuity) — most-recent first */
  readonly previousBindings?: ReadonlyArray<Binding>;
  /** Layers to enable (subset) — omit to use all available for this build */
  readonly enableLayers?: ReadonlyArray<MatchLayer>;
  /** Scene group context (overrides shot.sceneGroupId if provided) */
  readonly sceneGroupId?: string;
}

// =============================================================================
// MatchingEngine interface
// =============================================================================

export interface MatchingEngine {
  matchShot(shot: Shot, library: AssetLibrary, context?: MatchContext): Promise<ShotBindings>;

  matchShots(
    shots: ReadonlyArray<Shot>,
    library: AssetLibrary,
    context?: Omit<MatchContext, 'previousBindings'>,
  ): Promise<ReadonlyArray<ShotBindings>>;
}

// =============================================================================
// Matcher interface (internal)
// =============================================================================

/**
 * Each layer implements this interface. The facade composes them in priority order.
 */
export interface IMatcher {
  readonly layer: MatchLayer;
  match(
    ref: EntityRef,
    shot: Shot,
    library: AssetLibrary,
    context: MatchContext,
  ): Promise<BindingCandidate | undefined>;
}
