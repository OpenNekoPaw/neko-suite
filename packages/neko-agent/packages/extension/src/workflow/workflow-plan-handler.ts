/**
 * Workflow Plan Handler — facade over the four single-responsibility
 * sub-controllers that used to live in this file as one 1100-line class.
 *
 *   - PlanReviewSession       (presentAndDispatch + edits + fork + capabilities)
 *   - PlanQueryController     (diff / list / loadPersistedPlan)
 *   - WorkflowLifecycleBridge (attachProgressForwarder + store transitions)
 *   - RouterMemoryController  (router memory inspection + mutation)
 *
 * This facade preserves the external API that chatProvider / index.ts
 * already call (handleIncoming, handleEditBinding, presentAndDispatch,
 * attachProgressForwarder, etc.), so consumers don't need to know about
 * the split.  Pick the sub-controller directly in new code for finer
 * dependency control.
 *
 * See docs/architecture/plan-mode.md §7 for the interactive flow.
 */

import * as vscode from 'vscode';
import type {
  WorkflowPlanAbortMessage,
  WorkflowPlanApplyToAllMessage,
  WorkflowPlanApproveMessage,
  WorkflowPlanDiffRequestMessage,
  WorkflowPlanEditBindingMessage,
  WorkflowPlanForkMessage,
  WorkflowPlanListEntry,
  WorkflowPlanListRequestMessage,
  WorkflowPlanOverrideMessage,
  WorkflowPlanToggleCheckpointMessage,
  WorkflowRouterMemoryDeleteMessage,
  WorkflowRouterMemoryEntry,
  WorkflowRouterMemoryRequestMessage,
} from '@neko-agent/types';
import { Workflow } from '@neko/platform';
import type { Orchestrator, RoutedWorkflowResult } from './orchestrator-bootstrap';
import { PlanReviewSession, type PresentPlanOptions } from './plan-review-session';
import { PlanQueryController } from './plan-query-controller';
import { WorkflowLifecycleBridge } from './workflow-lifecycle-bridge';
import { RouterMemoryController } from './router-memory-controller';
import { PlanStoreWriter, toWirePlan, VSCodeUserNotifier, type UserNotifier } from './plan-wire';

// Re-export types the broader codebase has historically imported from
// this module.
export type { PresentPlanOptions };
export { toWirePlan };

export interface WorkflowPlanHandlerDeps {
  orchestrator: Orchestrator;
  getWebview: () => vscode.Webview | undefined;
  /** Optional PlanStore override (defaults to orchestrator.planStore). */
  planStore?: Workflow.PlanStore;
  /**
   * User-facing notifier (defaults to `vscode.window.showWarningMessage`).
   * Inject a silent stub in tests.
   */
  notifier?: UserNotifier;
  /**
   * Optional P4 plan-approval adapter. When supplied, the review
   * session consults the unified ApprovalEngine for the auto-approve
   * decision instead of the legacy confidence threshold.
   *
   * Shape intentionally matches the output of
   * `createPlanReviewApprovalAdapter` from @neko/agent/approval so
   * extension activation can pass the adapter through as-is.
   */
  evaluatePlanApproval?: import('./plan-review-session').PlanReviewSessionDeps['evaluatePlanApproval'];
}

/**
 * Thin composition root.  Instantiates the four sub-controllers and
 * delegates.  Each sub-controller receives only the collaborators it
 * actually uses — no more god-class knowing everything.
 */
export class WorkflowPlanHandler {
  private readonly reviewSession: PlanReviewSession;
  private readonly queryController: PlanQueryController;
  private readonly lifecycleBridge: WorkflowLifecycleBridge;
  private readonly routerMemoryController: RouterMemoryController;

