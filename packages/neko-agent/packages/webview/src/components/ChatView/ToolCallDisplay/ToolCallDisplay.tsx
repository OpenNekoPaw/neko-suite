/**
 * ToolCallDisplay - Renders a single tool call with status, summary, and results
 *
 * Routes between confirmation UI and normal display based on tool state.
 * Delegates media extraction and rendering to sub-modules.
 */

import { useState, useCallback, memo } from 'react';
import { ToolCall } from '@/components/types';
import { useTranslation } from '@/i18n/I18nContext';
import { RichContentRenderer } from '@/components/ChatView/RichContent';
import { VSCodeMessages } from '@/components/hooks/useVSCode';
import { useMessageActions } from '@/components/ChatView/MessageActionsContext';
import { TaskCard } from '@/components/ChatView/TaskCard/TaskCard';
import { getLogger } from '../../../utils/logger';
import {
  extractFilePath,
  extractImageUrls,
  extractVideoUrls,
  extractAudioUrls,
  extractLocalPaths,
} from './media-extractors';
import {
  IMAGE_GENERATION_TOOLS,
  VIDEO_GENERATION_TOOLS,
  AUDIO_GENERATION_TOOLS,
  FILE_TOOLS,
  getToolSummary,
} from './tool-constants';
import {
  FileIcon,
  ChevronIcon,
  SuccessIcon,
  ErrorIcon,
  WarningIcon,
  ToolLoadingSpinner,
} from './icons';

const logger = getLogger('ToolCallDisplay');
const vscode = (window as { vscode?: { postMessage: (msg: unknown) => void } }).vscode;

interface ToolCallDisplayProps {
  toolCall: ToolCall;
}

