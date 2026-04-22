/**
 * ProgressNarrator — pure text composer for user-facing progress.
 *
 * See: docs/architecture/dual-flow-architecture.md §3.2 Status
 *      plan v2 P5 (ProgressNarrator + MilestoneTracker)
 *
 * Responsibility: turn milestones (produced by MilestoneTracker) into
 * concise, user-readable narrative lines. No subscriptions, no side
 * effects — callers compose it with whatever input they have.
 *
 * Typical pipeline:
 *   MilestoneTracker (subscribes to EventBus)
 *      → history: Milestone[]
 *      → ProgressNarrator.narrate(history)
 *      → CreationStatusUpdatedEvent / UI text strip
 *
 * Design rules:
 *   - Pure + sync: same inputs always yield the same output.
 *   - Configurable format: icons + verbosity + language are injectable
 *     without forking the module.
 *   - Stable ordering: output follows milestone insertion order.
 */

import type { Milestone, MilestoneKind } from './milestone-tracker';

// =============================================================================
// Config
// =============================================================================

export interface NarrationFormat {
  /**
   * Per-kind icon / prefix. Missing entries fall back to
   * `defaultIcon`.
   */
  icons?: Partial<Record<MilestoneKind, string>>;
  /** Used when a kind has no explicit icon. */
  defaultIcon?: string;
  /**
   * 'compact' — single-line "icon label" per milestone.
   * 'timestamped' — "icon [HH:MM:SS] label".
   * Default 'compact'.
   */
  style?: 'compact' | 'timestamped';
}

export const DEFAULT_NARRATION_ICONS: Record<MilestoneKind, string> = {
  'run-started': '▶',
  'run-ended': '■',
  'round-decided': '·',
  autoheal: '↻',
  'quality-evaluated': '✓',
  'draft-presented': '◌',
  'review-decided': '◉',
  'status-updated': '…',
  'artifact-written': '✎',
  'artifact-invalid': '⚠',
  other: '•',
};

// =============================================================================
// Narrator
// =============================================================================

/**
 * Render a single milestone as one line.
 */
export function narrateOne(milestone: Milestone, format: NarrationFormat = {}): string {
  const icons = { ...DEFAULT_NARRATION_ICONS, ...(format.icons ?? {}) };
  const icon = icons[milestone.kind] ?? format.defaultIcon ?? '•';
  const style = format.style ?? 'compact';
  if (style === 'timestamped') {
    return `${icon} [${formatTime(milestone.at)}] ${milestone.label}`;
  }
  return `${icon} ${milestone.label}`;
}

/**
 * Render a run's full progress as a multi-line narrative, in order.
 * An optional `runId` filter scopes the output to a single run.
 */
export function narrate(
  milestones: readonly Milestone[],
  format: NarrationFormat = {},
  runId?: string,
): string {
  const filtered = runId ? milestones.filter((m) => m.runId === runId) : milestones;
  return filtered.map((m) => narrateOne(m, format)).join('\n');
}

/**
 * Compose a one-line headline suitable for the creation-flow Status
 * primitive: latest milestone + a counter like `(3/7 rounds)`.
 * Returns null if there is nothing to narrate.
 */
export function narrateHeadline(
  milestones: readonly Milestone[],
  format: NarrationFormat = {},
): string | null {
  if (milestones.length === 0) return null;
  const latest = milestones[milestones.length - 1]!;
  const rounds = milestones.filter((m) => m.kind === 'round-decided').length;
  const line = narrateOne(latest, format);
  return rounds > 0 ? `${line} (${rounds} round${rounds === 1 ? '' : 's'})` : line;
}

// =============================================================================
// Helpers
// =============================================================================

function formatTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
