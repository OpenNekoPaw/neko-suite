import { memo } from 'react';
import { Message, MessageAttachment, ContentBlock } from '@/components/types';
import { ToolCallDisplay } from '@/components/ChatView/ToolCallDisplay';
import { DiffBlock } from '@/components/ChatView/DiffBlock';
import { PlanReview } from '@/components/ChatView/PlanReview';
import { TaskCard, BatchTaskCard } from '@/components/ChatView/TaskCard';
import { MessageActions } from '@/components/ChatView/MessageActions';
import { BackgroundTask } from '@/components/TaskListView';
import { MarkdownRenderer, ThinkingBlock } from '@/components/ChatView/MessageContent';
import { ImagePreview, AudioPlayer, VideoPlayer } from '@/components/ChatView/MediaPreview';
import { useMessageActions } from '@/components/ChatView/MessageActionsContext';

interface MessageItemProps {
  message: Message;
  // Background tasks for inline task cards
  backgroundTasks?: BackgroundTask[];
  // P2: Message operations
  onEditMessage?: (messageId: string) => void;
  onResendFrom?: (messageId: string) => void;
  onFeedback?: (messageId: string, feedback: 'positive' | 'negative') => void;
  // Layout options
  showAvatar?: boolean;
  isGrouped?: boolean;
}

// Format timestamp
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// User avatar component - compact size (20px)
function UserAvatar() {
  return (
    <div className="w-5 h-5 rounded-full bg-[var(--vscode-button-background)] flex items-center justify-center flex-shrink-0">
      <svg
        className="w-3 h-3 text-[var(--vscode-button-foreground)]"
        fill="currentColor"
        viewBox="0 0 24 24"
      >
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
      </svg>
    </div>
  );
}

// Assistant avatar component - compact size (20px)
function AssistantAvatar() {
  return (
    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[var(--vscode-charts-purple)] to-[var(--vscode-charts-blue)] flex items-center justify-center flex-shrink-0">
      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
      </svg>
    </div>
  );
}

// Format file size
function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Attachment preview component
function AttachmentDisplay({ attachment }: { attachment: MessageAttachment }) {
  // Image preview with fullscreen modal
  if (attachment.type === 'image' && attachment.preview) {
    return <ImagePreview src={attachment.preview} alt={attachment.name} className="mt-1" />;
  }

  // Audio player
  if (attachment.type === 'audio' && attachment.preview) {
    return (
      <AudioPlayer
        src={attachment.preview}
        title={attachment.name}
        className="mt-1 w-full max-w-[400px]"
      />
    );
  }

  // Video player
  if (attachment.type === 'video' && attachment.preview) {
    return (
      <VideoPlayer
        src={attachment.preview}
        title={attachment.name}
        className="mt-1 w-full max-w-[500px]"
      />
    );
  }

  // File attachment badge
  const icons: Record<string, string> = {
    file: '📄',
    image: '🖼️',
    video: '🎥',
    audio: '🎵',
  };

  return (
    <div className="mt-1 inline-flex items-center gap-1 px-2 py-1 bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded text-[11px]">
      <span>{icons[attachment.type] || '📎'}</span>
      <span className="truncate max-w-[150px]">{attachment.name}</span>
      {attachment.size && (
        <span className="text-[var(--vscode-descriptionForeground)]">
          ({formatFileSize(attachment.size)})
        </span>
      )}
    </div>
  );
}

/**
 * Render a single content block
 */
function ContentBlockRenderer({
  block,
  isStreaming,
  onAcceptDiff,
  onRejectDiff,
  onApprovePlanStep,
  onRejectPlanStep,
  onModifyPlanStep,
  onApproveAllPlanSteps,
  onRejectAllPlanSteps,
}: {
  block: ContentBlock;
  isStreaming?: boolean;
  onAcceptDiff?: (filePath: string) => void;
  onRejectDiff?: (filePath: string) => void;
  onApprovePlanStep?: (planId: string, stepId: string) => void;
  onRejectPlanStep?: (planId: string, stepId: string) => void;
  onModifyPlanStep?: (planId: string, stepId: string, newDescription: string) => void;
  onApproveAllPlanSteps?: (planId: string) => void;
  onRejectAllPlanSteps?: (planId: string) => void;
}) {
  switch (block.type) {
    case 'thinking':
      return (
        <div className="mb-2">
          <ThinkingBlock content={block.thinking || ''} isComplete={block.isThinkingComplete} />
        </div>
      );

    case 'text':
      if (!block.content) return null;
      return (
        <div className="inline-block px-2.5 py-1.5 rounded-xl text-[13px] leading-relaxed bg-[var(--vscode-input-background)] border border-[var(--vscode-panel-border)]/60 rounded-tl-sm shadow-[0_1px_4px_rgba(0,0,0,0.08)]">
          <MarkdownRenderer
            content={block.content}
            isStreaming={block.isStreaming || isStreaming}
          />
        </div>
      );

    case 'tool_call':
      if (!block.toolCall) return null;
      return (
        <div className="w-full">
          <ToolCallDisplay toolCall={block.toolCall} />
        </div>
      );

    case 'code_diff':
      if (!block.codeDiff) return null;
      return (
        <div className="w-full">
          <DiffBlock diff={block.codeDiff} onAccept={onAcceptDiff} onReject={onRejectDiff} />
        </div>
      );

    case 'plan':
      if (!block.plan) return null;
      return (
        <div className="w-full">
          <PlanReview
            plan={block.plan}
            onApproveStep={
              onApprovePlanStep ? (stepId) => onApprovePlanStep(block.plan!.id, stepId) : undefined
            }
            onRejectStep={
              onRejectPlanStep ? (stepId) => onRejectPlanStep(block.plan!.id, stepId) : undefined
            }
            onModifyStep={
              onModifyPlanStep
                ? (stepId, desc) => onModifyPlanStep(block.plan!.id, stepId, desc)
                : undefined
            }
            onApproveAll={
              onApproveAllPlanSteps ? () => onApproveAllPlanSteps(block.plan!.id) : undefined
            }
            onRejectAll={
              onRejectAllPlanSteps ? () => onRejectAllPlanSteps(block.plan!.id) : undefined
            }
          />
        </div>
      );

    default:
      return null;
  }
}

