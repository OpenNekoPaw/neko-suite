/**
 * Workflow Plan Handler — bridges the Workflow Orchestrator with the chat webview.
 *
 * Responsibilities:
 *   1. Map internal LitePlan → wire-safe WorkflowLitePlan (postMessage-compatible)
 *   2. Post `workflow/planPreview` to webview and await user decision
 *   3. On approve → dispatch to pipeline via Orchestrator.startRoutedPipeline
 *   4. On override → re-decide with forceLevel, re-preview
 *   5. On abort → notify + clean up
 *
 * See docs/architecture/plan-mode.md §7 for the interactive flow.
 */

import * as vscode from 'vscode';
import type {
  WorkflowLitePlan,
  WorkflowRoute,
  WorkflowBindingCandidate,
  WorkflowBindingSlot,
  WorkflowConstraint,
  WorkflowShotBindingSummary,
  WorkflowViolation,
  WorkflowPlanAbortMessage,
  WorkflowPlanApproveMessage,
  WorkflowPlanApplyToAllMessage,
  WorkflowPlanDiffMessage,
  WorkflowPlanDiffPayload,
  WorkflowPlanDiffRequestMessage,
  WorkflowPlanEditBindingMessage,
  WorkflowPlanForkMessage,
  WorkflowPlanListEntry,
  WorkflowPlanListMessage,
  WorkflowPlanListRequestMessage,
  WorkflowPlanOverrideMessage,
  WorkflowPlanToggleCheckpointMessage,
} from '@neko-agent/types';
import { Workflow } from '@neko/platform';
import type { Orchestrator, RoutedPipelineResult } from './orchestrator-bootstrap';
import { subscribePipelineProgress } from '../pipeline/pipeline-progress-bridge';
import { registerActivePipeline, removePipeline } from '../tools/pipelineTools';
import { getLogger } from '../base';

const logger = getLogger('WorkflowPlanHandler');

// =============================================================================
// Pending approval bookkeeping
// =============================================================================

interface PendingPlan {
  plan: Workflow.LitePlan;
  resolve(decision: PlanDecision): void;
  reject(err: Error): void;
  /** Input used to build this plan, re-used on override */
  input: Workflow.RawInput;
  /** Original request options (for re-dispatch) */
  request: Omit<PresentPlanOptions, 'input'>;
  /** Shot list used during matching — kept around so edits can re-run the consistency checker */
  shots?: readonly Workflow.Shot[];
}

type PlanDecision =
  | { kind: 'approve' }
  | { kind: 'override'; forceLevel: Workflow.RouteLevel }
  | { kind: 'abort' };

// =============================================================================
// Public API
// =============================================================================

export interface PresentPlanOptions {
  input: Workflow.RawInput;
  routerOverrides?: Workflow.RouterOverrides;
  globalStyle?: string;
  /** Auto-approve if confidence ≥ this threshold (Phase 1 default: always prompt) */
  autoApproveThreshold?: number;
}

export interface WorkflowPlanHandlerDeps {
  orchestrator: Orchestrator;
  getWebview: () => vscode.Webview | undefined;
  /** Optional PlanStore override (defaults to orchestrator.planStore). */
  planStore?: Workflow.PlanStore;
}

export class WorkflowPlanHandler {
  private readonly pending = new Map<string, PendingPlan>();
  private readonly planStore: Workflow.PlanStore | undefined;

  constructor(private readonly deps: WorkflowPlanHandlerDeps) {
    this.planStore = deps.planStore ?? deps.orchestrator.planStore;
  }

