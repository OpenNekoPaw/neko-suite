/**
 * AgentsPanel - Global Task Control Center
 *
 * Provides a unified view for managing all background tasks:
 * - Active tasks dashboard with real-time progress
 * - Queued tasks with priority management
 * - Task statistics and success rates
 * - Quick batch actions (pause/resume/cancel all)
 */

import { useMemo, useState } from 'react';
import { useTranslation } from '@/i18n/I18nContext';
import type { BackgroundTask } from '@/components/TaskListView';
import {
  type AgentsPanelProps,
  calculateStatistics,
  groupTasksByStatus,
} from './types';
import { ActiveTasksDashboard } from './ActiveTasksDashboard';
import { QueuedTaskList } from './QueuedTaskList';
import { TaskStatisticsPanel } from './TaskStatisticsPanel';
import { QuickActions } from './QuickActions';

// Re-export types for external use
export * from './types';

/**
 * Tab type for panel navigation
 */
type TabType = 'active' | 'queued' | 'history' | 'stats';

/**
 * AgentsPanel - Main component
 */
export function AgentsPanel({
  tasks,
  parallelGroups = [],
  statistics: externalStats,
  onCancelTask,
  onRemoveTask,
  onViewResult,
  onClearCompleted,
  onReorderQueue,
  onPauseTask: _onPauseTask,
  onResumeTask: _onResumeTask,
  onPauseAll,
  onResumeAll,
  onCancelAll,
}: AgentsPanelProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('active');

  // Group tasks by status
  const grouped = useMemo(() => groupTasksByStatus(tasks), [tasks]);

  // Calculate statistics (use external if provided)
  const statistics = useMemo(
    () => externalStats || calculateStatistics(tasks),
    [externalStats, tasks]
  );

  // Tab configuration
  const tabs: Array<{ id: TabType; label: string; count: number }> = [
    { id: 'active', label: t('agents.tabs.active'), count: grouped.active.length },
    { id: 'queued', label: t('agents.tabs.queued'), count: grouped.queued.length },
    { id: 'history', label: t('agents.tabs.history'), count: grouped.completed.length + grouped.failed.length },
    { id: 'stats', label: t('agents.tabs.stats'), count: 0 },
  ];

  // Check if there are paused tasks (for resume all)
  const hasPausedTasks = tasks.some(t => t.status === 'paused' as BackgroundTask['status']);

  return (
    <div className="flex flex-col h-full">
      {/* Header with Quick Actions */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--vscode-panel-border)]">
        <h2 className="text-[12px] font-medium">{t('agents.title')}</h2>
        <QuickActions
          hasActiveTasks={grouped.active.length > 0}
          hasQueuedTasks={grouped.queued.length > 0}
          hasPausedTasks={hasPausedTasks}
          onPauseAll={onPauseAll}
          onResumeAll={onResumeAll}
          onCancelAll={onCancelAll}
          onClearCompleted={grouped.completed.length > 0 || grouped.failed.length > 0 ? onClearCompleted : undefined}
        />
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-[var(--vscode-panel-border)]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-[var(--vscode-focusBorder)] text-[var(--vscode-foreground)]'
                : 'text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[9px] ${
                activeTab === tab.id
                  ? 'bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]'
                  : 'bg-[var(--vscode-input-background)]'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'active' && (
          <ActiveTasksDashboard
            tasks={grouped.active}
            parallelGroups={parallelGroups}
            onCancelTask={onCancelTask}
            onViewResult={onViewResult}
          />
        )}

        {activeTab === 'queued' && (
          <QueuedTaskList
            tasks={grouped.queued}
            onCancelTask={onCancelTask}
            onReorderQueue={onReorderQueue}
          />
        )}

        {activeTab === 'history' && (
          <HistoryList
            completedTasks={grouped.completed}
            failedTasks={grouped.failed}
            onRemoveTask={onRemoveTask}
            onViewResult={onViewResult}
          />
        )}

        {activeTab === 'stats' && (
          <TaskStatisticsPanel
            statistics={statistics}
            completedTasks={grouped.completed}
          />
        )}
      </div>
    </div>
  );
}

/**
 * HistoryList - Completed and failed tasks
 */
interface HistoryListProps {
  completedTasks: BackgroundTask[];
  failedTasks: BackgroundTask[];
  onRemoveTask: (taskId: string) => void;
  onViewResult: (taskId: string) => void;
}

function HistoryList({
  completedTasks,
  failedTasks,
  onRemoveTask,
  onViewResult,
}: HistoryListProps) {
  const { t } = useTranslation();
  const allTasks = [...failedTasks, ...completedTasks].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  if (allTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--vscode-descriptionForeground)]">
        <svg className="w-12 h-12 mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
        <p className="text-[11px]">{t('agents.noHistory')}</p>
      </div>
    );
  }

  return (
    <div className="p-2 space-y-1">
      {allTasks.map((task) => (
        <HistoryTaskItem
          key={task.id}
          task={task}
          onRemove={() => onRemoveTask(task.id)}
          onViewResult={() => onViewResult(task.id)}
        />
      ))}
    </div>
  );
}

/**
 * HistoryTaskItem - Single history task row
 */
interface HistoryTaskItemProps {
  task: BackgroundTask;
  onRemove: () => void;
  onViewResult: () => void;
}

function HistoryTaskItem({ task, onRemove, onViewResult }: HistoryTaskItemProps) {
  const isSuccess = task.status === 'completed';
  const isFailed = task.status === 'failed' || task.status === 'cancelled';

  // Format relative time
  const formatRelativeTime = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <div className={`flex items-center gap-2 p-2 rounded border transition-colors ${
      isFailed
        ? 'border-[var(--vscode-inputValidation-errorBorder)] bg-[var(--vscode-inputValidation-errorBackground)]'
        : 'border-[var(--vscode-panel-border)] hover:bg-[var(--vscode-list-hoverBackground)]'
    }`}>
      {/* Status Icon */}
      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
        isSuccess
          ? 'bg-[var(--vscode-charts-green)]/20 text-[var(--vscode-charts-green)]'
          : 'bg-[var(--vscode-charts-red)]/20 text-[var(--vscode-charts-red)]'
      }`}>
        {isSuccess ? (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
      </div>

      {/* Task Info */}
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium truncate">{task.name}</div>
        <div className="text-[9px] text-[var(--vscode-descriptionForeground)]">
          {task.type} • {formatRelativeTime(task.updatedAt)}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {isSuccess && (
          <button
            onClick={onViewResult}
            className="p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded opacity-60 hover:opacity-100"
            title="View result"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </button>
        )}
        <button
          onClick={onRemove}
          className="p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded opacity-60 hover:opacity-100"
          title="Remove"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default AgentsPanel;
