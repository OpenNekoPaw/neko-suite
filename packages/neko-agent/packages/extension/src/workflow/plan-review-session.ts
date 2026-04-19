/**
 * Plan Review Session — owns the "present a plan → wait for the user →
 * dispatch" interactive flow, plus the in-memory pending map that
 * post-preview edits mutate.
 *
 * Extracted from the old 1100-line WorkflowPlanHandler so review state
 * lives in one place and the other controllers (query / lifecycle /
 * memory) can be sized to their single responsibility.
 *
 * Responsibilities:
 *   - presentAndDispatch (the interactive state machine)
 *   - handleIncoming      (approve / override / abort routing)
 *   - handleEditBinding   (matrix edit)
 *   - handleApplyToAll    (entity-level propagation)
 *   - handleToggleCheckpoint
 *   - handleFork          (derive a plan from a persisted one)
 *   - computeCapabilities (pure function of plan + pending state)
 *
 * Dispatch goes through PipelineLifecycleBridge for transition /
 * broadcast so the review session doesn't know how progress is
 * forwarded to the webview.
 */

import * as vscode from 'vscode';
import type {
  WorkflowPlanAbortMessage,
  WorkflowPlanApplyToAllMessage,
  WorkflowPlanApproveMessage,
  WorkflowPlanCapabilities,
  WorkflowPlanEditBindingMessage,
  WorkflowPlanForkMessage,
  WorkflowPlanOverrideMessage,
  WorkflowPlanToggleCheckpointMessage,
} from '@neko-agent/types';
import { Workflow } from '@neko/platform';
import type { Orchestrator, RoutedPipelineResult } from './orchestrator-bootstrap';
import type { PipelineLifecycleBridge } from './pipeline-lifecycle-bridge';
import {
  computeCapabilities,
  postDispatched,
  postPreview,
  postStatus,
  postUpdated,
  type PlanStoreWriter,
} from './plan-wire';
import { getLogger } from '../base';

const logger = getLogger('PlanReviewSession');

// =============================================================================
// Pending-plan bookkeeping
// =============================================================================

interface PendingPlan {
  plan: Workflow.LitePlan;
  resolve(decision: PlanDecision): void;
  reject(err: Error): void;
  /** Input used to build this plan, re-used on override */
  input: Workflow.RawInput;
  /** Original request options (for re-dispatch) */
  request: Omit<PresentPlanOptions, 'input'>;
  /** Shot list used during matching — kept around so edits can re-run consistency */
  shots?: readonly Workflow.Shot[];
}

type PlanDecision =
  | { kind: 'approve'; plan: Workflow.LitePlan }
  | { kind: 'override'; forceLevel: Workflow.RouteLevel; plan: Workflow.LitePlan }
  | { kind: 'abort'; plan: Workflow.LitePlan };

// =============================================================================
// Public API
// =============================================================================

export interface PresentPlanOptions {
  input: Workflow.RawInput;
  routerOverrides?: Workflow.RouterOverrides;
  globalStyle?: string;
  /** Auto-approve if confidence ≥ this threshold (Phase 1 default: always prompt) */
  autoApproveThreshold?: number;
  /** Shot list that matching + consistency ran against.  See PendingPlan.shots. */
  shots?: ReadonlyArray<Workflow.Shot>;
}

export interface PlanReviewSessionDeps {
  orchestrator: Orchestrator;
  planStore: Workflow.PlanStore | undefined;
  planStoreWriter: PlanStoreWriter;
  pipelineLifecycle: PipelineLifecycleBridge;
  getWebview: () => vscode.Webview | undefined;
}

export class PlanReviewSession {
  /**
   * Pending map — visible as a getter so the facade can preserve its
   * legacy `.pending` accessor (used by a handful of regression tests
   * to poke at session state).  Production code should never touch it
   * directly.
   */
  readonly pending = new Map<string, PendingPlan>();

  constructor(private readonly deps: PlanReviewSessionDeps) {}