  constructor(deps: WorkflowPlanHandlerDeps) {
    const planStore = deps.planStore ?? deps.orchestrator.planStore;
    const planStoreWriter = new PlanStoreWriter(planStore);
    const notifier = deps.notifier ?? VSCodeUserNotifier;

    this.lifecycleBridge = new WorkflowLifecycleBridge({
      planStoreWriter,
      getWebview: deps.getWebview,
    });
    this.reviewSession = new PlanReviewSession({
      orchestrator: deps.orchestrator,
      planStoreWriter,
      pipelineLifecycle: this.lifecycleBridge,
      getWebview: deps.getWebview,
      notifier,
      ...(deps.evaluatePlanApproval ? { evaluatePlanApproval: deps.evaluatePlanApproval } : {}),
    });
    this.queryController = new PlanQueryController({
      planStore,
      getWebview: deps.getWebview,
    });
    this.routerMemoryController = new RouterMemoryController({
      orchestrator: deps.orchestrator,
      getWebview: deps.getWebview,
    });
  }

  // ---------------------------------------------------------------------------
  // Review — presentAndDispatch + interactive decisions + edits + fork
  // ---------------------------------------------------------------------------

  presentAndDispatch(options: PresentPlanOptions): Promise<{
    route: Workflow.Route;
    plan: Workflow.LitePlan;
    result: RoutedWorkflowResult | undefined;
  }> {
    return this.reviewSession.presentAndDispatch(options);
  }

  handleIncoming(
    msg: WorkflowPlanApproveMessage | WorkflowPlanOverrideMessage | WorkflowPlanAbortMessage,
  ): boolean {
    return this.reviewSession.handleIncoming(msg);
  }

  handleEditBinding(msg: WorkflowPlanEditBindingMessage): Promise<Workflow.LitePlan | undefined> {
    return this.reviewSession.handleEditBinding(msg);
  }

  handleApplyToAll(msg: WorkflowPlanApplyToAllMessage): Promise<Workflow.LitePlan | undefined> {
    return this.reviewSession.handleApplyToAll(msg);
  }

  handleToggleCheckpoint(
    msg: WorkflowPlanToggleCheckpointMessage,
  ): Promise<Workflow.LitePlan | undefined> {
    return this.reviewSession.handleToggleCheckpoint(msg);
  }

  handleFork(msg: WorkflowPlanForkMessage): Promise<Workflow.LitePlan | undefined> {
    return this.reviewSession.handleFork(msg);
  }

  // ---------------------------------------------------------------------------
  // Query — diff / list / load (read-only)
  // ---------------------------------------------------------------------------

  loadPersistedPlan(planId: string): Promise<Workflow.PersistentPlan | undefined> {
    return this.queryController.loadPersistedPlan(planId);
  }

  handleDiffRequest(msg: WorkflowPlanDiffRequestMessage): Promise<Workflow.PlanDiff | undefined> {
    return this.queryController.handleDiffRequest(msg);
  }

  handleListRequest(
    msg: WorkflowPlanListRequestMessage,
  ): Promise<WorkflowPlanListEntry[] | undefined> {
    return this.queryController.handleListRequest(msg);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle — progress forwarding (called externally after dispatch)
  // ---------------------------------------------------------------------------

  attachProgressForwarder(
    planId: string,
    result: RoutedWorkflowResult,
    chatWebview: vscode.Webview,
    progressEventCommand?: string,
  ): void {
    this.lifecycleBridge.attachProgressForwarder(planId, result, chatWebview, progressEventCommand);
  }

  // ---------------------------------------------------------------------------
  // Router memory — inspector UI backend
  // ---------------------------------------------------------------------------

  handleRouterMemoryRequest(msg: WorkflowRouterMemoryRequestMessage): WorkflowRouterMemoryEntry[] {
    return this.routerMemoryController.handleRouterMemoryRequest(msg);
  }

  handleRouterMemoryDelete(msg: WorkflowRouterMemoryDeleteMessage): Promise<boolean> {
    return this.routerMemoryController.handleRouterMemoryDelete(msg);
  }

  // ---------------------------------------------------------------------------
  // Legacy accessor — tests poke at `.pending` to verify session state.
  // Production code should NOT depend on this; it's kept only so the
  // regression tests don't need to re-route through sub-controllers.
  // ---------------------------------------------------------------------------

  /** @internal — for tests only */
  get pending(): Map<string, unknown> {
    return this.reviewSession.pending as unknown as Map<string, unknown>;
  }
}
