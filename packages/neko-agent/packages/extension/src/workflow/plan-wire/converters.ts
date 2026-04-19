/**
 * Plan Wire — wire-type converters (pure functions, no side effects).
 *
 * LitePlan / Workflow types → postMessage-safe webview types.  Kept
 * away from the messenger / store / broadcast modules so everything in
 * this file is trivially testable and composable.
 */

import type {
  WorkflowBindingCandidate,
  WorkflowConstraint,
  WorkflowLitePlan,
  WorkflowPlanCapabilities,
  WorkflowPlanDiffPayload,
  WorkflowPlanListEntry,
  WorkflowRoute,
  WorkflowBindingSlot,
  WorkflowRouterMemoryEntry,
  WorkflowShotBindingSummary,
  WorkflowViolation,
} from '@neko-agent/types';
import { Workflow } from '@neko/platform';

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