/**
 * Render assistant message content using content blocks (chronological order)
 */
function AssistantContentBlocks({
  message,
  isStreaming,
  onAcceptDiff,
  onRejectDiff,
  onApprovePlanStep,
  onRejectPlanStep,
  onModifyPlanStep,
  onApproveAllPlanSteps,
  onRejectAllPlanSteps,
}: {
  message: Message;
  isStreaming?: boolean;
  onAcceptDiff?: (filePath: string) => void;
  onRejectDiff?: (filePath: string) => void;
  onApprovePlanStep?: (planId: string, stepId: string) => void;
  onRejectPlanStep?: (planId: string, stepId: string) => void;
  onModifyPlanStep?: (planId: string, stepId: string, newDescription: string) => void;
  onApproveAllPlanSteps?: (planId: string) => void;
  onRejectAllPlanSteps?: (planId: string) => void;
}) {
  // If contentBlocks available, render them in order
  if (message.contentBlocks && message.contentBlocks.length > 0) {
    return (
      <div className="space-y-2">
        {message.contentBlocks.map((block) => (
          <ContentBlockRenderer
            key={block.id}
            block={block}
            isStreaming={isStreaming}
            onAcceptDiff={onAcceptDiff}
            onRejectDiff={onRejectDiff}
            onApprovePlanStep={onApprovePlanStep}
            onRejectPlanStep={onRejectPlanStep}
            onModifyPlanStep={onModifyPlanStep}
            onApproveAllPlanSteps={onApproveAllPlanSteps}
            onRejectAllPlanSteps={onRejectAllPlanSteps}
          />
        ))}
      </div>
    );
  }

  // Legacy fallback: render in fixed order (thinking → content → toolCalls)
  return (
    <>
      {/* Thinking block */}
      {message.thinking && (
        <div className="mb-2">
          <ThinkingBlock content={message.thinking} isComplete={message.isThinkingComplete} />
        </div>
      )}

      {/* Message bubble - compact */}
      {message.content && (
        <div className="inline-block px-2.5 py-1.5 rounded-xl text-[13px] leading-relaxed bg-[var(--vscode-input-background)] border border-[var(--vscode-panel-border)]/60 rounded-tl-sm shadow-[0_1px_4px_rgba(0,0,0,0.08)]">
          <MarkdownRenderer content={message.content} isStreaming={isStreaming} />
        </div>
      )}

      {/* Tool calls */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="mt-2 space-y-2 w-full">
          {message.toolCalls.map((toolCall) => (
            <ToolCallDisplay key={toolCall.id} toolCall={toolCall} />
          ))}
        </div>
      )}
    </>
  );
}