  /**
   * Build a plan, present it, and dispatch on user approval.
   *
   * Dispatch uses the CURRENT in-memory plan (mutated by edit-binding /
   * toggle-checkpoint during review) — not the initial build result.
   * See handleIncoming for the decision-carrying-plan mechanism.
   */
  async presentAndDispatch(options: PresentPlanOptions): Promise<{
    route: Workflow.Route;
    plan: Workflow.LitePlan;
    result: RoutedPipelineResult | undefined;
  }> {
    const { route, plan } = await this.deps.orchestrator.buildPlan(
      options.input,
      options.routerOverrides,
      options.shots,
    );

    // Persist the initial 'pending' plan so refreshes / crashes don't lose it.
    await this.deps.planStoreWriter.persistInitial(plan);

    // Auto-approve path: confidence clears the threshold and no shots need review.
    const threshold = options.autoApproveThreshold ?? 1.1; // default: never auto-approve
    if (route.confidence >= threshold && planHasNoRedCells(plan)) {
      logger.info('Plan auto-approved', {
        planId: plan.id,
        level: route.level,
        confidence: route.confidence,
      });
      await this.deps.planStoreWriter.transition(plan.id, 'approved', {
        reason: 'auto-approve (threshold met)',
        by: 'system',
      });
      const result = await this.dispatchApprovedPlan(plan, options.input, {
        ...(options.routerOverrides !== undefined && { routerOverrides: options.routerOverrides }),
        ...(options.globalStyle !== undefined && { globalStyle: options.globalStyle }),
      });
      return { route, plan, result };
    }

    // Interactive path — pending.set MUST happen before postPreview so
    // the first-frame capability snapshot reflects the same truth the
    // handler will use later.  See Fix-F in the review history.
    const request: Omit<PresentPlanOptions, 'input'> = {
      ...(options.routerOverrides !== undefined && { routerOverrides: options.routerOverrides }),
      ...(options.globalStyle !== undefined && { globalStyle: options.globalStyle }),
      ...(options.autoApproveThreshold !== undefined && {
        autoApproveThreshold: options.autoApproveThreshold,
      }),
      ...(options.shots !== undefined && { shots: options.shots }),
    };
    const decision = new Promise<PlanDecision>((resolve, reject) => {
      this.pending.set(plan.id, {
        plan,
        resolve,
        reject,
        input: options.input,
        request,
        ...(options.shots !== undefined && { shots: options.shots }),
      });
    });
    // Promise constructor runs synchronously — pending is populated.
    this.postPreview(plan);

    const resolved = await decision;
    const currentPlan = resolved.plan;

    switch (resolved.kind) {
      case 'abort':
        logger.info('Plan aborted by user', { planId: currentPlan.id });
        await this.deps.pipelineLifecycle.markAborted(currentPlan.id, 'user-abort');
        return { route, plan: currentPlan, result: undefined };

      case 'override': {
        await this.deps.pipelineLifecycle.markEdited(
          currentPlan.id,
          `override to ${resolved.forceLevel}`,
        );
        const overriddenOptions: PresentPlanOptions = {
          input: options.input,
          routerOverrides: {
            ...(options.routerOverrides ?? {}),
            forceLevel: resolved.forceLevel,
          },
          ...(options.globalStyle !== undefined && { globalStyle: options.globalStyle }),
          ...(options.autoApproveThreshold !== undefined && {
            autoApproveThreshold: options.autoApproveThreshold,
          }),
          ...(options.shots !== undefined && { shots: options.shots }),
        };
        return this.presentAndDispatch(overriddenOptions);
      }

      case 'approve': {
        logger.info('Plan approved by user', { planId: currentPlan.id });
        await this.deps.planStoreWriter.transition(currentPlan.id, 'approved', {
          reason: 'user-approve',
          by: 'user',
        });
        const result = await this.dispatchApprovedPlan(currentPlan, options.input, {
          ...(options.routerOverrides !== undefined && {
            routerOverrides: options.routerOverrides,
          }),
          ...(options.globalStyle !== undefined && { globalStyle: options.globalStyle }),
        });
        return { route, plan: currentPlan, result };
      }
    }
  }

  /**
   * Route an incoming approve / override / abort message to the matching
   * pending entry.  Each decision carries `pending.plan` forward so the
   * resolver sees the post-edit plan.
   */
  handleIncoming(
    msg: WorkflowPlanApproveMessage | WorkflowPlanOverrideMessage | WorkflowPlanAbortMessage,
  ): boolean {
    const pending = this.pending.get(msg.planId);
    if (!pending) return false;

    this.pending.delete(msg.planId);

    switch (msg.type) {
      case 'workflow/planApprove':
        pending.resolve({ kind: 'approve', plan: pending.plan });
        return true;
      case 'workflow/planOverride':
        pending.resolve({
          kind: 'override',
          forceLevel: msg.forceLevel,
          plan: pending.plan,
        });
        return true;
      case 'workflow/planAbort':
        pending.resolve({ kind: 'abort', plan: pending.plan });
        return true;
    }
  }

  /**
   * Apply a user-driven matrix edit to a pending plan.
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
    await this.deps.planStoreWriter.persistEdit(updated);
    this.postUpdated(updated);
    return updated;
  }

  /**
   * Toggle the `userCheckpoint` flag on one of the plan's stages.
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
    await this.deps.planStoreWriter.persistEdit(updated);
    this.postUpdated(updated);
    return updated;
  }

  /**
   * Propagate an edit to every shot whose binding references the same entity.
   */
  async handleApplyToAll(
    msg: WorkflowPlanApplyToAllMessage,
  ): Promise<Workflow.LitePlan | undefined> {
    const pending = this.pending.get(msg.planId);
    if (!pending) return undefined;

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
    await this.deps.planStoreWriter.persistEdit(updated);
    this.postUpdated(updated);
    return updated;
  }

