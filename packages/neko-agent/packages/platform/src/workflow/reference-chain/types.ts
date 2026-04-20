/**
 * Reference Chain types — Phase 5 stub.
 *
 * Problem (see docs/architecture/creative-consistency.md §4): even when
 * MatchingEngine binds every shot to the same asset, diffusion-based
 * generators produce per-shot drift because each shot starts from the
 * same static reference.  Feeding *earlier shots' generated output* back
 * in as references cuts drift by anchoring the chain.
 *
 * This file freezes the TypeScript contract so Phase 5 consumers
 * (WorkflowExecutor, MediaGenerationService, canvas `ShotCharacter`)
 * can be built against stable types even before the production chain
 * builder lands.
 */
import type { BindingSlot } from '../asset-library/types';

// =============================================================================
// Public types
// =============================================================================

/**
 * How a shot inherits references from earlier shots in the same
 * continuity group:
 *
 * - `sequential`  — each shot references the immediately preceding
 *                   shot's generated output.  Fastest to drift.
 * - `anchored`    — every shot references the first shot's output.
 *                   Most stable but can feel stiff across long scenes.
 * - `hybrid`      — reference both the anchor (first shot) and the
 *                   previous shot's output.  Recommended default.
 */
export type ReferenceChainStrategy = 'sequential' | 'anchored' | 'hybrid';

/**
 * A single shot's place in the reference chain.  `references` is the
 * ordered list of *prior* shot ids whose generated output should be
 * fed back as reference images when this shot is generated.
 *
 * Ordering matters: the generator should treat index 0 as the primary
 * reference and later entries as secondary.  The hybrid strategy puts
 * the anchor first and the previous shot second.
 */
export interface ReferenceChainEntry {
  readonly shotId: string;
  /** Slot this chain targets (character / scene / etc). */
  readonly slot: BindingSlot;
  /** Ordered list of ancestor shot ids to reference. */
  readonly references: ReadonlyArray<string>;
  /** Strategy that produced this entry (for explainability / debugging). */
  readonly strategy: ReferenceChainStrategy;
}

/**
 * Minimum shot shape consumed by the builder — kept decoupled from the
 * full canvas `ShotCanvasNode` so Phase 5 integration can land
 * incrementally without pulling engine-side types into platform.
 */
export interface ReferenceChainShot {
  readonly shotId: string;
  /** Shot index in the storyboard (used to order the chain). */
  readonly index: number;
  /** Optional scene-group id; shots in different groups never chain. */
  readonly sceneGroupId?: string;
  /** Tags such as "scene-change" that break continuity within a group. */
  readonly tags?: ReadonlyArray<string>;
  /** Bound entities that participate in the chain (by slot → entityId). */
  readonly boundEntities: Readonly<Partial<Record<BindingSlot, string>>>;
}

// =============================================================================
// Builder options
// =============================================================================

export interface BuildReferenceChainOptions {
  /** Strategy applied to every entry.  Default: `hybrid`. */
  readonly strategy?: ReferenceChainStrategy;
  /**
   * Which slots should participate.  Default is `['character']` — that's
   * where drift bites hardest — but callers can widen to scene / prop
   * when they want those locked too.
   */
  readonly slots?: ReadonlyArray<BindingSlot>;
  /**
   * When true, tags that match this set force a chain break regardless
   * of sceneGroupId.  Default: `['scene-change']`.
   */
  readonly breakTags?: ReadonlyArray<string>;
  /**
   * Maximum number of references returned per entry.  Defaults vary by
   * strategy: 1 for sequential/anchored, 2 for hybrid.  Callers may
   * raise this when a generator supports more reference slots.
   */
  readonly maxReferences?: number;
}

// =============================================================================
// Builder interface (stub — production impl lands in Phase 5)
// =============================================================================

/**
 * Pure reference-chain builder.  Given a contiguous list of shots and
 * options, returns one `ReferenceChainEntry` per (shot, slot) pair that
 * is actually chained.
 */
export interface ReferenceChainBuilder {
  build(
    shots: ReadonlyArray<ReferenceChainShot>,
    options?: BuildReferenceChainOptions,
  ): ReadonlyArray<ReferenceChainEntry>;
}