// Error message card — prominent red styling for API errors, timeouts, etc.
function ErrorMessageCard({ content }: { content: string }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-[var(--vscode-inputValidation-errorBorder,#be1100)] bg-[var(--vscode-inputValidation-errorBackground,rgba(190,17,0,0.1))] text-[13px] leading-relaxed max-w-full">
      <svg
        className="w-4 h-4 flex-shrink-0 mt-0.5 text-[var(--vscode-errorForeground,#f14c4c)]"
        fill="currentColor"
        viewBox="0 0 16 16"
      >
        <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 12.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11zM7.25 5v4h1.5V5h-1.5zm0 5v1.5h1.5V10h-1.5z" />
      </svg>
      <div className="min-w-0">
        <div className="text-[var(--vscode-errorForeground,#f14c4c)] font-medium text-[12px] mb-0.5">
          Error
        </div>
        <div className="text-[var(--vscode-foreground)] whitespace-pre-wrap break-words text-[12px] opacity-90">
          {content}
        </div>
      </div>
    </div>
  );
}

export const MessageItem = memo(function MessageItem({
  message,
  backgroundTasks,
  onEditMessage,
  onResendFrom,
  onFeedback,
  showAvatar = true,
  isGrouped = false,
}: MessageItemProps) {
  const {
    onCancelTask,
    onViewTaskResult,
    onAcceptDiff,
    onRejectDiff,
    onApprovePlanStep,
    onRejectPlanStep,
    onModifyPlanStep,
    onApproveAllPlanSteps,
    onRejectAllPlanSteps,
  } = useMessageActions();
  // 找出与这条消息关联的任务
  const relatedTasks = message.backgroundTaskIds
    ? backgroundTasks?.filter((t) => message.backgroundTaskIds!.includes(t.id)) || []
    : [];

  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isStreaming = message.isStreaming;

  // System messages (e.g., queued notifications) - centered, subtle styling
  if (isSystem) {
    return (
      <div className="flex justify-center py-1 px-2">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] text-[var(--vscode-descriptionForeground)] bg-[var(--vscode-input-background)] border border-[var(--vscode-panel-border)]">
          {message.isQueued && (
            <svg className="w-3 h-3 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
          )}
          <span>{message.content}</span>
        </div>
      </div>
    );
  }

  // User messages: right-aligned with avatar on right
  // Assistant messages: left-aligned with avatar on left
  return (
    <div className="group hover:bg-[var(--vscode-list-hoverBackground)] transition-colors">
      <div className={`flex gap-2 px-2 py-1 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar - compact 20px */}
        <div className="flex-shrink-0 w-5 pt-0.5">
          {showAvatar && !isGrouped ? (
            isUser ? (
              <UserAvatar />
            ) : (
              <AssistantAvatar />
            )
          ) : (
            <div className="w-5" />
          )}
        </div>

        {/* Content */}
        <div className={`flex-1 min-w-0 max-w-[85%] ${isUser ? 'flex flex-col items-end' : ''}`}>
          {/* Header: Role name + timestamp */}
          {!isGrouped && (
            <div className={`flex items-center gap-2 mb-0.5 ${isUser ? 'flex-row-reverse' : ''}`}>
              <span
                className={`text-[11px] font-medium ${isUser ? 'text-[var(--vscode-foreground)]' : 'text-[var(--vscode-textLink-foreground)]'}`}
              >
                {isUser ? 'You' : 'Assistant'}
              </span>
              <span className="text-[10px] text-[var(--vscode-descriptionForeground)] opacity-0 group-hover:opacity-100 transition-opacity">
                {formatTime(message.timestamp)}
              </span>
              {message.editedAt && (
                <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                  (edited)
                </span>
              )}
            </div>
          )}

          {/* User message content - compact bubble */}
          {isUser ? (
            <div
              className={`inline-block px-2.5 py-1.5 rounded-xl text-[13px] leading-relaxed bg-gradient-to-br from-[var(--vscode-charts-blue,#0e63c8)] via-[var(--vscode-button-background)] to-[var(--vscode-charts-purple,#6b3fa0)] text-[var(--vscode-button-foreground)] rounded-tr-sm shadow-[0_2px_8px_rgba(0,0,0,0.2)]`}
            >
              {/* Attachments for user messages */}
              {message.attachments && message.attachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {message.attachments.map((attachment) => (
                    <AttachmentDisplay key={attachment.id} attachment={attachment} />
                  ))}
                </div>
              )}
              <div className="whitespace-pre-wrap break-words">{message.content}</div>
            </div>
          ) : message.isError ? (
            /* Error message: prominent red card */
            <ErrorMessageCard content={message.content} />
          ) : (
            /* Assistant message: render content blocks in chronological order */
            <AssistantContentBlocks
              message={message}
              isStreaming={isStreaming}
              onAcceptDiff={onAcceptDiff}
              onRejectDiff={onRejectDiff}
              onApprovePlanStep={onApprovePlanStep}
              onRejectPlanStep={onRejectPlanStep}
              onModifyPlanStep={onModifyPlanStep}
              onApproveAllPlanSteps={onApproveAllPlanSteps}
              onRejectAllPlanSteps={onRejectAllPlanSteps}
            />
          )}

          {/* Background task cards - TaskCard handles all tasks including completed
              ToolCallDisplay skips media preview for backgroundMode tasks */}
          {relatedTasks.length === 1 && (
            <div className="mt-2 w-full">
              <TaskCard
                task={relatedTasks[0]}
                onCancel={onCancelTask}
                onViewResult={onViewTaskResult}
              />
            </div>
          )}
          {relatedTasks.length > 1 && (
            <div className="mt-2 w-full">
              <BatchTaskCard
                tasks={relatedTasks}
                onCancel={onCancelTask}
                onCancelAll={() => relatedTasks.forEach((t) => onCancelTask?.(t.id))}
                onViewResult={onViewTaskResult}
              />
            </div>
          )}

          {/* Message actions */}
          {!isStreaming && (
            <div
              className={`mt-1 opacity-0 group-hover:opacity-100 transition-opacity ${isUser ? 'self-end' : ''}`}
            >
              <MessageActions
                message={message}
                onEdit={isUser && onEditMessage ? () => onEditMessage(message.id) : undefined}
                onResend={isUser && onResendFrom ? () => onResendFrom(message.id) : undefined}
                onFeedback={!isUser && onFeedback ? (fb) => onFeedback(message.id, fb) : undefined}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