  /**
   * Build a plan, present it to the webview, and dispatch on user approval.
   * Phase 1 MVP: single-plan flow (no multi-plan forks yet).
   */
  async presentAndDispatch(options: PresentPlanOptions): Promise<{
    route: Workflow.Route;
    plan: Workflow.LitePlan;
    result: RoutedPipelineResult | undefined;
  }> {
    const { route, plan } = await this.deps.orchestrator.buildPlan(
      options.input,
      options.routerOverrides,
    );

    // Persist the initial 'pending' plan so refreshes / crashes don't lose it.
    await this.persistInitial(plan);

    // Auto-approve path: confidence clears the threshold and no shots need review.
    const threshold = options.autoApproveThreshold ?? 1.1; // default: never auto-approve
    if (route.confidence >= threshold && this.planHasNoRedCells(plan)) {
      logger.info('Plan auto-approved', {
        planId: plan.id,
        level: route.level,
        confidence: route.confidence,
      });
      await this.transitionIfStored(plan.id, 'approved', {
        reason: 'auto-approve (threshold met)',
        by: 'system',
      });
      const result = await this.deps.orchestrator.startRoutedPipeline({
        input: options.input,
        ...(options.routerOverrides !== undefined && { routerOverrides: options.routerOverrides }),
        ...(options.globalStyle !== undefined && { globalStyle: options.globalStyle }),
      });
      await this.transitionIfStored(plan.id, 'executing', {
        pipelineId: result.handle.id,
        by: 'system',
      });
      this.postDispatched(plan.id, result.handle.id, result.handle.flowId);
      return { route, plan, result };
    }

    // Interactive path — post preview, wait for the user's decision.
    this.postPreview(plan);

    const decision = await new Promise<PlanDecision>((resolve, reject) => {
      const request: Omit<PresentPlanOptions, 'input'> = {
        ...(options.routerOverrides !== undefined && { routerOverrides: options.routerOverrides }),
        ...(options.globalStyle !== undefined && { globalStyle: options.globalStyle }),
        ...(options.autoApproveThreshold !== undefined && {
          autoApproveThreshold: options.autoApproveThreshold,
        }),
      };
      this.pending.set(plan.id, {
        plan,
        resolve,
        reject,
        input: options.input,
        request,
      });
    });

    switch (decision.kind) {
      case 'abort':
        logger.info('Plan aborted by user', { planId: plan.id });
        await this.transitionIfStored(plan.id, 'aborted', {
          reason: 'user-abort',
          by: 'user',
        });
        this.postStatus(plan.id, 'aborted');
        return { route, plan, result: undefined };

      case 'override': {
        // Mark the original as 'edited' (→ pending) so the history shows
        // the replacement lineage, then recurse.
        await this.transitionIfStored(plan.id, 'edited', {
          reason: `override to ${decision.forceLevel}`,
          by: 'user',
        });
        const overriddenOptions: PresentPlanOptions = {
          input: options.input,
          routerOverrides: {
            ...(options.routerOverrides ?? {}),
            forceLevel: decision.forceLevel,
          },
          ...(options.globalStyle !== undefined && { globalStyle: options.globalStyle }),
          ...(options.autoApproveThreshold !== undefined && {
            autoApproveThreshold: options.autoApproveThreshold,
          }),
        };
        return this.presentAndDispatch(overriddenOptions);
      }

      case 'approve': {
        logger.info('Plan approved by user', { planId: plan.id });
        await this.transitionIfStored(plan.id, 'approved', {
          reason: 'user-approve',
          by: 'user',
        });
        const result = await this.deps.orchestrator.startRoutedPipeline({
          input: options.input,
          ...(options.routerOverrides !== undefined && {
            routerOverrides: options.routerOverrides,
          }),
          ...(options.globalStyle !== undefined && { globalStyle: options.globalStyle }),
        });
        await this.transitionIfStored(plan.id, 'executing', {
          pipelineId: result.handle.id,
          by: 'system',
        });
        this.postDispatched(plan.id, result.handle.id, result.handle.flowId);
        return { route, plan, result };
      }
    }
  }

  /**
   * Load a previously persisted plan from disk. Returns undefined when no
   * store is configured or the id is unknown.
   */
  async loadPersistedPlan(planId: string): Promise<Workflow.PersistentPlan | undefined> {
    if (!this.planStore) return undefined;
    return this.planStore.load(planId);
  }

