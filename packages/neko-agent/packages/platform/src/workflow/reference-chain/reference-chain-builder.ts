/**
 * Reference Chain Builder — Phase 5 stub implementation.
 *
 * Computes per-shot reference lists based on the chosen strategy and
 * scene-group / break-tag boundaries.  Pure, deterministic, no I/O.
 *
 * Consumed by (all pending Phase 5 wire-up):
 *   - PlanBuilder: stores the chain inside `.nkplan` for review
 *   - PipelineExecutor: threads ancestor outputs into each shot's
 *     generation call via MediaGenerationService
 *   - Canvas `ShotCharacter.referenceChain` field (new, Phase 5)
 *
 * See docs/architecture/creative-consistency.md §4.
 */

import type { BindingSlot } from '../asset-library/types';
import type {
  BuildReferenceChainOptions,
  ReferenceChainBuilder,
  ReferenceChainEntry,
  ReferenceChainShot,
  ReferenceChainStrategy,
} from './types';

// =============================================================================
// Defaults
// =============================================================================

const DEFAULT_STRATEGY: ReferenceChainStrategy = 'hybrid';
const DEFAULT_SLOTS: ReadonlyArray<BindingSlot> = ['character'];
const DEFAULT_BREAK_TAGS = new Set(['scene-change']);

// =============================================================================
// Implementation
// =============================================================================

export function buildReferenceChain(
  shots: ReadonlyArray<ReferenceChainShot>,
  options: BuildReferenceChainOptions = {},
): ReadonlyArray<ReferenceChainEntry> {
  const strategy = options.strategy ?? DEFAULT_STRATEGY;
  const slots = options.slots ?? DEFAULT_SLOTS;
  const breakTags = options.breakTags ? new Set(options.breakTags) : DEFAULT_BREAK_TAGS;
  const maxRefs = options.maxReferences ?? defaultMaxReferences(strategy);

  const ordered = [...shots].sort((a, b) => a.index - b.index);
  const entries: ReferenceChainEntry[] = [];

  for (const slot of slots) {
    // Iterate per slot so each slot's chain is independent — breaking
    // a character's chain doesn't break the scene's chain etc.
    let anchor: ReferenceChainShot | undefined;
    let prev: ReferenceChainShot | undefined;

    for (const shot of ordered) {
      const entityId = shot.boundEntities[slot];
      if (entityId === undefined) {
        // No binding for this slot on this shot — treat as a chain break.
        anchor = undefined;
        prev = undefined;
        continue;
      }

      const breaks = (() => {
        if (!anchor || !prev) return true;
        if (shot.sceneGroupId !== anchor.sceneGroupId) return true;
        if (shot.tags && shot.tags.some((t) => breakTags.has(t))) return true;
        // Entity changed within the group — new anchor.
        if (anchor.boundEntities[slot] !== entityId) return true;
        return false;
      })();

      if (breaks) {
        // Start (or restart) the chain at this shot.
        anchor = shot;
        prev = shot;
        continue;
      }

      // We are chained — emit a ReferenceChainEntry for this shot.
      const refs = pickReferences(strategy, anchor!, prev!, maxRefs);
      if (refs.length > 0) {
        entries.push({
          shotId: shot.shotId,
          slot,
          references: refs,
          strategy,
        });
      }
      prev = shot;
    }
  }

  return entries;
}

export function createReferenceChainBuilder(): ReferenceChainBuilder {
  return { build: buildReferenceChain };
}

// =============================================================================
// Helpers (pure)
// =============================================================================

function pickReferences(
  strategy: ReferenceChainStrategy,
  anchor: ReferenceChainShot,
  prev: ReferenceChainShot,
  maxRefs: number,
): string[] {
  switch (strategy) {
    case 'anchored':
      return [anchor.shotId].slice(0, maxRefs);
    case 'sequential':
      return [prev.shotId].slice(0, maxRefs);
    case 'hybrid': {
      if (anchor.shotId === prev.shotId) return [anchor.shotId].slice(0, maxRefs);
      return [anchor.shotId, prev.shotId].slice(0, maxRefs);
    }
  }
}

function defaultMaxReferences(strategy: ReferenceChainStrategy): number {
  return strategy === 'hybrid' ? 2 : 1;
}
