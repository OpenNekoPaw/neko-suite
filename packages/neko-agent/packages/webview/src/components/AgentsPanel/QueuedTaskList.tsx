/**
 * QueuedTaskList - Queue management for pending tasks
 *
 * Features:
 * - Display queued tasks with priority
 * - Drag-and-drop reordering (future)
 * - Priority adjustment buttons
 * - Estimated start time
 */

import { useState } from 'react';
import { useTranslation } from '@/i18n/I18nContext';
import type { BackgroundTask } from '@/components/TaskListView';
import type { QueuedTaskListProps } from './types';

export function QueuedTaskList({
  tasks,
  onCancelTask,
  onReorderQueue,
}: QueuedTaskListProps) {
  const { t } = useTranslation();

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--vscode-descriptionForeground)]">
        <svg className="w-12 h-12 mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <p className="text-[11px]">{t('agents.noQueuedTasks')}</p>
        <p className="text-[9px] mt-1">{t('agents.noQueuedTasksHint')}</p>
      </div>
    );
  }

  // Sort by priority (higher first) then by creation time
  const sortedTasks = [...tasks].sort((a, b) => {
    const priorityA = (a as BackgroundTask & { priority?: number }).priority || 0;
    const priorityB = (b as BackgroundTask & { priority?: number }).priority || 0;
    if (priorityA !== priorityB) return priorityB - priorityA;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  return (
    <div className="p-2">
      {/* Queue Header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
          {tasks.length} {t('agents.tasksInQueue')}
        </span>
        {onReorderQueue && (
          <span className="text-[9px] text-[var(--vscode-descriptionForeground)]">
            {t('agents.dragToReorder')}
          </span>
        )}
      </div>

      {/* Queue Items */}
      <div className="space-y-1">
        {sortedTasks.map((task, index) => (
          <QueuedTaskItem
            key={task.id}
            task={task}
            position={index + 1}
            onCancel={() => onCancelTask(task.id)}
            onMoveUp={onReorderQueue && index > 0 ? () => onReorderQueue(task.id, index - 1) : undefined}
            onMoveDown={onReorderQueue && index < sortedTasks.length - 1 ? () => onReorderQueue(task.id, index + 1) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * QueuedTaskItem - Single queued task row
 */
interface QueuedTaskItemProps {
  task: BackgroundTask;
  position: number;
  onCancel: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

function QueuedTaskItem({
  task,
  position,
  onCancel,
  onMoveUp,
  onMoveDown,
}: QueuedTaskItemProps) {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);

  // Get priority from task metadata
  const priority = (task as BackgroundTask & { priority?: number }).priority || 0;
  const estimatedStart = (task as BackgroundTask & { estimatedStartTime?: number }).estimatedStartTime;

  return (
    <div
      className="flex items-center gap-2 p-2 border border-[var(--vscode-panel-border)] rounded hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Position Number */}
      <div className="w-6 h-6 rounded bg-[var(--vscode-input-background)] flex items-center justify-center flex-shrink-0">
        <span className="text-[10px] font-medium">{position}</span>
      </div>

      {/* Task Info */}
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium truncate">{task.name}</div>
        <div className="flex items-center gap-2 text-[9px] text-[var(--vscode-descriptionForeground)]">
          <span className="px-1 py-0.5 bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded">
            {task.type}
          </span>
          {priority > 0 && (
            <span className="flex items-center gap-0.5 text-[var(--vscode-charts-yellow)]">
              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              {t('agents.priority')}: {priority}
            </span>
          )}
          {estimatedStart && (
            <span>
              {t('agents.startsIn')}: {formatWaitTime(estimatedStart - Date.now())}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className={`flex items-center gap-0.5 transition-opacity ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
        {/* Move Up */}
        {onMoveUp && (
          <button
            onClick={onMoveUp}
            className="p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded"
            title={t('agents.moveUp')}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
        )}

        {/* Move Down */}
        {onMoveDown && (
          <button
            onClick={onMoveDown}
            className="p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded"
            title={t('agents.moveDown')}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}

        {/* Cancel */}
        <button
          onClick={onCancel}
          className="p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded text-[var(--vscode-errorForeground)]"
          title={t('common.cancel')}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Drag Handle (future) */}
      {false && (
        <div className="cursor-move text-[var(--vscode-descriptionForeground)]">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
          </svg>
        </div>
      )}
    </div>
  );
}

/**
 * Format wait time in human-readable format
 */
function formatWaitTime(ms: number): string {
  if (ms < 0) return 'soon';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export default QueuedTaskList;
