/**
 * PlanMatrix — shot × asset-type binding matrix (read-only + edit mode).
 *
 * Phase 1.5 shipped as a read-only view. Phase 2 adds an edit affordance:
 * clicking a cell opens a popover listing the alternative candidates the
 * MatchingEngine surfaced; selecting one posts workflow/planEditBinding to
 * the extension. A secondary "apply to all" button fires
 * workflow/planApplyToAll.
 *
 * Cells are coloured by confidence:
 *   ✅ green  — confidence ≥ 0.9
 *   ⚠️ yellow — 0.6 ≤ confidence < 0.9
 *   ❓ red    — below 0.6 or unmatched
 *
 * See docs/architecture/plan-mode.md §7 and
 * docs/architecture/creative-consistency.md §7.
 */

import { memo, useCallback, useState } from 'react';
import type {
  WorkflowBindingCandidate,
  WorkflowBindingSlot,
  WorkflowShotBindingSummary,
} from '@neko-agent/types';
import { vscode } from '@/messages';

interface PlanMatrixProps {
  planId: string;
  shots: readonly WorkflowShotBindingSummary[];
  /** Disable editing (e.g. once the plan is executing) */
  readOnly?: boolean;
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

export const PlanMatrix = memo(function PlanMatrix({
  planId,
  shots,
  readOnly = false,
  maxRows = 20,
}: PlanMatrixProps) {
  // Track which (shotId, slot) currently has its popover open
  const [openCell, setOpenCell] = useState<string | undefined>(undefined);

  const cellKey = (shotId: string, slot: WorkflowBindingSlot) => `${shotId}::${slot}`;

  const handleCellClick = useCallback(
    (
      shotId: string,
      slot: WorkflowBindingSlot,
      alternatives: readonly WorkflowBindingCandidate[],
    ) => {
      if (readOnly) return;
      if (alternatives.length === 0) return;
      setOpenCell((prev) => (prev === cellKey(shotId, slot) ? undefined : cellKey(shotId, slot)));
    },
    [readOnly],
  );

  const handlePick = useCallback(
    (shotId: string, slot: WorkflowBindingSlot, assetId: string) => {
      vscode?.postMessage({
        type: 'workflow/planEditBinding',
        planId,
        shotId,
        slot,
        assetId,
      });
      setOpenCell(undefined);
    },
    [planId],
  );

  const handleApplyToAll = useCallback(
    (entityId: string, slot: WorkflowBindingSlot, assetId: string) => {
      vscode?.postMessage({
        type: 'workflow/planApplyToAll',
        planId,
        entityId,
        slot,
        assetId,
      });
      setOpenCell(undefined);
    },
    [planId],
  );

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
              {activeSlots.map((slot) => {
                const candidate = shot.primary[slot];
                const alternatives = shot.alternatives[slot] ?? [];
                const unmatched = shot.unmatched.includes(slot);
                const isOpen = openCell === cellKey(shot.shotId, slot);
                return (
                  <td key={slot} className="relative py-1 pr-2 align-top">
                    <BindingCell
                      candidate={candidate}
                      unmatched={unmatched}
                      hasAlternatives={alternatives.length > 0}
                      readOnly={readOnly}
                      onClick={() => handleCellClick(shot.shotId, slot, alternatives)}
                    />
                    {isOpen && !readOnly && (
                      <BindingPopover
                        candidates={candidates(candidate, alternatives)}
                        currentAssetId={candidate?.assetId}
                        onPick={(assetId) => handlePick(shot.shotId, slot, assetId)}
                        onApplyToAll={
                          candidate
                            ? (assetId) => handleApplyToAll(candidate.entityId, slot, assetId)
                            : undefined
                        }
                      />
                    )}
                  </td>
                );
              })}
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
// BindingCell + popover
// =============================================================================

function BindingCell({
  candidate,
  unmatched,
  hasAlternatives,
  readOnly,
  onClick,
}: {
  candidate: WorkflowBindingCandidate | undefined;
  unmatched: boolean;
  hasAlternatives: boolean;
  readOnly: boolean;
  onClick: () => void;
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

  const clickable = !readOnly && hasAlternatives;

  return (
    <span
      className={`inline-flex items-center gap-1 ${
        clickable ? 'cursor-pointer rounded px-1 hover:bg-[var(--vscode-list-hoverBackground)]' : ''
      }`}
      title={clickable ? `${title}\n\n(click to pick an alternative)` : title}
      onClick={clickable ? onClick : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      <span aria-label="confidence">{icon}</span>
      <span className="truncate" style={{ maxWidth: 140 }}>
        {candidate.assetId}
        {continuityFlag && (
          <span className="ml-0.5 text-[var(--vscode-charts-blue)]" title="Continuity reuse">
            {continuityFlag}
          </span>
        )}
        {clickable && <span className="ml-1 opacity-60">▾</span>}
      </span>
    </span>
  );
}

function BindingPopover({
  candidates,
  currentAssetId,
  onPick,
  onApplyToAll,
}: {
  candidates: readonly WorkflowBindingCandidate[];
  currentAssetId: string | undefined;
  onPick: (assetId: string) => void;
  onApplyToAll?: (assetId: string) => void;
}) {
  return (
    <div
      className="absolute left-0 top-full z-20 mt-1 min-w-[220px] rounded border border-[var(--agent-divider)] bg-[var(--vscode-editor-background)] p-1 shadow-md"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-1 px-1 text-[10px] text-[var(--agent-fg-secondary)]">Alternatives</div>
      {candidates.length === 0 ? (
        <div className="px-2 py-1 text-[11px] italic text-[var(--agent-fg-secondary)]">(none)</div>
      ) : (
        candidates.map((c) => {
          const selected = c.assetId === currentAssetId;
          return (
            <div
              key={`${c.provenance}:${c.assetId}`}
              className={`flex items-center justify-between gap-1 rounded px-1 py-0.5 text-[11px] ${
                selected
                  ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
                  : 'hover:bg-[var(--vscode-list-hoverBackground)]'
              }`}
            >
              <button
                type="button"
                className="flex-1 truncate text-left"
                onClick={() => onPick(c.assetId)}
                title={c.reason}
              >
                {confidenceIcon(c.confidence)} {c.assetId}
                <span className="ml-1 text-[9px] opacity-60">
                  {c.provenance} · {(c.confidence * 100).toFixed(0)}%
                </span>
              </button>
              {onApplyToAll && !selected && (
                <button
                  type="button"
                  className="rounded px-1 text-[9px] text-[var(--vscode-charts-blue)] hover:underline"
                  onClick={() => onApplyToAll(c.assetId)}
                  title="Apply this asset to every other shot of the same entity"
                >
                  all →
                </button>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function candidates(
  primary: WorkflowBindingCandidate | undefined,
  alternatives: readonly WorkflowBindingCandidate[],
): WorkflowBindingCandidate[] {
  const result: WorkflowBindingCandidate[] = [];
  if (primary) result.push(primary);
  for (const a of alternatives) {
    if (primary && a.assetId === primary.assetId && a.provenance === primary.provenance) continue;
    result.push(a);
  }
  return result;
}

function confidenceIcon(c: number): string {
  if (c >= 0.9) return '✅';
  if (c >= 0.6) return '⚠️';
  return '❓';
}
