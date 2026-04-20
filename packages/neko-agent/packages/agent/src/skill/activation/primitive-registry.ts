/**
 * Primitive Registry — metadata + dependency DAG for the 10 primitives.
 *
 * See: docs/architecture/dual-flow-architecture.md §3.2, §3.3, §4.2
 *
 * This module is the single source of truth for:
 *   - Which ring (creation/execution) a primitive belongs to
 *   - Which primitives a primitive depends on (the DAG)
 *   - Which primitives are default-mandatory
 *   - Canonical execution order within a round
 *
 * Pure data + pure helpers. No executor calls, no I/O. Safe to import from
 * tests and from the activation planner.
 */

import type { FlowKind, Primitive, PrimitiveSet } from '@neko-agent/types';

// =============================================================================
// Metadata
// =============================================================================

export interface PrimitiveMetadata {
  /** The primitive name (redundant with the key but handy when iterating). */
  name: Primitive;
  /** Which ring owns this primitive. */
  flow: FlowKind;
  /**
   * Prerequisites that must appear *before* this primitive in an activation
   * set — but each prerequisite may itself be skipped. The registry only
   * encodes ordering, not mandatory-ness.
   */
  dependsOn: readonly Primitive[];
  /**
   * Whether the primitive is always required by default. Only `execution`
   * and `status` on the outer ring and `step` on the inner ring are
   * always-mandatory per ADR §3.2/§3.3/§4.2.
   */
  defaultMandatory: boolean;
  /**
   * Position in the canonical order for its ring. Used to sort activation
   * sets when the planner emits them.
   */
  order: number;
  /** Short label for telemetry / logs. */
  label: string;
}

/**
 * Canonical order (low → high):
 *   creation: orchestration → proposal → review → execution → status
 *   execution: plan → todo → approve → apply → step
 */
export const PRIMITIVE_REGISTRY: Readonly<Record<Primitive, PrimitiveMetadata>> = {
  // Creation (outer ring)
  orchestration: {
    name: 'orchestration',
    flow: 'creation',
    dependsOn: [],
    defaultMandatory: false,
    order: 10,
    label: 'Orchestration',
  },
  proposal: {
    name: 'proposal',
    flow: 'creation',
    dependsOn: [],
    defaultMandatory: false,
    order: 20,
    label: 'Proposal',
  },
  review: {
    name: 'review',
    flow: 'creation',
    dependsOn: ['proposal'],
    defaultMandatory: false,
    order: 30,
    label: 'Review',
  },
  execution: {
    name: 'execution',
    flow: 'creation',
    dependsOn: [],
    defaultMandatory: true,
    order: 40,
    label: 'Execution',
  },
  status: {
    name: 'status',
    flow: 'creation',
    dependsOn: [],
    defaultMandatory: true,
    order: 50,
    label: 'Status',
  },

  // Execution (inner ring)
  plan: {
    name: 'plan',
    flow: 'execution',
    dependsOn: [],
    defaultMandatory: false,
    order: 110,
    label: 'Plan',
  },
  todo: {
    name: 'todo',
    flow: 'execution',
    dependsOn: ['plan'],
    defaultMandatory: false,
    order: 120,
    label: 'TODO',
  },
  approve: {
    name: 'approve',
    flow: 'execution',
    dependsOn: ['plan'],
    defaultMandatory: false,
    order: 130,
    label: 'Approve',
  },
  apply: {
    name: 'apply',
    flow: 'execution',
    dependsOn: ['approve'],
    defaultMandatory: false,
    order: 140,
    label: 'Apply',
  },
  step: {
    name: 'step',
    flow: 'execution',
    dependsOn: [],
    defaultMandatory: true,
    order: 150,
    label: 'Step',
  },
};

// =============================================================================
// Queries
// =============================================================================

export function getPrimitiveMetadata(p: Primitive): PrimitiveMetadata {
  return PRIMITIVE_REGISTRY[p];
}

export function getPrimitivesByFlow(flow: FlowKind): readonly Primitive[] {
  return (Object.values(PRIMITIVE_REGISTRY) as PrimitiveMetadata[])
    .filter((m) => m.flow === flow)
    .sort((a, b) => a.order - b.order)
    .map((m) => m.name);
}

// =============================================================================
// DAG validation + canonical ordering
// =============================================================================

/**
 * Sort primitives by their canonical order. Stable + total — safe to apply
 * to any subset of primitives.
 */
export function sortByDag(primitives: readonly Primitive[]): PrimitiveSet {
  return [...primitives].sort((a, b) => PRIMITIVE_REGISTRY[a].order - PRIMITIVE_REGISTRY[b].order);
}

/**
 * Validate that no primitive in the set has a dependency that sorts *after*
 * it (which would mean the set is malformed) — dependencies that are simply
 * missing from the set are *allowed* (skipping prereqs is the whole point).
 *
 * Returns `{ ok: true }` on success, or `{ ok: false, violations: ... }`
 * describing the first offenders so callers can produce actionable errors.
 */
export type DagValidationResult =
  | { ok: true }
  | {
      ok: false;
      violations: readonly {
        primitive: Primitive;
        dependency: Primitive;
        reason: 'out-of-order';
      }[];
    };

export function validateDag(primitives: readonly Primitive[]): DagValidationResult {
  const index = new Map<Primitive, number>();
  primitives.forEach((p, i) => index.set(p, i));

  const violations: {
    primitive: Primitive;
    dependency: Primitive;
    reason: 'out-of-order';
  }[] = [];

  for (const p of primitives) {
    const meta = PRIMITIVE_REGISTRY[p];
    for (const dep of meta.dependsOn) {
      const depIdx = index.get(dep);
      if (depIdx === undefined) continue; // dep skipped — allowed
      const pIdx = index.get(p);
      if (pIdx !== undefined && depIdx > pIdx) {
        violations.push({ primitive: p, dependency: dep, reason: 'out-of-order' });
      }
    }
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}