function ToolCallDisplayComponent({ toolCall }: ToolCallDisplayProps) {
  const { t } = useTranslation();
  const { backgroundTasks, onCancelTask, onViewTaskResult } = useMessageActions();
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleOpenFile = useCallback((filePath: string) => {
    vscode?.postMessage({ type: 'openFile', filePath });
  }, []);

  const handleConfirm = useCallback(
    (approved: boolean) => {
      logger.info('handleConfirm called:', {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        approved,
      });
      VSCodeMessages.confirmTool(toolCall.id, approved);
    },
    [toolCall.id, toolCall.name],
  );

  // Serialized data
  const argsJson = JSON.stringify(toolCall.arguments, null, 2);
  const resultJson =
    toolCall.result?.data !== undefined ? JSON.stringify(toolCall.result.data, null, 2) : null;

  const hasExpandableContent =
    Object.keys(toolCall.arguments).length > 0 || (resultJson !== null && resultJson.length > 0);

  // Background task mode detection
  const resultData = toolCall.result?.data as Record<string, unknown> | undefined;
  const isBackgroundMode = resultData?.backgroundMode === true;
  const backgroundTaskStatus = resultData?.status as string | undefined;
  const isBackgroundTaskCompleted = isBackgroundMode && backgroundTaskStatus === 'completed';
  const shouldShowMediaPreview = !isBackgroundMode || isBackgroundTaskCompleted;

  // Look up live task for inline TaskCard progress
  const backgroundTaskId = isBackgroundMode
    ? (resultData?.taskId as string | undefined)
    : undefined;
  const liveTask = backgroundTaskId
    ? backgroundTasks?.find((t) => t.id === backgroundTaskId)
    : undefined;

  // Media extraction
  const isImageTool = IMAGE_GENERATION_TOOLS.includes(toolCall.name);
  const imageUrls =
    toolCall.result?.success && shouldShowMediaPreview
      ? extractImageUrls(toolCall.result.data)
      : [];

  const isVideoTool = VIDEO_GENERATION_TOOLS.includes(toolCall.name);
  const videoUrls =
    toolCall.result?.success && shouldShowMediaPreview
      ? extractVideoUrls(toolCall.result.data)
      : [];

  const isAudioTool = AUDIO_GENERATION_TOOLS.includes(toolCall.name);
  const audioUrls =
    toolCall.result?.success && shouldShowMediaPreview
      ? extractAudioUrls(toolCall.result.data)
      : [];

  const localPaths = toolCall.result?.success ? extractLocalPaths(toolCall.result.data) : [];

  // File tool detection
  const isFileTool = FILE_TOOLS.includes(toolCall.name);
  const filePath = extractFilePath(toolCall.arguments) || extractFilePath(toolCall.result?.data);

  // Summary and status
  const summary = getToolSummary(toolCall.name, toolCall.arguments);
  const isPending = !toolCall.result;
  const isSuccess = toolCall.result?.success === true;
  const isFailed = toolCall.result?.success === false;
  const needsConfirmation = toolCall.pendingConfirmation === true;

  // Confirmation UI
  if (needsConfirmation) {
    logger.info('Rendering confirmation UI for:', {
      toolCallId: toolCall.id,
      toolName: toolCall.name,
    });
    return (
      <div className="my-2 border border-[var(--vscode-inputValidation-warningBorder)] rounded-md overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-[var(--vscode-inputValidation-warningBackground)]">
          <WarningIcon className="w-4 h-4 text-[var(--vscode-inputValidation-warningBorder)] shrink-0" />
          <span className="font-medium text-[12px] text-[var(--vscode-foreground)]">
            Tool Confirmation Required
          </span>
        </div>
        <div className="px-3 py-2 bg-[var(--vscode-editor-background)]">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono text-[11px] px-1.5 py-0.5 bg-[var(--vscode-textBlockQuote-background)] rounded">
              {toolCall.name}
            </span>
            {toolCall.confirmation?.action && (
              <span className="text-[11px] text-[var(--vscode-descriptionForeground)]">
                {toolCall.confirmation.action}
              </span>
            )}
          </div>
          {toolCall.confirmation?.description && (
            <p className="text-[11px] text-[var(--vscode-foreground)] mb-2">
              {toolCall.confirmation.description}
            </p>
          )}
          {summary && (
            <div className="text-[10px] font-mono text-[var(--vscode-descriptionForeground)] mb-2 truncate">
              {summary}
            </div>
          )}
          {hasExpandableContent && (
            <div className="mb-2">
              <button
                onClick={toggleExpand}
                className="flex items-center gap-1 text-[10px] text-[var(--vscode-textLink-foreground)] hover:underline"
              >
                <ChevronIcon
                  className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                />
                {isExpanded ? 'Hide details' : 'Show details'}
              </button>
              {isExpanded && (
                <div className="mt-1 pl-2 border-l border-[var(--vscode-panel-border)]">
                  <pre className="p-1.5 bg-[var(--vscode-textBlockQuote-background)] rounded overflow-x-auto font-mono text-[10px] max-h-[100px] w-full max-w-full">
                    {argsJson}
                  </pre>
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 pt-2 border-t border-[var(--vscode-panel-border)]">
            <button
              onClick={() => handleConfirm(true)}
              className="px-3 py-1 text-[11px] font-medium rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] transition-colors"
            >
              Allow
            </button>
            <button
              onClick={() => handleConfirm(false)}
              className="px-3 py-1 text-[11px] font-medium rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] transition-colors"
            >
              Deny
            </button>
            <span className="flex-1" />
            <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
              Press Enter to allow, Esc to deny
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Normal display
  return (
    <div className="my-1">
      {/* Compact single-line header */}
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] cursor-pointer transition-colors
          ${isPending ? 'bg-[var(--vscode-textBlockQuote-background)]' : ''}
          ${isSuccess ? 'bg-[color-mix(in_srgb,var(--vscode-textBlockQuote-background)_95%,#22c55e)]' : ''}
          ${isFailed ? 'bg-[color-mix(in_srgb,var(--vscode-textBlockQuote-background)_95%,#ef4444)]' : ''}
          hover:bg-[var(--vscode-list-hoverBackground)]
        `}
        onClick={hasExpandableContent ? toggleExpand : undefined}
      >
        {isPending && (
          <ToolLoadingSpinner className="w-3 h-3 text-[var(--vscode-textLink-foreground)] shrink-0" />
        )}
        {isSuccess && (
          <SuccessIcon className="w-3 h-3 text-[var(--vscode-charts-green)] shrink-0" />
        )}
        {isFailed && <ErrorIcon className="w-3 h-3 text-[var(--vscode-charts-red)] shrink-0" />}

        <span className="font-medium text-[var(--vscode-foreground)] shrink-0">
          {toolCall.name}
        </span>

        {summary && (
          <span className="text-[var(--vscode-descriptionForeground)] font-mono truncate">
            {summary}
          </span>
        )}
        <span className="flex-1" />

        {isFileTool && filePath && isSuccess && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleOpenFile(filePath);
            }}
            className="px-1.5 py-0.5 rounded bg-[var(--vscode-button-secondaryBackground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] text-[var(--vscode-button-secondaryForeground)] transition-colors flex items-center gap-1 shrink-0"
            title={`Open ${filePath}`}
          >
            <FileIcon className="w-3 h-3" />
            <span>Open</span>
          </button>
        )}

        {toolCall.result?.duration && (
          <span className="text-[var(--vscode-descriptionForeground)] text-[10px] shrink-0">
            {toolCall.result.duration}ms
          </span>
        )}

        {hasExpandableContent && (
          <ChevronIcon
            className={`w-3 h-3 text-[var(--vscode-descriptionForeground)] transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
          />
        )}
      </div>

      {/* Error message */}
      {isFailed && toolCall.result?.error && (
        <div className="px-2 py-1 text-[10px] text-[var(--vscode-charts-red)] bg-[var(--vscode-inputValidation-errorBackground)]">
          {toolCall.result.error}
        </div>
      )}

      {/* Expanded content */}
      {isExpanded && (
        <div className="mt-1 ml-4 pl-2 border-l border-[var(--vscode-panel-border)] text-[10px]">
          {Object.keys(toolCall.arguments).length > 0 && (
            <div className="mb-2">
              <div className="text-[var(--vscode-descriptionForeground)] opacity-70 mb-0.5">
                {t('chat.toolCall.args')}
              </div>
              <pre className="p-1.5 bg-[var(--vscode-editor-background)] rounded overflow-x-auto font-mono border border-[var(--vscode-panel-border)] max-h-[150px] w-full max-w-full">
                {argsJson}
              </pre>
            </div>
          )}
          {resultJson && (
            <div>
              <div className="text-[var(--vscode-descriptionForeground)] opacity-70 mb-0.5">
                Result
              </div>
              <pre className="p-1.5 bg-[var(--vscode-editor-background)] rounded overflow-x-auto font-mono border border-[var(--vscode-panel-border)] max-h-[150px] w-full max-w-full">
                {resultJson}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Inline task progress card for background media tasks */}
      {isBackgroundMode && liveTask && (
        <TaskCard task={liveTask} onCancel={onCancelTask} onViewResult={onViewTaskResult} />
      )}

      {/* Media previews — registry-driven rendering (ADR-6 §6.2) */}
      {isImageTool && imageUrls.length > 0 && (
        <div className="mt-2 space-y-2">
          {imageUrls.map((url, index) => (
            <RichContentRenderer
              key={index}
              kind="image"
              data={{
                src: url,
                alt: `Generated image ${index + 1}`,
                name: `generated_${index + 1}.png`,
                localPath: localPaths[index] || localPaths[0],
              }}
            />
          ))}
        </div>
      )}
      {isVideoTool && videoUrls.length > 0 && (
        <div className="mt-2 space-y-2">
          {videoUrls.map((url, index) => (
            <RichContentRenderer
              key={index}
              kind="video"
              data={{
                src: url,
                title: `generated_${index + 1}.mp4`,
                localPath: localPaths[index] || localPaths[0],
              }}
            />
          ))}
        </div>
      )}
      {isAudioTool && audioUrls.length > 0 && (
        <div className="mt-2 space-y-2">
          {audioUrls.map((url, index) => (
            <RichContentRenderer
              key={index}
              kind="audio"
              data={{
                src: url,
                title: `generated_${index + 1}.mp3`,
                localPath: localPaths[index] || localPaths[0],
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export const ToolCallDisplay = memo(ToolCallDisplayComponent);
