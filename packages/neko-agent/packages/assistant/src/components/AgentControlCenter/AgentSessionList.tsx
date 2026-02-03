/**
 * AgentSessionList - List of agent sessions grouped by status
 *
 * Displays running sessions first, then idle sessions.
 */

import { useMemo } from 'react';
import { useTranslation } from '@/i18n/I18nContext';
import { AgentSessionCard } from './AgentSessionCard';
import { getActiveSessions, getIdleSessions } from './types';
import type { AgentSessionListProps } from './types';

export function AgentSessionList({
  sessions,
  activeConversationId,
  onNavigateToConversation,
  onStopAgent,
  onCancelSubAgent,
}: AgentSessionListProps) {
  const { t } = useTranslation();

  // Split sessions into running and idle
  const { runningSessions, idleSessions } = useMemo(() => ({
    runningSessions: getActiveSessions(sessions),
    idleSessions: getIdleSessions(sessions),
  }), [sessions]);

  // Empty state
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--vscode-descriptionForeground)]">
        <svg className="w-12 h-12 mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <p className="text-[11px]">{t('agentControl.noSessions')}</p>
        <p className="text-[9px] mt-1">{t('agentControl.noSessionsHint')}</p>
      </div>
    );
  }

  return (
    <div className="p-2 space-y-4">
      {/* Running Sessions */}
      {runningSessions.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2 px-1">
            <div className="w-2 h-2 rounded-full bg-[var(--vscode-charts-blue)] animate-pulse" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--vscode-descriptionForeground)]">
              {t('agentControl.running')} ({runningSessions.length})
            </span>
          </div>
          <div className="space-y-1.5">
            {runningSessions.map((session) => (
              <AgentSessionCard
                key={session.conversationId}
                session={session}
                isActive={session.conversationId === activeConversationId}
                onNavigate={() => onNavigateToConversation(session.conversationId)}
                onStop={() => onStopAgent(session.conversationId)}
                onCancelSubAgent={onCancelSubAgent ? (subAgentId) => onCancelSubAgent(session.conversationId, subAgentId) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {/* Idle Sessions */}
      {idleSessions.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2 px-1">
            <div className="w-2 h-2 rounded-full bg-[var(--vscode-charts-gray)]" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--vscode-descriptionForeground)]">
              {t('agentControl.idle')} ({idleSessions.length})
            </span>
          </div>
          <div className="space-y-1.5">
            {idleSessions.map((session) => (
              <AgentSessionCard
                key={session.conversationId}
                session={session}
                isActive={session.conversationId === activeConversationId}
                onNavigate={() => onNavigateToConversation(session.conversationId)}
                onStop={() => onStopAgent(session.conversationId)}
                onCancelSubAgent={onCancelSubAgent ? (subAgentId) => onCancelSubAgent(session.conversationId, subAgentId) : undefined}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default AgentSessionList;
