/**
 * TaskCardMini - Compact inline task status display
 */

import type { BackgroundTask } from '@/components/TaskListView';
import { getStatusColor, getTypeIcon } from './task-utils';

interface TaskCardMiniProps {
  task: BackgroundTask;
  onViewResult?: (taskId: string) => void;
}

export function TaskCardMini({ task, onViewResult }: TaskCardMiniProps) {
  const isActive = task.status === 'queued' || task.status === 'processing';
  const isCompleted = task.status === 'completed';

  return (
    <div
      className="inline-flex items-center gap-2 px-2 py-1 rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] text-[11px] cursor-pointer hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
      onClick={() => isCompleted && onViewResult?.(task.id)}
    >
      <span>{getTypeIcon(task.type)}</span>
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: getStatusColor(task.status) }}
      />
      <span className="truncate max-w-[120px]">{task.name}</span>
      {isActive && (
        <span className="text-[var(--vscode-descriptionForeground)]">
          {task.progress}%
        </span>
      )}
      {isCompleted && (
        <span className="text-[var(--vscode-textLink-foreground)]">&rarr;</span>
      )}
    </div>
  );
}