  /**
   * Fork a persisted plan into a new pending plan.  Legacy plans without
   * `source.input` are rejected before `forkPlan` runs — we don't leave
   * zombie forks on disk (see Fix-D review history).
   */
  async handleFork(msg: WorkflowPlanForkMessage): Promise<Workflow.LitePlan | undefined> {
    if (!this.deps.planStore) {
      logger.warn('Fork ignored — no PlanStore configured', { planId: msg.planId });
      return undefined;
    }
    const source = await this.deps.planStore.load(msg.planId);
    if (!source) {
      logger.warn('Fork ignored — source plan not found', { planId: msg.planId });
      return undefined;
    }
    if (!source.input) {
      logger.warn('Fork rejected — source plan has no persisted RawInput (pre-Phase-2.5)', {
        planId: msg.planId,
      });
      void vscode.window.showWarningMessage(
        `Cannot fork plan ${msg.planId}: it predates input persistence. ` +
          'Re-run from scratch instead.',
      );
      return undefined;
    }
    const forkInput = source.input;

    const fork = Workflow.forkPlan(source, {
      reason: 'user-fork',
      by: 'user',
      ...(msg.resetToOriginal === true && { resetToOriginal: true }),
    });
    await this.deps.planStore.save(fork);
    const lite = Workflow.toLitePlan(fork);

    // Register the fork as pending.  Shots aren't persisted on NkPlan
    // so edit-binding on a forked plan goes through the fail-safe
    // branch in rerunConsistency (preserves prior violations instead
    // of silently clearing them).
    const decision = new Promise<PlanDecision>((resolve, reject) => {
      this.pending.set(lite.id, {
        plan: lite,
        resolve,
        reject,
        input: forkInput,
        request: {},
      });
    });
    this.postPreview(lite);

    // Fire-and-forget — the fork flow is user-paced; returning
    // immediately lets the caller post the preview and wait for the
    // button press.
    void (async () => {
      const d = await decision;
      const planNow = d.plan;
      if (d.kind === 'abort') {
        await this.deps.pipelineLifecycle.markAborted(planNow.id, 'user-abort');
        return;
      }
      if (d.kind === 'override') {
        // Override on a fork: abandon it, re-run Router with the
        // persisted input + forceLevel.
        await this.deps.pipelineLifecycle.markEdited(planNow.id, `override to ${d.forceLevel}`);
        await this.presentAndDispatch({
          input: forkInput,
          routerOverrides: { forceLevel: d.forceLevel },
        });
        return;
      }
      logger.info('Forked plan approved by user', { planId: planNow.id });
      await this.deps.planStoreWriter.transition(planNow.id, 'approved', {
        reason: 'user-approve (fork)',
        by: 'user',
      });
      await this.dispatchApprovedPlan(planNow, forkInput, {});
    })();

    return lite;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Common "plan is approved → hand off to the pipeline" path shared by
   * auto-approve, user-approve, and fork-dispatch.  Uses `req.plan` so
   * the orchestrator reuses the reviewed plan (preserves id + bindings
   * + checkpoints through execution).
   */
  private async dispatchApprovedPlan(
    plan: Workflow.LitePlan,
    input: Workflow.RawInput,
    request: {
      routerOverrides?: Workflow.RouterOverrides;
      globalStyle?: string;
    },
  ): Promise<RoutedPipelineResult> {
    const result = await this.deps.orchestrator.startRoutedPipeline({
      input,
      plan,
      ...(request.routerOverrides !== undefined && { routerOverrides: request.routerOverrides }),
      ...(request.globalStyle !== undefined && { globalStyle: request.globalStyle }),
    });
    await this.deps.pipelineLifecycle.markExecuting(plan.id, result.handle.id);
    postDispatched(this.deps.getWebview, plan.id, result.handle.id, result.handle.flowId);
    return result;
  }

  private postPreview(plan: Workflow.LitePlan): void {
    postPreview(this.deps.getWebview, plan, this.capabilitiesFor(plan));
  }

  private postUpdated(plan: Workflow.LitePlan): void {
    postUpdated(this.deps.getWebview, plan, this.capabilitiesFor(plan));
  }

  private capabilitiesFor(plan: Workflow.LitePlan): WorkflowPlanCapabilities {
    const hasPendingShots = (this.pending.get(plan.id)?.shots?.length ?? 0) > 0;
    return computeCapabilities(plan, hasPendingShots);
  }
}

// =============================================================================
// Pure helpers
// =============================================================================

function planHasNoRedCells(plan: Workflow.LitePlan): boolean {
  if (!plan.shots) return true;
  return plan.shots.every((s) => (s.unmatched?.length ?? 0) === 0);
}

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
  // Fall back to the current primary (idempotent edit) so re-selecting
  // the already-chosen asset is a no-op with defined behaviour.
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
