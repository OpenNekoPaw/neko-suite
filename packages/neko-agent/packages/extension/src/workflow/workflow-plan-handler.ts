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
  WorkflowPlanCapabilities,
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
  WorkflowRouterMemoryDeleteMessage,
  WorkflowRouterMemoryEntry,
  WorkflowRouterMemoryMessage,
  WorkflowRouterMemoryRequestMessage,
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
  /**
   * Shot list that matching + consistency were run against.  Stored on the
   * PendingPlan so post-preview edits (edit-binding / apply-to-all) can
   * re-run the ConsistencyChecker against the original matching input
   * rather than an empty shot set (which would silently clear violations).
   */
  shots?: ReadonlyArray<Workflow.Shot>;
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
   *
   * Important: after the user approves (or auto-approve fires), dispatch uses
   * **the current in-memory plan** — the one the user actually reviewed +
   * edited — not a re-generated copy.  Auto-approve re-uses the initial
   * build result; the interactive path re-uses `pending.plan`, which
   * handleEditBinding / handleToggleCheckpoint / handleApplyToAll have
   * already mutated in place.  Passing the plan into `startRoutedPipeline`
   * skips the Router + PlanBuilder re-run and keeps plan id / bindings /
   * checkpoints / reference chain stable through execution.
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
      const result = await this.dispatchApprovedPlan(plan, options.input, {
        ...(options.routerOverrides !== undefined && { routerOverrides: options.routerOverrides }),
        ...(options.globalStyle !== undefined && { globalStyle: options.globalStyle }),
      });
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
        ...(options.shots !== undefined && { shots: options.shots }),
      };
      this.pending.set(plan.id, {
        plan,
        resolve,
        reject,
        input: options.input,
        request,
        // Retain the original shot list so edit-binding / apply-to-all can
        // re-run ConsistencyChecker against the same input matching saw.
        // Falls back to undefined (not empty array) when no shots flowed in,
        // so downstream code can distinguish "never had shots" from "had an
        // empty list of shots".
        ...(options.shots !== undefined && { shots: options.shots }),
      });
    });

    // `decision.plan` carries the in-memory plan at the moment of approval
    // — this is the plan mutated by edit-binding / toggle-checkpoint
    // messages, not the initial build result.  See handleIncoming.
    const currentPlan = decision.plan;

    switch (decision.kind) {
      case 'abort':
        logger.info('Plan aborted by user', { planId: currentPlan.id });
        await this.transitionIfStored(currentPlan.id, 'aborted', {
          reason: 'user-abort',
          by: 'user',
        });
        this.broadcastPlanState('aborted', currentPlan.id);
        this.postStatus(currentPlan.id, 'aborted');
        return { route, plan: currentPlan, result: undefined };

      case 'override': {
        // Mark the original as 'edited' (→ pending) so the history shows
        // the replacement lineage, then recurse.
        await this.transitionIfStored(currentPlan.id, 'edited', {
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
          ...(options.shots !== undefined && { shots: options.shots }),
        };
        return this.presentAndDispatch(overriddenOptions);
      }

      case 'approve': {
        logger.info('Plan approved by user', { planId: currentPlan.id });
        await this.transitionIfStored(currentPlan.id, 'approved', {
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
   * Common "plan is approved → hand off to the pipeline" path shared by the
   * auto-approve branch, the user-approve branch, and fork-dispatch.
   *
   * Passes `plan` to `startRoutedPipeline` so the orchestrator reuses it
   * instead of re-running Router + PlanBuilder (which would produce a new
   * plan id and drop the user's matrix edits / checkpoint toggles / fork
   * lineage).  Keeps plan-id ↔ pipeline-id binding consistent with what
   * attachProgressForwarder and the PlanStore track.
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
    await this.transitionIfStored(plan.id, 'executing', {
      pipelineId: result.handle.id,
      by: 'system',
    });
    this.broadcastPlanState('executing', plan.id, result.handle.id);
    this.postDispatched(plan.id, result.handle.id, result.handle.flowId);
    return result;
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

    // Always pass `pending.plan` (the in-memory plan mutated by earlier
    // edit-binding / toggle-checkpoint messages) so `presentAndDispatch`
    // dispatches the exact plan the user reviewed.  See Fix-1 rationale.
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
   * The fork's Start / Edit / Abort buttons go through the same interactive
   * flow as the initial preview: `handleIncoming` resolves the pending
   * promise, and the internal resolver below either dispatches via
   * `dispatchApprovedPlan` (Start) or emits an aborted status (Abort).
   * Before Fix-2 the fork had a placeholder resolver that did nothing —
   * clicking Start was silently a no-op.
   *
   * Returns the forked plan for test assertions; does NOT await the
   * eventual dispatch because forks are user-initiated on a webview
   * timeline.
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

    // Fork self-sufficiency contract — `source.input` is required for
    // honest fork execution (fountain/file-based inputs break when we
    // synthesise a `{kind:'prompt', text: route.reason}` placeholder
    // because downstream stages read ctx.source / ctx.sourceFormat).
    // Pre-Phase-2.5 plans lack `input`; we log + abort the fork rather
    // than dispatch against a fake source.
    const forkInput = source.input;
    if (!forkInput) {
      logger.warn('Fork has no persisted RawInput (pre-Phase-2.5 plan); cannot dispatch honestly', {
        planId: lite.id,
        parentPlanId: msg.planId,
      });
      await this.transitionIfStored(lite.id, 'aborted', {
        reason: 'fork-missing-input (source plan predates input persistence)',
        by: 'system',
      });
      this.postStatus(lite.id, 'aborted');
      this.postPreview(lite);
      return lite;
    }

    // Register the fork as pending with a real dispatcher.  When the user
    // clicks Start, handleIncoming resolves this promise with the (possibly
    // edited) plan and we dispatch it via the same
    // `dispatchApprovedPlan` path used by the initial preview.
    //
    // Note on pending.shots: we intentionally leave it undefined because
    // the original Shot[] matching ran against is NOT persisted on
    // NkPlan (only the derived bindings).  editPlanBinding /
    // applyBindingToAll on a forked plan therefore go through the
    // fail-safe branch in rerunConsistency — preserving prior violations
    // instead of silently clearing them.
    const decision = new Promise<PlanDecision>((resolve, reject) => {
      this.pending.set(lite.id, {
        plan: lite,
        resolve,
        reject,
        input: forkInput,
        request: {},
      });
    });

    // Fire-and-forget — the fork flow is user-paced; returning immediately
    // lets the caller post a planPreview and wait for the button press.
    void (async () => {
      const d = await decision;
      const planNow = d.plan;
      if (d.kind === 'abort') {
        await this.transitionIfStored(planNow.id, 'aborted', {
          reason: 'user-abort',
          by: 'user',
        });
        this.broadcastPlanState('aborted', planNow.id);
        this.postStatus(planNow.id, 'aborted');
        return;
      }
      if (d.kind === 'override') {
        // With persisted input, override is a legitimate operation on a
        // fork: abandon the fork, run Router.decide(source.input) with
        // forceLevel, rebuild, and re-present.  We recurse through
        // presentAndDispatch which manages the full lifecycle.
        await this.transitionIfStored(planNow.id, 'edited', {
          reason: `override to ${d.forceLevel}`,
          by: 'user',
        });
        await this.presentAndDispatch({
          input: forkInput,
          routerOverrides: { forceLevel: d.forceLevel },
        });
        return;
      }
      // Approve path.
      logger.info('Forked plan approved by user', { planId: planNow.id });
      await this.transitionIfStored(planNow.id, 'approved', {
        reason: 'user-approve (fork)',
        by: 'user',
      });
      await this.dispatchApprovedPlan(planNow, forkInput, {});
    })();

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

  // ---------------------------------------------------------------------------
  // Router memory inspection (Phase 3 tool)
  // ---------------------------------------------------------------------------

  /**
   * Return recent router-memory entries.  Posts `workflow/routerMemory` with
   * the entries + total; when no memory is wired the message still posts
   * (empty entries + errorMessage).
   */
  handleRouterMemoryRequest(msg: WorkflowRouterMemoryRequestMessage): WorkflowRouterMemoryEntry[] {
    const memory = this.deps.orchestrator.routerMemory;
    if (!memory) {
      this.postRouterMemory({
        entries: [],
        total: 0,
        errorMessage: 'Router memory is not available (no workspace folder or file IO).',
      });
      return [];
    }
    const entries = memory.listRecent({
      ...(msg.limit !== undefined && { limit: msg.limit }),
      ...(msg.level !== undefined && { level: msg.level }),
      ...(msg.source !== undefined && { source: msg.source }),
    });
    const wire = entries.map(toWireRouterMemoryEntry);
    this.postRouterMemory({ entries: wire, total: memory.count() });
    return wire;
  }

  /**
   * Delete a single entry by hash, or clear all entries when `hash` is
   * omitted.  After mutating, re-post the updated list so the webview
   * re-renders without a separate request.
   */
  async handleRouterMemoryDelete(msg: WorkflowRouterMemoryDeleteMessage): Promise<boolean> {
    const memory = this.deps.orchestrator.routerMemory;
    if (!memory) {
      this.postRouterMemory({
        entries: [],
        total: 0,
        errorMessage: 'Router memory is not available.',
      });
      return false;
    }
    let changed = false;
    if (msg.hash !== undefined) {
      changed = await memory.deleteByHash(msg.hash);
    } else {
      await memory.clearAll();
      changed = true;
    }
    const entries = memory.listRecent().map(toWireRouterMemoryEntry);
    this.postRouterMemory({ entries, total: memory.count() });
    return changed;
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
  // Cross-extension plan-state broadcast
  // ---------------------------------------------------------------------------

  /**
   * Tell sibling extensions (currently neko-canvas) when a plan enters or
   * leaves an "actively working" state.  This lets e.g. the canvas
   * BatchGenerationScheduler enter quiet mode so it doesn't double-queue
   * with the orchestrator's batchGenerate pipeline stage.
   *
   * Fire-and-forget; if no extension registers the command the call is a
   * silent no-op (command-not-found is swallowed by the promise catch).
   */
  private broadcastPlanState(
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

  // ---------------------------------------------------------------------------
  // Posting helpers
  // ---------------------------------------------------------------------------

  private postPreview(plan: Workflow.LitePlan): void {
    const webview = this.deps.getWebview();
    if (!webview) return;
    const wirePlan = toWirePlan(plan, this.computeCapabilities(plan));
    webview.postMessage({
      type: 'workflow/planPreview',
      plan: wirePlan,
    });
  }

  /**
   * Compute which webview actions are actually wired end-to-end for the
   * given plan.  Callers include this alongside the wire plan so the
   * WorkflowPlanCard can hide buttons that would silently fail (e.g. the
   * Override button on forks created from pre-Phase-2.5 plans where
   * `plan.input` is absent).
   */
  private computeCapabilities(plan: Workflow.LitePlan): WorkflowPlanCapabilities {
    const pending = this.pending.get(plan.id);
    const hasShots = (plan.shots?.length ?? 0) > 0;
    const hasInput = plan.input !== undefined;
    const hasPendingShots = (pending?.shots?.length ?? 0) > 0;
    const hasActiveStages = plan.stages.some((s) => !s.skipped);
    return {
      canApprove: true,
      canAbort: true,
      // Override requires the original input to re-run Router.decide with
      // forceLevel.  Forks from pre-Phase-2.5 plans have no input.
      canOverride: hasInput,
      canEditBinding: hasShots,
      canApplyToAll: hasShots,
      canToggleCheckpoint: hasActiveStages,
      // ConsistencyChecker needs the original Shot[] input (held on
      // PendingPlan.shots).  Forks never have it — editing still works
      // but won't re-run the checker.
      canRecheckConsistency: hasShots && hasPendingShots,
    };
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
    webview.postMessage({
      type: 'workflow/planUpdated',
      plan: toWirePlan(plan, this.computeCapabilities(plan)),
    });
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

  private postRouterMemory(params: Omit<WorkflowRouterMemoryMessage, 'type'>): void {
    const webview = this.deps.getWebview();
    if (!webview) return;
    webview.postMessage({ type: 'workflow/routerMemory', ...params });
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
        this.broadcastPlanState('completed', planId, result.handle.id);
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
        this.broadcastPlanState('failed', planId, result.handle.id);
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

function toWireRouterMemoryEntry(entry: Workflow.RouterMemoryEntry): WorkflowRouterMemoryEntry {
  return {
    hash: entry.hash,
    level: entry.level,
    reason: entry.reason,
    at: entry.at,
    source: entry.source,
    ...(entry.textLength !== undefined && { textLength: entry.textLength }),
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
