/**
 * TaskListView 任务列表组件
 * 显示后台媒体生成任务的状态
 */

import { useState, useEffect } from 'react';
import { useTranslation } from '@/i18n/I18nContext';

// =============================================================================
// 类型定义
// =============================================================================

export type TaskStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type TaskType = 'image' | 'video';

/**
 * Task step status for detailed progress tracking
 */
export type TaskStepStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * Individual step in a task workflow
 */
export interface TaskStep {
  id: string;
  name: string;
  status: TaskStepStatus;
  startTime?: number;
  endTime?: number;
  message?: string;
}

export interface BackgroundTask {
  id: string;
  type: TaskType;
  name: string;
  prompt: string;
  providerId: string;
  providerName: string;
  status: TaskStatus;
  progress: number;
  createdAt: string;
  updatedAt: string;
  result?: {
    urls: string[];
    localPaths?: string[];
    thumbnailUrl?: string;
    width?: number;
    height?: number;
    duration?: number;
  };
  error?: string;
  // P1: Step tracking
  steps?: TaskStep[];
  currentStepId?: string;
  eta?: number; // Estimated time remaining in seconds
}

interface TaskListViewProps {
  tasks: BackgroundTask[];
  onCancelTask: (taskId: string) => void;
  onRemoveTask: (taskId: string) => void;
  onViewResult: (taskId: string) => void;
  onClearCompleted: () => void;
}

// =============================================================================
// 辅助函数
// =============================================================================

function formatRelativeTime(dateString: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return t('history.timeAgo.justNow');
  if (diffMin < 60) return t('history.timeAgo.minutes', { count: diffMin });
  if (diffHour < 24) return t('history.timeAgo.hours', { count: diffHour });
  if (diffDay < 7) return t('history.timeAgo.days', { count: diffDay });
  return date.toLocaleDateString();
}

function getStatusColor(status: TaskStatus): string {
  switch (status) {
    case 'queued': return 'var(--vscode-charts-yellow)';
    case 'processing': return 'var(--vscode-charts-blue)';
    case 'completed': return 'var(--vscode-charts-green)';
    case 'failed': return 'var(--vscode-charts-red)';
    case 'cancelled': return 'var(--vscode-descriptionForeground)';
    default: return 'var(--vscode-foreground)';
  }
}

function getTypeLabel(type: TaskType): { text: string; color: string } {
  if (type === 'video') {
    return { text: 'Video', color: 'var(--vscode-charts-purple)' };
  }
  return { text: 'Image', color: 'var(--vscode-charts-blue)' };
}

// =============================================================================
// 单个任务项组件
// =============================================================================

interface TaskItemProps {
  task: BackgroundTask;
  onCancel: () => void;
  onRemove: () => void;
  onViewResult: () => void;
}

function TaskItem({ task, onCancel, onRemove, onViewResult }: TaskItemProps) {
  const { t } = useTranslation();
  const isActive = task.status === 'queued' || task.status === 'processing';
  const isCompleted = task.status === 'completed';
  const isFailed = task.status === 'failed' || task.status === 'cancelled';
  const typeLabel = getTypeLabel(task.type);

  // Compact single-row layout for task items
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--vscode-list-hoverBackground)] rounded group">
      {/* Type Badge */}
      <span
        className="text-[8px] px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium uppercase"
        style={{
          backgroundColor: `color-mix(in srgb, ${typeLabel.color} 20%, transparent)`,
          color: typeLabel.color,
          border: `1px solid ${typeLabel.color}`,
        }}
      >
        {typeLabel.text}
      </span>

      {/* Progress Ring / Status Dot */}
      <div className="flex-shrink-0 w-4 h-4 relative">
        {isActive ? (
          // Animated progress ring
          <svg className="w-4 h-4 -rotate-90" viewBox="0 0 16 16">
            <circle
              cx="8" cy="8" r="6"
              fill="none"
              stroke="var(--vscode-progressBar-background)"
              strokeWidth="2"
            />
            <circle
              cx="8" cy="8" r="6"
              fill="none"
              stroke="var(--vscode-progressBar-foreground)"
              strokeWidth="2"
              strokeDasharray={`${(task.progress / 100) * 37.7} 37.7`}
              className="transition-all duration-300"
            />
          </svg>
        ) : (
          // Status dot
          <div
            className="w-2 h-2 rounded-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ backgroundColor: getStatusColor(task.status) }}
          />
        )}
      </div>

      {/* Task Name - truncated */}
      <span
        className="flex-1 text-[11px] truncate cursor-pointer hover:underline"
        title={task.prompt || task.name}
        onClick={isCompleted ? onViewResult : undefined}
      >
        {task.name}
      </span>

      {/* Time */}
      <span className="text-[9px] text-[var(--vscode-descriptionForeground)] flex-shrink-0">
        {formatRelativeTime(task.createdAt, t)}
      </span>

      {/* Action Buttons - show on hover */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {isActive && (
          <button
            onClick={onCancel}
            className="text-[9px] px-1.5 py-0.5 text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded"
            title={t('tasks.cancel')}
          >
            ✕
          </button>
        )}
        {isCompleted && (
          <button
            onClick={onViewResult}
            className="text-[9px] px-1.5 py-0.5 text-[var(--vscode-textLink-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded"
            title={t('tasks.viewResult')}
          >
            👁
          </button>
        )}
        {!isActive && (
          <button
            onClick={onRemove}
            className="text-[9px] px-1.5 py-0.5 text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded"
            title={t('tasks.remove')}
          >
            🗑
          </button>
        )}
      </div>

      {/* Error indicator */}
      {isFailed && task.error && (
        <span
          className="text-[9px] text-[var(--vscode-errorForeground)] flex-shrink-0"
          title={task.error}
        >
          ⚠
        </span>
      )}
    </div>
  );
}

