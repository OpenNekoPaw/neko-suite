/**
 * AgentSessionCard - Single session card component
 *
 * Displays agent state, conversation title, and action buttons.
 * Supports expandable SubAgent list when SubAgents are present.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from '@/i18n/I18nContext';
import { SubAgentList } from './SubAgentList';
import type { AgentSessionCardProps } from './types';
import type { AgentPhase } from '@/components/types';

/**
 * Phase display configuration
 */
const phaseConfig: Record<AgentPhase, { icon: string; color: string; bgColor: string }> = {
  idle: {
    icon: '●',
    color: 'text-[var(--vscode-charts-gray)]',
    bgColor: 'bg-[var(--vscode-charts-gray)]/10',
  },
  thinking: {
    icon: '◐',
    color: 'text-[var(--vscode-charts-purple)]',
    bgColor: 'bg-[var(--vscode-charts-purple)]/10',
  },
  acting: {
    icon: '◉',
    color: 'text-[var(--vscode-charts-blue)]',
    bgColor: 'bg-[var(--vscode-charts-blue)]/10',
  },
  streaming: {
    icon: '◑',
    color: 'text-[var(--vscode-charts-green)]',
    bgColor: 'bg-[var(--vscode-charts-green)]/10',
  },
};

/**
 * Format elapsed time
 */
function formatElapsedTime(startedAt: number): string {
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  if (elapsed < 60) {
    return `${elapsed}s`;
  }
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  return `${minutes}m ${seconds}s`;
}

export function AgentSessionCard({
  session,
  isActive,
  onNavigate,
  onStop,
  onCancelSubAgent,
}: AgentSessionCardProps) {
  const { t } = useTranslation();
  const { agentState, conversationTitle, tokenCount, queuedMessagesCount, subAgents } = session;

  // Expansion state for SubAgents
  const [isExpanded, setIsExpanded] = useState(false);

  // Check if has SubAgents
  const hasSubAgents = subAgents && subAgents.length > 0;
  const runningSubAgentsCount = useMemo(() => {
    if (!subAgents) return 0;
    return subAgents.filter(sa => sa.status === 'running' || sa.status === 'pending').length;
  }, [subAgents]);

  // Determine phase (default to idle if no state)
  const phase: AgentPhase = agentState?.phase ?? 'idle';
  const config = phaseConfig[phase];
  const isRunning = phase !== 'idle';

  // Calculate elapsed time if running
  const elapsedTime = useMemo(() => {
    if (agentState?.startedAt) {
      return formatElapsedTime(agentState.startedAt);
    }
    return null;
  }, [agentState?.startedAt]);

  // Phase label with tool name if acting
  const phaseLabel = useMemo(() => {
    const baseLabel = t(`agentControl.phase.${phase}`);
    if (phase === 'acting' && agentState?.toolName) {
      return `${baseLabel}: ${agentState.toolName}`;
    }
    return baseLabel;
  }, [phase, agentState?.toolName, t]);

  return (
    <div
      className={`rounded-lg border transition-colors ${
        isActive
          ? 'border-[var(--vscode-focusBorder)] bg-[var(--vscode-button-background)]/20'
          : 'border-[var(--vscode-panel-border)] hover:bg-[var(--vscode-list-hoverBackground)]'
      }`}
    >
      {/* Main Card Content */}
      <div className="flex items-center gap-3 p-3">
        {/* Phase Indicator */}
        <div
          className={`flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0 ${config.bgColor}`}
        >
          <span className={`text-sm ${isRunning ? 'animate-pulse' : ''} ${config.color}`}>
            {config.icon}
          </span>
        </div>

        {/* Session Info */}
        <div className="flex-1 min-w-0">
          {/* Title */}
          <div className="text-[11px] font-medium truncate">
            {conversationTitle || t('agentControl.untitled')}
          </div>

          {/* Meta info */}
          <div className="flex items-center gap-2 text-[9px] text-[var(--vscode-descriptionForeground)]">
            {/* Phase */}
            <span className={`flex items-center gap-1 ${config.color}`}>
              <span className="truncate max-w-[100px]">{phaseLabel}</span>
            </span>

            {/* Elapsed time */}
            {elapsedTime && (
              <>
                <span>•</span>
                <span>{elapsedTime}</span>
              </>
            )}

            {/* Token count */}
            {tokenCount !== undefined && tokenCount > 0 && (
              <>
                <span>•</span>
                <span>{tokenCount >= 1000 ? `${(tokenCount / 1000).toFixed(1)}k` : tokenCount} tokens</span>
              </>
            )}

            {/* Queued messages */}
            {queuedMessagesCount > 0 && (
              <>
                <span>•</span>
                <span className="text-[var(--vscode-charts-yellow)]">
                  {queuedMessagesCount} {t('agentControl.queued')}
                </span>
              </>
            )}

            {/* SubAgents indicator */}
            {hasSubAgents && (
              <>
                <span>•</span>
                <span className="text-[var(--vscode-charts-purple)]">
                  {runningSubAgentsCount > 0 ? (
                    <span className="flex items-center gap-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--vscode-charts-purple)] animate-pulse" />
                      {runningSubAgentsCount} {t('subAgent.running')}
                    </span>
                  ) : (
                    `${subAgents.length} ${t('subAgent.title')}`
                  )}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Expand/Collapse SubAgents button */}
          {hasSubAgents && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className="p-1.5 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded opacity-70 hover:opacity-100 transition-opacity"
              title={isExpanded ? t('subAgent.collapse') : t('subAgent.expand')}
            >
              <svg
                className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}

          {/* Navigate button */}
          <button
            onClick={onNavigate}
            className="p-1.5 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded opacity-70 hover:opacity-100 transition-opacity"
            title={t('agentControl.navigate')}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>

          {/* Stop button (only when running) */}
          {isRunning && (
            <button
              onClick={onStop}
              className="p-1.5 hover:bg-[var(--vscode-inputValidation-errorBackground)] rounded opacity-70 hover:opacity-100 transition-opacity text-[var(--vscode-errorForeground)]"
              title={t('agentControl.stop')}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* SubAgent List (Collapsible) */}
      {hasSubAgents && isExpanded && (
        <div className="px-3 pb-3">
          <SubAgentList
            subAgents={subAgents}
            onCancel={onCancelSubAgent}
          />
        </div>
      )}
    </div>
  );
}

export default AgentSessionCard;
