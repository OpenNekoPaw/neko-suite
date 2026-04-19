/**
 * Plan Wire — shared webview-message helpers, Workflow → wire type
 * conversions, PlanStore write helper, and the cross-extension broadcast
 * channel.  Extracted from the monolithic `WorkflowPlanHandler` so the
 * four sub-controllers (Review / Query / Lifecycle / RouterMemory) can
 * compose what they need without pulling the whole god-class in.
 *
 * Nothing in this module owns state; it is a library of free functions
 * plus a thin `PlanStoreWriter` wrapper around the PlanStore SDK.
 */

import * as vscode from 'vscode';
import type {
  WorkflowBindingCandidate,
  WorkflowBindingSlot,
  WorkflowConstraint,
  WorkflowLitePlan,
  WorkflowPlanCapabilities,
  WorkflowPlanDiffMessage,
  WorkflowPlanDiffPayload,
  WorkflowPlanListEntry,
  WorkflowPlanListMessage,
  WorkflowRoute,
  WorkflowRouterMemoryEntry,
  WorkflowRouterMemoryMessage,
  WorkflowShotBindingSummary,
  WorkflowViolation,
} from '@neko-agent/types';
import { Workflow } from '@neko/platform';
import { getLogger } from '../base';

const logger = getLogger('WorkflowPlanWire');

// =============================================================================
// Wire-type conversions (LitePlan → postMessage-safe WorkflowLitePlan)
// =============================================================================

export function toWirePlan(
  plan: Workflow.LitePlan,
  capabilities?: WorkflowPlanCapabilities,
): WorkflowLitePlan {
  return {
    id: plan.id,
    createdAt: plan.createdAt,
    status: plan.status,
    route: toWireRoute(plan.route),
    stages: plan.stages.map((s) => ({
      id: s.id,
      label: s.label,
      skipped: s.skipped,
      ...(s.estimate !== undefined && { estimate: { ...s.estimate } }),
      ...(s.userCheckpoint !== undefined && { userCheckpoint: s.userCheckpoint }),
    })),
    ...(plan.shots !== undefined && { shots: plan.shots.map(toWireShot) }),
    ...(plan.notes !== undefined && { notes: [...plan.notes] }),
    ...(plan.constraints !== undefined &&
      plan.constraints.length > 0 && { constraints: plan.constraints.map(toWireConstraint) }),
    ...(plan.violations !== undefined &&
      plan.violations.length > 0 && { violations: plan.violations.map(toWireViolation) }),
    ...(plan.parentPlanId !== undefined && { parentPlanId: plan.parentPlanId }),
    ...(capabilities !== undefined && { capabilities }),
  };
}

export function toWireRoute(route: Workflow.Route): WorkflowRoute {
  return {
    level: route.level,
    flowId: route.flowId,
    entryExtension: route.entryExtension,
    skipStages: [...route.skipStages],
    reason: route.reason,
    confidence: route.confidence,
    provenance: route.provenance,
  };
}

export function toWireShot(shot: Workflow.ShotBindingSummary): WorkflowShotBindingSummary {
  const primary: Partial<Record<string, WorkflowBindingCandidate>> = {};
  for (const [slot, cand] of Object.entries(shot.primary)) {
    if (cand) primary[slot] = toWireCandidate(cand);
  }
  const alternatives: Partial<Record<string, WorkflowBindingCandidate[]>> = {};
  for (const [slot, list] of Object.entries(shot.alternatives)) {
    if (list && list.length > 0) {
      alternatives[slot] = list.map(toWireCandidate);
    }
  }
  return {
    shotId: shot.shotId,
    primary: primary as WorkflowShotBindingSummary['primary'],
    alternatives: alternatives as WorkflowShotBindingSummary['alternatives'],
    unmatched: [...shot.unmatched] as WorkflowShotBindingSummary['unmatched'],
  };
}

export function toWireCandidate(c: Workflow.BindingCandidate): WorkflowBindingCandidate {
  // Wire type only carries L1..L5; 'user' edits round-trip as 'L1' for the
  // webview's rendering purposes (the semantic difference is persisted
  // server-side via Binding.provenance in .nkplan but isn't displayed).
  const provenance = c.provenance === 'user' ? 'L1' : c.provenance;
  return {
    slot: c.slot as WorkflowBindingCandidate['slot'],
    entityId: c.entityId,
    assetId: c.assetId,
    provenance,
    confidence: c.confidence,
    ...(c.reason !== undefined && { reason: c.reason }),
  };
}

