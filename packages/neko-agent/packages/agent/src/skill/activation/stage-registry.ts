/**
 * Stage Registry — metadata + dependency DAG for the three SDD stages.
 *
 * See: docs/architecture/agent-unified-workflow.md §4
 *
 * Single source of truth for:
 *   - Which stages depend on which (Draft → Plan → Apply)
 *   - Which stage is always-mandatory (Apply only)
 *   - Canonical execution order within a run
 *
 * Pure data + pure helpers. No executor calls, no I/O. Safe to import from
 * tests and from the stage-planner.
 *
 * Renamed 2026-04-22 (ADR §4 revision): specify/plan/tasks/implement →
 * draft/plan/apply. The `tasks` stage was merged into `plan`.
 */

import type { SddStage, StageSet } from '@neko-agent/types';

// =============================================================================
// Metadata
// =============================================================================

export interface StageMetadata {
  /** Stage name (redundant with the key but handy when iterating). */
  name: SddStage;
  /**
   * Prerequisites that must appear *before* this stage in an activation set.
   * Each prerequisite may itself be skipped — the registry only encodes
   * ordering, not mandatory-ness.
   */
  dependsOn: readonly SddStage[];
  /**
   * Whether the stage is always required. Only Apply is always-mandatory:
   * even clarification / pure-think rounds produce an Apply log entry.
   */
  defaultMandatory: boolean;
  /** Position in the canonical order. Used to sort activation sets. */
  order: number;
  /** Short label for telemetry / logs. */
  label: string;
  /**
   * Whether this stage has a default approval gate (user-facing). Only
   * Draft has one — it approves the Draft at stage end. Apply triggers
   * per-operation approvals via the execution strategy pack, not at the
   * stage boundary.
   */
  hasApprovalGate: boolean;
}

/**
 * Canonical order: draft → plan → apply.
 */
export const STAGE_REGISTRY: Readonly<Record<SddStage, StageMetadata>> = {
  draft: {
    name: 'draft',
    dependsOn: [],
    defaultMandatory: false,
    order: 10,
    label: 'Draft',
    hasApprovalGate: true,
  },
  plan: {
    name: 'plan',
    dependsOn: ['draft'],
    defaultMandatory: false,
    order: 20,
    label: 'Plan',
    hasApprovalGate: false,
  },
  apply: {
    name: 'apply',
    dependsOn: [],
    defaultMandatory: true,
    order: 30,
    label: 'Apply',
    hasApprovalGate: false,
  },
};

// =============================================================================
// Queries
// =============================================================================

export function getStageMetadata(s: SddStage): StageMetadata {
  return STAGE_REGISTRY[s];
}

export function allStagesInOrder(): readonly SddStage[] {
  return (Object.values(STAGE_REGISTRY) as StageMetadata[])
    .sort((a, b) => a.order - b.order)
    .map((m) => m.name);
}

// =============================================================================
// DAG validation + canonical ordering
// =============================================================================

/**
 * Sort stages by canonical order. Stable + total — safe on any subset.
 */
export function sortStagesByDag(stages: readonly SddStage[]): StageSet {
  return [...stages].sort((a, b) => STAGE_REGISTRY[a].order - STAGE_REGISTRY[b].order);
}

export type StageDagValidationResult =
  | { ok: true }
  | {
      ok: false;
      violations: readonly {
        stage: SddStage;
        dependency: SddStage;
        reason: 'out-of-order';
      }[];
    };

/**
 * Validate that every stage with a declared dependency that is *also present*
 * in the set appears after that dependency. Missing dependencies are allowed
 * (skipping prereqs is how AutoMode enters mid-DAG).
 */
export function validateStageDag(stages: readonly SddStage[]): StageDagValidationResult {
  const index = new Map<SddStage, number>();
  stages.forEach((s, i) => index.set(s, i));

  const violations: {
    stage: SddStage;
    dependency: SddStage;
    reason: 'out-of-order';
  }[] = [];

  for (const s of stages) {
    const meta = STAGE_REGISTRY[s];
    for (const dep of meta.dependsOn) {
      const depIdx = index.get(dep);
      if (depIdx === undefined) continue; // dep skipped — allowed
      const sIdx = index.get(s);
      if (sIdx !== undefined && depIdx > sIdx) {
        violations.push({ stage: s, dependency: dep, reason: 'out-of-order' });
      }
    }
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}
