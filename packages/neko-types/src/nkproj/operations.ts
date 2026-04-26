// =============================================================================
// NKPROJ Format SDK — Operations
//
// Pure helpers for manipulating an NkProj without mutating the input.  These
// are the primitives Lossless-Upgrade flows build on:
//
//   L0 prompt → L1 storyboard:
//     1. `addArtifacts([storyboard.nks])`
//     2. `appendUpgradeEvent({ toLevel: 'L1', addedArtifactIds: ['storyboard.nks'], ... })`
//     OR use the one-shot `recordLosslessUpgrade` which does both.
//
// Every helper returns a new NkProj with `updatedAt` refreshed — callers
// don't have to remember.  Validation is *not* re-run by these helpers;
// the caller runs `validateNkproj` before committing to disk.
// =============================================================================
//
// See docs/architecture/agent-unified-workflow.md (Lossless Upgrade).

import type { NkProj, NkprojArtifactKind, NkprojArtifactRef, NkprojUpgradeEvent } from './types';

// ---------------------------------------------------------------------------
// Artifact primitives
// ---------------------------------------------------------------------------

/**
 * Return every artifact whose `kind` matches.  Stable order (preserves the
 * project's canonical ordering).
 */
export function artifactsByKind(
  proj: NkProj,
  kind: NkprojArtifactKind,
): readonly NkprojArtifactRef[] {
  return proj.artifacts.filter((a) => a.kind === kind);
}

/**
 * Append artifacts.  Existing refs (matched by id) are replaced with the
 * new version; this is how Lossless-Upgrade flows "promote" a stub ref
 * (produced by L0) to the fully-populated form emitted by L2+.
 */
export function addArtifacts(
  proj: NkProj,
  refs: ReadonlyArray<NkprojArtifactRef>,
  opts: { now?: number } = {},
): NkProj {
  if (refs.length === 0) return proj;
  const now = opts.now ?? Date.now();
  const byId = new Map(proj.artifacts.map((a) => [a.id, a]));
  for (const ref of refs) byId.set(ref.id, ref);
  return {
    ...proj,
    artifacts: Array.from(byId.values()),
    updatedAt: now,
  };
}

/**
 * Remove artifacts by id.  Missing ids are silently ignored so callers
 * don't need to filter against the project first.  Upgrade history is
 * not pruned — the event log keeps stale ids so an accidental removal
 * can be traced.
 */
export function removeArtifacts(
  proj: NkProj,
  artifactIds: ReadonlyArray<string>,
  opts: { now?: number } = {},
): NkProj {
  if (artifactIds.length === 0) return proj;
  const drop = new Set(artifactIds);
  const next = proj.artifacts.filter((a) => !drop.has(a.id));
  if (next.length === proj.artifacts.length) return proj;
  const now = opts.now ?? Date.now();
  return { ...proj, artifacts: next, updatedAt: now };
}

// ---------------------------------------------------------------------------
// Upgrade-event primitives
// ---------------------------------------------------------------------------

export interface AppendUpgradeInput {
  readonly toLevel: NkprojUpgradeEvent['toLevel'];
  readonly addedArtifactIds: ReadonlyArray<string>;
  readonly fromLevel?: NkprojUpgradeEvent['fromLevel'];
  readonly reason?: string;
  readonly by?: string;
  readonly at?: number;
}

/**
 * Append a single upgrade event to the project's `upgradeHistory`.
 * The event log is append-only — never prune in place.
 */
export function appendUpgradeEvent(proj: NkProj, input: AppendUpgradeInput): NkProj {
  const event: NkprojUpgradeEvent = {
    at: input.at ?? Date.now(),
    toLevel: input.toLevel,
    addedArtifactIds: [...input.addedArtifactIds],
    ...(input.fromLevel !== undefined && { fromLevel: input.fromLevel }),
    ...(input.reason !== undefined && { reason: input.reason }),
    ...(input.by !== undefined && { by: input.by }),
  };
  const history = proj.upgradeHistory ? [...proj.upgradeHistory, event] : [event];
  return {
    ...proj,
    upgradeHistory: history,
    updatedAt: input.at ?? Date.now(),
  };
}

// ---------------------------------------------------------------------------
// One-shot Lossless Upgrade
// ---------------------------------------------------------------------------

export interface RecordUpgradeInput {
  readonly toLevel: NkprojUpgradeEvent['toLevel'];
  readonly newArtifacts: ReadonlyArray<NkprojArtifactRef>;
  readonly fromLevel?: NkprojUpgradeEvent['fromLevel'];
  readonly reason?: string;
  readonly by?: string;
  readonly at?: number;
}

/**
 * Combine `addArtifacts` + `appendUpgradeEvent` in a single call.  The
 * added artifacts get their `producedByRouteLevel` auto-set to `toLevel`
 * when unset — saves boilerplate at the call site.
 */
export function recordLosslessUpgrade(proj: NkProj, input: RecordUpgradeInput): NkProj {
  const now = input.at ?? Date.now();
  const stamped: NkprojArtifactRef[] = input.newArtifacts.map((a) =>
    a.producedByRouteLevel !== undefined ? a : { ...a, producedByRouteLevel: input.toLevel },
  );
  const withArtifacts = addArtifacts(proj, stamped, { now });
  return appendUpgradeEvent(withArtifacts, {
    toLevel: input.toLevel,
    addedArtifactIds: stamped.map((a) => a.id),
    ...(input.fromLevel !== undefined && { fromLevel: input.fromLevel }),
    ...(input.reason !== undefined && { reason: input.reason }),
    ...(input.by !== undefined && { by: input.by }),
    at: now,
  });
}
