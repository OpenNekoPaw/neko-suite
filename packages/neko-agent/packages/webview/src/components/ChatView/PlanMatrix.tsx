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

import { memo, useCallback, useRef, useState } from 'react';
import type {
  WorkflowBindingCandidate,
  WorkflowBindingSlot,
  WorkflowShotBindingSummary,
} from '@neko-agent/types';
import { vscode } from '@/messages';
import { useVirtualizedRows } from '@/hooks/useVirtualizedRows';

interface PlanMatrixProps {
  planId: string;
  shots: readonly WorkflowShotBindingSummary[];
  /** Disable editing (e.g. once the plan is executing) */
  readOnly?: boolean;
  /** Shot count threshold above which virtualization kicks in. */
  virtualizeThreshold?: number;
  /** Pixel height used when virtualizing — must match the actual row height. */
  rowHeightPx?: number;
  /** Max pixel height of the scrollable region when virtualizing. */
  maxViewportPx?: number;
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
  virtualizeThreshold = 40,
  rowHeightPx = 28,
  maxViewportPx = 420,
}: PlanMatrixProps) {
  // Track which (shotId, slot) currently has its popover open
  const [openCell, setOpenCell] = useState<string | undefined>(undefined);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const virtualize = shots.length > virtualizeThreshold;
  const { range, paddingTop, paddingBottom } = useVirtualizedRows({
    container: scrollContainerRef,
    itemCount: virtualize ? shots.length : 0,
    rowHeight: rowHeightPx,
  });

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

  // When virtualizing, only render the shots the hook says are in range;
  // the `paddingTop` / `paddingBottom` spacer cells keep the scrollbar
  // correct.  Without virtualization, render everything (small plans).
  const renderStart = virtualize ? range.start : 0;
  const renderEnd = virtualize ? range.end : shots.length;
  const visibleShots = shots.slice(renderStart, renderEnd);

  const renderRow = (shot: WorkflowShotBindingSummary, globalIndex: number) => (
    <tr
      key={shot.shotId}
      className="border-b border-[var(--agent-divider)] last:border-b-0"
      style={virtualize ? { height: rowHeightPx } : undefined}
    >
      <td className="py-1 pr-2 text-[var(--agent-fg-secondary)]">{globalIndex + 1}</td>
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
  );

  const header = (
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
  );

  const bodyRows = visibleShots.map((shot, i) => renderRow(shot, renderStart + i));

  return (
    <div className="overflow-x-auto">
      <div className="mb-1 text-[11px] font-semibold text-[var(--agent-fg-secondary)]">
        Shot bindings ({shots.length}
        {virtualize ? ' · virtualized' : ''})
      </div>
      {virtualize ? (
        <div
          ref={scrollContainerRef}
          className="overflow-y-auto"
          style={{ maxHeight: maxViewportPx }}
          data-testid="plan-matrix-virtual-viewport"
        >
          <table className="w-full border-collapse text-[11px]">
            {header}
            <tbody>
              {paddingTop > 0 && (
                <tr aria-hidden="true" style={{ height: paddingTop }}>
                  <td colSpan={activeSlots.length + 1} />
                </tr>
              )}
              {bodyRows}
              {paddingBottom > 0 && (
                <tr aria-hidden="true" style={{ height: paddingBottom }}>
                  <td colSpan={activeSlots.length + 1} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <table className="w-full border-collapse text-[11px]">
          {header}
          <tbody>{bodyRows}</tbody>
        </table>
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
  const provenanceMark = provenanceBadge(candidate.provenance);
  const title = buildTitle(candidate);

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
        {provenanceMark && (
          <span
            className={`ml-0.5 ${provenanceMark.className}`}
            title={provenanceMark.title}
            aria-label={provenanceMark.title}
          >
            {provenanceMark.glyph}
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
                  {provenanceLabel(c.provenance)} · {(c.confidence * 100).toFixed(0)}%
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

interface ProvenanceBadge {
  glyph: string;
  title: string;
  className: string;
}

/**
 * A small secondary glyph that surfaces *why* the matcher picked this
 * candidate: continuity (L5), semantic (L3), LLM (L4), or user override.
 * Returning undefined for L1/L2 keeps the "explicit tag" / "fuzzy name"
 * cases uncluttered — those are already the common case and don't need
 * a callout.
 */
function provenanceBadge(
  provenance: WorkflowBindingCandidate['provenance'],
): ProvenanceBadge | undefined {
  // NOTE: the wire type narrows 'user' → 'L1' (see toWireCandidate in the
  // extension), so the 'user' case is unreachable here.  L1 / L2 stay
  // unbadged because they're the common path and don't need a callout.
  switch (provenance) {
    case 'L5':
      return {
        glyph: '*',
        title: 'Continuity reuse from an earlier shot',
        className: 'text-[var(--vscode-charts-blue)]',
      };
    case 'L3':
      return {
        glyph: '🔍',
        title: 'Semantic match (CLIP)',
        className: 'text-[var(--vscode-charts-orange)]',
      };
    case 'L4':
      return {
        glyph: '🤖',
        title: 'LLM tie-breaker',
        className: 'text-[var(--vscode-charts-purple)]',
      };
    case 'L1':
    case 'L2':
    default:
      return undefined;
  }
}

/** Human-readable provenance shown in the alternatives popover. */
function provenanceLabel(provenance: WorkflowBindingCandidate['provenance']): string {
  switch (provenance) {
    case 'L1':
      return 'L1 explicit';
    case 'L2':
      return 'L2 name';
    case 'L3':
      return 'L3 semantic';
    case 'L4':
      return 'L4 LLM';
    case 'L5':
      return 'L5 continuity';
    default:
      return provenance;
  }
}

function buildTitle(candidate: WorkflowBindingCandidate): string {
  const pct = (candidate.confidence * 100).toFixed(0);
  const prov = provenanceLabel(candidate.provenance);
  const head = candidate.reason ?? `${prov} match`;
  return `${head}\nProvenance: ${prov}\nConfidence: ${pct}%`;
}
