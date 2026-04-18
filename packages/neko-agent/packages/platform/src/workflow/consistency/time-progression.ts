/**
 * time_progression — scene time advances monotonically along the shot order.
 *
 * Time is inferred from the scene asset id suffix (`forest_dawn`,
 * `forest_morning`, ...). When adjacent shots share an entity but carry
 * non-monotonic time suffixes (and no scene-change tag), we emit a violation.
 *
 * Time ordering (lowercase):
 *   dawn < morning < noon < afternoon < dusk < night
 *
 * See docs/architecture/creative-consistency.md §2.2.
 */

import type { Shot, ShotBindings } from '../matching/types';
import type { CheckContext, Constraint, ConsistencyRule, Violation } from './types';

const KIND = 'time_progression' as const;

const ORDER: readonly string[] = ['dawn', 'morning', 'noon', 'afternoon', 'dusk', 'night'];

export const timeProgressionRule: ConsistencyRule = {
  kind: KIND,
  check({ shots, bindings }: CheckContext) {
    const constraints: Constraint[] = [];
    const violations: Violation[] = [];

    // Group primary scene bindings by entity so we can check monotonicity
    // across the scene's appearances.
    const byEntity = indexScenesByEntity(shots, bindings);

    for (const [entityId, occurrences] of byEntity) {
      if (occurrences.length < 2) continue;

      const sequence = orderedTimesFor(occurrences);
      if (sequence.length > 0) {
        constraints.push({
          id: `time_${entityId}`,
          kind: KIND,
          entity: entityId,
          shots: occurrences.map((o) => o.shotId),
          payload: { sequence },
          severity: 'warning',
        });
      }

      for (let i = 1; i < occurrences.length; i++) {
        const prev = occurrences[i - 1]!;
        const curr = occurrences[i]!;
        if (curr.isBreak) continue;
        if (prev.timeIdx < 0 || curr.timeIdx < 0) continue;
        if (curr.timeIdx < prev.timeIdx) {
          violations.push({
            id: `vtime_${entityId}_${curr.shotId}`,
            kind: KIND,
            severity: 'warning',
            constraintId: `time_${entityId}`,
            shotIds: [prev.shotId, curr.shotId],
            entity: entityId,
            slot: 'scene',
            message: `Scene "${entityId}" rewinds from ${prev.timeLabel} in shot ${prev.shotId} to ${curr.timeLabel} in shot ${curr.shotId}.`,
            suggestions: [
              { kind: 'add-scene-break', beforeShot: curr.shotId },
              {
                kind: 'accept-as-intentional',
                note: `Accept time reversal between ${prev.shotId} and ${curr.shotId}`,
              },
            ],
          });
        }
      }
    }

    return { constraints, violations };
  },
};

// =============================================================================
// Helpers
// =============================================================================

interface SceneOccurrence {
  shotId: string;
  order: number;
  assetId: string;
  timeLabel: string;
  /** Position in ORDER, or -1 if the asset has no known time suffix */
  timeIdx: number;
  isBreak: boolean;
}

function indexScenesByEntity(
  shots: readonly Shot[],
  bindings: readonly ShotBindings[],
): Map<string, SceneOccurrence[]> {
  const byShotId = new Map(bindings.map((b) => [b.shotId, b]));
  const result = new Map<string, SceneOccurrence[]>();
  shots.forEach((shot, order) => {
    const shotBindings = byShotId.get(shot.id);
    if (!shotBindings) return;
    const primary = shotBindings.primary['scene'];
    if (!primary) return;
    const occ = buildOccurrence(shot, order, primary.entityId, primary.assetId);
    const list = result.get(primary.entityId) ?? [];
    list.push(occ);
    result.set(primary.entityId, list);
  });
  // Sort occurrences by original shot order so monotonicity check is meaningful
  for (const list of result.values()) list.sort((a, b) => a.order - b.order);
  return result;
}

function buildOccurrence(
  shot: Shot,
  order: number,
  _entityId: string,
  assetId: string,
): SceneOccurrence {
  const { timeLabel, timeIdx } = extractTime(assetId);
  return {
    shotId: shot.id,
    order,
    assetId,
    timeLabel,
    timeIdx,
    isBreak: (shot.tags ?? []).includes('scene-change'),
  };
}

function extractTime(assetId: string): { timeLabel: string; timeIdx: number } {
  const lower = assetId.toLowerCase();
  for (let i = 0; i < ORDER.length; i++) {
    if (lower.includes(ORDER[i]!)) {
      return { timeLabel: ORDER[i]!, timeIdx: i };
    }
  }
  return { timeLabel: '', timeIdx: -1 };
}

function orderedTimesFor(occurrences: readonly SceneOccurrence[]): string[] {
  const seen = new Set<string>();
  const sequence: string[] = [];
  for (const occ of occurrences) {
    if (!occ.timeLabel || seen.has(occ.timeLabel)) continue;
    seen.add(occ.timeLabel);
    sequence.push(occ.timeLabel);
  }
  return sequence;
}

export const __internal = { extractTime, ORDER };
