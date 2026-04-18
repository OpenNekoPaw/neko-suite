/**
 * WorkflowPlanCard — renders a Router/Plan-layer LitePlan for user review.
 *
 * Distinct from PlanReview (which handles the agent's step-review flow).
 * This card shows: route level + reason + stage list + (optionally) a shot
 * × asset-type matrix. Three actions: Start / Override / Abort.
 *
 * See docs/architecture/plan-mode.md §7.
 */

import { memo, useCallback, useState } from 'react';
import type { WorkflowLitePlan, WorkflowRouteLevel } from '@neko-agent/types';
import { vscode } from '@/messages';
import { PlanMatrix } from './PlanMatrix';

interface WorkflowPlanCardProps {
  plan: WorkflowLitePlan;
  /** When true, the card reflects a dispatched/completed state */
  readOnly?: boolean;
  /** Status override (shown in header badge) */
  statusLabel?: string;
}

// =============================================================================
// Constants
// =============================================================================

const LEVEL_META: Record<
  WorkflowRouteLevel,
  { label: string; description: string; color: string }
> = {
  L0: {
    label: 'L0',
    description: 'Direct single-shot',
    color: 'var(--vscode-charts-blue)',
  },
  L1: {
    label: 'L1',
    description: 'Batch storyboard',
    color: 'var(--vscode-charts-green)',
  },
  L2: {
    label: 'L2',
    description: 'Scripted pipeline',
    color: 'var(--vscode-charts-yellow)',
  },
  L3: {
    label: 'L3',
    description: 'Full novel pipeline',
    color: 'var(--vscode-charts-orange)',
  },
  L4: {
    label: 'L4',
    description: 'Visual-first (comic/3D)',
    color: 'var(--vscode-charts-purple)',
  },
};

const ALL_LEVELS: WorkflowRouteLevel[] = ['L0', 'L1', 'L2', 'L3', 'L4'];

// =============================================================================
// Component
// =============================================================================