  /**
   * Called from ChatProvider's `onDidReceiveMessage` hook when the user
   * clicks approve/override/abort in the webview.
   */
  handleIncoming(
    msg: WorkflowPlanApproveMessage | WorkflowPlanOverrideMessage | WorkflowPlanAbortMessage,
  ): boolean {
    const pending = this.pending.get(msg.planId);
    if (!pending) return false;

    this.pending.delete(msg.planId);

    switch (msg.type) {
      case 'workflow/planApprove':
        pending.resolve({ kind: 'approve' });
        return true;
      case 'workflow/planOverride':
        pending.resolve({ kind: 'override', forceLevel: msg.forceLevel });
        return true;
      case 'workflow/planAbort':
        pending.resolve({ kind: 'abort' });
        return true;
    }
  }

  /**
   * Apply a user-driven matrix edit to a pending plan: override a single
   * shot × slot binding with the chosen alternative asset.
   *
   * Returns the updated plan so tests can assert on it; the handler also
   * posts `workflow/planUpdated` to the webview and re-persists.
   */
  async handleEditBinding(
    msg: WorkflowPlanEditBindingMessage,
  ): Promise<Workflow.LitePlan | undefined> {
    const pending = this.pending.get(msg.planId);
    if (!pending) {
      logger.debug('Edit ignored — plan no longer pending', { planId: msg.planId });
      return undefined;
    }

    const candidate = pickAlternative(
      pending.plan,
      msg.shotId,
      msg.slot as Workflow.BindingSlot,
      msg.assetId,
    );
    if (!candidate) {
      logger.debug('Edit ignored — asset not found among alternatives', {
        planId: msg.planId,
        shotId: msg.shotId,
        slot: msg.slot,
        assetId: msg.assetId,
      });
      return undefined;
    }

    const updated = Workflow.editPlanBinding(
      pending.plan,
      {
        shotId: msg.shotId,
        slot: msg.slot as Workflow.BindingSlot,
        candidate: { ...candidate, provenance: 'user', confidence: 1.0 },
        userConfirm: true,
      },
      {
        shots: pending.shots ?? [],
        consistencyChecker: this.deps.orchestrator.consistencyChecker,
      },
    );
    pending.plan = updated;
    await this.persistEdit(updated);
    this.postUpdated(updated);
    return updated;
  }

  /**
   * Toggle the `userCheckpoint` flag on one of the plan's stages. No-op when
   * the plan is no longer pending or the stage is skipped.
   */
  async handleToggleCheckpoint(
    msg: WorkflowPlanToggleCheckpointMessage,
  ): Promise<Workflow.LitePlan | undefined> {
    const pending = this.pending.get(msg.planId);
    if (!pending) return undefined;
    const updated = Workflow.togglePlanStageCheckpoint(pending.plan, {
      stageId: msg.stageId,
      ...(msg.value !== undefined && { value: msg.value }),
    });
    if (updated === pending.plan) return pending.plan;
    pending.plan = updated;
    await this.persistEdit(updated);
    this.postUpdated(updated);
    return updated;
  }

  /**
   * Fork a persisted plan into a new pending plan. Typically invoked after a
   * pipeline finishes (or aborts) to kick off a new run while preserving the
   * parent's bindings. The fork is persisted with status='pending' and a
   * fresh `workflow/planPreview` is posted so the user can approve / edit it.
   *
   * Returns the forked plan for test assertions.
   */
  async handleFork(msg: WorkflowPlanForkMessage): Promise<Workflow.LitePlan | undefined> {
    if (!this.planStore) {
      logger.warn('Fork ignored — no PlanStore configured', { planId: msg.planId });
      return undefined;
    }
    const source = await this.planStore.load(msg.planId);
    if (!source) {
      logger.warn('Fork ignored — source plan not found', { planId: msg.planId });
      return undefined;
    }
    const fork = Workflow.forkPlan(source, {
      reason: 'user-fork',
      by: 'user',
      ...(msg.resetToOriginal === true && { resetToOriginal: true }),
    });
    await this.planStore.save(fork);
    const lite = Workflow.toLitePlan(fork);
    // Register the fork as pending so edit/approve/abort messages route to it.
    const pending: PendingPlan = {
      plan: lite,
      resolve: () => undefined,
      reject: () => undefined,
      input: { kind: 'prompt', text: 'fork' }, // placeholder — approve path uses plan directly
      request: {},
    };
    this.pending.set(lite.id, pending);

    // Post a fresh preview so the UI shows the forked plan.
    this.postPreview(lite);
    return lite;
  }

