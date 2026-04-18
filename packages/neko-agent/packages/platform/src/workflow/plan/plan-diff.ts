/**
 * PlanDiff — structural diff between two plans.
 *
 * Used by the matrix editor UI to show "what changed" when forking, editing,
 * or comparing to a parent plan. Operates on PersistentPlan so both LitePlan
 * (via toNkPlan) and disk-loaded .nkplan files share the same surface.
 *
 * Diff categories:
 *   - route: level / flowId / skipStages
 *   - stage: added / removed / skipped-toggled / checkpoint-toggled
 *   - shot: primary-swapped / unmatched-changed / confirmed-toggled
 *   - constraint: added / removed (id-keyed)
 *
 * Output is wire-safe (plain JSON, no class instances).
 */

import type { PersistentPlan } from './persistence-types';

// =============================================================================
// Diff entry shapes
// =============================================================================

export type RouteChangeKind = 'level' | 'flowId' | 'skipStages' | 'entryExtension';

export interface RouteChange {
  kind: RouteChangeKind;
  from: string | readonly string[];
  to: string | readonly string[];
}

export type StageChangeKind = 'added' | 'removed' | 'skippedToggled' | 'checkpointToggled';

export interface StageChange {
  kind: StageChangeKind;
  stageId: string;
  /** For toggled variants, the new value */
  value?: boolean;
}

export type ShotChangeKind =
  | 'primarySwapped'
  | 'unmatchedChanged'
  | 'confirmedToggled'
  | 'shotAdded'
  | 'shotRemoved';

export interface ShotChange {
  kind: ShotChangeKind;
  shotId: string;
  /** Slot affected for primarySwapped */
  slot?: string;
  /** Previous assetId (primarySwapped) */
  fromAssetId?: string;
  /** New assetId (primarySwapped) */
  toAssetId?: string;
  /** New value for confirmedToggled */
  value?: boolean;
}

export type ConstraintChangeKind = 'added' | 'removed';

export interface ConstraintChange {
  kind: ConstraintChangeKind;
  constraintId: string;
  constraintKind: string;
}

export interface PlanDiff {
  leftId: string;
  rightId: string;
  route: readonly RouteChange[];
  stages: readonly StageChange[];
  shots: readonly ShotChange[];
  constraints: readonly ConstraintChange[];
  /** Convenience: true when none of the categories have entries. */
  unchanged: boolean;
}

// =============================================================================
// API
// =============================================================================

/**
 * Compute the diff of two plans. The direction is `left → right` — i.e.
 * entries describe the transformation needed to go from `left` to `right`.
 */
export function diffPlans(left: PersistentPlan, right: PersistentPlan): PlanDiff {
  const route = diffRoute(left, right);
  const stages = diffStages(left, right);
  const shots = diffShots(left, right);
  const constraints = diffConstraints(left, right);
  const unchanged =
    route.length === 0 && stages.length === 0 && shots.length === 0 && constraints.length === 0;
  return {
    leftId: left.id,
    rightId: right.id,
    route,
    stages,
    shots,
    constraints,
    unchanged,
  };
}

// =============================================================================
// Internals — each returns a fresh array to keep callers predictable
// =============================================================================

function diffRoute(left: PersistentPlan, right: PersistentPlan): RouteChange[] {
  const out: RouteChange[] = [];
  if (left.route.level !== right.route.level) {
    out.push({ kind: 'level', from: left.route.level, to: right.route.level });
  }
  if (left.route.flowId !== right.route.flowId) {
    out.push({ kind: 'flowId', from: left.route.flowId, to: right.route.flowId });
  }
  if (left.route.entryExtension !== right.route.entryExtension) {
    out.push({
      kind: 'entryExtension',
      from: left.route.entryExtension,
      to: right.route.entryExtension,
    });
  }
  if (!arrayEquals(left.route.skipStages, right.route.skipStages)) {
    out.push({
      kind: 'skipStages',
      from: [...left.route.skipStages],
      to: [...right.route.skipStages],
    });
  }
  return out;
}

