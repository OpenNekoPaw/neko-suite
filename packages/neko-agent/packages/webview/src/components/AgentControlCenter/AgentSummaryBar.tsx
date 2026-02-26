/**
 * AgentSummaryBar - Summary bar with stats and quick actions
 *
 * Shows active/total counts and batch operation buttons.
 */

import { useTranslation } from '@/i18n/I18nContext';
import type { AgentSummaryBarProps } from './types';

export function AgentSummaryBar({
  activeCount,
  totalCount,
  onStopAll,
  onClearIdle,
}: AgentSummaryBarProps) {
  const { t } = useTranslation();
  const hasActiveAgents = activeCount > 0;
  const hasIdleAgents = totalCount > activeCount;

  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-sideBar-background)]">
      {/* Stats */}
      <div className="flex items-center gap-3">
        <h2 className="text-[12px] font-medium">{t('agentControl.title')}</h2>
        <div className="flex items-center gap-2 text-[10px] text-[var(--vscode-descriptionForeground)]">
          <span className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${hasActiveAgents ? 'bg-[var(--vscode-charts-blue)] animate-pulse' : 'bg-[var(--vscode-charts-gray)]'}`} />
            {t('agentControl.summaryActive')}: <span className="font-medium text-[var(--vscode-foreground)]">{activeCount}</span>
          </span>
          <span className="opacity-50">/</span>
          <span>
            {t('agentControl.summaryTotal')}: <span className="font-medium text-[var(--vscode-foreground)]">{totalCount}</span>
          </span>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-1">
        {/* Stop All */}
        {hasActiveAgents && onStopAll && (
          <button
            onClick={onStopAll}
            className="flex items-center gap-1 px-2 py-1 text-[9px] rounded hover:bg-[var(--vscode-inputValidation-errorBackground)] text-[var(--vscode-errorForeground)] transition-colors"
            title={t('agentControl.stopAll')}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
            </svg>
            {t('agentControl.stopAll')}
          </button>
        )}

        {/* Clear Idle */}
        {hasIdleAgents && onClearIdle && (
          <button
            onClick={onClearIdle}
            className="flex items-center gap-1 px-2 py-1 text-[9px] rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] transition-colors"
            title={t('agentControl.clearIdle')}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            {t('agentControl.clearIdle')}
          </button>
        )}
      </div>
    </div>
  );
}

export default AgentSummaryBar;
