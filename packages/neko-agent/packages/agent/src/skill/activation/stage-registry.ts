/**
 * Stage Registry — metadata + dependency DAG for the four SDD stages.
 *
 * See: docs/architecture/agent-unified-workflow.md §4
 *
 * Single source of truth for:
 *   - Which stages depend on which (Specify → Plan → Tasks → Implement)
 *   - Which stage is always-mandatory (Implement only)
 *   - Canonical execution order within a run
 *
 * Pure data + pure helpers. No executor calls, no I/O. Safe to import from
 * tests and from the stage-planner.
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
   * Whether the stage is always required. Only Implement is always-mandatory:
   * even clarification / pure-think rounds produce an Implement log entry.
   */
  defaultMandatory: boolean;
  /** Position in the canonical order. Used to sort activation sets. */
  order: number;
  /** Short label for telemetry / logs. */
  label: string;
  /**
   * Whether this stage has a default approval gate (user-facing). Only
   * Specify has one — it approves the Proposal at stage end. Implement
   * triggers per-operation approvals via the execution strategy pack, not
   * at the stage boundary.
   */
  hasApprovalGate: boolean;
}

/**
 * Canonical order: specify → plan → tasks → implement.
 */
export const STAGE_REGISTRY: Readonly<Record<SddStage, StageMetadata>> = {
  specify: {
    name: 'specify',
    dependsOn: [],
    defaultMandatory: false,
    order: 10,
    label: 'Specify',
    hasApprovalGate: true,
  },
  plan: {
    name: 'plan',
    dependsOn: ['specify'],
    defaultMandatory: false,
    order: 20,
    label: 'Plan',
    hasApprovalGate: false,
  },
  tasks: {
    name: 'tasks',
    dependsOn: ['plan'],
    defaultMandatory: false,
    order: 30,
    label: 'Tasks',
    hasApprovalGate: false,
  },
  implement: {
    name: 'implement',
    dependsOn: [],
    defaultMandatory: true,
    order: 40,
    label: 'Implement',
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