export function toWireConstraint(c: Workflow.Constraint): WorkflowConstraint {
  return {
    id: c.id,
    kind: c.kind,
    entity: c.entity,
    shots: [...c.shots],
    payload: { ...c.payload },
    ...(c.severity !== undefined && { severity: c.severity }),
  };
}

export function toWireViolation(v: Workflow.Violation): WorkflowViolation {
  return {
    id: v.id,
    kind: v.kind,
    severity: v.severity,
    constraintId: v.constraintId,
    shotIds: [...v.shotIds],
    entity: v.entity,
    ...(v.slot !== undefined && { slot: v.slot }),
    message: v.message,
    ...(v.suggestions !== undefined &&
      v.suggestions.length > 0 && {
        suggestions: v.suggestions.map((s) => ({ ...s })),
      }),
  };
}

export function toWireRouterMemoryEntry(
  entry: Workflow.RouterMemoryEntry,
): WorkflowRouterMemoryEntry {
  return {
    hash: entry.hash,
    level: entry.level,
    reason: entry.reason,
    at: entry.at,
    source: entry.source,
    ...(entry.textLength !== undefined && { textLength: entry.textLength }),
  };
}

export function toWirePlanListEntry(entry: Workflow.PlanListEntry): WorkflowPlanListEntry {
  return {
    id: entry.id,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    status: entry.status,
    routeLevel: entry.routeLevel,
    flowId: entry.flowId,
    reason: entry.reason,
    ...(entry.parentPlanId !== undefined && { parentPlanId: entry.parentPlanId }),
    shotCount: entry.shotCount,
    ...(entry.pipelineId !== undefined && { pipelineId: entry.pipelineId }),
    ...(entry.errorMessage !== undefined && { errorMessage: entry.errorMessage }),
  };
}

export function toWireDiff(diff: Workflow.PlanDiff): WorkflowPlanDiffPayload {
  return {
    leftId: diff.leftId,
    rightId: diff.rightId,
    route: diff.route.map((r) => ({
      kind: r.kind,
      from: Array.isArray(r.from) ? [...(r.from as readonly string[])] : (r.from as string),
      to: Array.isArray(r.to) ? [...(r.to as readonly string[])] : (r.to as string),
    })),
    stages: diff.stages.map((s) => ({
      kind: s.kind,
      stageId: s.stageId,
      ...(s.value !== undefined && { value: s.value }),
    })),
    shots: diff.shots.map((s) => ({
      kind: s.kind,
      shotId: s.shotId,
      ...(s.slot !== undefined && { slot: s.slot as WorkflowBindingSlot }),
      ...(s.fromAssetId !== undefined && { fromAssetId: s.fromAssetId }),
      ...(s.toAssetId !== undefined && { toAssetId: s.toAssetId }),
      ...(s.value !== undefined && { value: s.value }),
    })),
    constraints: diff.constraints.map((c) => ({
      kind: c.kind,
      constraintId: c.constraintId,
      constraintKind: c.constraintKind,
    })),
    unchanged: diff.unchanged,
  };
}

// =============================================================================
// Outgoing messages — every helper is a no-op when no webview is attached.
// =============================================================================

type GetWebview = () => vscode.Webview | undefined;

export function postPreview(
  getWebview: GetWebview,
  plan: Workflow.LitePlan,
  capabilities: WorkflowPlanCapabilities,
): void {
  const webview = getWebview();
  if (!webview) return;
  webview.postMessage({
    type: 'workflow/planPreview',
    plan: toWirePlan(plan, capabilities),
  });
}

export function postUpdated(
  getWebview: GetWebview,
  plan: Workflow.LitePlan,
  capabilities: WorkflowPlanCapabilities,
): void {
  const webview = getWebview();
  if (!webview) return;
  webview.postMessage({ type: 'workflow/planUpdated', plan: toWirePlan(plan, capabilities) });
}

export function postDispatched(
  getWebview: GetWebview,
  planId: string,
  pipelineId: string,
  flowId: string,
): void {
  const webview = getWebview();
  if (!webview) return;
  webview.postMessage({
    type: 'workflow/planDispatched',
    planId,
    pipelineId,
    flowId,
  });
}

export function postStatus(
  getWebview: GetWebview,
  planId: string,
  status: 'approved' | 'executing' | 'completed' | 'aborted' | 'failed',
  errorMessage?: string,
): void {
  const webview = getWebview();
  if (!webview) return;
  webview.postMessage({
    type: 'workflow/planStatus',
    planId,
    status,
    ...(errorMessage !== undefined && { errorMessage }),
  });
}

