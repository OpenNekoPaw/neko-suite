/**
 * Pipeline Lifecycle Bridge — forwards post-dispatch pipeline events
 * (progress, completion, error) to the webview and PlanStore.  Also
 * owns the canvas-facing broadcast when plan state changes.
 *
 * Extracted from the old WorkflowPlanHandler so the review session
 * doesn't carry lifecycle wiring, and sibling controllers
 * (PlanReviewSession on dispatch, future auto-restart flows) can share
 * one attachment path.
 */

import * as vscode from 'vscode';
import { Workflow } from '@neko/platform';
import type { RoutedWorkflowResult } from './orchestrator-bootstrap';
import { subscribeWorkflowProgress } from './workflow-progress-bridge';
import { registerActiveWorkflow, removePipeline } from '../tools/pipelineTools';
import { broadcastPlanState, postStatus, type PlanStoreWriter } from './plan-wire';

export interface WorkflowLifecycleBridgeDeps {
  planStoreWriter: PlanStoreWriter;
  getWebview: () => vscode.Webview | undefined;
}

export class WorkflowLifecycleBridge {
  constructor(private readonly deps: WorkflowLifecycleBridgeDeps) {}

  /**
   * Subscribe to pipeline progress and forward completion / error back
   * to the webview + PlanStore + canvas broadcast.
   *
   * Called once per dispatched pipeline (by PlanReviewSession's
   * dispatchApprovedPlan and the external `startRoutedWorkflow` entry
   * point in index.ts).  Safe to call multiple times per pipeline —
   * progress-bridge + registerActiveWorkflow are idempotent.
   */
  attachProgressForwarder(
    planId: string,
    result: RoutedWorkflowResult,
    chatWebview: vscode.Webview,
    progressEventCommand?: string,
  ): void {
    // Register the handle so webview messages (pipelineGateConfirm /
    // pipelineGateCancel) can reach it.  The progress bridge will call
    // removePipeline() on completion / error.
    registerActiveWorkflow(result.handle.id, result.handle);

    subscribeWorkflowProgress(chatWebview, result.handle.id, result.handle, {
      ...(progressEventCommand !== undefined && { eventCommand: progressEventCommand }),
    });

    // Best-effort status updates — propagate to webview and to PlanStore.
    result.handle.result
      .then(async () => {
        await this.deps.planStoreWriter.transition(planId, 'completed', { by: 'system' });
        broadcastPlanState('completed', planId, result.handle.id);
        postStatus(this.deps.getWebview, planId, 'completed');
      })
      .catch(async (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        await this.deps.planStoreWriter.transition(planId, 'failed', {
          errorMessage: message,
          by: 'system',
        });
        // Defensive cleanup — removePipeline is idempotent.
        removePipeline(result.handle.id);
        broadcastPlanState('failed', planId, result.handle.id);
        postStatus(this.deps.getWebview, planId, 'failed', message);
      });
  }

  /**
   * Transition helpers re-exposed so PlanReviewSession can drive store +
   * broadcast through a single entry point (keeps the "who broadcasts"
   * contract in one place).
   */
  async markApproved(planId: string, opts: { reason?: string; by?: string } = {}): Promise<void> {
    await this.deps.planStoreWriter.transition(planId, 'approved', opts);
  }

  async markExecuting(planId: string, pipelineId: string): Promise<void> {
    await this.deps.planStoreWriter.transition(planId, 'executing', {
      pipelineId,
      by: 'system',
    });
    broadcastPlanState('executing', planId, pipelineId);
  }

  async markAborted(planId: string, reason: string, by: string = 'user'): Promise<void> {
    await this.deps.planStoreWriter.transition(planId, 'aborted', { reason, by });
    broadcastPlanState('aborted', planId);
    postStatus(this.deps.getWebview, planId, 'aborted');
  }

  async markEdited(planId: string, reason: string): Promise<void> {
    await this.deps.planStoreWriter.transition(planId, 'edited', { reason, by: 'user' });
  }
}

export type { Workflow };
