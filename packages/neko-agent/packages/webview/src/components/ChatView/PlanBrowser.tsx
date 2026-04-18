/**
 * PlanBrowser — lists persisted plans with Fork / Diff actions per row.
 *
 * Populated by `workflow/planList` responses.  Each row shows the plan id,
 * route level, status, shot count, and recency.  Selecting "Fork" sends a
 * `workflow/planFork` message; selecting "Diff" queues a
 * `workflow/planDiffRequest` against the parent (or against whichever plan
 * the user has selected as left-hand side).
 *
 * Intended as an inline drawer under the WorkflowPlanCard actions.  Not a
 * modal — we want the active plan + diff view to remain visible behind it.
 *
 * See docs/architecture/plan-mode.md §8 (Plan iteration and forks).
 */

import { memo, useCallback, useEffect, useState } from 'react';
import type { WorkflowPlanListEntry } from '@neko-agent/types';
import { vscode } from '@/messages';

interface PlanBrowserProps {
  entries: readonly WorkflowPlanListEntry[];
  filterStatus: WorkflowPlanListEntry['status'] | undefined;
  filterParentPlanId: string | undefined;
  errorMessage: string | undefined;
  /** Close the browser drawer */
  onClose: () => void;
}

type StatusFilter = 'all' | WorkflowPlanListEntry['status'];

const STATUS_OPTIONS: readonly StatusFilter[] = [
  'all',
  'pending',
  'approved',
  'executing',
  'completed',
  'aborted',
  'failed',
];

export const PlanBrowser = memo(function PlanBrowser({
  entries,
  filterStatus,
  filterParentPlanId,
  errorMessage,
  onClose,
}: PlanBrowserProps) {
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>(filterStatus ?? 'all');

  const requestList = useCallback(
    (status: StatusFilter) => {
      vscode?.postMessage({
        type: 'workflow/planListRequest',
        ...(status !== 'all' && { status }),
        ...(filterParentPlanId !== undefined && { parentPlanId: filterParentPlanId }),
        limit: 50,
      });
    },
    [filterParentPlanId],
  );

  // Initial fetch on mount.  Follow-up fetches happen through the
  // setSelectedStatus handler.
  useEffect(() => {
    requestList(selectedStatus);
    // Run once per mount — subsequent fetches are user-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStatusChange = (status: StatusFilter): void => {
    setSelectedStatus(status);
    requestList(status);
  };

  return (
    <div
      className="my-2 rounded-md border border-[var(--agent-divider)] bg-[var(--agent-bg-secondary)] p-3"
      role="region"
      aria-label="Plan browser"
      data-testid="plan-browser"
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[13px] font-semibold">
          Plans{' '}
          <span className="text-[11px] font-normal text-[var(--agent-fg-secondary)]">
            ({entries.length})
          </span>
          {filterParentPlanId && (
            <span className="ml-2 text-[10px] text-[var(--agent-fg-secondary)]">
              forks of <code className="opacity-80">{filterParentPlanId}</code>
            </span>
          )}
        </div>
        <button
          type="button"
          className="rounded px-2 py-0.5 text-[10px] text-[var(--agent-fg-secondary)] hover:bg-[var(--vscode-list-hoverBackground)]"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`rounded px-2 py-0.5 text-[10px] ${
              selectedStatus === opt
                ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
                : 'bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] hover:opacity-80'
            }`}
            onClick={() => handleStatusChange(opt)}
          >
            {opt}
          </button>
        ))}
      </div>

      {errorMessage && (
        <div
          className="mb-2 rounded border border-[var(--agent-danger)] p-1.5 text-[11px] text-[var(--agent-danger)]"
          role="alert"
        >
          {errorMessage}
        </div>
      )}

      {entries.length === 0 && !errorMessage && (
        <div className="text-[11px] italic text-[var(--agent-fg-secondary)]">
          No plans match this filter.
        </div>
      )}

      <ul className="space-y-1">
        {entries.map((entry) => (
          <PlanRow key={entry.id} entry={entry} />
        ))}
      </ul>
    </div>
  );
});

// =============================================================================
// Row
// =============================================================================

function PlanRow({ entry }: { entry: WorkflowPlanListEntry }) {
  const handleFork = (): void => {
    vscode?.postMessage({ type: 'workflow/planFork', planId: entry.id });
  };
  const handleDiff = (): void => {
    vscode?.postMessage({ type: 'workflow/planDiffRequest', planId: entry.id });
  };

  const relative = formatRelative(entry.updatedAt);
  const statusColor = STATUS_COLORS[entry.status];

  return (
    <li className="flex items-center gap-2 rounded border border-transparent px-1 py-1 text-[11px] hover:border-[var(--agent-divider)]">
      <span
        className="inline-block h-4 w-8 shrink-0 rounded text-center text-[9px] font-semibold leading-4 text-white"
        style={{ backgroundColor: entry.routeLevel ? levelColor(entry.routeLevel) : 'grey' }}
      >
        {entry.routeLevel}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 truncate">
          <code className="truncate opacity-80">{entry.id}</code>
          <span className={`text-[9px] ${statusColor}`}>· {entry.status}</span>
          {entry.parentPlanId && (
            <span className="text-[9px] text-[var(--agent-fg-secondary)]">
              · fork of {entry.parentPlanId}
            </span>
          )}
        </div>
        <div className="truncate text-[10px] text-[var(--agent-fg-secondary)]">
          {entry.shotCount} shot{entry.shotCount === 1 ? '' : 's'} · {relative} · {entry.reason}
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          className="vscode-button-secondary px-1.5 py-0.5 text-[10px]"
          onClick={handleFork}
          title="Create a new pending plan from this one"
        >
          Fork
        </button>
        {entry.parentPlanId && (
          <button
            type="button"
            className="vscode-button-secondary px-1.5 py-0.5 text-[10px]"
            onClick={handleDiff}
            title={`Compare against parent ${entry.parentPlanId}`}
          >
            Diff
          </button>
        )}
      </div>
    </li>
  );
}

// =============================================================================
// Helpers
// =============================================================================

const STATUS_COLORS: Record<WorkflowPlanListEntry['status'], string> = {
  pending: 'text-[var(--vscode-charts-yellow)]',
  approved: 'text-[var(--vscode-charts-blue)]',
  executing: 'text-[var(--vscode-charts-blue)]',
  paused: 'text-[var(--vscode-charts-orange)]',
  edited: 'text-[var(--vscode-charts-purple)]',
  completed: 'text-[var(--vscode-charts-green)]',
  aborted: 'text-[var(--agent-fg-secondary)]',
  failed: 'text-[var(--agent-danger)]',
};

function levelColor(level: string): string {
  switch (level) {
    case 'L0':
      return 'var(--vscode-charts-blue)';
    case 'L1':
      return 'var(--vscode-charts-green)';
    case 'L2':
      return 'var(--vscode-charts-yellow)';
    case 'L3':
      return 'var(--vscode-charts-orange)';
    case 'L4':
      return 'var(--vscode-charts-purple)';
    default:
      return 'gray';
  }
}

function formatRelative(ts: number): string {
  const diffMs = Date.now() - ts;
  if (diffMs < 0) return 'just now';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}
