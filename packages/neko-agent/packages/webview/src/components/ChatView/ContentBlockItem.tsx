/**
 * ContentBlockItem - Individual content block renderer
 *
 * Renders a single content block (thinking, text, tool_call, code_diff, plan)
 * as an independent visual unit in the message list.
 */

import { memo } from 'react';
import type { ContentBlock } from '@neko-agent/types';
import { ToolCallDisplay, ToolCallGroupDisplay } from '@/components/ChatView/ToolCallDisplay';
import { DiffBlock } from '@/components/ChatView/DiffBlock';
import { PlanReview } from '@/components/ChatView/PlanReview';
import { RichContentRenderer } from '@/components/ChatView/RichContent';
import { MarkdownRenderer, ThinkingBlock } from '@/components/ChatView/MessageContent';
import { MessageAvatar } from '@/components/ChatView/MessageAvatar';
import { useMessageActions } from '@/components/ChatView/MessageActionsContext';
import { SendToMenu } from '@/components/ChatView/SendToMenu';
import { projectCanvasContentTransferTarget } from '@/presenters/plugin-transfer-presenter';
import { projectAssistantMarkdownCanvasTransferPayload } from '@/presenters/storyboard-transfer-presenter';
import {
  CodeIcon,
  EditIcon,
  FileIcon,
  InfoIcon,
  PackageIcon,
  SettingsIcon,
} from '@neko/shared/icons';
import {
  projectContentBlockUi,
  type ContentBlockHeaderIconKind,
  type ContentBlockHeaderTone,
  type ContentBlockUiProjection,
} from '@/presenters/content-block-presenter';
import type { MessageSpeakerIdentity } from '@/components/ChatView/message-identity';

interface ContentBlockItemProps {
  /** The content block to render */
  block?: ContentBlock;
  /** Projected content block display model, used by message-level aggregation. */
  projection?: ContentBlockUiProjection;
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
  /** Speaker identity for assistant-owned content blocks. */
  assistantIdentity?: MessageSpeakerIdentity;
}

const blockHeaderIconByKind: Record<ContentBlockHeaderIconKind, string> = {
  thinking: 'thinking',
  response: 'response',
  tool: 'tool',
  edit: 'edit',
  plan: 'plan',
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
  projection: projectedBlock,
  isFirst,
  isStreaming,
  conversationId,
  workItemIds,
  siblingBlocks,
  assistantIdentity,
}: ContentBlockItemProps) {
  const actions = useMessageActions();
  const projection =
    projectedBlock ??
    (block
      ? projectContentBlockUi({
          block,
          siblingBlocks,
          parentIsStreaming: isStreaming,
        })
      : null);

  if (!projection) return null;

  return (
    <div className="agent-message-row group">
      <div className="flex gap-2 px-2 py-1">
        {/* Avatar - only show on first block */}
        <div className="flex-shrink-0 w-5 pt-0.5">
          {isFirst ? (
            <MessageAvatar
              role="assistant"
              label={assistantIdentity?.avatarLabel}
              imageUri={assistantIdentity?.avatarUri}
              title={assistantIdentity?.title}
            />
          ) : (
            <div className="w-5" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 max-w-[85%]">
          {/* Header: Block type + timestamp */}
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-medium ${blockHeaderToneClassByTone[projection.header.tone]}`}
            >
              <ContentBlockHeaderIcon
                kind={projection.header.iconKind}
                className="h-3 w-3 flex-shrink-0"
              />
              {projection.header.label}
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

function ContentBlockHeaderIcon({
  kind,
  className,
}: {
  kind: ContentBlockHeaderIconKind;
  className?: string;
}) {
  switch (blockHeaderIconByKind[kind]) {
    case 'thinking':
      return <InfoIcon className={className} />;
    case 'response':
      return <FileIcon className={className} />;
    case 'tool':
      return <SettingsIcon className={className} />;
    case 'edit':
      return <EditIcon className={className} />;
    case 'plan':
      return <CodeIcon className={className} />;
    case '[]':
      return <PackageIcon className={className} />;
  }
}

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
              siblingBlocks: projection.siblingBlocks,
              toolCalls: projection.toolCalls,
              target: projectCanvasContentTransferTarget({
                ambientNodes: callbacks.ambientNodes,
                contextChips: callbacks.contextChips,
              }),
              provenance: { source: 'webview', label: 'assistant-storyboard-block' },
            })
          : null;

      return (
        <div className="agent-bubble agent-bubble-assistant block w-fit max-w-full min-w-0 rounded-2xl rounded-tl-md px-2.5 py-1.5 text-[13px] leading-relaxed">
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

    case 'toolGroup':
      return (
        <div className="w-full">
          <ToolCallGroupDisplay
            projection={projection}
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

    case 'plan': {
      const {
        onApprovePlanStep,
        onRejectPlanStep,
        onModifyPlanStep,
        onApproveAllPlanSteps,
        onRejectAllPlanSteps,
      } = callbacks;
      return (
        <div className="w-full">
          <PlanReview
            plan={projection.plan}
            onApproveStep={
              onApprovePlanStep
                ? (stepId) => onApprovePlanStep(projection.plan.id, stepId)
                : undefined
            }
            onRejectStep={
              onRejectPlanStep
                ? (stepId) => onRejectPlanStep(projection.plan.id, stepId)
                : undefined
            }
            onModifyStep={
              onModifyPlanStep
                ? (stepId, desc) => onModifyPlanStep(projection.plan.id, stepId, desc)
                : undefined
            }
            onApproveAll={
              onApproveAllPlanSteps ? () => onApproveAllPlanSteps(projection.plan.id) : undefined
            }
            onRejectAll={
              onRejectAllPlanSteps ? () => onRejectAllPlanSteps(projection.plan.id) : undefined
            }
          />
        </div>
      );
    }

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
