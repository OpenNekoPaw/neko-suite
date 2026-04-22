/**
 * Plan Review → ApprovalEngine adapter.
 *
 * See: docs/architecture/dual-flow-architecture.md §5.1
 *      plan v2 P4 (Approval unification — adapter migration)
 *
 * Plan review is the outer-ring (creation-flow) business-level
 * approval: the user looks at a LitePlan and decides approve /
 * override / abort. Historically PlanReviewSession hard-coded an
 * auto-approve threshold (`confidence >= threshold`); this adapter
 * routes that decision through the unified ApprovalEngine so custom
 * strategy packs can short-circuit, and so creation-flow telemetry
 * lands on the same bus as permission + quality-gate events.
 *
 * Decision inputs the adapter feeds into the engine:
 *   - confidence (from Route)
 *   - planHasConstraintIssues (derived from the Plan — proxy for
 *     "needs user review")
 *   - destructive + idempotent metadata: plans are preview artefacts,
 *     so defaults are `destructive: false` + `idempotent: true`. The
 *     creationStrategyPack already auto-accepts preview-only plans.
 *
 * The adapter does NOT execute override / abort paths — those remain
 * user actions on the interactive UI. It only produces the "can we
 * short-circuit the user prompt?" decision.
 */

import type { IApprovalEngine, ApprovalResponse } from '../index';
import { getLogger } from '../../utils/logger';

const logger = getLogger('PlanReviewApprovalAdapter');

// =============================================================================
// Types
// =============================================================================

/**
 * Narrow plan shape the adapter needs. Using a local structural type
 * keeps the adapter from depending on the full platform Workflow.LitePlan
 * module (which in turn transitively pulls in extension types).
 */
export interface PlanReviewPlanSummary {
  /** Stable plan id for request correlation. */
  id: string;
  /** Route confidence score (0-1). */
  confidence: number;
  /** Route level (L0..L4). Included in context for pack introspection. */
  level?: string;
  /** Has the plan any violations / red cells that force user review? */
  hasReviewableIssues: boolean;
}

export interface PlanReviewApprovalAdapterDeps {
  /** Engine to consult. */
  engine: IApprovalEngine;
  /**
   * Optional confidence threshold passed as context so custom
   * strategy packs can read it. Default 0.9 — packs may choose
   * higher/lower bars; the default creationStrategyPack doesn't read
   * this field today but future packs will.
   */
  confidenceThreshold?: number;
  /** Clock injection. */
  now?: () => number;
}

export interface PlanReviewApprovalRequest {
  plan: PlanReviewPlanSummary;
}

// =============================================================================
// Adapter
// =============================================================================

/**
 * Build a function that evaluates a plan via the engine and returns
 * the engine's full response. PlanReviewSession uses the resolution
 * to decide between the auto-approve fast-path and the interactive
 * path; ambiguous decisions fall through to user review (the existing
 * postPreview / handleIncoming flow).
 */
export function createPlanReviewApprovalAdapter(
  deps: PlanReviewApprovalAdapterDeps,
): (request: PlanReviewApprovalRequest) => Promise<ApprovalResponse> {
  const clock = deps.now ?? (() => Date.now());
  const confidenceThreshold = deps.confidenceThreshold ?? 0.9;

  return async function evaluatePlanReview(
    request: PlanReviewApprovalRequest,
  ): Promise<ApprovalResponse> {
    const requestId = `plan-review:${request.plan.id}`;
    try {
      return await deps.engine.evaluate({
        channel: 'draft-review',
        paradigm: 'declarative',
        subject: {
          label: `Plan ${request.plan.id}`,
          kind: `plan:${request.plan.id}`,
          // Plans are preview artefacts — no side effects until dispatch,
          // which is a separate ApplyEngine + Permission channel decision.
          destructive: false,
          // Plan review is idempotent when the plan has no reviewable
          // issues — the same plan decided twice yields the same verdict.
          idempotent: !request.plan.hasReviewableIssues,
        },
        context: {
          confidence: request.plan.confidence,
          confidenceThreshold,
          level: request.plan.level,
          hasReviewableIssues: request.plan.hasReviewableIssues,
        },
        id: requestId,
        at: clock(),
      });
    } catch (err) {
      // Plan review is a business-level decision — a buggy engine
      // should NOT silently auto-approve or auto-reject. Surface as
      // 'escalate' so the user sees the plan in the interactive UI.
      logger.warn(`ApprovalEngine threw on plan review ${request.plan.id}: ${String(err)}`);
      return {
        requestId,
        resolution: 'escalate',
        reason: 'engine-error',
        note: `Engine error: ${String(err)}`,
        decidedAt: clock(),
      };
    }
  };
}
