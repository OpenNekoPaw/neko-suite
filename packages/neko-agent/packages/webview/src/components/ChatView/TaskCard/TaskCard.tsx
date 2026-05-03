/**
 * TaskCard - Inline task status card displayed in conversation
 *
 * ADR-3: Enhanced with multi-image grid (ImageGridCard) and
 * cross-plugin "Send to" buttons (SendToMenu, ADR-5 P0).
 */

import { useState, useCallback } from 'react';
import { VSCodeMessages } from '@/messages';
import type { BackgroundTask } from '@/components/TaskListView';
import { useTranslation } from '@/i18n/I18nContext';
import { RichContentRenderer } from '@/components/ChatView/RichContent';
import { SendToMenu, type PluginsAvailable } from '@/components/ChatView/SendToMenu';
import {
  type AgentWorkItemStatusTone,
  projectBackgroundTaskCard,
  projectBackgroundTaskResultContent,
} from '@/presenters/work-item-presenter';
import {
  SuccessIcon,
  ErrorIcon,
  ToolLoadingSpinner as LoadingSpinner,
} from '@/components/ChatView/ToolCallDisplay';
import { TaskSteps, ChevronIcon } from './TaskSteps';
import { getToneColor, getTypeIcon, formatDuration, formatETA } from './task-utils';

interface TaskCardProps {
  task: BackgroundTask;
  onCancel?: (taskId: string) => void;
  onRetry?: (taskId: string) => void;
  onViewResult?: (taskId: string) => void;
  /** Available neko-suite plugins for "Send to" buttons (ADR-5) */
  plugins?: PluginsAvailable;
}

const compactActionClass =
  'inline-flex items-center gap-1 rounded-md border border-[var(--agent-input-border)] bg-[var(--agent-elevated)] px-1.5 py-0.5 text-[10px] text-[var(--agent-fg)] transition-colors hover:bg-[var(--agent-hover)]';