  /**
   * Compute a diff between two persisted plans and post the result back to the
   * webview. If `againstPlanId` is omitted, uses the plan's `parentPlanId`.
   */
  async handleDiffRequest(
    msg: WorkflowPlanDiffRequestMessage,
  ): Promise<Workflow.PlanDiff | undefined> {
    if (!this.planStore) {
      this.postDiff({
        planId: msg.planId,
        againstPlanId: msg.againstPlanId,
        diff: undefined,
        errorMessage: 'No PlanStore configured',
      });
      return undefined;
    }
    const right = await this.planStore.load(msg.planId);
    if (!right) {
      this.postDiff({
        planId: msg.planId,
        againstPlanId: msg.againstPlanId,
        diff: undefined,
        errorMessage: `Plan not found: ${msg.planId}`,
      });
      return undefined;
    }
    const leftId = msg.againstPlanId ?? right.parentPlanId;
    if (!leftId) {
      this.postDiff({
        planId: msg.planId,
        againstPlanId: msg.againstPlanId,
        diff: undefined,
        errorMessage: 'No plan to compare against (no parentPlanId and no againstPlanId given)',
      });
      return undefined;
    }
    const left = await this.planStore.load(leftId);
    if (!left) {
      this.postDiff({
        planId: msg.planId,
        againstPlanId: msg.againstPlanId,
        diff: undefined,
        errorMessage: `Plan not found: ${leftId}`,
      });
      return undefined;
    }
    const diff = Workflow.diffPlans(left, right);
    this.postDiff({
      planId: msg.planId,
      againstPlanId: leftId,
      diff: toWireDiff(diff),
    });
    return diff;
  }

