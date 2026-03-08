/**
 * TaskCard - 内联任务状态卡片
 * 在对话中显示后台任务的实时状态
 */

import { useState, useCallback } from 'react';
import { BackgroundTask, TaskStatus, TaskType, TaskStep, TaskStepStatus } from '@/components/TaskListView';
import { useTranslation } from '@/i18n/I18nContext';
import { ImagePreview, VideoPlayer } from '@/components/ChatView/MediaPreview';
import { SuccessIcon, ErrorIcon, ToolLoadingSpinner as LoadingSpinner } from '@/components/ChatView/ToolCallDisplay';

interface TaskCardProps {
  task: BackgroundTask;
  onCancel?: (taskId: string) => void;
  onViewResult?: (taskId: string) => void;
}

// =============================================================================
// 辅助函数
// =============================================================================

function getStatusColor(status: TaskStatus): string {
  switch (status) {
    case 'queued': return 'var(--vscode-charts-yellow, #cca700)';
    case 'processing': return 'var(--vscode-charts-blue, #3794ff)';
    case 'completed': return 'var(--vscode-charts-green, #89d185)';
    case 'failed': return 'var(--vscode-charts-red, #f14c4c)';
    case 'cancelled': return 'var(--vscode-descriptionForeground)';
    default: return 'var(--vscode-foreground)';
  }
}

function getTypeIcon(type: TaskType): string {
  return type === 'video' ? '🎬' : '🖼️';
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function formatETA(seconds?: number): string {
  if (!seconds || seconds <= 0) return '';
  if (seconds < 60) return `~${Math.ceil(seconds)}s`;
  const mins = Math.ceil(seconds / 60);
  return `~${mins}m`;
}

function getStepStatusIcon(status: TaskStepStatus): string {
  switch (status) {
    case 'completed': return '✓';
    case 'running': return '●';
    case 'failed': return '✗';
    default: return '○';
  }
}

function getStepStatusColor(status: TaskStepStatus): string {
  switch (status) {
    case 'completed': return 'var(--vscode-charts-green, #89d185)';
    case 'running': return 'var(--vscode-charts-blue, #3794ff)';
    case 'failed': return 'var(--vscode-charts-red, #f14c4c)';
    default: return 'var(--vscode-descriptionForeground)';
  }
}

// =============================================================================
// TaskSteps 子组件
// =============================================================================

interface TaskStepsProps {
  steps: TaskStep[];
  currentStepId?: string;
}

function TaskSteps({ steps, currentStepId }: TaskStepsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpand = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  if (!steps || steps.length === 0) return null;

  const currentStepIndex = steps.findIndex(s => s.id === currentStepId);
  const completedSteps = steps.filter(s => s.status === 'completed').length;

  return (
    <div className="mb-2">
      {/* Steps header */}
      <button
        onClick={toggleExpand}
        className="w-full flex items-center gap-2 text-[10px] text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] transition-colors"
      >
        <ChevronIcon className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        <span>Steps: {completedSteps}/{steps.length}</span>
        {currentStepId && currentStepIndex >= 0 && (
          <span className="text-[var(--vscode-foreground)]">
            - {steps[currentStepIndex].name}
          </span>
        )}
      </button>

      {/* Steps list (expanded) */}
      {isExpanded && (
        <div className="mt-2 pl-2 border-l-2 border-[var(--vscode-panel-border)] space-y-1">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`flex items-start gap-2 text-[10px] ${
                step.id === currentStepId ? 'text-[var(--vscode-foreground)]' : 'text-[var(--vscode-descriptionForeground)]'
              }`}
            >
              {/* Status icon */}
              <span
                className={`flex-shrink-0 ${step.status === 'running' ? 'animate-pulse' : ''}`}
                style={{ color: getStepStatusColor(step.status) }}
              >
                {getStepStatusIcon(step.status)}
              </span>

              {/* Step info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{index + 1}. {step.name}</span>
                  {step.startTime && step.endTime && (
                    <span className="text-[var(--vscode-descriptionForeground)]">
                      ({formatDuration(Math.round((step.endTime - step.startTime) / 1000))})
                    </span>
                  )}
                </div>
                {step.message && (
                  <div className="text-[var(--vscode-descriptionForeground)] truncate">
                    {step.message}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Chevron icon for steps
function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

// =============================================================================
// 主组件 - 与 ToolCallDisplay 样式一致
// =============================================================================

export function TaskCard({ task, onCancel, onViewResult }: TaskCardProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  const isActive = task.status === 'queued' || task.status === 'processing';
  const isCompleted = task.status === 'completed';
  const isFailed = task.status === 'failed' || task.status === 'cancelled';

  const toggleExpand = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  // Get status background color
  const getStatusBgClass = () => {
    if (isCompleted) return 'bg-[color-mix(in_srgb,var(--vscode-textBlockQuote-background)_95%,#22c55e)]';
    if (isFailed) return 'bg-[color-mix(in_srgb,var(--vscode-textBlockQuote-background)_95%,#ef4444)]';
    if (isActive) return 'bg-[color-mix(in_srgb,var(--vscode-textBlockQuote-background)_95%,#3b82f6)]';
    return 'bg-[var(--vscode-textBlockQuote-background)]';
  };

  return (
    <div className="my-1">
      {/* Compact header - matches ToolCallDisplay style */}
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] cursor-pointer transition-colors
          ${getStatusBgClass()}
          hover:bg-[var(--vscode-list-hoverBackground)]
          ${isExpanded ? 'rounded-b-none' : ''}
        `}
        onClick={toggleExpand}
      >
        {/* Status indicator */}
        {isActive && <LoadingSpinner className="w-3 h-3 text-[var(--vscode-charts-blue)] shrink-0" />}
        {isCompleted && <SuccessIcon className="w-3 h-3 text-[var(--vscode-charts-green)] shrink-0" />}
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

        {/* Spacer */}
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

        {/* Expand indicator */}
        <ChevronIcon className={`w-3 h-3 text-[var(--vscode-descriptionForeground)] transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
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

// Icons imported from ToolCallDisplay/icons.tsx: SuccessIcon, ErrorIcon, LoadingSpinner

/**
 * Mini version for compact display
 */
export function TaskCardMini({ task, onViewResult }: TaskCardProps) {
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
        <span className="text-[var(--vscode-textLink-foreground)]">→</span>
      )}
    </div>
  );
}

