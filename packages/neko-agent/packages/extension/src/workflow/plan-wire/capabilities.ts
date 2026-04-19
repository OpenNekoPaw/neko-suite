/**
 * Plan Wire — capability derivation (pure function).
 *
 * Tells the webview which actions the handler actually supports for a
 * given plan shape.  Kept in its own module so UI / messenger code can
 * import capability logic without dragging converters or side-effects
 * in.
 */

import type { WorkflowPlanCapabilities } from '@neko-agent/types';
import { Workflow } from '@neko/platform';

export function computeCapabilities(
  plan: Workflow.LitePlan,
  hasPendingShots: boolean,
): WorkflowPlanCapabilities {
  const hasShots = (plan.shots?.length ?? 0) > 0;
  const hasInput = plan.input !== undefined;
  const hasActiveStages = plan.stages.some((s) => !s.skipped);
  // canRecheckConsistency prefers the plan-persistent matchingShots
  // (Phase 3.5+ self-sufficient reviews) and falls back to the
  // session-held pending.shots for in-flight reviews that predate the
  // persisted field.  Either being non-empty means the checker has
  // enough input to re-run.
  const hasMatchingShots = (plan.matchingShots?.length ?? 0) > 0;
  return {
    canApprove: true,
    canAbort: true,
    canOverride: hasInput,
    canEditBinding: hasShots,
    canApplyToAll: hasShots,
    canToggleCheckpoint: hasActiveStages,
    canRecheckConsistency: hasShots && (hasMatchingShots || hasPendingShots),
  };
}