  /**
   * List persisted plans for the webview's plan-browser UI.  Posts a
   * `workflow/planList` response with the same filter fields echoed back.
   * Returns the list for test assertions.
   */
  async handleListRequest(
    msg: WorkflowPlanListRequestMessage,
  ): Promise<WorkflowPlanListEntry[] | undefined> {
    if (!this.planStore) {
      this.postList({
        entries: [],
        ...(msg.status !== undefined && { status: msg.status }),
        ...(msg.parentPlanId !== undefined && { parentPlanId: msg.parentPlanId }),
        ...(msg.limit !== undefined && { limit: msg.limit }),
        errorMessage: 'No PlanStore configured',
      });
      return undefined;
    }
    try {
      const entries = await this.planStore.listPlans({
        ...(msg.status !== undefined && { status: msg.status }),
        ...(msg.parentPlanId !== undefined && { parentPlanId: msg.parentPlanId }),
        ...(msg.limit !== undefined && { limit: msg.limit }),
      });
      const wire = entries.map(toWirePlanListEntry);
      this.postList({
        entries: wire,
        ...(msg.status !== undefined && { status: msg.status }),
        ...(msg.parentPlanId !== undefined && { parentPlanId: msg.parentPlanId }),
        ...(msg.limit !== undefined && { limit: msg.limit }),
      });
      return wire;
    } catch (err) {
      this.postList({
        entries: [],
        ...(msg.status !== undefined && { status: msg.status }),
        ...(msg.parentPlanId !== undefined && { parentPlanId: msg.parentPlanId }),
        ...(msg.limit !== undefined && { limit: msg.limit }),
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      return undefined;
    }
  }

  /**
   * Propagate an edit to every other shot whose binding references the same entity.
   */
  async handleApplyToAll(
    msg: WorkflowPlanApplyToAllMessage,
  ): Promise<Workflow.LitePlan | undefined> {
    const pending = this.pending.get(msg.planId);
    if (!pending) return undefined;

    // Pick the candidate once — it must be a current binding for the entity.
    const candidate = findCandidateForEntity(
      pending.plan,
      msg.entityId,
      msg.slot as Workflow.BindingSlot,
      msg.assetId,
    );
    if (!candidate) return undefined;

    const updated = Workflow.applyBindingToAll(
      pending.plan,
      {
        entityId: msg.entityId,
        slot: msg.slot as Workflow.BindingSlot,
        candidate: { ...candidate, provenance: 'user', confidence: 1.0 },
      },
      {
        shots: pending.shots ?? [],
        consistencyChecker: this.deps.orchestrator.consistencyChecker,
      },
    );
    pending.plan = updated;
    await this.persistEdit(updated);
    this.postUpdated(updated);
    return updated;
  }

  // ---------------------------------------------------------------------------
  // Posting helpers
  // ---------------------------------------------------------------------------

  private postPreview(plan: Workflow.LitePlan): void {
    const webview = this.deps.getWebview();
    if (!webview) return;
    const wirePlan = toWirePlan(plan);
    webview.postMessage({
      type: 'workflow/planPreview',
      plan: wirePlan,
    });
  }

  private postDispatched(planId: string, pipelineId: string, flowId: string): void {
    const webview = this.deps.getWebview();
    if (!webview) return;
    webview.postMessage({
      type: 'workflow/planDispatched',
      planId,
      pipelineId,
      flowId,
    });
  }

  private postUpdated(plan: Workflow.LitePlan): void {
    const webview = this.deps.getWebview();
    if (!webview) return;
    webview.postMessage({ type: 'workflow/planUpdated', plan: toWirePlan(plan) });
  }

  private postDiff(params: Omit<WorkflowPlanDiffMessage, 'type'>): void {
    const webview = this.deps.getWebview();
    if (!webview) return;
    webview.postMessage({ type: 'workflow/planDiff', ...params });
  }

  private postList(params: Omit<WorkflowPlanListMessage, 'type'>): void {
    const webview = this.deps.getWebview();
    if (!webview) return;
    webview.postMessage({ type: 'workflow/planList', ...params });
  }

  private async persistEdit(plan: Workflow.LitePlan): Promise<void> {
    if (!this.planStore) return;
    try {
      const persistent = Workflow.toNkPlan(plan);
      await this.planStore.save(persistent);
    } catch (err) {
      logger.warn('Failed to persist plan edit', {
        planId: plan.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private postStatus(
    planId: string,
    status: 'approved' | 'executing' | 'completed' | 'aborted' | 'failed',
  ): void {
    const webview = this.deps.getWebview();
    if (!webview) return;
    webview.postMessage({
      type: 'workflow/planStatus',
      planId,
      status,
    });
  }

  /** Subscribe to pipeline progress and forward completion/error to webview */
  attachProgressForwarder(
    planId: string,
    result: RoutedPipelineResult,
    chatWebview: vscode.Webview,
    progressEventCommand?: string,
  ): void {
    // Register the handle so webview messages (pipelineGateConfirm /
    // pipelineGateCancel) can reach it.  The progress bridge will call
    // removePipeline() on completion/error.
    registerActivePipeline(result.handle.id, result.handle);

    subscribePipelineProgress(chatWebview, result.handle.id, result.handle, {
      ...(progressEventCommand !== undefined && { eventCommand: progressEventCommand }),
    });

    // Best-effort status updates — propagate to webview and to PlanStore.
    result.handle.result
      .then(async () => {
        await this.transitionIfStored(planId, 'completed', { by: 'system' });
        this.postStatus(planId, 'completed');
      })
      .catch(async (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        await this.transitionIfStored(planId, 'failed', {
          errorMessage: message,
          by: 'system',
        });
        // Defensive cleanup — removePipeline is idempotent.
        removePipeline(result.handle.id);
        const webview = this.deps.getWebview();
        if (webview) {
          webview.postMessage({
            type: 'workflow/planStatus',
            planId,
            status: 'failed',
            errorMessage: message,
          });
        }
      });
  }

  // ---------------------------------------------------------------------------
  // PlanStore integration (Phase 2)
  // ---------------------------------------------------------------------------

  private async persistInitial(plan: Workflow.LitePlan): Promise<void> {
    if (!this.planStore) return;
    try {
      const persistent = Workflow.toNkPlan(plan);
      await this.planStore.save(persistent);
    } catch (err) {
      logger.warn('Failed to persist initial plan', {
        planId: plan.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async transitionIfStored(
    planId: string,
    to: Workflow.PlanStatus,
    options: Workflow.PlanTransitionOptions = {},
  ): Promise<void> {
    if (!this.planStore) return;
    try {
      await this.planStore.transition(planId, to, options);
    } catch (err) {
      // Illegal-transition errors are expected if the store is already in a
      // later state (e.g. auto-approve path also calls transition). Swallow
      // these so best-effort persistence doesn't break the happy path.
      logger.debug('Plan transition skipped', {
        planId,
        to,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private planHasNoRedCells(plan: Workflow.LitePlan): boolean {
    if (!plan.shots) return true;
    return plan.shots.every((s) => (s.unmatched?.length ?? 0) === 0);
  }
}

// =============================================================================
// Conversion: internal LitePlan → wire WorkflowLitePlan
// =============================================================================

export function toWirePlan(plan: Workflow.LitePlan): WorkflowLitePlan {
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
  };
}

// =============================================================================
// Edit helpers — pure lookups over the in-memory LitePlan
// =============================================================================

function pickAlternative(
  plan: Workflow.LitePlan,
  shotId: string,
  slot: Workflow.BindingSlot,
  assetId: string,
): Workflow.BindingCandidate | undefined {
  const shot = plan.shots?.find((s) => s.shotId === shotId);
  if (!shot) return undefined;
  const alts = shot.alternatives[slot] ?? [];
  const fromAlt = alts.find((c) => c.assetId === assetId);
  if (fromAlt) return fromAlt;
  // Fall back to the current primary (idempotent edit) so re-selecting the
  // already-chosen asset is a no-op with defined behaviour.
  const primary = shot.primary[slot];
  if (primary && primary.assetId === assetId) return primary;
  return undefined;
}

function findCandidateForEntity(
  plan: Workflow.LitePlan,
  entityId: string,
  slot: Workflow.BindingSlot,
  assetId: string,
): Workflow.BindingCandidate | undefined {
  if (!plan.shots) return undefined;
  for (const shot of plan.shots) {
    const primary = shot.primary[slot];
    if (primary && primary.entityId === entityId && primary.assetId === assetId) return primary;
    const alt = (shot.alternatives[slot] ?? []).find(
      (c) => c.entityId === entityId && c.assetId === assetId,
    );
    if (alt) return alt;
  }
  return undefined;
}

function toWireConstraint(c: Workflow.Constraint): WorkflowConstraint {
  return {
    id: c.id,
    kind: c.kind,
    entity: c.entity,
    shots: [...c.shots],
    payload: { ...c.payload },
    ...(c.severity !== undefined && { severity: c.severity }),
  };
}

function toWireViolation(v: Workflow.Violation): WorkflowViolation {
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

function toWirePlanListEntry(entry: Workflow.PlanListEntry): WorkflowPlanListEntry {
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

function toWireDiff(diff: Workflow.PlanDiff): WorkflowPlanDiffPayload {
  return {
    leftId: diff.leftId,
    rightId: diff.rightId,
    route: diff.route.map((r) => ({
      kind: r.kind,
      // from/to can be string or readonly string[] — normalise for the wire
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

function toWireRoute(route: Workflow.Route): WorkflowRoute {
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

function toWireShot(shot: Workflow.ShotBindingSummary): WorkflowShotBindingSummary {
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

function toWireCandidate(c: Workflow.BindingCandidate): WorkflowBindingCandidate {
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
