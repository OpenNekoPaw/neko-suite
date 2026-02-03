/**
 * AgentControlCenter Type Definitions
 *
 * Types for the Agent session monitoring panel.
 * Manages cross-conversation Agent execution states.
 */

import type { AgentState } from '@/components/types';
import type { SubAgentInfo } from '@neko/shared';

// Re-export AgentState for convenience
export type { AgentState, AgentPhase } from '@/components/types';
// Re-export SubAgent types for convenience
export type { SubAgentInfo, SubAgentUIStatus, SubAgentUIType } from '@neko/shared';

/**
 * Agent session information for monitoring
 */
export interface AgentSessionInfo {
  /** Conversation ID */
  conversationId: string;
  /** Conversation title for display */
  conversationTitle: string;
  /** Current agent state (null when idle) */
  agentState: AgentState | null;
  /** Context token count */
  tokenCount?: number;
  /** Number of queued messages waiting to be processed */
  queuedMessagesCount: number;
  /** Last activity timestamp */
  lastActivity?: number;
  /** SubAgents spawned by this agent */
  subAgents?: SubAgentInfo[];
}

/**
 * AgentControlCenter component props
 */
export interface AgentControlCenterProps {
  /** All conversation sessions with agent info */
  sessions: AgentSessionInfo[];
  /** Currently active conversation ID */
  activeConversationId: string | null;
  /** Navigate to a specific conversation */
  onNavigateToConversation: (conversationId: string) => void;
  /** Stop agent execution for a conversation */
  onStopAgent: (conversationId: string) => void;
  /** Clear all idle sessions from the list */
  onClearIdleSessions?: () => void;
  /** Cancel a SubAgent */
  onCancelSubAgent?: (conversationId: string, subAgentId: string) => void;
}

/**
 * AgentSessionCard component props
 */
export interface AgentSessionCardProps {
  /** Session information */
  session: AgentSessionInfo;
  /** Whether this is the currently active conversation */
  isActive: boolean;
  /** Navigate to this conversation */
  onNavigate: () => void;
  /** Stop agent for this conversation */
  onStop: () => void;
  /** Cancel a SubAgent */
  onCancelSubAgent?: (subAgentId: string) => void;
}

/**
 * AgentSessionList component props
 */
export interface AgentSessionListProps {
  /** Sessions to display */
  sessions: AgentSessionInfo[];
  /** Currently active conversation ID */
  activeConversationId: string | null;
  /** Navigate to a conversation */
  onNavigateToConversation: (conversationId: string) => void;
  /** Stop agent for a conversation */
  onStopAgent: (conversationId: string) => void;
  /** Cancel a SubAgent */
  onCancelSubAgent?: (conversationId: string, subAgentId: string) => void;
}

/**
 * AgentSummaryBar component props
 */
export interface AgentSummaryBarProps {
  /** Number of active (non-idle) agents */
  activeCount: number;
  /** Total number of sessions */
  totalCount: number;
  /** Stop all running agents */
  onStopAll?: () => void;
  /** Clear idle sessions */
  onClearIdle?: () => void;
}

/**
 * Check if an agent is actively running (not idle)
 */
export function isAgentActive(state: AgentState | null): boolean {
  return state !== null && state.phase !== 'idle';
}

/**
 * Get active sessions from a list
 */
export function getActiveSessions(sessions: AgentSessionInfo[]): AgentSessionInfo[] {
  return sessions.filter(s => isAgentActive(s.agentState));
}

/**
 * Get idle sessions from a list
 */
export function getIdleSessions(sessions: AgentSessionInfo[]): AgentSessionInfo[] {
  return sessions.filter(s => !isAgentActive(s.agentState));
}