export const WorkflowPlanCard = memo(function WorkflowPlanCard({
  plan,
  readOnly = false,
  statusLabel,
}: WorkflowPlanCardProps) {
  const [isOverriding, setIsOverriding] = useState(false);

  const handleApprove = useCallback(() => {
    vscode?.postMessage({ type: 'workflow/planApprove', planId: plan.id });
  }, [plan.id]);

  const handleAbort = useCallback(() => {
    vscode?.postMessage({ type: 'workflow/planAbort', planId: plan.id });
  }, [plan.id]);

  const handleOverride = useCallback(
    (level: WorkflowRouteLevel) => {
      vscode?.postMessage({
        type: 'workflow/planOverride',
        planId: plan.id,
        forceLevel: level,
      });
      setIsOverriding(false);
    },
    [plan.id],
  );

  const meta = LEVEL_META[plan.route.level];
  const effectiveStages = plan.stages.filter((s) => !s.skipped);
  const skippedStages = plan.stages.filter((s) => s.skipped);

  return (
    <div
      className="my-2 rounded-md border border-[var(--agent-divider)] bg-[var(--agent-bg-secondary)] p-3"
      data-testid="workflow-plan-card"
      data-plan-id={plan.id}
    >
      {/* Header */}
      <div className="mb-2 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-6 min-w-[28px] items-center justify-center rounded px-1.5 text-[11px] font-semibold text-white"
            style={{ backgroundColor: meta.color }}
          >
            {meta.label}
          </span>
          <div>
            <div className="text-[13px] font-semibold">{meta.description}</div>
            <div className="text-[11px] text-[var(--agent-fg-secondary)]">
              flowId: {plan.route.flowId} · confidence {(plan.route.confidence * 100).toFixed(0)}%
            </div>
          </div>
        </div>
        {statusLabel && (
          <span className="rounded bg-[var(--vscode-badge-background)] px-2 py-0.5 text-[10px] text-[var(--vscode-badge-foreground)]">
            {statusLabel}
          </span>
        )}
      </div>

      {/* Reason */}
      <div className="mb-2 text-[12px] text-[var(--agent-fg-primary)]">
        <span className="text-[var(--agent-fg-secondary)]">Reason: </span>
        {plan.route.reason}
      </div>

      {/* Notes */}
      {plan.notes && plan.notes.length > 0 && (
        <ul className="mb-2 list-inside list-disc text-[11px] text-[var(--agent-fg-secondary)]">
          {plan.notes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      )}

      {/* Stages */}
      <div className="mb-3">
        <div className="mb-1 text-[11px] font-semibold text-[var(--agent-fg-secondary)]">
          Stages ({effectiveStages.length}
          {skippedStages.length > 0 ? ` / ${plan.stages.length}` : ''})
        </div>
        <ol className="space-y-0.5 text-[12px]">
          {plan.stages.map((stage, i) => (
            <li
              key={stage.id}
              className={`flex items-center gap-2 ${stage.skipped ? 'opacity-40 line-through' : ''}`}
            >
              <span className="w-4 text-right text-[var(--agent-fg-secondary)]">{i + 1}.</span>
              <span className="flex-1">{stage.label}</span>
              {stage.estimate && <StageEstimate estimate={stage.estimate} />}
            </li>
          ))}
        </ol>
      </div>

      {/* Shot × binding matrix */}
      {plan.shots && plan.shots.length > 0 && (
        <div className="mb-3">
          <PlanMatrix planId={plan.id} shots={plan.shots} readOnly={readOnly} />
        </div>
      )}

      {/* Consistency violations (Phase 2 ConsistencyChecker) */}
      {plan.violations && plan.violations.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 text-[11px] font-semibold text-[var(--agent-fg-secondary)]">
            Consistency ({plan.violations.length})
          </div>
          <ul className="space-y-1 text-[11px]">
            {plan.violations.map((v) => (
              <li
                key={v.id}
                className={`rounded px-2 py-1 ${
                  v.severity === 'error'
                    ? 'bg-[var(--agent-danger-bg, rgba(230,70,70,0.12))] text-[var(--agent-danger)]'
                    : v.severity === 'warning'
                      ? 'bg-[var(--agent-warning-bg, rgba(230,180,40,0.12))] text-[var(--agent-warning-fg)]'
                      : 'text-[var(--agent-fg-secondary)]'
                }`}
              >
                <div className="font-medium">
                  {v.severity === 'error' ? '❌' : v.severity === 'warning' ? '⚠️' : 'ℹ️'}{' '}
                  {v.message}
                </div>
                <div className="mt-0.5 text-[10px] opacity-80">
                  {v.kind} · shots {v.shotIds.join(', ')} · entity {v.entity}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--agent-divider)] pt-2">
          <button className="vscode-button-primary px-3 py-1 text-[12px]" onClick={handleApprove}>
            Start
          </button>

          <div className="relative">
            <button
              className="vscode-button-secondary px-3 py-1 text-[12px]"
              onClick={() => setIsOverriding((v) => !v)}
            >
              Override ▾
            </button>
            {isOverriding && (
              <div className="absolute z-10 mt-1 flex flex-col rounded border border-[var(--agent-divider)] bg-[var(--vscode-editor-background)] p-1 shadow">
                {ALL_LEVELS.filter((l) => l !== plan.route.level).map((level) => {
                  const m = LEVEL_META[level];
                  return (
                    <button
                      key={level}
                      className="whitespace-nowrap rounded px-2 py-1 text-left text-[12px] hover:bg-[var(--vscode-list-hoverBackground)]"
                      onClick={() => handleOverride(level)}
                    >
                      <span className="mr-2 font-semibold" style={{ color: m.color }}>
                        {m.label}
                      </span>
                      {m.description}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button className="vscode-button-secondary px-3 py-1 text-[12px]" onClick={handleAbort}>
            Abort
          </button>
        </div>
      )}
    </div>
  );
});

// =============================================================================
// Sub-components
// =============================================================================

function StageEstimate({
  estimate,
}: {
  estimate: NonNullable<WorkflowLitePlan['stages'][number]['estimate']>;
}) {
  const parts: string[] = [];
  if (estimate.tokens !== undefined) parts.push(`${estimate.tokens}t`);
  if (estimate.credits !== undefined) parts.push(`${estimate.credits}c`);
  if (estimate.durationSec !== undefined) parts.push(`${estimate.durationSec}s`);
  if (parts.length === 0) return null;
  return <span className="text-[10px] text-[var(--agent-fg-secondary)]">{parts.join(' · ')}</span>;
}
