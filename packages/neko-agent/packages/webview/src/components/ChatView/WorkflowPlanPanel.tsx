/**
 * WorkflowPlanPanel — thin container that mounts the WorkflowPlanCard
 * whenever a workflow/planPreview is active.
 *
 * Mounts near the chat input so the user sees it as an inline card in the
 * current conversation flow. Hidden when no plan is active.
 */

import { memo } from 'react';
import { useWorkflowPlan } from '@/hooks/useWorkflowPlan';
import { WorkflowPlanCard } from './WorkflowPlanCard';
import { PlanDiffView } from './PlanDiffView';
import { PipelineGatePanel } from './PipelineGatePanel';
import { RouterAskModal } from './RouterAskModal';
import { PlanBrowser } from './PlanBrowser';
import { RouterMemoryView } from './RouterMemoryView';

export const WorkflowPlanPanel = memo(function WorkflowPlanPanel() {
  const {
    plan,
    status,
    errorMessage,
    diff,
    diffError,
    pendingGate,
    pendingAsk,
    browser,
    routerMemory,
    dismiss,
    dismissDiff,
    clearPendingGate,
    clearPendingAsk,
    closeBrowser,
    openRouterMemory,
    closeRouterMemory,
  } = useWorkflowPlan();

  // The router's ask_user fires during route decision, before any plan
  // exists.  Render the modal standalone in that case.
  if (!plan && pendingAsk) {
    return (
      <div className="px-2 pt-1">
        <RouterAskModal
          askId={pendingAsk.askId}
          question={pendingAsk.question}
          {...(pendingAsk.options !== undefined && { options: pendingAsk.options })}
          {...(pendingAsk.timeoutMs !== undefined && { timeoutMs: pendingAsk.timeoutMs })}
          onResolved={clearPendingAsk}
        />
      </div>
    );
  }

  // Router-memory inspector can be opened when no plan is active — useful for
  // auditing past decisions between sessions.
  if (!plan && routerMemory.open) {
    return (
      <div className="px-2 pt-1">
        <RouterMemoryView
          entries={routerMemory.entries}
          total={routerMemory.total}
          errorMessage={routerMemory.errorMessage}
          loaded={routerMemory.loaded}
          onClose={closeRouterMemory}
        />
      </div>
    );
  }

  if (!plan) return null;

  const readOnly = status !== 'pending';
  const terminal = status === 'completed' || status === 'aborted' || status === 'failed';
  const statusLabel = mapStatusLabel(status);

  return (
    <div className="px-2 pt-1">
      <WorkflowPlanCard
        plan={plan}
        readOnly={readOnly}
        terminal={terminal}
        {...(statusLabel !== undefined && { statusLabel })}
      />
      {pendingGate && (
        <PipelineGatePanel
          pipelineId={pendingGate.pipelineId}
          preview={pendingGate.preview}
          onResolved={clearPendingGate}
        />
      )}
      {pendingAsk && (
        <RouterAskModal
          askId={pendingAsk.askId}
          question={pendingAsk.question}
          {...(pendingAsk.options !== undefined && { options: pendingAsk.options })}
          {...(pendingAsk.timeoutMs !== undefined && { timeoutMs: pendingAsk.timeoutMs })}
          onResolved={clearPendingAsk}
        />
      )}
      {errorMessage && (
        <div
          className="mt-1 rounded border border-[var(--agent-danger)] bg-[var(--agent-bg-secondary)] p-2 text-[11px] text-[var(--agent-danger)]"
          role="alert"
        >
          {errorMessage}
        </div>
      )}
      {browser.open && (
        <PlanBrowser
          entries={browser.entries}
          filterStatus={browser.filterStatus}
          filterParentPlanId={browser.filterParentPlanId}
          errorMessage={browser.errorMessage}
          onClose={closeBrowser}
        />
      )}
      {routerMemory.open && (
        <RouterMemoryView
          entries={routerMemory.entries}
          total={routerMemory.total}
          errorMessage={routerMemory.errorMessage}
          loaded={routerMemory.loaded}
          onClose={closeRouterMemory}
        />
      )}
      {(diff !== undefined || diffError !== undefined) && (
        <PlanDiffView
          diff={
            diff ?? {
              leftId: '',
              rightId: '',
              route: [],
              stages: [],
              shots: [],
              constraints: [],
              unchanged: true,
            }
          }
          {...(diffError !== undefined && { errorMessage: diffError })}
          onDismiss={dismissDiff}
        />
      )}
      {terminal && (
        <div className="mt-1 flex justify-end gap-1.5">
          <button
            className="vscode-button-secondary px-2 py-0.5 text-[11px]"
            onClick={openRouterMemory}
            title="Review what the router has learned about your inputs"
          >
            Router history
          </button>
          <button className="vscode-button-secondary px-2 py-0.5 text-[11px]" onClick={dismiss}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
});

function mapStatusLabel(
  status: 'pending' | 'dispatched' | 'executing' | 'completed' | 'aborted' | 'failed',
): string | undefined {
  switch (status) {
    case 'pending':
      return undefined;
    case 'dispatched':
      return 'Dispatched';
    case 'executing':
      return 'Executing…';
    case 'completed':
      return 'Completed';
    case 'aborted':
      return 'Aborted';
    case 'failed':
      return 'Failed';
  }
}