// =============================================================================
// 主组件
// =============================================================================

export function TaskListView({
  tasks,
  onCancelTask,
  onRemoveTask,
  onViewResult,
  onClearCompleted,
}: TaskListViewProps) {
  const { t } = useTranslation();
  const activeTasks = tasks.filter(t => t.status === 'queued' || t.status === 'processing');
  const completedTasks = tasks.filter(t => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled');

  const hasCompletedTasks = completedTasks.length > 0;

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Compact Header */}
      <div className="sticky top-0 bg-[var(--vscode-sideBar-background)] px-2 py-1.5 border-b border-[var(--vscode-panel-border)] flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium">{t('tasks.title')}</span>
          {activeTasks.length > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded-full">
              {activeTasks.length}
            </span>
          )}
        </div>
        {hasCompletedTasks && (
          <button
            onClick={onClearCompleted}
            className="text-[9px] text-[var(--vscode-textLink-foreground)] hover:underline"
          >
            {t('tasks.clearCompleted')}
          </button>
        )}
      </div>

      {/* Task List - Compact */}
      <div className="py-1">
        {tasks.length === 0 ? (
          <div className="py-8 text-center">
            <div className="text-2xl mb-2">📋</div>
            <div className="text-[11px] text-[var(--vscode-descriptionForeground)]">
              {t('tasks.empty')}
            </div>
            <div className="text-[9px] text-[var(--vscode-descriptionForeground)] mt-0.5">
              {t('tasks.emptyHint')}
            </div>
          </div>
        ) : (
          <>
            {/* Active Tasks */}
            {activeTasks.length > 0 && (
              <div className="mb-1">
                <div className="text-[9px] text-[var(--vscode-descriptionForeground)] uppercase tracking-wider px-2 py-1">
                  {t('tasks.active')}
                </div>
                {activeTasks.map(task => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onCancel={() => onCancelTask(task.id)}
                    onRemove={() => onRemoveTask(task.id)}
                    onViewResult={() => onViewResult(task.id)}
                  />
                ))}
              </div>
            )}

            {/* Completed Tasks */}
            {completedTasks.length > 0 && (
              <div>
                <div className="text-[9px] text-[var(--vscode-descriptionForeground)] uppercase tracking-wider px-2 py-1">
                  {t('tasks.completed')}
                </div>
                {completedTasks.map(task => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onCancel={() => onCancelTask(task.id)}
                    onRemove={() => onRemoveTask(task.id)}
                    onViewResult={() => onViewResult(task.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// 带自动刷新的任务列表 Hook
// =============================================================================

export function useBackgroundTasks(vscodeApi: any) {
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);

  useEffect(() => {
    // 请求初始任务列表
    vscodeApi.postMessage({ type: 'getTasks' });

    // 监听任务更新
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      switch (message.type) {
        case 'tasksUpdated':
          setTasks(message.tasks || []);
          break;
        case 'taskCreated':
          setTasks(prev => [message.task, ...prev]);
          break;
        case 'taskUpdated':
          setTasks(prev => prev.map(t => t.id === message.task.id ? message.task : t));
          break;
        case 'taskRemoved':
          setTasks(prev => prev.filter(t => t.id !== message.taskId));
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [vscodeApi]);

  const cancelTask = (taskId: string) => {
    vscodeApi.postMessage({ type: 'cancelTask', taskId });
  };

  const removeTask = (taskId: string) => {
    vscodeApi.postMessage({ type: 'removeTask', taskId });
  };

  const viewResult = (taskId: string) => {
    vscodeApi.postMessage({ type: 'viewTaskResult', taskId });
  };

  const clearCompleted = () => {
    vscodeApi.postMessage({ type: 'clearCompletedTasks' });
  };

  return {
    tasks,
    cancelTask,
    removeTask,
    viewResult,
    clearCompleted,
  };
}
