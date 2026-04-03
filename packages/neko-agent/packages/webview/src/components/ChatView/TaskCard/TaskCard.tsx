/**
 * TaskCard - Inline task status card displayed in conversation
 *
 * ADR-3: Enhanced with multi-image grid (ImageGridCard) and
 * cross-plugin "Send to" buttons (SendToMenu, ADR-5 P0).
 */

import { useState, useCallback } from 'react';

const vscode = (window as { vscode?: { postMessage: (msg: unknown) => void } }).vscode;
import type { BackgroundTask } from '@/components/TaskListView';
import { useTranslation } from '@/i18n/I18nContext';
import { RichContentRenderer } from '@/components/ChatView/RichContent';
import { SendToMenu, type PluginsAvailable } from '@/components/ChatView/SendToMenu';
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
  /** Available neko-suite plugins for "Send to" buttons (ADR-5) */
  plugins?: PluginsAvailable;
}

export function TaskCard({ task, onCancel, onViewResult, plugins }: TaskCardProps) {
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
          {task.type === 'video'
            ? t('tasks.videoGeneration')
            : task.type === 'audio'
              ? t('tasks.audioGeneration')
              : t('tasks.imageGeneration')}
        </span>

        {/* Progress or status */}
        {isActive && task.progress > 0 && (
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

        {isFailed && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              vscode?.postMessage({ type: 'retryTask', taskId: task.id });
            }}
            className="px-1.5 py-0.5 rounded bg-[var(--vscode-button-secondaryBackground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] text-[var(--vscode-button-secondaryForeground)] transition-colors shrink-0"
            title={t('tasks.retry')}
          >
            ↻
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
              {task.progress > 0 && (
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
              )}
              <div className="h-1.5 bg-[var(--vscode-progressBar-background)] rounded-full overflow-hidden">
                {task.progress > 0 ? (
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${task.progress}%`,
                      backgroundColor: getStatusColor(task.status),
                    }}
                  />
                ) : (
                  // Indeterminate animation for models without progress reporting
                  <div
                    className="h-full w-1/3 rounded-full animate-[indeterminate_1.5s_ease-in-out_infinite]"
                    style={{ backgroundColor: getStatusColor(task.status) }}
                  />
                )}
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

          {/* Result preview (for completed tasks) — ADR-3 enhanced */}
          {isCompleted && task.result && <ResultPreview task={task} plugins={plugins} />}

          {/* Provider info */}
          <div className="text-[var(--vscode-descriptionForeground)] pt-1 border-t border-[var(--vscode-panel-border)]">
            {t('tasks.provider')}: {task.providerName}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ResultPreview - Completed task result display (ADR-3/4 enhanced)
//
// When `result.assets` (GeneratedAsset[]) is available, uses asset metadata
// (webviewUri, width, height, duration, path) as the authoritative source.
// Falls back to legacy `result.urls / localPaths` for backward compatibility.
// ---------------------------------------------------------------------------

function ResultPreview({ task, plugins }: { task: BackgroundTask; plugins?: PluginsAvailable }) {
  const { t } = useTranslation();
  const result = task.result!;
  const assets = result.assets;

  // Derive display data: prefer assets, fall back to legacy fields
  const displayUrls = assets && assets.length > 0 ? assets.map((a) => a.webviewUri) : result.urls;
  const displayLocalPaths =
    assets && assets.length > 0 ? assets.map((a) => a.path) : result.localPaths;
  const firstLocalPath = displayLocalPaths?.[0];

  // Extract dimension/duration from first asset if available
  const firstAsset = assets?.[0];
  const displayWidth =
    firstAsset && 'width' in firstAsset ? (firstAsset as { width: number }).width : result.width;
  const displayHeight =
    firstAsset && 'height' in firstAsset
      ? (firstAsset as { height: number }).height
      : result.height;
  const displayDuration =
    firstAsset && 'duration' in firstAsset
      ? (firstAsset as { duration: number }).duration
      : result.duration;

  // Derive RichContent kind + data from task type and display URLs (ADR-6 §6.2)
  const { contentKind, contentData } = deriveRichContent(
    task,
    displayUrls,
    displayLocalPaths,
    result.thumbnailUrl,
  );

  return (
    <div className="mb-2">
      {/* Media result — registry-driven rendering (ADR-6 §6.2) */}
      {contentKind && contentData && (
        <RichContentRenderer kind={contentKind} data={contentData} inline />
      )}

      {/* Result info badges + download */}
      <div className="flex flex-wrap items-center gap-1 mt-2">
        {displayWidth && displayHeight && (
          <span className="px-1.5 py-0.5 bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded">
            {displayWidth}×{displayHeight}
          </span>
        )}
        {displayDuration && displayDuration > 0 && (
          <span className="px-1.5 py-0.5 bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded">
            {formatDuration(displayDuration)}
          </span>
        )}
        <span className="flex-1" />
        {firstLocalPath && (
          <span
            className="text-[var(--vscode-descriptionForeground)] text-xs truncate max-w-[140px]"
            title={firstLocalPath}
          >
            {firstLocalPath.split(/[\\/]/).pop()}
          </span>
        )}
        {firstLocalPath && (
          <button
            onClick={() => {
              vscode?.postMessage({
                type: 'revealFile',
                filePath: firstLocalPath,
              });
            }}
            className="px-1.5 py-0.5 rounded bg-[var(--vscode-button-secondaryBackground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] text-[var(--vscode-button-secondaryForeground)] transition-colors flex items-center gap-1"
            title={t('tasks.revealInExplorer')}
          >
            <DownloadIcon className="w-3 h-3" />
            <span>{t('tasks.revealInExplorer')}</span>
          </button>
        )}
      </div>

      {/* "Send to" cross-plugin buttons (ADR-5 P0) */}
      {firstLocalPath && plugins && (
        <SendToMenu
          assetPath={firstLocalPath}
          mediaType={task.type === 'video' ? 'video' : task.type === 'audio' ? 'audio' : 'image'}
          plugins={plugins}
          className="mt-1.5"
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: derive RichContent kind + data payload from BackgroundTask
// ---------------------------------------------------------------------------

function deriveRichContent(
  task: BackgroundTask,
  displayUrls: string[] | undefined,
  displayLocalPaths: string[] | undefined,
  thumbnailUrl: string | undefined,
): { contentKind: string | null; contentData: Record<string, unknown> | null } {
  const firstUrl = displayUrls?.[0];
  const firstLocalPath = displayLocalPaths?.[0];

  switch (task.type) {
    case 'video':
      if (!firstUrl) return { contentKind: null, contentData: null };
      return {
        contentKind: 'video',
        contentData: {
          src: firstUrl,
          poster: thumbnailUrl,
          title: task.name,
          localPath: firstLocalPath,
        },
      };

    case 'audio':
      if (!firstUrl) return { contentKind: null, contentData: null };
      return {
        contentKind: 'audio',
        contentData: { src: firstUrl, title: task.name, localPath: firstLocalPath },
      };

    case 'image': {
      if (displayUrls && displayUrls.length > 1) {
        return {
          contentKind: 'image-grid',
          contentData: { urls: displayUrls, localPaths: displayLocalPaths, name: task.name },
        };
      }
      const imgSrc = thumbnailUrl || firstUrl;
      if (!imgSrc) return { contentKind: null, contentData: null };
      return {
        contentKind: 'image',
        contentData: { src: imgSrc, name: task.name, localPath: firstLocalPath },
      };
    }

    default:
      return { contentKind: null, contentData: null };
  }
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
