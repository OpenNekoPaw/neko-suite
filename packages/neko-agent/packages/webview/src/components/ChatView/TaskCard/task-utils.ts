/**
 * Shared utility functions for TaskCard components
 */

import type { TaskStatus, TaskStepStatus } from '@/components/TaskListView';

export function getStatusColor(status: TaskStatus): string {
  switch (status) {
    case 'queued': return 'var(--vscode-charts-yellow, #cca700)';
    case 'processing': return 'var(--vscode-charts-blue, #3794ff)';
    case 'completed': return 'var(--vscode-charts-green, #89d185)';
    case 'failed': return 'var(--vscode-charts-red, #f14c4c)';
    case 'cancelled': return 'var(--vscode-descriptionForeground)';
    default: return 'var(--vscode-foreground)';
  }
}

export function getTypeIcon(type: string): string {
  return type === 'video' ? '\uD83C\uDFAC' : '\uD83D\uDDBC\uFE0F';
}

export function formatDuration(seconds?: number): string {
  if (!seconds) return '';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

export function formatETA(seconds?: number): string {
  if (!seconds || seconds <= 0) return '';
  if (seconds < 60) return `~${Math.ceil(seconds)}s`;
  const mins = Math.ceil(seconds / 60);
  return `~${mins}m`;
}

export function getStepStatusIcon(status: TaskStepStatus): string {
  switch (status) {
    case 'completed': return '\u2713';
    case 'running': return '\u25CF';
    case 'failed': return '\u2717';
    default: return '\u25CB';
  }
}

export function getStepStatusColor(status: TaskStepStatus): string {
  switch (status) {
    case 'completed': return 'var(--vscode-charts-green, #89d185)';
    case 'running': return 'var(--vscode-charts-blue, #3794ff)';
    case 'failed': return 'var(--vscode-charts-red, #f14c4c)';
    default: return 'var(--vscode-descriptionForeground)';
  }
}
