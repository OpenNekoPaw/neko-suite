/**
 * Agent State Indicator Component
 *
 * Displays the current agent execution phase (thinking/acting/streaming)
 * with visual indicators to confirm the agent is running.
 */

import { useState, useEffect } from 'react';
import type { AgentState, AgentPhase } from '@/components/types';

/**
 * Phase configuration for display
 */
const phaseConfig: Record<AgentPhase, { label: string; icon: string; color: string }> = {
  idle: {
    label: 'Ready',
    icon: '●',
    color: 'text-[var(--vscode-charts-gray)]',
  },
  thinking: {
    label: 'Thinking',
    icon: '◐',
    color: 'text-[var(--vscode-charts-purple)]',
  },
  acting: {
    label: 'Acting',
    icon: '◉',
    color: 'text-[var(--vscode-charts-blue)]',
  },
  streaming: {
    label: 'Writing',
    icon: '◑',
    color: 'text-[var(--vscode-charts-green)]',
  },
};

/**
 * Format elapsed time in a human-readable format
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

/**
 * Compact version for inline display (e.g., in header or input area)
 * Also shows real-time elapsed time
 */
export function AgentStateIndicatorCompact({ agentState }: { agentState: AgentState | null }) {
  // Real-time elapsed time update
  const [elapsedTime, setElapsedTime] = useState('');

  useEffect(() => {
    if (!agentState) {
      setElapsedTime('');
      return;
    }

    // Update immediately
    setElapsedTime(formatElapsedTime(agentState.startedAt));

    // Update every second
    const timer = setInterval(() => {
      setElapsedTime(formatElapsedTime(agentState.startedAt));
    }, 1000);

    return () => clearInterval(timer);
  }, [agentState?.startedAt, agentState]);

  if (!agentState) {
    return null;
  }

  const { phase, toolName } = agentState;
  const config = phaseConfig[phase];

  const title = phase === 'acting' && toolName ? `${config.label}: ${toolName}` : config.label;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${config.color}`} title={title}>
      <span className="animate-pulse">{config.icon}</span>
      <span className="opacity-80">{config.label}</span>
      {elapsedTime && (
        <span className="text-[var(--vscode-descriptionForeground)] opacity-60">{elapsedTime}</span>
      )}
    </span>
  );
}