export function postDiff(
  getWebview: GetWebview,
  params: Omit<WorkflowPlanDiffMessage, 'type'>,
): void {
  const webview = getWebview();
  if (!webview) return;
  webview.postMessage({ type: 'workflow/planDiff', ...params });
}

export function postList(
  getWebview: GetWebview,
  params: Omit<WorkflowPlanListMessage, 'type'>,
): void {
  const webview = getWebview();
  if (!webview) return;
  webview.postMessage({ type: 'workflow/planList', ...params });
}

export function postRouterMemory(
  getWebview: GetWebview,
  params: Omit<WorkflowRouterMemoryMessage, 'type'>,
): void {
  const webview = getWebview();
  if (!webview) return;
  webview.postMessage({ type: 'workflow/routerMemory', ...params });
}

// =============================================================================
// Cross-extension broadcast — lets sibling extensions (currently neko-canvas)
// quiet down when an orchestrator plan is active.  Fire-and-forget; command
// not being registered is fine (the target extension may be absent).
//
// Note: this is still an implicit, string-keyed contract.  Future work would
// move it behind a shared typed extension-API, see plan-mode.md §12.
// =============================================================================

export function broadcastPlanState(
  status: 'executing' | 'paused' | 'completed' | 'aborted' | 'failed',
  planId: string,
  pipelineId?: string,
): void {
  vscode.commands
    .executeCommand('neko.canvas.orchestrator.planStateChanged', {
      status,
      planId,
      ...(pipelineId !== undefined && { pipelineId }),
    })
    .then(undefined, () => {
      // neko-canvas not installed or not yet activated — fine.
    });
}

// =============================================================================
// PlanStoreWriter — small wrapper around the Workflow.PlanStore SDK.
// Used by PlanReviewSession and PipelineLifecycleBridge; isolates error
// handling so callers don't have to reimplement the swallow-on-failure
// pattern.  Returns early on all ops when no store is configured.
// =============================================================================

export class PlanStoreWriter {
  constructor(private readonly store: Workflow.PlanStore | undefined) {}

  get enabled(): boolean {
    return this.store !== undefined;
  }

  async persistInitial(plan: Workflow.LitePlan): Promise<void> {
    if (!this.store) return;
    try {
      await this.store.save(Workflow.toNkPlan(plan));
    } catch (err) {
      logger.warn('Failed to persist initial plan', {
        planId: plan.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async persistEdit(plan: Workflow.LitePlan): Promise<void> {
    if (!this.store) return;
    try {
      await this.store.save(Workflow.toNkPlan(plan));
    } catch (err) {
      logger.warn('Failed to persist plan edit', {
        planId: plan.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async transition(
    planId: string,
    to: Workflow.PlanStatus,
    options: Workflow.PlanTransitionOptions = {},
  ): Promise<void> {
    if (!this.store) return;
    try {
      await this.store.transition(planId, to, options);
    } catch (err) {
      // Illegal-transition errors are expected when the store is already
      // in a later state (auto-approve also calls transition).  Swallow
      // so best-effort persistence doesn't break the happy path.
      logger.debug('Plan transition skipped', {
        planId,
        to,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// =============================================================================
// Capability derivation — pure function of plan + optional pending shots.
// Lives here so any controller that posts a plan can use the same truth.
// =============================================================================

/**
 * Capability flags the webview uses to gate Start / Override / Abort /
 * edit / apply-to-all / checkpoint-toggle.  All fields default to a safe
 * "enabled only when we can prove it works" posture — the webview treats
 * missing capabilities as all-capable for back-compat with older
 * handlers, so producers must populate every flag explicitly.
 */
export function computeCapabilities(
  plan: Workflow.LitePlan,
  hasPendingShots: boolean,
): WorkflowPlanCapabilities {
  const hasShots = (plan.shots?.length ?? 0) > 0;
  const hasInput = plan.input !== undefined;
  const hasActiveStages = plan.stages.some((s) => !s.skipped);
  return {
    canApprove: true,
    canAbort: true,
    canOverride: hasInput,
    canEditBinding: hasShots,
    canApplyToAll: hasShots,
    canToggleCheckpoint: hasActiveStages,
    // ConsistencyChecker needs the original Shot[] input; forks don't
    // persist it, so their edits can't re-compute violations.
    canRecheckConsistency: hasShots && hasPendingShots,
  };
}
