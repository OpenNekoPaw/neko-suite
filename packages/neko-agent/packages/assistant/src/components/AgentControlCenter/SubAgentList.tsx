/**
 * SubAgentList - Expandable list of SubAgents for an agent session
 *
 * Displays SubAgent status, progress, and allows cancellation.
 */

import { useMemo } from 'react';
import { useTranslation } from '@/i18n/I18nContext';
import type { SubAgentInfo, SubAgentUIStatus, SubAgentUIType } from '@uniedit/shared';

// =============================================================================
// Types
// =============================================================================

export interface SubAgentListProps {
  /** List of SubAgents */
  subAgents: SubAgentInfo[];
  /** Cancel a SubAgent */
  onCancel?: (subAgentId: string) => void;
}

export interface SubAgentItemProps {
  /** SubAgent info */
  subAgent: SubAgentInfo;
  /** Cancel callback */
  onCancel?: () => void;
}

// =============================================================================
// Status Configuration
// =============================================================================

const statusConfig: Record<SubAgentUIStatus, { icon: string; color: string; bgColor: string }> = {
  pending: {
    icon: '○',
    color: 'text-[var(--vscode-charts-gray)]',
    bgColor: 'bg-[var(--vscode-charts-gray)]/10',
  },
  running: {
    icon: '◐',
    color: 'text-[var(--vscode-charts-blue)]',
    bgColor: 'bg-[var(--vscode-charts-blue)]/10',
  },
  completed: {
    icon: '●',
    color: 'text-[var(--vscode-charts-green)]',
    bgColor: 'bg-[var(--vscode-charts-green)]/10',
  },
  failed: {
    icon: '✕',
    color: 'text-[var(--vscode-charts-red)]',
    bgColor: 'bg-[var(--vscode-charts-red)]/10',
  },
  cancelled: {
    icon: '○',
    color: 'text-[var(--vscode-charts-yellow)]',
    bgColor: 'bg-[var(--vscode-charts-yellow)]/10',
  },
};

const typeLabels: Record<SubAgentUIType, string> = {
  'code-search': 'Code Search',
  'file-explorer': 'File Explorer',
  'test-runner': 'Test Runner',
  'document-writer': 'Doc Writer',
  general: 'General',
};

// =============================================================================
// Utility Functions
// =============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatElapsedTime(startedAt: number): string {
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  if (elapsed < 60) return `${elapsed}s`;
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  return `${minutes}m ${seconds}s`;
}

// =============================================================================
// SubAgentItem Component
// =============================================================================

export function SubAgentItem({ subAgent, onCancel }: SubAgentItemProps) {
  const { t } = useTranslation();
  const config = statusConfig[subAgent.status];
  const isRunning = subAgent.status === 'running';
  const canCancel = subAgent.status === 'pending' || subAgent.status === 'running';

  // Calculate time display
  const timeDisplay = useMemo(() => {
    if (subAgent.duration) {
      return formatDuration(subAgent.duration);
    }
    if (subAgent.startedAt && isRunning) {
      return formatElapsedTime(subAgent.startedAt);
    }
    return null;
  }, [subAgent.duration, subAgent.startedAt, isRunning]);

  // Progress display
  const progressDisplay = useMemo(() => {
    if (subAgent.iteration && subAgent.maxIterations) {
      return `${subAgent.iteration}/${subAgent.maxIterations}`;
    }
    if (subAgent.progress !== undefined) {
      return `${subAgent.progress}%`;
    }
    return null;
  }, [subAgent.iteration, subAgent.maxIterations, subAgent.progress]);

  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-[var(--vscode-list-hoverBackground)] group">
      {/* Status Indicator */}
      <div
        className={`flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0 ${config.bgColor}`}
      >
        <span className={`text-[10px] ${isRunning ? 'animate-spin' : ''} ${config.color}`}>
          {config.icon}
        </span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        {/* Type badge + Description */}
        <div className="flex items-center gap-1.5">
          <span className="text-[8px] px-1 py-0.5 rounded bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]">
            {typeLabels[subAgent.type]}
          </span>
          <span className="text-[10px] truncate text-[var(--vscode-foreground)]">
            {subAgent.description}
          </span>
        </div>

        {/* Meta info */}
        <div className="flex items-center gap-2 text-[8px] text-[var(--vscode-descriptionForeground)]">
          {/* Status */}
          <span className={config.color}>
            {t(`subAgent.status.${subAgent.status}`)}
          </span>

          {/* Progress */}
          {progressDisplay && (
            <>
              <span>•</span>
              <span>{progressDisplay}</span>
            </>
          )}

          {/* Time */}
          {timeDisplay && (
            <>
              <span>•</span>
              <span>{timeDisplay}</span>
            </>
          )}

          {/* Error */}
          {subAgent.error && (
            <>
              <span>•</span>
              <span className="text-[var(--vscode-charts-red)] truncate max-w-[80px]" title={subAgent.error}>
                {subAgent.error}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Cancel button */}
      {canCancel && onCancel && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
          className="p-1 opacity-0 group-hover:opacity-70 hover:opacity-100 hover:bg-[var(--vscode-inputValidation-errorBackground)] rounded transition-opacity text-[var(--vscode-errorForeground)]"
          title={t('subAgent.cancel')}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

// =============================================================================
// SubAgentList Component
// =============================================================================

export function SubAgentList({ subAgents, onCancel }: SubAgentListProps) {
  const { t } = useTranslation();

  // Group SubAgents by status
  const { running, completed, other } = useMemo(() => {
    const running: SubAgentInfo[] = [];
    const completed: SubAgentInfo[] = [];
    const other: SubAgentInfo[] = [];

    for (const sa of subAgents) {
      if (sa.status === 'running' || sa.status === 'pending') {
        running.push(sa);
      } else if (sa.status === 'completed') {
        completed.push(sa);
      } else {
        other.push(sa);
      }
    }

    return { running, completed, other };
  }, [subAgents]);

  if (subAgents.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 pt-2 border-t border-[var(--vscode-panel-border)]">
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-1 px-2">
        <svg className="w-3 h-3 text-[var(--vscode-descriptionForeground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <span className="text-[9px] font-medium uppercase tracking-wider text-[var(--vscode-descriptionForeground)]">
          {t('subAgent.title')} ({subAgents.length})
        </span>
      </div>

      {/* Running SubAgents */}
      {running.length > 0 && (
        <div className="space-y-0.5">
          {running.map((sa) => (
            <SubAgentItem
              key={sa.id}
              subAgent={sa}
              onCancel={onCancel ? () => onCancel(sa.id) : undefined}
            />
          ))}
        </div>
      )}

      {/* Completed SubAgents */}
      {completed.length > 0 && (
        <div className="space-y-0.5">
          {completed.map((sa) => (
            <SubAgentItem key={sa.id} subAgent={sa} />
          ))}
        </div>
      )}

      {/* Failed/Cancelled SubAgents */}
      {other.length > 0 && (
        <div className="space-y-0.5">
          {other.map((sa) => (
            <SubAgentItem key={sa.id} subAgent={sa} />
          ))}
        </div>
      )}
    </div>
  );
}

export default SubAgentList;
