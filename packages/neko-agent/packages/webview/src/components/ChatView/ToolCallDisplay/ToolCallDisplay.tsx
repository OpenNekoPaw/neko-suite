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
import { SubAgentCard } from '@/components/ChatView/SubAgentCard';
import { getTaskWorkItemById, selectRelatedSubAgentWorkItems } from '@/components/AgentWorkItem';
import { projectToolCallDisplayState } from '@/presenters/tool-call-presenter';
import { getLogger } from '../../../utils/logger';
import { CopyIcon } from '@neko/shared/icons';
import {
  FileIcon,
  ChevronIcon,
  SuccessIcon,
  ErrorIcon,
  WarningIcon,
  ToolLoadingSpinner,
} from './icons';
import { DocumentImageThumbnails } from './DocumentImageThumbnails';

const logger = getLogger('ToolCallDisplay');

interface ToolCallDisplayProps {
  toolCall: ToolCall;
  conversationId: string | null;
  workItemIds?: string[];
}

function ToolCallDisplayComponent({ toolCall, conversationId, workItemIds }: ToolCallDisplayProps) {
  const { t } = useTranslation();
  const { workItems, pluginsAvailable, onCancelTask, onRetryTask, onViewTaskResult } =
    useMessageActions();
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleOpenFile = useCallback((filePath: string) => {
    VSCodeMessages.openFile(filePath);
  }, []);

  const handleCopyText = useCallback((text: string) => {
    void navigator.clipboard.writeText(text);
  }, []);

  const handleConfirm = useCallback(
    (approved: boolean) => {
      logger.info('handleConfirm called:', {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        approved,
        conversationId,
      });
      if (!conversationId) {
        logger.warn('Cannot confirm tool without conversationId');
        return;
      }
      VSCodeMessages.confirmTool(toolCall.id, approved, conversationId);
    },
    [toolCall.id, toolCall.name, conversationId],
  );

  const projection = projectToolCallDisplayState(toolCall);
  const {
    argsJson,
    resultJson,
    hasExpandableContent,
    isBackgroundMode,
    backgroundTaskId,
    isImageTool,
    imageUrls,
    isVideoTool,
    videoUrls,
    isAudioTool,
    audioUrls,
    localPaths,
    documentThumbnails,
    copyText,
    isFileTool,
    filePath,
    summary,
    isPending,
    isSuccess,
    isFailed,
    needsConfirmation,
  } = projection;
  const liveTask = backgroundTaskId
    ? getTaskWorkItemById(workItems, backgroundTaskId)?.task
    : undefined;
  const relatedSubAgents = selectRelatedSubAgentWorkItems({
    toolCallId: toolCall.id,
    toolResultData: toolCall.result?.data,
    workItems,
    workItemIds,
  });

  const toneClass = isFailed ? 'is-danger' : isSuccess ? 'is-success' : isPending ? 'is-info' : '';
  const compactActionClass =
    'inline-flex items-center gap-1 rounded-md border border-[var(--agent-input-border)] bg-[var(--agent-elevated)] px-1.5 py-0.5 text-[10px] text-[var(--agent-fg)] transition-colors hover:bg-[var(--agent-hover)]';

  // Confirmation UI
  if (needsConfirmation) {
    logger.info('Rendering confirmation UI for:', {
      toolCallId: toolCall.id,
      toolName: toolCall.name,
    });
    return (
      <div className="my-2">
        <div className="agent-inline-card is-warning">
          <div className="agent-inline-header flex items-center gap-2 px-3 py-2">
            <WarningIcon className="h-4 w-4 shrink-0 text-[var(--agent-warning-fg)]" />
            <span className="text-[12px] font-medium text-[var(--agent-fg)]">
              Tool Confirmation Required
            </span>
          </div>
          <div className="px-3 py-2 text-[var(--agent-fg)]">
            <div className="mb-2 flex items-center gap-2">
              <span className="agent-badge font-mono text-[11px] text-[var(--agent-fg)]">
                {toolCall.name}
              </span>
              {toolCall.confirmation?.action && (
                <span className="text-[11px] text-[var(--agent-fg-secondary)]">
                  {toolCall.confirmation.action}
                </span>
              )}
            </div>
            {toolCall.confirmation?.description && (
              <p className="mb-2 text-[11px] text-[var(--agent-fg)]">
                {toolCall.confirmation.description}
              </p>
            )}
            {summary && (
              <div className="mb-2 truncate font-mono text-[10px] text-[var(--agent-fg-secondary)]">
                {summary}
              </div>
            )}
            {hasExpandableContent && (
              <div className="mb-2">
                <button
                  onClick={toggleExpand}
                  className="flex items-center gap-1 text-[10px] text-[var(--agent-accent)] hover:underline"
                >
                  <ChevronIcon
                    className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  />
                  {isExpanded ? 'Hide details' : 'Show details'}
                </button>
                {isExpanded && (
                  <div className="mt-1 border-l border-[var(--agent-divider)] pl-2">
                    <pre className="agent-code-block max-h-[100px] w-full max-w-full overflow-x-auto p-1.5 font-mono text-[10px]">
                      {argsJson}
                    </pre>
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-2 border-t border-[var(--agent-divider)] pt-2">
              <button
                onClick={() => handleConfirm(true)}
                className="vscode-button px-3 py-1 text-[11px] leading-4"
              >
                Allow
              </button>
              <button
                onClick={() => handleConfirm(false)}
                className="vscode-button vscode-button-secondary px-3 py-1 text-[11px] leading-4"
              >
                Deny
              </button>
              <span className="flex-1" />
              <span className="text-[10px] text-[var(--agent-fg-secondary)]">
                Press Enter to allow, Esc to deny
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Normal display
  return (
    <div className="my-1">
      <div className={`agent-inline-card ${toneClass}`}>
        {/* Compact single-line header */}
        <div
          className="agent-inline-header flex items-center gap-1.5 px-2 py-1.5 text-[11px] transition-colors"
          onClick={hasExpandableContent ? toggleExpand : undefined}
          role={hasExpandableContent ? 'button' : undefined}
        >
          {isPending && (
            <ToolLoadingSpinner className="h-3 w-3 shrink-0 text-[var(--agent-info)]" />
          )}
          {isSuccess && <SuccessIcon className="h-3 w-3 shrink-0 text-[var(--agent-success)]" />}
          {isFailed && <ErrorIcon className="h-3 w-3 shrink-0 text-[var(--agent-danger)]" />}

          <span className="shrink-0 font-medium text-[var(--agent-fg)]">{toolCall.name}</span>

          {summary && (
            <span className="truncate font-mono text-[10px] text-[var(--agent-fg-secondary)]">
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
              className={compactActionClass}
              title={`Open ${filePath}`}
            >
              <FileIcon className="h-3 w-3" />
              <span>Open</span>
            </button>
          )}

          {copyText && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCopyText(copyText);
              }}
              className={compactActionClass}
              title="Copy result summary"
            >
              <CopyIcon className="h-3 w-3" />
              <span>Copy</span>
            </button>
          )}

          {toolCall.result?.duration && (
            <span className="shrink-0 text-[10px] text-[var(--agent-fg-secondary)]">
              {toolCall.result.duration}ms
            </span>
          )}

          {hasExpandableContent && (
            <ChevronIcon
              className={`h-3 w-3 shrink-0 text-[var(--agent-fg-secondary)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            />
          )}
        </div>

        {/* Error message */}
        {isFailed && toolCall.result?.error && (
          <div className="border-t border-[color-mix(in_srgb,var(--agent-danger)_24%,transparent)] bg-[color-mix(in_srgb,var(--agent-danger)_12%,transparent)] px-2 py-1 text-[10px] text-[var(--agent-danger)]">
            {toolCall.result.error}
          </div>
        )}

        {/* Expanded content */}
        {isExpanded && (
          <div className="border-t border-[var(--agent-divider)] px-3 py-2 text-[10px]">
            {Object.keys(toolCall.arguments).length > 0 && (
              <div className="mb-2">
                <div className="mb-0.5 flex items-center gap-2 text-[var(--agent-fg-secondary)] opacity-80">
                  <span>{t('chat.toolCall.args')}</span>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded border border-[var(--agent-input-border)] px-1 py-0.5 text-[9px] text-[var(--agent-fg)] hover:bg-[var(--agent-hover)]"
                    title="Copy input JSON"
                    onClick={() => handleCopyText(argsJson)}
                  >
                    <CopyIcon className="h-3 w-3" />
                    <span>JSON</span>
                  </button>
                </div>
                <pre className="agent-code-block max-h-[150px] w-full max-w-full overflow-x-auto p-1.5 font-mono">
                  {argsJson}
                </pre>
              </div>
            )}
            {resultJson && (
              <div>
                <div className="mb-0.5 flex items-center gap-2 text-[var(--agent-fg-secondary)] opacity-80">
                  <span>Result</span>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded border border-[var(--agent-input-border)] px-1 py-0.5 text-[9px] text-[var(--agent-fg)] hover:bg-[var(--agent-hover)]"
                    title="Copy output JSON"
                    onClick={() => handleCopyText(resultJson)}
                  >
                    <CopyIcon className="h-3 w-3" />
                    <span>JSON</span>
                  </button>
                </div>
                <pre className="agent-code-block max-h-[150px] w-full max-w-full overflow-x-auto p-1.5 font-mono">
                  {resultJson}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Inline task progress card for background media tasks */}
      {isBackgroundMode && liveTask && (
        <TaskCard
          task={liveTask}
          onCancel={onCancelTask}
          onRetry={onRetryTask}
          onViewResult={onViewTaskResult}
          plugins={pluginsAvailable}
        />
      )}
      {relatedSubAgents.map((item) => (
        <SubAgentCard key={item.id} item={item} />
      ))}

      {documentThumbnails.length > 0 && <DocumentImageThumbnails thumbnails={documentThumbnails} />}

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
