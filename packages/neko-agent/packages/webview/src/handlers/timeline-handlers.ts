import { defineHandler } from './types';
import type { HandlerRegistration, MessageHandler, MessageHandlerContext } from './types';
import type { AgentTurnTimelineMessage } from './messages';
import type { AgentTurnTimelineItem } from '@neko-agent/types';
import { updateConversation } from './message-updater';
import {
  applyAgentTurnTimelineMessage,
  projectMessagesWithActiveTurnTimeline,
  projectActiveTurnTimelineWorkItems,
} from '@/presenters/active-turn-timeline-presenter';
import { upsertWorkItemsForConversation } from '@/presenters/work-item-state-presenter';

const handleAgentTurnTimeline: MessageHandler<'agentTurnTimeline'> = (
  message: AgentTurnTimelineMessage,
  context,
) => {
  applyTimelineMessageToConversation(message, context);
};

function applyTimelineMessageToConversation(
  message: AgentTurnTimelineMessage,
  context: MessageHandlerContext,
): void {
  updateConversation(
    context,
    message.conversationId,
    (messages, _streamingMessageId, streaming) => {
      const projection = applyAgentTurnTimelineMessage({
        state: streaming.activeTurnTimeline ?? null,
        message,
      });
      const wasCompleted = streaming.activeTurnTimeline?.completed === true;

      if (projection.diagnostics.length > 0) {
        context.setGlobalError(formatTimelineDiagnostics(projection.diagnostics));
        return {
          messages,
          activeTurnTimeline: projection.state,
        };
      }

      const workItems = projectActiveTurnTimelineWorkItems(projection.state);
      if (workItems.length > 0) {
        context.setWorkItemsByConversation((prev) =>
          upsertWorkItemsForConversation(prev, message.conversationId, workItems),
        );
      }
      return {
        messages: projectMessagesWithActiveTurnTimeline(messages, projection.state),
        streamingMessageId: wasCompleted ? streaming.streamingMessageId : message.messageId,
        isThinking: false,
        activeTurnTimeline: projection.state,
      };
    },
  );
}

export function hasActiveTimelineForMessage(input: {
  readonly context: MessageHandlerContext;
  readonly conversationId: string | undefined;
  readonly messageId: string | undefined;
}): boolean {
  return getActiveTimelineForMessage(input.context, input.conversationId, input.messageId) !== null;
}

export function getActiveTimelineForMessage(
  context: MessageHandlerContext,
  conversationId: string | undefined,
  messageId: string | undefined,
) {
  if (!conversationId) {
    return null;
  }
  const streaming = context.conversationStreamingRef.current.get(conversationId);
  const activeTimeline = streaming?.activeTurnTimeline ?? null;
  if (!activeTimeline) {
    return null;
  }
  if (messageId !== undefined && activeTimeline.messageId !== messageId) {
    return null;
  }
  return activeTimeline.completed ? null : activeTimeline;
}

export function findActiveTimelineToolCall(
  items: readonly AgentTurnTimelineItem[],
  toolCallId: string,
): Extract<AgentTurnTimelineItem, { readonly kind: 'tool_call' }> | undefined {
  return items.find(
    (item): item is Extract<AgentTurnTimelineItem, { readonly kind: 'tool_call' }> =>
      item.kind === 'tool_call' && item.payload.toolCall.id === toolCallId,
  );
}

export function hasActiveTimelineWorkItem(
  items: readonly AgentTurnTimelineItem[],
  workItemId: string,
): boolean {
  return items.some(
    (item) =>
      (item.kind === 'task' || item.kind === 'media') && item.payload.workItem.id === workItemId,
  );
}

export function rejectActiveTimelineNonTimelineMessage(input: {
  readonly context: MessageHandlerContext;
  readonly messageType: string;
  readonly reason: string;
}): void {
  input.context.setGlobalError(`Agent timeline ${input.messageType} rejected: ${input.reason}`);
}

function formatTimelineDiagnostics(
  diagnostics: readonly { readonly code: string; readonly message: string }[],
): string {
  return `Agent timeline event rejected: ${diagnostics
    .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
    .join('; ')}`;
}

export const timelineHandlers: HandlerRegistration[] = [
  defineHandler('agentTurnTimeline', handleAgentTurnTimeline),
];
