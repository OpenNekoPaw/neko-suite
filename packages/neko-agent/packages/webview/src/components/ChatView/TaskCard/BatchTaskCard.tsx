/**
 * BatchTaskCard - Compact display for multiple tasks
 */

import type { BackgroundTask } from '@/components/TaskListView';
import { useTranslation } from '@/i18n/I18nContext';
import { getStatusColor, getTypeIcon } from './task-utils';

interface BatchTaskCardProps {
  tasks: BackgroundTask[];
  onCancel?: (taskId: string) => void;
  onCancelAll?: () => void;
  onViewResult?: (taskId: string) => void;
}

export function BatchTaskCard({
  tasks,
  onCancel: _onCancel,
  onCancelAll,
  onViewResult,
}: BatchTaskCardProps) {
  const { t } = useTranslation();

  if (tasks.length === 0) return null;

  const stats = {
    queued: tasks.filter((t) => t.status === 'queued').length,
    processing: tasks.filter((t) => t.status === 'processing').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
    failed: tasks.filter((t) => t.status === 'failed' || t.status === 'cancelled').length,
  };

  const totalProgress = Math.round(tasks.reduce((sum, t) => sum + t.progress, 0) / tasks.length);

  const allCompleted = stats.completed === tasks.length;
  const allFailed = stats.failed === tasks.length;
  const hasActive = stats.queued > 0 || stats.processing > 0;
  const taskType = tasks[0]?.type || 'video';

  return (
    <div className="mt-2 border border-[var(--vscode-panel-border)] rounded-lg overflow-hidden bg-[var(--vscode-editor-background)]">
      {/* Header */}
      <div
        className="px-3 py-2 flex items-center justify-between"
        style={{
          background: allCompleted
            ? 'linear-gradient(90deg, color-mix(in srgb, var(--vscode-charts-green, #89d185) 15%, transparent), transparent)'
            : allFailed
              ? 'linear-gradient(90deg, color-mix(in srgb, var(--vscode-charts-red, #f14c4c) 15%, transparent), transparent)'
              : 'linear-gradient(90deg, color-mix(in srgb, var(--vscode-charts-blue, #3794ff) 15%, transparent), transparent)',
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-base">{getTypeIcon(taskType)}</span>
          <span className="text-[12px] font-medium">
            {taskType === 'video'
              ? t('tasks.batchVideoGeneration')
              : t('tasks.batchImageGeneration')}
          </span>
          <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
            ({t('tasks.tasks', { count: tasks.length })})
          </span>
        </div>
      </div>

      {/* Progress Overview */}
      <div className="px-3 py-2">
        {/* Status badges */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {stats.completed > 0 && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor:
                  'color-mix(in srgb, var(--vscode-charts-green, #89d185) 20%, transparent)',
                color: 'var(--vscode-charts-green, #89d185)',
              }}
            >
              ✓ {stats.completed} {t('tasks.status.completed').toLowerCase()}
            </span>
          )}
          {stats.processing > 0 && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full animate-pulse"
              style={{
                backgroundColor:
                  'color-mix(in srgb, var(--vscode-charts-blue, #3794ff) 20%, transparent)',
                color: 'var(--vscode-charts-blue, #3794ff)',
              }}
            >
              ⏳ {stats.processing} {t('tasks.status.processing').toLowerCase()}
            </span>
          )}
          {stats.queued > 0 && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor:
                  'color-mix(in srgb, var(--vscode-charts-yellow, #cca700) 20%, transparent)',
                color: 'var(--vscode-charts-yellow, #cca700)',
              }}
            >
              ⏸ {stats.queued} {t('tasks.status.queued').toLowerCase()}
            </span>
          )}
          {stats.failed > 0 && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor:
                  'color-mix(in srgb, var(--vscode-charts-red, #f14c4c) 20%, transparent)',
                color: 'var(--vscode-charts-red, #f14c4c)',
              }}
            >
              ✗ {stats.failed} {t('tasks.status.failed').toLowerCase()}
            </span>
          )}
        </div>

        {/* Overall progress bar */}
        {hasActive && (
          <div className="mb-2">
            <div className="flex items-center justify-between text-[10px] text-[var(--vscode-descriptionForeground)] mb-1">
              <span>{t('tasks.overallProgress')}</span>
              <span>{totalProgress}%</span>
            </div>
            <div className="h-2 bg-[var(--vscode-progressBar-background)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out bg-[var(--vscode-charts-blue,#3794ff)]"
                style={{ width: `${totalProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Individual task list (compact) */}
        <div className="max-h-[200px] overflow-y-auto space-y-1 mb-2">
          {tasks.map((task, index) => (
            <div
              key={task.id}
              className="flex items-center gap-2 px-2 py-1 rounded bg-[var(--vscode-input-background)] text-[10px]"
            >
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: getStatusColor(task.status) }}
              />
              <span className="flex-1 truncate text-[var(--vscode-descriptionForeground)]">
                #{index + 1}: {task.prompt.slice(0, 40)}
                {task.prompt.length > 40 ? '...' : ''}
              </span>
              <span className="flex-shrink-0" style={{ color: getStatusColor(task.status) }}>
                {task.status === 'completed'
                  ? '✓'
                  : task.status === 'failed'
                    ? '✗'
                    : `${task.progress}%`}
              </span>
              {task.status === 'completed' && onViewResult && (
                <button
                  onClick={() => onViewResult(task.id)}
                  className="text-[var(--vscode-textLink-foreground)] hover:underline"
                >
                  {t('common.view')}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-1 border-t border-[var(--vscode-panel-border)]">
          {hasActive && onCancelAll && (
            <button
              onClick={onCancelAll}
              className="text-[10px] px-2 py-1 text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded transition-colors"
            >
              {t('tasks.cancelAll')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
