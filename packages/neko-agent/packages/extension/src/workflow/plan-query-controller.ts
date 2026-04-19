/**
 * Plan Query Controller — read-only views over the persisted PlanStore.
 * Handles `workflow/planDiffRequest`, `workflow/planListRequest`, and
 * direct `loadPersistedPlan` calls.
 *
 * Extracted from the old WorkflowPlanHandler god-class so the review
 * session doesn't have to drag the entire query surface along.  No
 * mutating operations live here; nothing in this module touches the
 * pending map or dispatches pipelines.
 */

import * as vscode from 'vscode';
import type {
  WorkflowPlanDiffRequestMessage,
  WorkflowPlanListEntry,
  WorkflowPlanListRequestMessage,
} from '@neko-agent/types';
import { Workflow } from '@neko/platform';
import { postDiff, postList, toWireDiff, toWirePlanListEntry } from './plan-wire';

export interface PlanQueryControllerDeps {
  planStore: Workflow.PlanStore | undefined;
  getWebview: () => vscode.Webview | undefined;
}

export class PlanQueryController {
  constructor(private readonly deps: PlanQueryControllerDeps) {}

  /**
   * Load a previously persisted plan from disk. Returns undefined when no
   * store is configured or the id is unknown.
   */
  async loadPersistedPlan(planId: string): Promise<Workflow.PersistentPlan | undefined> {
    if (!this.deps.planStore) return undefined;
    return this.deps.planStore.load(planId);
  }

  /**
   * Compute a diff between two persisted plans and post the result back to
   * the webview.  If `againstPlanId` is omitted, uses the plan's
   * `parentPlanId`.
   */
  async handleDiffRequest(
    msg: WorkflowPlanDiffRequestMessage,
  ): Promise<Workflow.PlanDiff | undefined> {
    if (!this.deps.planStore) {
      postDiff(this.deps.getWebview, {
        planId: msg.planId,
        againstPlanId: msg.againstPlanId,
        diff: undefined,
        errorMessage: 'No PlanStore configured',
      });
      return undefined;
    }
    const right = await this.deps.planStore.load(msg.planId);
    if (!right) {
      postDiff(this.deps.getWebview, {
        planId: msg.planId,
        againstPlanId: msg.againstPlanId,
        diff: undefined,
        errorMessage: `Plan not found: ${msg.planId}`,
      });
      return undefined;
    }
    const leftId = msg.againstPlanId ?? right.parentPlanId;
    if (!leftId) {
      postDiff(this.deps.getWebview, {
        planId: msg.planId,
        againstPlanId: msg.againstPlanId,
        diff: undefined,
        errorMessage: 'No plan to compare against (no parentPlanId and no againstPlanId given)',
      });
      return undefined;
    }
    const left = await this.deps.planStore.load(leftId);
    if (!left) {
      postDiff(this.deps.getWebview, {
        planId: msg.planId,
        againstPlanId: msg.againstPlanId,
        diff: undefined,
        errorMessage: `Plan not found: ${leftId}`,
      });
      return undefined;
    }
    const diff = Workflow.diffPlans(left, right);
    postDiff(this.deps.getWebview, {
      planId: msg.planId,
      againstPlanId: leftId,
      diff: toWireDiff(diff),
    });
    return diff;
  }

  /**
   * List persisted plans for the webview's plan-browser UI.  Posts a
   * `workflow/planList` response with the same filter fields echoed
   * back.  Returns the wire list for test assertions.
   */
  async handleListRequest(
    msg: WorkflowPlanListRequestMessage,
  ): Promise<WorkflowPlanListEntry[] | undefined> {
    if (!this.deps.planStore) {
      postList(this.deps.getWebview, {
        entries: [],
        ...(msg.status !== undefined && { status: msg.status }),
        ...(msg.parentPlanId !== undefined && { parentPlanId: msg.parentPlanId }),
        ...(msg.limit !== undefined && { limit: msg.limit }),
        errorMessage: 'No PlanStore configured',
      });
      return undefined;
    }
    try {
      const entries = await this.deps.planStore.listPlans({
        ...(msg.status !== undefined && { status: msg.status }),
        ...(msg.parentPlanId !== undefined && { parentPlanId: msg.parentPlanId }),
        ...(msg.limit !== undefined && { limit: msg.limit }),
      });
      const wire = entries.map(toWirePlanListEntry);
      postList(this.deps.getWebview, {
        entries: wire,
        ...(msg.status !== undefined && { status: msg.status }),
        ...(msg.parentPlanId !== undefined && { parentPlanId: msg.parentPlanId }),
        ...(msg.limit !== undefined && { limit: msg.limit }),
      });
      return wire;
    } catch (err) {
      postList(this.deps.getWebview, {
        entries: [],
        ...(msg.status !== undefined && { status: msg.status }),
        ...(msg.parentPlanId !== undefined && { parentPlanId: msg.parentPlanId }),
        ...(msg.limit !== undefined && { limit: msg.limit }),
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      return undefined;
    }
  }
}
