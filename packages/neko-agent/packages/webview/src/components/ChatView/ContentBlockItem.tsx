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
import { RichContentRenderer } from '@/components/ChatView/RichContent';
import { MarkdownRenderer, ThinkingBlock } from '@/components/ChatView/MessageContent';
import { useMessageActions } from '@/components/ChatView/MessageActionsContext';
import { SendToMenu } from '@/components/ChatView/SendToMenu';
import { projectCanvasContentTransferTarget } from '@/presenters/plugin-transfer-presenter';
import { projectAssistantMarkdownCanvasTransferPayload } from '@/presenters/storyboard-transfer-presenter';
import {
  projectContentBlockUi,
  type ContentBlockHeaderIconKind,
  type ContentBlockHeaderTone,
  type ContentBlockUiProjection,
} from '@/presenters/content-block-presenter';

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
  /** Work items linked to the parent message */
  workItemIds?: string[];
  /** Sibling blocks from the owner message, used for composite media resolution */
  siblingBlocks?: ContentBlock[];
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

const blockHeaderIconByKind: Record<ContentBlockHeaderIconKind, string> = {
  thinking: '💭',
  response: '💬',
  tool: '🔧',
  edit: '📝',
  plan: '📋',
  composite: '[]',
};

const blockHeaderToneClassByTone: Record<ContentBlockHeaderTone, string> = {
  purple: 'text-[var(--vscode-charts-purple)]',
  green: 'text-[var(--vscode-charts-green)]',
  blue: 'text-[var(--vscode-charts-blue)]',
  orange: 'text-[var(--vscode-charts-orange)]',
  yellow: 'text-[var(--vscode-charts-yellow)]',
};

export const ContentBlockItem = memo(function ContentBlockItem({
  block,
  isFirst,
  isStreaming,
  conversationId,
  workItemIds,
  siblingBlocks,
}: ContentBlockItemProps) {
  const actions = useMessageActions();
  const projection = projectContentBlockUi({
    block,
    siblingBlocks,
    parentIsStreaming: isStreaming,
  });

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
            <span
              className={`text-[11px] font-medium ${blockHeaderToneClassByTone[projection.header.tone]}`}
            >
              {blockHeaderIconByKind[projection.header.iconKind]} {projection.header.label}
            </span>
            <span className="text-[10px] text-[var(--vscode-descriptionForeground)] opacity-0 group-hover:opacity-100 transition-opacity">
              {projection.header.timestampLabel}
            </span>
            {projection.header.showStreamingBadge && (
              <span className="text-[10px] text-[var(--vscode-charts-green)] animate-pulse">
                {projection.header.streamingLabel}
              </span>
            )}
          </div>

          {/* Block content */}
          {renderBlockContent(projection, conversationId, actions, workItemIds)}
        </div>
      </div>
    </div>
  );
});

/**
 * Render the content of a block based on its type
 */
function renderBlockContent(
  projection: ContentBlockUiProjection,
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
    | 'pluginsAvailable'
    | 'contextChips'
    | 'ambientNodes'
  >,
  workItemIds?: string[],
) {
  switch (projection.renderKind) {
    case 'thinking':
      return (
        <ThinkingBlock content={projection.thinking} isComplete={projection.isThinkingComplete} />
      );

    case 'markdown': {
      const canvasPayload =
        !projection.renderStreaming && callbacks.pluginsAvailable?.canvas
          ? projectAssistantMarkdownCanvasTransferPayload({
              content: projection.content,
              target: projectCanvasContentTransferTarget({
                ambientNodes: callbacks.ambientNodes,
                contextChips: callbacks.contextChips,
              }),
              provenance: { source: 'webview', label: 'assistant-storyboard-block' },
            })
          : null;

      return (
        <div className="block w-fit max-w-full min-w-0 px-2.5 py-1.5 rounded-xl text-[13px] leading-relaxed bg-[var(--vscode-input-background)] border border-[var(--vscode-panel-border)] rounded-tl-sm">
          <MarkdownRenderer content={projection.content} isStreaming={projection.renderStreaming} />
          {canvasPayload && callbacks.pluginsAvailable && (
            <div className="mt-1.5 border-t border-[var(--agent-divider)] pt-1">
              <SendToMenu
                payload={canvasPayload}
                mediaType="image"
                plugins={callbacks.pluginsAvailable}
                allowedTargets={['canvas']}
              />
            </div>
          )}
        </div>
      );
    }

    case 'tool':
      return (
        <div className="w-full">
          <ToolCallDisplay
            toolCall={projection.toolCall}
            conversationId={conversationId}
            workItemIds={workItemIds}
          />
        </div>
      );

    case 'diff':
      return (
        <div className="w-full">
          <DiffBlock
            diff={projection.codeDiff}
            onAccept={callbacks.onAcceptDiff}
            onReject={callbacks.onRejectDiff}
          />
        </div>
      );

    case 'plan':
      return (
        <div className="w-full">
          <PlanReview
            plan={projection.plan}
            onApproveStep={
              callbacks.onApprovePlanStep
                ? (stepId) => callbacks.onApprovePlanStep!(projection.plan.id, stepId)
                : undefined
            }
            onRejectStep={
              callbacks.onRejectPlanStep
                ? (stepId) => callbacks.onRejectPlanStep!(projection.plan.id, stepId)
                : undefined
            }
            onModifyStep={
              callbacks.onModifyPlanStep
                ? (stepId, desc) => callbacks.onModifyPlanStep!(projection.plan.id, stepId, desc)
                : undefined
            }
            onApproveAll={
              callbacks.onApproveAllPlanSteps
                ? () => callbacks.onApproveAllPlanSteps!(projection.plan.id)
                : undefined
            }
            onRejectAll={
              callbacks.onRejectAllPlanSteps
                ? () => callbacks.onRejectAllPlanSteps!(projection.plan.id)
                : undefined
            }
          />
        </div>
      );

    case 'composite':
      return (
        <div className="w-full">
          <RichContentRenderer
            kind={projection.richContent.kind}
            data={projection.richContent.data}
          />
        </div>
      );

    case 'empty':
      return null;
  }
}