// =============================================================================
// 批量任务卡片
// =============================================================================

interface BatchTaskCardProps {
  tasks: BackgroundTask[];
  onCancel?: (taskId: string) => void;
  onCancelAll?: () => void;
  onViewResult?: (taskId: string) => void;
}

/**
 * 批量任务卡片 - 紧凑显示多个任务
 */
export function BatchTaskCard({ tasks, onCancel: _onCancel, onCancelAll, onViewResult }: BatchTaskCardProps) {
  const { t } = useTranslation();

  if (tasks.length === 0) return null;

  // 统计各状态数量
  const stats = {
    queued: tasks.filter(t => t.status === 'queued').length,
    processing: tasks.filter(t => t.status === 'processing').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    failed: tasks.filter(t => t.status === 'failed' || t.status === 'cancelled').length,
  };

  const totalProgress = Math.round(
    tasks.reduce((sum, t) => sum + t.progress, 0) / tasks.length
  );

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
                backgroundColor: 'color-mix(in srgb, var(--vscode-charts-green, #89d185) 20%, transparent)',
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
                backgroundColor: 'color-mix(in srgb, var(--vscode-charts-blue, #3794ff) 20%, transparent)',
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
                backgroundColor: 'color-mix(in srgb, var(--vscode-charts-yellow, #cca700) 20%, transparent)',
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
                backgroundColor: 'color-mix(in srgb, var(--vscode-charts-red, #f14c4c) 20%, transparent)',
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
                #{index + 1}: {task.prompt.slice(0, 40)}{task.prompt.length > 40 ? '...' : ''}
              </span>
              <span className="flex-shrink-0" style={{ color: getStatusColor(task.status) }}>
                {task.status === 'completed' ? '✓' : task.status === 'failed' ? '✗' : `${task.progress}%`}
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
