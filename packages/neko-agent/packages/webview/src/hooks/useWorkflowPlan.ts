/**
 * useWorkflowPlan — subscribe to workflow/* messages from the extension host.
 *
 * Phase 1.5 MVP: single current plan + status. Multi-plan fork view is
 * Phase 2.
 *
 * See docs/architecture/plan-mode.md §7.
 */

import { useEffect, useState } from 'react';
import type {
  PipelineGatePreview,
  WorkflowIncomingMessage,
  WorkflowLitePlan,
  WorkflowPlanDiffPayload,
  WorkflowPlanListEntry,
  WorkflowRouterMemoryEntry,
} from '@neko-agent/types';

export type WorkflowPlanStatus =
  | 'pending'
  | 'dispatched'
  | 'executing'
  | 'completed'
  | 'aborted'
  | 'failed';

export interface PendingGate {
  pipelineId: string;
  preview: PipelineGatePreview;
}

export interface PendingRouterAsk {
  askId: string;
  question: string;
  options: readonly string[] | undefined;
  timeoutMs: number | undefined;
}

export interface PlanBrowserState {
  entries: readonly WorkflowPlanListEntry[];
  /** Echo of the request's filter so the UI can label the result. */
  filterStatus: WorkflowPlanListEntry['status'] | undefined;
  filterParentPlanId: string | undefined;
  errorMessage: string | undefined;
  /** When true the browser is open; a `planList` response refreshes entries. */
  open: boolean;
}

export interface RouterMemoryState {
  entries: readonly WorkflowRouterMemoryEntry[];
  total: number;
  errorMessage: string | undefined;
  /** True once a response has landed — lets the UI distinguish "not loaded" from "empty". */
  loaded: boolean;
  /** Drawer visibility. */
  open: boolean;
}

export interface WorkflowPlanState {
  /** Plan currently being previewed or executed. Undefined when no plan is active. */
  plan: WorkflowLitePlan | undefined;
  status: WorkflowPlanStatus;
  /** Pipeline handle id set after dispatch */
  pipelineId: string | undefined;
  /** Last error message, if the plan execution failed */
  errorMessage: string | undefined;
  /** Latest diff payload returned by handleDiffRequest */
  diff: WorkflowPlanDiffPayload | undefined;
  /** Error text if the most recent diff request failed */
  diffError: string | undefined;
  /** Currently paused pipeline gate awaiting user resume / cancel */
  pendingGate: PendingGate | undefined;
  /** Outstanding routerAsk awaiting user response */
  pendingAsk: PendingRouterAsk | undefined;
  /** Persistent plan browser (list of fork candidates etc.) */
  browser: PlanBrowserState;
  /** Router memory inspector (recent routing decisions). */
  routerMemory: RouterMemoryState;
}

const INITIAL_BROWSER: PlanBrowserState = {
  entries: [],
  filterStatus: undefined,
  filterParentPlanId: undefined,
  errorMessage: undefined,
  open: false,
};

const INITIAL_ROUTER_MEMORY: RouterMemoryState = {
  entries: [],
  total: 0,
  errorMessage: undefined,
  loaded: false,
  open: false,
};

const INITIAL: WorkflowPlanState = {
  plan: undefined,
  status: 'pending',
  pipelineId: undefined,
  errorMessage: undefined,
  diff: undefined,
  diffError: undefined,
  pendingGate: undefined,
  pendingAsk: undefined,
  browser: INITIAL_BROWSER,
  routerMemory: INITIAL_ROUTER_MEMORY,
};

