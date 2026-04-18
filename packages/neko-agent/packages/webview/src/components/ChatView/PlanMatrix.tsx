/**
 * PlanMatrix — read-only shot × asset-type binding matrix.
 *
 * Renders each shot as a row and each binding slot (character/scene/action/...)
 * as a column, colour-coded by confidence:
 *   ✅ green  — confidence ≥ 0.9
 *   ⚠️ yellow — 0.6 ≤ confidence < 0.9
 *   ❓ red    — below 0.6 or unmatched
 *
 * Interactivity is deferred to Phase 2 (drag-drop override, "apply to all").
 *
 * See docs/architecture/plan-mode.md §7 and
 * docs/architecture/creative-consistency.md §7.
 */

import { memo } from 'react';
import type {
  WorkflowBindingCandidate,
  WorkflowBindingSlot,
  WorkflowShotBindingSummary,
} from '@neko-agent/types';

interface PlanMatrixProps {
  shots: readonly WorkflowShotBindingSummary[];
  /** Maximum rows to render inline; rest collapsed behind a "show more" toggle */
  maxRows?: number;
}

const SLOT_ORDER: WorkflowBindingSlot[] = ['character', 'scene', 'action', 'prop', 'style'];

const SLOT_LABEL: Record<WorkflowBindingSlot, string> = {
  character: 'Character',
  scene: 'Scene',
  action: 'Action',
  prop: 'Prop',
  style: 'Style',
};

export const PlanMatrix = memo(function PlanMatrix({ shots, maxRows = 20 }: PlanMatrixProps) {
  // Determine which slots are actually used across all shots — hide empty columns
  const activeSlots = SLOT_ORDER.filter((slot) =>
    shots.some((s) => s.primary[slot] !== undefined || s.unmatched.includes(slot)),
  );

  if (activeSlots.length === 0) {
    return (
      <div className="text-[11px] italic text-[var(--agent-fg-secondary)]">
        No asset bindings required for this plan.
      </div>
    );
  }

  const visibleShots = shots.slice(0, maxRows);
  const hidden = shots.length - visibleShots.length;

  return (
    <div className="overflow-x-auto">
      <div className="mb-1 text-[11px] font-semibold text-[var(--agent-fg-secondary)]">
        Shot bindings ({shots.length})
      </div>
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="border-b border-[var(--agent-divider)] text-left text-[var(--agent-fg-secondary)]">
            <th className="py-1 pr-2 font-normal">#</th>
            {activeSlots.map((slot) => (
              <th key={slot} className="py-1 pr-2 font-normal">
                {SLOT_LABEL[slot]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleShots.map((shot, i) => (
            <tr
              key={shot.shotId}
              className="border-b border-[var(--agent-divider)] last:border-b-0"
            >
              <td className="py-1 pr-2 text-[var(--agent-fg-secondary)]">{i + 1}</td>
              {activeSlots.map((slot) => (
                <td key={slot} className="py-1 pr-2">
                  <BindingCell
                    candidate={shot.primary[slot]}
                    unmatched={shot.unmatched.includes(slot)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {hidden > 0 && (
        <div className="mt-1 text-[10px] text-[var(--agent-fg-secondary)]">
          … {hidden} more shot(s) hidden
        </div>
      )}
    </div>
  );
});

// =============================================================================
// BindingCell
// =============================================================================

function BindingCell({
  candidate,
  unmatched,
}: {
  candidate: WorkflowBindingCandidate | undefined;
  unmatched: boolean;
}) {
  if (unmatched || !candidate) {
    return (
      <span
        className="inline-flex items-center gap-1"
        title={unmatched ? 'No candidate found' : '—'}
      >
        <span aria-label="unmatched">❓</span>
        <span className="text-[var(--agent-fg-secondary)]">—</span>
      </span>
    );
  }

  const icon = confidenceIcon(candidate.confidence);
  const continuityFlag = candidate.provenance === 'L5' ? '*' : '';
  const title = candidate.reason
    ? `${candidate.reason}\nConfidence: ${(candidate.confidence * 100).toFixed(0)}%`
    : `Confidence: ${(candidate.confidence * 100).toFixed(0)}%`;

  return (
    <span className="inline-flex items-center gap-1" title={title}>
      <span aria-label="confidence">{icon}</span>
      <span className="truncate" style={{ maxWidth: 140 }}>
        {candidate.assetId}
        {continuityFlag && (
          <span className="ml-0.5 text-[var(--vscode-charts-blue)]" title="Continuity reuse">
            {continuityFlag}
          </span>
        )}
      </span>
    </span>
  );
}

function confidenceIcon(c: number): string {
  if (c >= 0.9) return '✅';
  if (c >= 0.6) return '⚠️';
  return '❓';
}