function diffStages(left: PersistentPlan, right: PersistentPlan): StageChange[] {
  const out: StageChange[] = [];
  const leftMap = new Map(left.stages.map((s) => [s.id, s]));
  const rightMap = new Map(right.stages.map((s) => [s.id, s]));

  for (const stage of right.stages) {
    const before = leftMap.get(stage.id);
    if (!before) {
      out.push({ kind: 'added', stageId: stage.id });
      continue;
    }
    if (before.skipped !== stage.skipped) {
      out.push({ kind: 'skippedToggled', stageId: stage.id, value: stage.skipped });
    }
    const leftCheckpoint = before.userCheckpoint === true;
    const rightCheckpoint = stage.userCheckpoint === true;
    if (leftCheckpoint !== rightCheckpoint) {
      out.push({ kind: 'checkpointToggled', stageId: stage.id, value: rightCheckpoint });
    }
  }
  for (const stage of left.stages) {
    if (!rightMap.has(stage.id)) {
      out.push({ kind: 'removed', stageId: stage.id });
    }
  }
  return out;
}

function diffShots(left: PersistentPlan, right: PersistentPlan): ShotChange[] {
  const out: ShotChange[] = [];
  const leftShots = left.shots ?? [];
  const rightShots = right.shots ?? [];
  const leftMap = new Map(leftShots.map((s) => [s.shotId, s]));
  const rightMap = new Map(rightShots.map((s) => [s.shotId, s]));

  for (const shot of rightShots) {
    const before = leftMap.get(shot.shotId);
    if (!before) {
      out.push({ kind: 'shotAdded', shotId: shot.shotId });
      continue;
    }
    // Primary swaps per slot
    const slots = new Set<string>([...Object.keys(before.primary), ...Object.keys(shot.primary)]);
    for (const slot of slots) {
      const fromAsset = (before.primary as Record<string, { assetId: string } | undefined>)[slot]
        ?.assetId;
      const toAsset = (shot.primary as Record<string, { assetId: string } | undefined>)[slot]
        ?.assetId;
      if (fromAsset !== toAsset) {
        out.push({
          kind: 'primarySwapped',
          shotId: shot.shotId,
          slot,
          ...(fromAsset !== undefined && { fromAssetId: fromAsset }),
          ...(toAsset !== undefined && { toAssetId: toAsset }),
        });
      }
    }
    // Unmatched list
    if (!arrayEquals(before.unmatched, shot.unmatched)) {
      out.push({ kind: 'unmatchedChanged', shotId: shot.shotId });
    }
    // userConfirmed toggle
    const leftConfirmed = before.userConfirmed === true;
    const rightConfirmed = shot.userConfirmed === true;
    if (leftConfirmed !== rightConfirmed) {
      out.push({
        kind: 'confirmedToggled',
        shotId: shot.shotId,
        value: rightConfirmed,
      });
    }
  }
  for (const shot of leftShots) {
    if (!rightMap.has(shot.shotId)) {
      out.push({ kind: 'shotRemoved', shotId: shot.shotId });
    }
  }
  return out;
}

function diffConstraints(left: PersistentPlan, right: PersistentPlan): ConstraintChange[] {
  const out: ConstraintChange[] = [];
  const leftMap = new Map((left.constraints ?? []).map((c) => [c.id, c]));
  const rightMap = new Map((right.constraints ?? []).map((c) => [c.id, c]));

  for (const c of right.constraints ?? []) {
    if (!leftMap.has(c.id)) {
      out.push({ kind: 'added', constraintId: c.id, constraintKind: c.kind });
    }
  }
  for (const c of left.constraints ?? []) {
    if (!rightMap.has(c.id)) {
      out.push({ kind: 'removed', constraintId: c.id, constraintKind: c.kind });
    }
  }
  return out;
}

function arrayEquals<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