export function useWorkflowPlan(): WorkflowPlanState & {
  dismiss: () => void;
  dismissDiff: () => void;
  clearPendingGate: () => void;
  clearPendingAsk: () => void;
  openBrowser: () => void;
  closeBrowser: () => void;
  openRouterMemory: () => void;
  closeRouterMemory: () => void;
} {
  const [state, setState] = useState<WorkflowPlanState>(INITIAL);

  useEffect(() => {
    const handler = (event: MessageEvent<unknown>) => {
      const msg = event.data as WorkflowIncomingMessage | undefined;
      if (!msg || typeof msg !== 'object' || !('type' in msg)) return;

      switch (msg.type) {
        case 'workflow/planPreview':
          // Preserve pendingAsk — the ask fired during route decision and
          // stays relevant even after the plan arrives.  Browser state is
          // also preserved so the browser isn't closed by a preview arrival.
          setState((prev) => ({
            plan: msg.plan,
            status: 'pending',
            pipelineId: undefined,
            errorMessage: undefined,
            diff: undefined,
            diffError: undefined,
            pendingGate: undefined,
            pendingAsk: prev.pendingAsk,
            browser: prev.browser,
            routerMemory: prev.routerMemory,
          }));
          break;
        case 'workflow/planDispatched':
          setState((prev) =>
            prev.plan && prev.plan.id === msg.planId
              ? { ...prev, status: 'dispatched', pipelineId: msg.pipelineId }
              : prev,
          );
          break;
        case 'workflow/planStatus':
          setState((prev) => {
            if (!prev.plan || prev.plan.id !== msg.planId) return prev;
            return {
              ...prev,
              status: mapStatus(msg.status),
              errorMessage: msg.errorMessage,
            };
          });
          break;
        case 'workflow/planUpdated':
          // Replace the plan wholesale — the extension has just
          // applied a user edit and re-run the consistency checker.
          setState((prev) =>
            prev.plan && prev.plan.id === msg.plan.id ? { ...prev, plan: msg.plan } : prev,
          );
          break;
        case 'workflow/planDiff':
          setState((prev) => ({
            ...prev,
            diff: msg.diff,
            diffError: msg.errorMessage,
          }));
          break;
        case 'pipelineGateWaiting':
          // Match only when the gate belongs to the currently-tracked
          // pipeline — avoids hijacking a gate fired by the agent tool
          // StartPipeline flow, which has its own UI path.
          setState((prev) => {
            if (!prev.pipelineId || prev.pipelineId !== msg.pipelineId) return prev;
            return {
              ...prev,
              pendingGate: { pipelineId: msg.pipelineId, preview: msg.data },
            };
          });
          break;
        case 'workflow/routerAsk':
          setState((prev) => ({
            ...prev,
            pendingAsk: {
              askId: msg.askId,
              question: msg.question,
              options: msg.options,
              timeoutMs: msg.timeoutMs,
            },
          }));
          break;
        case 'workflow/planList':
          setState((prev) => ({
            ...prev,
            browser: {
              entries: msg.entries,
              filterStatus: msg.status,
              filterParentPlanId: msg.parentPlanId,
              errorMessage: msg.errorMessage,
              // Open the panel on any response even if the user hadn't
              // opened it — this lets "Browse plans" trigger the initial
              // request without a separate open-state flag.
              open: true,
            },
          }));
          break;
        case 'workflow/routerMemory':
          setState((prev) => ({
            ...prev,
            routerMemory: {
              entries: msg.entries,
              total: msg.total,
              errorMessage: msg.errorMessage,
              loaded: true,
              open: true,
            },
          }));
          break;
        default:
          break;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return {
    ...state,
    dismiss: () => setState(INITIAL),
    dismissDiff: () => setState((prev) => ({ ...prev, diff: undefined, diffError: undefined })),
    clearPendingGate: () => setState((prev) => ({ ...prev, pendingGate: undefined })),
    clearPendingAsk: () => setState((prev) => ({ ...prev, pendingAsk: undefined })),
    openBrowser: () =>
      setState((prev) => ({
        ...prev,
        browser: { ...prev.browser, open: true, errorMessage: undefined },
      })),
    closeBrowser: () => setState((prev) => ({ ...prev, browser: INITIAL_BROWSER })),
    openRouterMemory: () =>
      setState((prev) => ({
        ...prev,
        routerMemory: { ...prev.routerMemory, open: true },
      })),
    closeRouterMemory: () =>
      setState((prev) => ({
        ...prev,
        routerMemory: INITIAL_ROUTER_MEMORY,
      })),
  };
}

function mapStatus(
  s: 'approved' | 'executing' | 'completed' | 'aborted' | 'failed',
): WorkflowPlanStatus {
  switch (s) {
    case 'approved':
    case 'executing':
      return 'executing';
    case 'completed':
      return 'completed';
    case 'aborted':
      return 'aborted';
    case 'failed':
      return 'failed';
  }
}
