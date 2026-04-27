/**
 * ContentBlockItem - Individual content block renderer
 *
 * Renders a single content block (thinking, text, tool_call, code_diff, plan)
 * as an independent visual unit in the message list.
 */

import { memo } from 'react';
import type { ContentBlock } from '@/components/types';
import { ToolCallDisplay } from '@/components/ChatView/ToolCallDisplay';
import { DiffBlock } from '@/components/ChatView/DiffBlock';
import { PlanReview } from '@/components/ChatView/PlanReview';
import { MarkdownRenderer, ThinkingBlock } from '@/components/ChatView/MessageContent';
import { useMessageActions } from '@/components/ChatView/MessageActionsContext';

interface ContentBlockItemProps {
  /** The content block to render */
  block: ContentBlock;
  /** Whether this is the first block in the message */
  isFirst: boolean;
  /** Whether this is the last block in the message */
  isLast: boolean;
  /** Whether the parent message is streaming */
  isStreaming: boolean;
  /** Current conversation for scoped UI actions */
  conversationId: string | null;
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

// Block type icons and labels
const blockTypeConfig: Record<
  ContentBlock['type'],
  { icon: string; label: string; color: string }
> = {
  thinking: {
    icon: '💭',
    label: 'Thinking',
    color: 'text-[var(--vscode-charts-purple)]',
  },
  text: {
    icon: '💬',
    label: 'Response',
    color: 'text-[var(--vscode-charts-green)]',
  },
  tool_call: {
    icon: '🔧',
    label: 'Tool',
    color: 'text-[var(--vscode-charts-blue)]',
  },
  code_diff: {
    icon: '📝',
    label: 'Edit',
    color: 'text-[var(--vscode-charts-orange)]',
  },
  plan: {
    icon: '📋',
    label: 'Plan',
    color: 'text-[var(--vscode-charts-yellow)]',
  },
};

// Format timestamp
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export const ContentBlockItem = memo(function ContentBlockItem({
  block,
  isFirst,
  isStreaming,
  conversationId,
}: ContentBlockItemProps) {
  const config = blockTypeConfig[block.type];
  const actions = useMessageActions();

  return (
    <div className="group hover:bg-[var(--vscode-list-hoverBackground)] transition-colors">
      <div className="flex gap-2 px-2 py-1">
        {/* Avatar - only show on first block */}
        <div className="flex-shrink-0 w-5 pt-0.5">
          {isFirst ? <AssistantAvatar /> : <div className="w-5" />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 max-w-[85%]">
          {/* Header: Block type + timestamp */}
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-[11px] font-medium ${config.color}`}>
              {config.icon} {config.label}
            </span>
            <span className="text-[10px] text-[var(--vscode-descriptionForeground)] opacity-0 group-hover:opacity-100 transition-opacity">
              {formatTime(block.timestamp)}
            </span>
            {block.isStreaming && (
              <span className="text-[10px] text-[var(--vscode-charts-green)] animate-pulse">
                streaming...
              </span>
            )}
          </div>

          {/* Block content */}
          {renderBlockContent(block, isStreaming, conversationId, actions)}
        </div>
      </div>
    </div>
  );
});

/**
 * Render the content of a block based on its type
 */
function renderBlockContent(
  block: ContentBlock,
  isStreaming: boolean,
  conversationId: string | null,
  callbacks: Pick<
    import('@/components/ChatView/MessageActionsContext').MessageActionsContextValue,
    | 'onAcceptDiff'
    | 'onRejectDiff'
    | 'onApprovePlanStep'
    | 'onRejectPlanStep'
    | 'onModifyPlanStep'
    | 'onApproveAllPlanSteps'
    | 'onRejectAllPlanSteps'
  >,
) {
  switch (block.type) {
    case 'thinking':
      return <ThinkingBlock content={block.thinking || ''} isComplete={block.isThinkingComplete} />;

    case 'text':
      if (!block.content) return null;
      return (
        <div className="inline-block px-2.5 py-1.5 rounded-xl text-[13px] leading-relaxed bg-[var(--vscode-input-background)] border border-[var(--vscode-panel-border)] rounded-tl-sm">
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
          <ToolCallDisplay toolCall={block.toolCall} conversationId={conversationId} />
        </div>
      );

    case 'code_diff':
      if (!block.codeDiff) return null;
      return (
        <div className="w-full">
          <DiffBlock
            diff={block.codeDiff}
            onAccept={callbacks.onAcceptDiff}
            onReject={callbacks.onRejectDiff}
          />
        </div>
      );

    case 'plan':
      if (!block.plan) return null;
      return (
        <div className="w-full">
          <PlanReview
            plan={block.plan}
            onApproveStep={
              callbacks.onApprovePlanStep
                ? (stepId) => callbacks.onApprovePlanStep!(block.plan!.id, stepId)
                : undefined
            }
            onRejectStep={
              callbacks.onRejectPlanStep
                ? (stepId) => callbacks.onRejectPlanStep!(block.plan!.id, stepId)
                : undefined
            }
            onModifyStep={
              callbacks.onModifyPlanStep
                ? (stepId, desc) => callbacks.onModifyPlanStep!(block.plan!.id, stepId, desc)
                : undefined
            }
            onApproveAll={
              callbacks.onApproveAllPlanSteps
                ? () => callbacks.onApproveAllPlanSteps!(block.plan!.id)
                : undefined
            }
            onRejectAll={
              callbacks.onRejectAllPlanSteps
                ? () => callbacks.onRejectAllPlanSteps!(block.plan!.id)
                : undefined
            }
          />
        </div>
      );

    default:
      return null;
  }
}
