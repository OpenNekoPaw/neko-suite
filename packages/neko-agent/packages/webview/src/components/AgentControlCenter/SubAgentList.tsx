/**
 * SubAgentList - Compact inline list of SubAgents for an agent session
 *
 * Simplified view: one line per sub-agent with status icon, type, description, and duration.
 */

import { useTranslation } from '@/i18n/I18nContext';
import type { SubAgentInfo, SubAgentUIStatus } from '@neko/shared';

export interface SubAgentListProps {
  subAgents: SubAgentInfo[];
  onCancel?: (subAgentId: string) => void;
}

const statusIcons: Record<SubAgentUIStatus, string> = {
  pending: '○',
  running: '◐',
  completed: '●',
  failed: '✕',
  cancelled: '○',
};

const statusColors: Record<SubAgentUIStatus, string> = {
  pending: 'text-[var(--vscode-charts-gray)]',
  running: 'text-[var(--vscode-charts-blue)]',
  completed: 'text-[var(--vscode-charts-green)]',
  failed: 'text-[var(--vscode-charts-red)]',
  cancelled: 'text-[var(--vscode-charts-yellow)]',
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

export function SubAgentList({ subAgents, onCancel }: SubAgentListProps) {
  const { t } = useTranslation();

  if (subAgents.length === 0) return null;

  return (
    <div className="mt-2 pt-2 border-t border-[var(--vscode-panel-border)]">
      <div className="flex items-center gap-1.5 mb-1 px-2">
        <span className="text-[9px] font-medium uppercase tracking-wider text-[var(--vscode-descriptionForeground)]">
          {t('subAgent.title')} ({subAgents.length})
        </span>
      </div>
      <div className="space-y-0.5 px-2">
        {subAgents.map((sa) => {
          const canCancel = sa.status === 'pending' || sa.status === 'running';
          const duration = sa.duration ? formatDuration(sa.duration) : null;
          return (
            <div key={sa.id} className="flex items-center gap-1.5 py-0.5 text-[10px] group">
              <span className={`${statusColors[sa.status]} ${sa.status === 'running' ? 'animate-spin' : ''}`}>
                {statusIcons[sa.status]}
              </span>
              <span className="text-[var(--vscode-descriptionForeground)]">{sa.type}:</span>
              <span className="truncate text-[var(--vscode-foreground)]">{sa.description}</span>
              {duration && (
                <span className="text-[var(--vscode-descriptionForeground)] flex-shrink-0">({duration})</span>
              )}
              {sa.error && (
                <span className="text-[var(--vscode-charts-red)] truncate max-w-[60px]" title={sa.error}>
                  {sa.error}
                </span>
              )}
              {canCancel && onCancel && (
                <button
                  onClick={() => onCancel(sa.id)}
                  className="opacity-0 group-hover:opacity-70 hover:opacity-100 text-[var(--vscode-errorForeground)] ml-auto flex-shrink-0"
                  title={t('subAgent.cancel')}
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SubAgentList;
