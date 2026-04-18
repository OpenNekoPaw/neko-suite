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
  WorkflowShotBindingSummary,
  WorkflowPlanAbortMessage,
  WorkflowPlanApproveMessage,
  WorkflowPlanOverrideMessage,
} from '@neko-agent/types';
import type { Workflow } from '@neko/platform';
import type { Orchestrator, RoutedPipelineResult } from './orchestrator-bootstrap';
import { subscribePipelineProgress } from '../pipeline/pipeline-progress-bridge';
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
}

export class WorkflowPlanHandler {
  private readonly pending = new Map<string, PendingPlan>();

  constructor(private readonly deps: WorkflowPlanHandlerDeps) {}

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

    // Auto-approve path: confidence clears the threshold and no shots need review.
    const threshold = options.autoApproveThreshold ?? 1.1; // default: never auto-approve
    if (route.confidence >= threshold && this.planHasNoRedCells(plan)) {
      logger.info('Plan auto-approved', {
        planId: plan.id,
        level: route.level,
        confidence: route.confidence,
      });
      const result = await this.deps.orchestrator.startRoutedPipeline({
        input: options.input,
        ...(options.routerOverrides !== undefined && { routerOverrides: options.routerOverrides }),
        ...(options.globalStyle !== undefined && { globalStyle: options.globalStyle }),
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
        this.postStatus(plan.id, 'aborted');
        return { route, plan, result: undefined };

      case 'override': {
        // Re-run with forced level; recurse so the user can review the new plan
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
        const result = await this.deps.orchestrator.startRoutedPipeline({
          input: options.input,
          ...(options.routerOverrides !== undefined && {
            routerOverrides: options.routerOverrides,
          }),
          ...(options.globalStyle !== undefined && { globalStyle: options.globalStyle }),
        });
        this.postDispatched(plan.id, result.handle.id, result.handle.flowId);
        return { route, plan, result };
      }
    }
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
    subscribePipelineProgress(chatWebview, result.handle.id, result.handle, {
      ...(progressEventCommand !== undefined && { eventCommand: progressEventCommand }),
    });

    // Best-effort status updates
    result.handle.result
      .then(() => this.postStatus(planId, 'completed'))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
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
    })),
    ...(plan.shots !== undefined && { shots: plan.shots.map(toWireShot) }),
    ...(plan.notes !== undefined && { notes: [...plan.notes] }),
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

function toWireCandidate(c: {
  slot: string;
  entityId: string;
  assetId: string;
  provenance: 'L1' | 'L2' | 'L3' | 'L4' | 'L5';
  confidence: number;
  reason?: string;
}): WorkflowBindingCandidate {
  return {
    slot: c.slot as WorkflowBindingCandidate['slot'],
    entityId: c.entityId,
    assetId: c.assetId,
    provenance: c.provenance,
    confidence: c.confidence,
    ...(c.reason !== undefined && { reason: c.reason }),
  };
}
