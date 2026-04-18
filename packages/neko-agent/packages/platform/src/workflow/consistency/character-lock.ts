/**
 * character_lock — same character entity must keep the same asset variant
 * within a scope (defaults to sceneGroupId).
 *
 * Emits:
 *   - One Constraint per (entity, scene group) describing the locked asset.
 *   - One Violation per shot that deviates from the lock, with a fix that
 *     replaces its binding with the canonical locked asset.
 *
 * Break conditions:
 *   - shot.tags.includes('scene-change')          (explicit scene break)
 *   - shot.tags.includes('character-change')      (character intentionally changes)
 *
 * See docs/architecture/creative-consistency.md §2.1.
 */

import type { BindingSlot } from '../asset-library/types';
import type { Shot, ShotBindings } from '../matching/types';
import type { CheckContext, Constraint, ConsistencyRule, Violation } from './types';

const KIND = 'character_lock' as const;
const SLOT: BindingSlot = 'character';

export const characterLockRule: ConsistencyRule = {
  kind: KIND,
  check({ shots, bindings }: CheckContext) {
    const constraints: Constraint[] = [];
    const violations: Violation[] = [];

    // Group shots by sceneGroupId (shots without a group form singleton groups)
    const groups = groupByScene(shots);

    for (const [groupId, groupShots] of groups) {
      const perEntity = indexByEntity(groupShots, bindings);
      for (const [entityId, occurrences] of perEntity) {
        if (occurrences.length < 2) continue;

        // Anchor = first user-confirmed binding; else first primary
        const anchor = pickAnchor(occurrences);
        if (!anchor) continue;

        constraints.push({
          id: `lock_${entityId}_${groupId}`,
          kind: KIND,
          entity: entityId,
          shots: occurrences.map((o) => o.shotId),
          payload: { lockedAsset: anchor.assetId, scope: { sceneGroupId: groupId } },
          severity: 'error',
        });

        // Emit violations for any occurrence whose asset disagrees with the
        // anchor, unless the shot explicitly breaks continuity.
        for (const occ of occurrences) {
          if (occ.assetId === anchor.assetId) continue;
          if (occ.isBreak) continue;
          violations.push({
            id: `v_${entityId}_${occ.shotId}`,
            kind: KIND,
            severity: 'error',
            constraintId: `lock_${entityId}_${groupId}`,
            shotIds: [occ.shotId],
            entity: entityId,
            slot: SLOT,
            message:
              `Character "${entityId}" uses ${occ.assetId} in shot ${occ.shotId}, ` +
              `but the scene locks it to ${anchor.assetId}.`,
            suggestions: [
              {
                kind: 'replace-binding',
                shotId: occ.shotId,
                slot: SLOT,
                assetId: anchor.assetId,
              },
              { kind: 'add-scene-break', beforeShot: occ.shotId },
              {
                kind: 'accept-as-intentional',
                note: `Override character_lock for ${entityId}`,
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

function groupByScene(shots: readonly Shot[]): Map<string, Shot[]> {
  const result = new Map<string, Shot[]>();
  for (const shot of shots) {
    const key = shot.sceneGroupId ?? `__solo:${shot.id}`;
    const list = result.get(key) ?? [];
    list.push(shot);
    result.set(key, list);
  }
  return result;
}

interface Occurrence {
  shotId: string;
  assetId: string;
  userConfirmed: boolean;
  isBreak: boolean;
}

function indexByEntity(
  shots: readonly Shot[],
  bindings: readonly ShotBindings[],
): Map<string, Occurrence[]> {
  const byShotId = new Map(bindings.map((b) => [b.shotId, b]));
  const result = new Map<string, Occurrence[]>();
  for (const shot of shots) {
    const shotBindings = byShotId.get(shot.id);
    if (!shotBindings) continue;
    const primary = shotBindings.primary[SLOT];
    if (!primary) continue;
    const occ: Occurrence = {
      shotId: shot.id,
      assetId: primary.assetId,
      userConfirmed: Boolean(
        (shotBindings as unknown as { userConfirmed?: boolean }).userConfirmed,
      ),
      isBreak:
        (shot.tags ?? []).includes('scene-change') ||
        (shot.tags ?? []).includes('character-change'),
    };
    const list = result.get(primary.entityId) ?? [];
    list.push(occ);
    result.set(primary.entityId, list);
  }
  return result;
}

function pickAnchor(occurrences: readonly Occurrence[]): Occurrence | undefined {
  return occurrences.find((o) => o.userConfirmed) ?? occurrences[0];
}