export function TaskCard({ task, onCancel, onRetry, onViewResult, plugins }: TaskCardProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  const projection = projectBackgroundTaskCard(task);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);
  const toneClass = toInlineToneClass(projection.tone);

  return (
    <div className="my-1">
      <div className={`agent-inline-card ${toneClass}`}>
        {/* Compact header */}
        <div
          className="agent-inline-header flex cursor-pointer items-center gap-1.5 px-2 py-1.5 text-[11px]"
          onClick={toggleExpand}
        >
          {/* Status indicator */}
          {projection.status.isActive && (
            <LoadingSpinner className="h-3 w-3 shrink-0 text-[var(--agent-info)]" />
          )}
          {projection.status.isCompleted && (
            <SuccessIcon className="h-3 w-3 shrink-0 text-[var(--agent-success)]" />
          )}
          {projection.status.isFailed && (
            <ErrorIcon className="h-3 w-3 shrink-0 text-[var(--agent-danger)]" />
          )}

          {/* Task type icon + name */}
          <span className="shrink-0">{getTypeIcon(projection.taskType)}</span>
          <span className="truncate font-medium text-[var(--agent-fg)]">
            {t(projection.titleKey)}
          </span>

          {/* Progress or status */}
          {projection.progressLabel && (
            <span className="shrink-0 text-[var(--agent-fg-secondary)]">
              {projection.progressLabel}
            </span>
          )}

          <span className="flex-1" />

          {/* Provider badge */}
          <span className="agent-badge hidden shrink-0 text-[10px] sm:inline-flex">
            {projection.providerName}
          </span>

          {/* Action buttons */}
          {projection.showCancel && onCancel && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCancel(task.id);
              }}
              className="agent-danger-link rounded-md px-1.5 py-0.5 text-[10px] shrink-0"
              title={t('tasks.cancel')}
            >
              ✕
            </button>
          )}

          {projection.showRetry && onRetry && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRetry(task.id);
              }}
              className={compactActionClass}
              title={t('tasks.retry')}
            >
              ↻
            </button>
          )}

          {projection.showViewResult && onViewResult && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onViewResult(task.id);
              }}
              className={compactActionClass}
              title={t('tasks.viewResult')}
            >
              {t('common.view')}
            </button>
          )}

          <ChevronIcon
            className={`h-3 w-3 shrink-0 text-[var(--agent-fg-secondary)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          />
        </div>

        {/* Error message (always show if failed) */}
        {projection.showCollapsedError && task.error && !isExpanded && (
          <div className="border-t border-[color-mix(in_srgb,var(--agent-danger)_24%,transparent)] bg-[color-mix(in_srgb,var(--agent-danger)_12%,transparent)] px-2 py-1 text-[10px] text-[var(--agent-danger)]">
            {task.error}
          </div>
        )}

        {/* Expanded content */}
        {isExpanded && (
          <div className="border-t border-[var(--agent-divider)] p-2 text-[10px] text-[var(--agent-fg)]">
            {/* Prompt */}
            <div className="mb-2 line-clamp-2 text-[var(--agent-fg-secondary)]">{task.prompt}</div>

            {/* Progress Bar (for active tasks) */}
            {projection.showProgressBar && (
              <div className="mb-2">
                {projection.showProgressLabel && (
                  <div className="mb-1 flex items-center justify-between text-[var(--agent-fg-secondary)]">
                    <span>{t('tasks.progress')}</span>
                    <div className="flex items-center gap-2">
                      <span>{projection.progressLabel}</span>
                      {projection.showEta && projection.etaSeconds !== null && (
                        <span className="text-[var(--agent-info)]">
                          ETA: {formatETA(projection.etaSeconds)}
                        </span>
                      )}
                    </div>
                  </div>
                )}
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--agent-input-bg)]">
                  {!projection.useIndeterminateProgress ? (
                    <div
                      className="h-full rounded-full transition-all duration-500 ease-out"
                      style={{
                        width: `${projection.progressBarPercent}%`,
                        backgroundColor: getToneColor(projection.tone),
                      }}
                    />
                  ) : (
                    // Indeterminate animation for models without progress reporting
                    <div
                      className="h-full w-1/3 animate-[indeterminate_1.5s_ease-in-out_infinite] rounded-full"
                      style={{ backgroundColor: getToneColor(projection.tone) }}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Task Steps */}
            {projection.showSteps && task.steps && (
              <TaskSteps steps={task.steps} currentStepId={task.currentStepId} />
            )}

            {/* Error message */}
            {projection.showExpandedError && task.error && (
              <div className="mb-2 rounded-md bg-[color-mix(in_srgb,var(--agent-danger)_12%,transparent)] px-2 py-1.5 text-[var(--agent-danger)]">
                ⚠️ {task.error}
              </div>
            )}

            {/* Result preview (for completed tasks) — ADR-3 enhanced */}
            {projection.showResultPreview && <ResultPreview task={task} plugins={plugins} />}

            {/* Provider info */}
            <div className="border-t border-[var(--agent-divider)] pt-1 text-[var(--agent-fg-secondary)]">
              {t('tasks.provider')}: {task.providerName}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function toInlineToneClass(tone: AgentWorkItemStatusTone): string {
  if (tone === 'success') return 'is-success';
  if (tone === 'danger') return 'is-danger';
  if (tone === 'info') return 'is-info';
  return '';
}

// ---------------------------------------------------------------------------
// ResultPreview - Completed task result display (ADR-3/4 enhanced)
//
// When `result.assets` (GeneratedAsset[]) is available, uses asset metadata
// (webviewUri, width, height, duration, path) as the authoritative source.
// Otherwise uses protocol-level `result.urls / localPaths`.
// ---------------------------------------------------------------------------

function ResultPreview({ task, plugins }: { task: BackgroundTask; plugins?: PluginsAvailable }) {
  const { t } = useTranslation();
  const projection = projectBackgroundTaskResultContent(task);
  const {
    contentKind,
    contentData,
    displayWidth,
    displayHeight,
    displayDuration,
    firstLocalPath,
    mediaType,
  } = projection;

  return (
    <div className="mb-2">
      {/* Media result — registry-driven rendering (ADR-6 §6.2) */}
      {contentKind && contentData && (
        <RichContentRenderer kind={contentKind} data={contentData} inline />
      )}

      {/* Result info badges + download */}
      <div className="flex flex-wrap items-center gap-1 mt-2">
        {displayWidth && displayHeight && (
          <span className="agent-badge text-[10px] text-[var(--agent-fg)]">
            {displayWidth}×{displayHeight}
          </span>
        )}
        {displayDuration && displayDuration > 0 && (
          <span className="agent-badge text-[10px] text-[var(--agent-fg)]">
            {formatDuration(displayDuration)}
          </span>
        )}
        <span className="flex-1" />
        {firstLocalPath && (
          <span
            className="max-w-[140px] truncate text-xs text-[var(--agent-fg-secondary)]"
            title={firstLocalPath}
          >
            {firstLocalPath.split(/[\\/]/).pop()}
          </span>
        )}
        {firstLocalPath && (
          <button
            onClick={() => {
              VSCodeMessages.revealFile(firstLocalPath);
            }}
            className={compactActionClass}
            title={t('tasks.revealInExplorer')}
          >
            <DownloadIcon className="h-3 w-3" />
            <span>{t('tasks.revealInExplorer')}</span>
          </button>
        )}
      </div>

      {/* "Send to" cross-plugin buttons (ADR-5 P0) */}
      {firstLocalPath && plugins && (
        <SendToMenu
          assetPath={firstLocalPath}
          mediaType={mediaType}
          plugins={plugins}
          className="mt-1.5"
        />
      )}
    </div>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
      />
    </svg>
  );
}
