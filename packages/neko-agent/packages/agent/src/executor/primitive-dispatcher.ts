/**
 * Primitive Dispatcher — runtime guard that the DAG is respected.
 *
 * See: docs/architecture/dual-flow-architecture.md §3.3, §4.2
 *      plan v2 R7 (primitive dependency violation)
 *
 * Responsibilities:
 * - Assert that Apply is not activated without Approve (when required).
 * - Assert that Approve is not activated without Plan (when required).
 * - Assert that Step is always the terminal primitive when activated.
 *
 * Intentionally tiny. The activation planner (P1.5) already produces
 * DAG-ordered sets; this is a belt-and-braces runtime check for when a
 * caller constructs a decision directly (e.g. tests, manual overrides)
 * and to catch regressions.
 *
 * Pure — no executor coupling. Import from both the planner and the
 * runner without creating cycles.
 */

import type { Primitive, PrimitiveActivationDecision } from '@neko-agent/types';
import {
  PRIMITIVE_REGISTRY,
  validateDag,
  type DagValidationResult,
} from '../skill/activation/primitive-registry';

// =============================================================================
// Types
// =============================================================================

export type DispatchViolationCode =
  /** DAG check failed (a prereq appears after the primitive that depends on it). */
  | 'dag-order'
  /** Activated set is empty. Step is always required, so this is a bug. */
  | 'empty-activation'
  /** Step was skipped on a non-plan-only inner-ring round. */
  | 'step-missing'
  /** Primitive outside the registry was activated. */
  | 'unknown-primitive';

export interface DispatchViolation {
  code: DispatchViolationCode;
  message: string;
  /** The offending primitive(s), when applicable. */
  primitives?: readonly Primitive[];
  /** Structured DAG details, when code === 'dag-order'. */
  dagDetail?: DagValidationResult;
}

export type DispatchValidation =
  | { ok: true }
  | { ok: false; violations: readonly DispatchViolation[] };

// =============================================================================
// Validator
// =============================================================================

/**
 * Validate a decision before dispatch. Returns `{ ok: true }` or a list
 * of violations. Callers choose whether to throw, log, or downgrade.
 */
export function validateDispatch(
  decision: PrimitiveActivationDecision,
  options: {
    /**
     * If true (default), Step must be present for inner-ring rounds
     * unless the mode is plan-only. Outer-ring rounds don't require Step.
     */
    requireStepForExecution?: boolean;
  } = {},
): DispatchValidation {
  const { requireStepForExecution = true } = options;
  const violations: DispatchViolation[] = [];

  // Unknown primitive check.
  for (const p of decision.activated) {
    if (!(p in PRIMITIVE_REGISTRY)) {
      violations.push({
        code: 'unknown-primitive',
        message: `Activated primitive "${p}" is not in the registry`,
        primitives: [p],
      });
    }
  }

  // Empty activation is a bug regardless of flow.
  if (decision.activated.length === 0) {
    violations.push({
      code: 'empty-activation',
      message: 'Activation set is empty — at minimum Step must be produced',
    });
  }

  // DAG check.
  const dag = validateDag(decision.activated);
  if (!dag.ok) {
    violations.push({
      code: 'dag-order',
      message: 'Activation set violates the primitive dependency DAG',
      dagDetail: dag,
    });
  }

  // Step check for inner-ring rounds.
  if (requireStepForExecution && decision.flow === 'execution') {
    const isPlanOnly = decision.taskShape === 'plan-only';
    if (!isPlanOnly && !decision.activated.includes('step')) {
      violations.push({
        code: 'step-missing',
        message: 'Inner-ring rounds must activate Step unless taskShape=plan-only',
      });
    }
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

/**
 * Assert variant that throws on any violation. For call sites that treat
 * a DAG violation as a bug rather than a runtime condition (e.g. tests,
 * developer builds).
 */
export function assertDispatch(decision: PrimitiveActivationDecision): void {
  const result = validateDispatch(decision);
  if (!result.ok) {
    const codes = result.violations.map((v) => v.code).join(', ');
    throw new Error(
      `PrimitiveDispatcher: decision failed validation (${codes}): ` +
        result.violations.map((v) => v.message).join('; '),
    );
  }
}
