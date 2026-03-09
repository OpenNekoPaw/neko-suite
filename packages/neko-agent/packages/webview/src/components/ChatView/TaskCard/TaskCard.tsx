/**
 * TaskCard - Inline task status card displayed in conversation
 */

import { useState, useCallback } from 'react';
import type { BackgroundTask } from '@/components/TaskListView';
import { useTranslation } from '@/i18n/I18nContext';
import { ImagePreview, VideoPlayer } from '@/components/ChatView/MediaPreview';
import {
  SuccessIcon,
  ErrorIcon,
  ToolLoadingSpinner as LoadingSpinner,
} from '@/components/ChatView/ToolCallDisplay';
import { TaskSteps, ChevronIcon } from './TaskSteps';
import { getStatusColor, getTypeIcon, formatDuration, formatETA } from './task-utils';

interface TaskCardProps {
  task: BackgroundTask;
  onCancel?: (taskId: string) => void;
  onViewResult?: (taskId: string) => void;
}

export function TaskCard({ task, onCancel, onViewResult }: TaskCardProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  const isActive = task.status === 'queued' || task.status === 'processing';
  const isCompleted = task.status === 'completed';
  const isFailed = task.status === 'failed' || task.status === 'cancelled';

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const getStatusBgClass = () => {
    if (isCompleted)
      return 'bg-[color-mix(in_srgb,var(--vscode-textBlockQuote-background)_95%,#22c55e)]';
    if (isFailed)
      return 'bg-[color-mix(in_srgb,var(--vscode-textBlockQuote-background)_95%,#ef4444)]';
    if (isActive)
      return 'bg-[color-mix(in_srgb,var(--vscode-textBlockQuote-background)_95%,#3b82f6)]';
    return 'bg-[var(--vscode-textBlockQuote-background)]';
  };

  return (
    <div className="my-1">
      {/* Compact header */}
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] cursor-pointer transition-colors
          ${getStatusBgClass()}
          hover:bg-[var(--vscode-list-hoverBackground)]
          ${isExpanded ? 'rounded-b-none' : ''}
        `}
        onClick={toggleExpand}
      >
        {/* Status indicator */}
        {isActive && (
          <LoadingSpinner className="w-3 h-3 text-[var(--vscode-charts-blue)] shrink-0" />
        )}
        {isCompleted && (
          <SuccessIcon className="w-3 h-3 text-[var(--vscode-charts-green)] shrink-0" />
        )}
        {isFailed && <ErrorIcon className="w-3 h-3 text-[var(--vscode-charts-red)] shrink-0" />}

        {/* Task type icon + name */}
        <span className="shrink-0">{getTypeIcon(task.type)}</span>
        <span className="font-medium text-[var(--vscode-foreground)] truncate">
          {task.type === 'video' ? t('tasks.videoGeneration') : t('tasks.imageGeneration')}
        </span>

        {/* Progress or status */}
        {isActive && (
          <span className="text-[var(--vscode-descriptionForeground)] shrink-0">
            {task.progress}%
          </span>
        )}

        <span className="flex-1" />

        {/* Provider badge */}
        <span className="text-[10px] text-[var(--vscode-descriptionForeground)] shrink-0 hidden sm:inline">
          {task.providerName}
        </span>

        {/* Action buttons */}
        {isActive && onCancel && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCancel(task.id);
            }}
            className="px-1.5 py-0.5 rounded text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors shrink-0"
            title={t('tasks.cancel')}
          >
            ✕
          </button>
        )}

        {isCompleted && onViewResult && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewResult(task.id);
            }}
            className="px-1.5 py-0.5 rounded bg-[var(--vscode-button-secondaryBackground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] text-[var(--vscode-button-secondaryForeground)] transition-colors shrink-0"
            title={t('tasks.viewResult')}
          >
            {t('common.view')}
          </button>
        )}

        <ChevronIcon
          className={`w-3 h-3 text-[var(--vscode-descriptionForeground)] transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
        />
      </div>

      {/* Error message (always show if failed) */}
      {isFailed && task.error && !isExpanded && (
        <div className="px-2 py-1 text-[10px] text-[var(--vscode-charts-red)] bg-[var(--vscode-inputValidation-errorBackground)] rounded-b">
          {task.error}
        </div>
      )}

      {/* Expanded content */}
      {isExpanded && (
        <div className="border border-t-0 border-[var(--vscode-panel-border)] rounded-b bg-[var(--vscode-editor-background)] p-2 text-[10px]">
          {/* Prompt */}
          <div className="text-[var(--vscode-descriptionForeground)] mb-2 line-clamp-2">
            {task.prompt}
          </div>

          {/* Progress Bar (for active tasks) */}
          {isActive && (
            <div className="mb-2">
              <div className="flex items-center justify-between text-[var(--vscode-descriptionForeground)] mb-1">
                <span>{t('tasks.progress')}</span>
                <div className="flex items-center gap-2">
                  <span>{task.progress}%</span>
                  {task.eta && task.eta > 0 && (
                    <span className="text-[var(--vscode-charts-blue)]">
                      ETA: {formatETA(task.eta)}
                    </span>
                  )}
                </div>
              </div>
              <div className="h-1.5 bg-[var(--vscode-progressBar-background)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${task.progress}%`,
                    backgroundColor: getStatusColor(task.status),
                  }}
                />
              </div>
            </div>
          )}

          {/* Task Steps */}
          {task.steps && task.steps.length > 0 && (
            <TaskSteps steps={task.steps} currentStepId={task.currentStepId} />
          )}

          {/* Error message */}
          {isFailed && task.error && (
            <div className="text-[var(--vscode-errorForeground)] bg-[color-mix(in_srgb,var(--vscode-errorForeground)_10%,transparent)] px-2 py-1.5 rounded mb-2">
              ⚠️ {task.error}
            </div>
          )}

          {/* Result preview (for completed tasks) */}
          {isCompleted && task.result && (
            <div className="mb-2">
              {task.type === 'video' && task.result.thumbnailUrl && (
                <VideoPlayer
                  src={task.result.urls?.[0] || task.result.thumbnailUrl}
                  poster={task.result.thumbnailUrl}
                  title={task.name}
                  localPath={task.result.localPaths?.[0]}
                  inline
                />
              )}
              {task.type === 'image' && task.result.thumbnailUrl && (
                <ImagePreview
                  src={task.result.thumbnailUrl}
                  name={task.name}
                  localPath={task.result.localPaths?.[0]}
                  inline
                />
              )}

              {/* Result info badges */}
              <div className="flex flex-wrap gap-1 mt-2">
                {task.result.width && task.result.height && (
                  <span className="px-1.5 py-0.5 bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded">
                    {task.result.width}×{task.result.height}
                  </span>
                )}
                {task.result.duration && (
                  <span className="px-1.5 py-0.5 bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded">
                    {formatDuration(task.result.duration)}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Provider info */}
          <div className="text-[var(--vscode-descriptionForeground)] pt-1 border-t border-[var(--vscode-panel-border)]">
            {t('tasks.provider')}: {task.providerName}
          </div>
        </div>
      )}
    </div>
  );
}
