/**
 * RouterMemoryView — inspects recent routing decisions stored in
 * `.neko/memory.md` (workflow-router H2 section).
 *
 * Fetches via `workflow/routerMemoryRequest`; deletions via
 * `workflow/routerMemoryDelete`.  Deleting an entry or clearing the
 * whole section triggers an extension-side re-post, so the UI refreshes
 * without a separate request.
 *
 * Entry points:
 *   - Opened from WorkflowPlanPanel (terminal state or no-plan standalone)
 *   - Closed via the ✕ button
 *
 * See docs/architecture/workflow-routing.md §7 (Router memory) and
 * docs/architecture/plan-mode.md §15 for rollout context.
 */

import { memo, useCallback, useEffect, useState } from 'react';
import type { WorkflowRouterMemoryEntry } from '@neko-agent/types';
import { vscode } from '@/messages';

interface RouterMemoryViewProps {
  entries: readonly WorkflowRouterMemoryEntry[];
  total: number;
  errorMessage: string | undefined;
  loaded: boolean;
  onClose: () => void;
}

type LevelFilter = 'all' | WorkflowRouterMemoryEntry['level'];
type SourceFilter = 'all' | WorkflowRouterMemoryEntry['source'];

const LEVEL_OPTIONS: readonly LevelFilter[] = ['all', 'L0', 'L1', 'L2', 'L3', 'L4'];
const SOURCE_OPTIONS: readonly SourceFilter[] = ['all', 'rules', 'llm', 'user-override', 'memory'];

export const RouterMemoryView = memo(function RouterMemoryView({
  entries,
  total,
  errorMessage,
  loaded,
  onClose,
}: RouterMemoryViewProps) {
  const [level, setLevel] = useState<LevelFilter>('all');
  const [source, setSource] = useState<SourceFilter>('all');

  const request = useCallback((l: LevelFilter, s: SourceFilter) => {
    vscode?.postMessage({
      type: 'workflow/routerMemoryRequest',
      limit: 100,
      ...(l !== 'all' && { level: l }),
      ...(s !== 'all' && { source: s }),
    });
  }, []);

  useEffect(() => {
    request(level, source);
    // Only fetch on mount; follow-ups are user-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLevelChange = (next: LevelFilter): void => {
    setLevel(next);
    request(next, source);
  };
  const handleSourceChange = (next: SourceFilter): void => {
    setSource(next);
    request(level, next);
  };

  const handleDelete = (hash: string): void => {
    vscode?.postMessage({ type: 'workflow/routerMemoryDelete', hash });
  };
  const handleClearAll = (): void => {
    if (!confirmClear(entries.length)) return;
    vscode?.postMessage({ type: 'workflow/routerMemoryDelete' });
  };

  return (
    <div
      className="my-2 rounded-md border border-[var(--agent-divider)] bg-[var(--agent-bg-secondary)] p-3"
      role="region"
      aria-label="Router memory inspector"
      data-testid="router-memory-view"
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[13px] font-semibold">
          Router memory{' '}
          <span className="text-[11px] font-normal text-[var(--agent-fg-secondary)]">
            ({entries.length}
            {total !== entries.length ? ` of ${total}` : ''})
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="vscode-button-secondary px-2 py-0.5 text-[10px]"
            onClick={handleClearAll}
            disabled={entries.length === 0}
            title="Remove every stored decision"
          >
            Clear all
          </button>
          <button
            type="button"
            className="rounded px-2 py-0.5 text-[10px] text-[var(--agent-fg-secondary)] hover:bg-[var(--vscode-list-hoverBackground)]"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-[var(--agent-fg-secondary)]">level:</span>
        {LEVEL_OPTIONS.map((opt) => (
          <button
            key={`lvl-${opt}`}
            type="button"
            className={filterChipClass(level === opt)}
            onClick={() => handleLevelChange(opt)}
          >
            {opt}
          </button>
        ))}
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-[var(--agent-fg-secondary)]">source:</span>
        {SOURCE_OPTIONS.map((opt) => (
          <button
            key={`src-${opt}`}
            type="button"
            className={filterChipClass(source === opt)}
            onClick={() => handleSourceChange(opt)}
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

      {loaded && entries.length === 0 && !errorMessage && (
        <div className="text-[11px] italic text-[var(--agent-fg-secondary)]">
          No entries match this filter.
        </div>
      )}

      <ul className="space-y-1">
        {entries.map((entry) => (
          <MemoryRow key={`${entry.hash}-${entry.at}`} entry={entry} onDelete={handleDelete} />
        ))}
      </ul>
    </div>
  );
});

// =============================================================================
// Row
// =============================================================================

function MemoryRow({
  entry,
  onDelete,
}: {
  entry: WorkflowRouterMemoryEntry;
  onDelete: (hash: string) => void;
}): JSX.Element {
  return (
    <li className="flex items-center gap-2 rounded border border-transparent px-1 py-1 text-[11px] hover:border-[var(--agent-divider)]">
      <span
        className="inline-block h-4 w-8 shrink-0 rounded text-center text-[9px] font-semibold leading-4 text-white"
        style={{ backgroundColor: levelColor(entry.level) }}
      >
        {entry.level}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 truncate">
          <span className={`text-[9px] ${sourceColor(entry.source)}`}>{entry.source}</span>
          <code className="truncate text-[10px] opacity-80">hash:{shortHash(entry.hash)}</code>
          {entry.textLength !== undefined && (
            <span className="text-[9px] text-[var(--agent-fg-secondary)]">
              · {entry.textLength} chars
            </span>
          )}
        </div>
        <div className="truncate text-[10px] text-[var(--agent-fg-secondary)]">
          {formatRelative(entry.at)} · {entry.reason}
        </div>
      </div>
      <button
        type="button"
        className="vscode-button-secondary shrink-0 px-1.5 py-0.5 text-[10px]"
        onClick={() => onDelete(entry.hash)}
        title="Forget this decision"
      >
        Forget
      </button>
    </li>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function filterChipClass(active: boolean): string {
  return `rounded px-2 py-0.5 text-[10px] ${
    active
      ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
      : 'bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] hover:opacity-80'
  }`;
}

function sourceColor(source: WorkflowRouterMemoryEntry['source']): string {
  switch (source) {
    case 'rules':
      return 'text-[var(--vscode-charts-blue)]';
    case 'llm':
      return 'text-[var(--vscode-charts-orange)]';
    case 'user-override':
      return 'text-[var(--vscode-charts-purple)]';
    case 'memory':
      return 'text-[var(--vscode-charts-green)]';
    default:
      return 'text-[var(--agent-fg-secondary)]';
  }
}

function levelColor(level: WorkflowRouterMemoryEntry['level']): string {
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

function shortHash(hash: string): string {
  return hash.length > 8 ? `${hash.slice(0, 8)}…` : hash;
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

function confirmClear(count: number): boolean {
  if (count === 0) return false;
  // Keep it simple — we're in a webview, window.confirm works and matches the
  // rest of the codebase's pattern for short destructive prompts.
  return window.confirm(
    `Forget ${count} router decision${count === 1 ? '' : 's'}? This cannot be undone.`,
  );
}
