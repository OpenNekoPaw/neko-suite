/**
 * AgentControlCenter - Main component for agent session monitoring
 *
 * Displays all conversation sessions with their agent states,
 * allowing navigation and control of running agents.
 */

import { useMemo, useCallback } from 'react';
import { AgentSummaryBar } from './AgentSummaryBar';
import { AgentSessionList } from './AgentSessionList';
import { getActiveSessions } from './types';
import type { AgentControlCenterProps } from './types';

// Re-export types for external use
export * from './types';

export function AgentControlCenter({
  sessions,
  activeConversationId,
  onNavigateToConversation,
  onStopAgent,
  onClearIdleSessions,
  onCancelSubAgent,
}: AgentControlCenterProps) {
  // Calculate active count
  const activeCount = useMemo(() => getActiveSessions(sessions).length, [sessions]);

  // Stop all running agents
  const handleStopAll = useCallback(() => {
    const activeSessions = getActiveSessions(sessions);
    activeSessions.forEach(session => {
      onStopAgent(session.conversationId);
    });
  }, [sessions, onStopAgent]);

  return (
    <div className="flex flex-col h-full">
      {/* Summary Bar */}
      <AgentSummaryBar
        activeCount={activeCount}
        totalCount={sessions.length}
        onStopAll={activeCount > 0 ? handleStopAll : undefined}
        onClearIdle={onClearIdleSessions}
      />

      {/* Session List */}
      <div className="flex-1 overflow-y-auto">
        <AgentSessionList
          sessions={sessions}
          activeConversationId={activeConversationId}
          onNavigateToConversation={onNavigateToConversation}
          onStopAgent={onStopAgent}
          onCancelSubAgent={onCancelSubAgent}
        />
      </div>
    </div>
  );
}

export default AgentControlCenter;
