/**
 * Stage Dispatcher — runtime guard that the SDD stage DAG is respected.
 *
 * See: docs/architecture/agent-unified-workflow.md §4
 *
 * Responsibilities:
 * - Assert that stage prerequisites appear in order (Specify → Plan →
 *   Tasks → Implement) when multiple stages activate in one round.
 * - Assert that Implement is the terminal stage when activated.
 * - Assert the activated set is non-empty (an empty round is a bug).
 *
 * Intentionally tiny. The stage-planner already produces DAG-ordered
 * sets; this is a belt-and-braces runtime check for when a caller
 * constructs a decision directly (tests, manual overrides).
 *
 * Pure — no executor coupling. Safe to import from both the planner and
 * the runner without creating cycles.
 */

import type { SddStage, StageActivationDecision } from '@neko-agent/types';
import {
  STAGE_REGISTRY,
  validateStageDag,
  type StageDagValidationResult,
} from '../skill/activation/stage-registry';

// =============================================================================
// Types
// =============================================================================

export type StageDispatchViolationCode =
  /** DAG check failed (a prereq appears after the stage that depends on it). */
  | 'dag-order'
  /** Activated set is empty — at minimum one stage must run. */
  | 'empty-activation'
  /** Stage outside the registry was activated. */
  | 'unknown-stage';

export interface StageDispatchViolation {
  code: StageDispatchViolationCode;
  message: string;
  /** The offending stage(s), when applicable. */
  stages?: readonly SddStage[];
  /** Structured DAG details, when code === 'dag-order'. */
  dagDetail?: StageDagValidationResult;
}

export type StageDispatchValidation =
  | { ok: true }
  | { ok: false; violations: readonly StageDispatchViolation[] };

// =============================================================================
// Validator
// =============================================================================

/**
 * Validate a decision before dispatch. Returns `{ ok: true }` or a list
 * of violations. Callers choose whether to throw, log, or downgrade.
 */
export function validateStageDispatch(decision: StageActivationDecision): StageDispatchValidation {
  const violations: StageDispatchViolation[] = [];

  // Unknown stage check.
  for (const s of decision.activated) {
    if (!(s in STAGE_REGISTRY)) {
      violations.push({
        code: 'unknown-stage',
        message: `Activated stage "${s}" is not in the registry`,
        stages: [s],
      });
    }
  }

  // Empty activation is a bug — even pure-think / retry activate at
  // least one stage (Specify for think, Implement for retry).
  if (decision.activated.length === 0) {
    violations.push({
      code: 'empty-activation',
      message: 'Activation set is empty — at minimum one stage must run',
    });
  }

  // DAG check.
  const dag = validateStageDag(decision.activated);
  if (!dag.ok) {
    violations.push({
      code: 'dag-order',
      message: 'Activation set violates the stage dependency DAG',
      dagDetail: dag,
    });
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

/**
 * Assert variant that throws on any violation. For call sites that treat
 * a DAG violation as a bug rather than a runtime condition (tests,
 * developer builds).
 */
export function assertStageDispatch(decision: StageActivationDecision): void {
  const result = validateStageDispatch(decision);
  if (!result.ok) {
    const codes = result.violations.map((v) => v.code).join(', ');
    throw new Error(
      `StageDispatcher: decision failed validation (${codes}): ` +
        result.violations.map((v) => v.message).join('; '),
    );
  }
}
