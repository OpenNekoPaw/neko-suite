/**
 * Plan Wire — outgoing webview messages.
 *
 * Each helper is a no-op when no webview is attached (handler
 * pre-activation / disposed webview) so callers never have to null-check.
 */

import type * as vscode from 'vscode';
import type {
  WorkflowPlanCapabilities,
  WorkflowPlanDiffMessage,
  WorkflowPlanListMessage,
  WorkflowRouterMemoryMessage,
} from '@neko-agent/types';
import { Workflow } from '@neko/platform';
import { toWirePlan } from './converters';

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
