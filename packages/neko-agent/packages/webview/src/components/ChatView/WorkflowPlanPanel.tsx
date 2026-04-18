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

export const WorkflowPlanPanel = memo(function WorkflowPlanPanel() {
  const { plan, status, errorMessage, diff, diffError, dismiss, dismissDiff } = useWorkflowPlan();

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
      {errorMessage && (
        <div
          className="mt-1 rounded border border-[var(--agent-danger)] bg-[var(--agent-bg-secondary)] p-2 text-[11px] text-[var(--agent-danger)]"
          role="alert"
        >
          {errorMessage}
        </div>
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
        <div className="mt-1 flex justify-end">
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
