/**
 * PlanDiffView — renders a `workflow/planDiff` payload as a compact summary.
 *
 * Shown as a collapsible block under the WorkflowPlanCard when the user has
 * forked or requested a diff. See docs/architecture/plan-mode.md §8.
 */

import { memo } from 'react';
import type { WorkflowPlanDiffPayload } from '@neko-agent/types';

interface PlanDiffViewProps {
  diff: WorkflowPlanDiffPayload;
  errorMessage?: string;
  onDismiss?: () => void;
}

export const PlanDiffView = memo(function PlanDiffView({
  diff,
  errorMessage,
  onDismiss,
}: PlanDiffViewProps) {
  if (errorMessage) {
    return (
      <div
        className="mt-2 rounded border border-[var(--agent-danger)] bg-[var(--agent-bg-secondary)] p-2 text-[11px] text-[var(--agent-danger)]"
        role="alert"
      >
        {errorMessage}
      </div>
    );
  }

  if (diff.unchanged) {
    return (
      <div className="mt-2 rounded border border-[var(--agent-divider)] bg-[var(--agent-bg-secondary)] p-2 text-[11px] text-[var(--agent-fg-secondary)]">
        No differences between plans.
        {onDismiss && (
          <button
            className="ml-2 text-[10px] underline hover:opacity-80"
            onClick={onDismiss}
            type="button"
          >
            Close
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2 rounded border border-[var(--agent-divider)] bg-[var(--agent-bg-secondary)] p-2 text-[11px]">
      <div className="mb-1 flex items-center justify-between">
        <div className="font-semibold">
          Diff: <code className="opacity-70">{diff.leftId}</code> →{' '}
          <code className="opacity-70">{diff.rightId}</code>
        </div>
        {onDismiss && (
          <button
            className="rounded px-2 py-0.5 text-[10px] text-[var(--agent-fg-secondary)] hover:bg-[var(--vscode-list-hoverBackground)]"
            onClick={onDismiss}
            type="button"
          >
            ✕
          </button>
        )}
      </div>

      {diff.route.length > 0 && (
        <Section title={`Route (${diff.route.length})`}>
          {diff.route.map((r, i) => (
            <div key={`route-${i}`} className="truncate">
              <span className="text-[var(--agent-fg-secondary)]">{r.kind}:</span>{' '}
              <code className="opacity-80">{formatValue(r.from)}</code>
              <span className="mx-1 text-[var(--agent-fg-secondary)]">→</span>
              <code className="opacity-80">{formatValue(r.to)}</code>
            </div>
          ))}
        </Section>
      )}

      {diff.stages.length > 0 && (
        <Section title={`Stages (${diff.stages.length})`}>
          {diff.stages.map((s, i) => (
            <div key={`stage-${i}`} className="truncate">
              {stageIcon(s.kind)} <code className="opacity-80">{s.stageId}</code>
              <span className="ml-1 text-[var(--agent-fg-secondary)]">
                {stageLabel(s.kind, s.value)}
              </span>
            </div>
          ))}
        </Section>
      )}

      {diff.shots.length > 0 && (
        <Section title={`Shots (${diff.shots.length})`}>
          {diff.shots.map((s, i) => (
            <div key={`shot-${i}`} className="truncate">
              {shotIcon(s.kind)} <code className="opacity-80">{s.shotId}</code>
              {s.slot && <span className="ml-1 text-[var(--agent-fg-secondary)]">· {s.slot}</span>}
              {s.fromAssetId && s.toAssetId && (
                <>
                  <span className="ml-1 opacity-80">{s.fromAssetId}</span>
                  <span className="mx-1 text-[var(--agent-fg-secondary)]">→</span>
                  <span className="opacity-80">{s.toAssetId}</span>
                </>
              )}
              <span className="ml-1 text-[var(--agent-fg-secondary)]">
                {shotLabel(s.kind, s.value)}
              </span>
            </div>
          ))}
        </Section>
      )}

      {diff.constraints.length > 0 && (
        <Section title={`Constraints (${diff.constraints.length})`}>
          {diff.constraints.map((c, i) => (
            <div key={`c-${i}`} className="truncate">
              {c.kind === 'added' ? '➕' : '➖'}{' '}
              <code className="opacity-80">{c.constraintKind}</code>
              <span className="ml-1 opacity-60">{c.constraintId}</span>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
});

// =============================================================================
// Helpers
// =============================================================================

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-1">
      <div className="text-[10px] font-semibold uppercase text-[var(--agent-fg-secondary)]">
        {title}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function formatValue(v: string | string[]): string {
  return Array.isArray(v) ? `[${v.join(', ')}]` : v;
}

function stageIcon(kind: string): string {
  switch (kind) {
    case 'added':
      return '➕';
    case 'removed':
      return '➖';
    case 'skippedToggled':
      return '⤳';
    case 'checkpointToggled':
      return '🛑';
    default:
      return '·';
  }
}

function stageLabel(kind: string, value?: boolean): string {
  if (kind === 'skippedToggled') return value ? 'skipped' : 'unskipped';
  if (kind === 'checkpointToggled') return value ? 'checkpoint on' : 'checkpoint off';
  return '';
}

function shotIcon(kind: string): string {
  switch (kind) {
    case 'primarySwapped':
      return '🔁';
    case 'unmatchedChanged':
      return '❓';
    case 'confirmedToggled':
      return '✅';
    case 'shotAdded':
      return '➕';
    case 'shotRemoved':
      return '➖';
    default:
      return '·';
  }
}

function shotLabel(kind: string, value?: boolean): string {
  if (kind === 'unmatchedChanged') return '(unmatched changed)';
  if (kind === 'confirmedToggled') return value ? '(confirmed)' : '(un-confirmed)';
  return '';
}
