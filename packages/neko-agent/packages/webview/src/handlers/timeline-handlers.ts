import type { AgentTurnTimelineItem } from '@neko-agent/types';
import { flushSync } from 'react-dom';
import type { AgentMarkdownSessionPublication } from '@/markdown/agent-markdown-session-registry';
import {
  applyAgentTurnTimelineDiagnostic,
  applyAgentTurnTimelineMessage,
  projectActiveTurnTimelineWorkItems,
  projectMessagesWithActiveTurnTimeline,
} from '@/presenters/active-turn-timeline-presenter';
import { upsertWorkItemsForConversation } from '@/presenters/work-item-state-presenter';
import type { AgentTurnTimelineDiagnostic, AgentTurnTimelineMessage } from './messages';
import { updateConversation } from './message-updater';
import { defineHandler } from './types';
import type { HandlerRegistration, MessageHandler, MessageHandlerContext } from './types';

const handleAgentTurnTimeline: MessageHandler<'agentTurnTimeline'> = (
  message: AgentTurnTimelineMessage,
  context,
) => {
  applyTimelineMessagesToConversation([message], context);
};

const handleAgentTurnTimelineDiagnostic: MessageHandler<'agentTurnTimelineDiagnostic'> = (
  diagnostic: AgentTurnTimelineDiagnostic,
  context,
) => {
  let unavailableTimelineState: ReturnType<typeof applyAgentTurnTimelineDiagnostic>['state'] = null;
  updateConversation(
    context,
    diagnostic.conversationId,
    (messages, _streamingMessageId, streaming) => {
      const previousState = streaming.activeTurnTimeline ?? null;
      const result = applyAgentTurnTimelineDiagnostic(previousState, diagnostic);
      if (
        diagnostic.code === 'turn-snapshot-unavailable' &&
        result.state !== previousState &&
        result.state?.synchronization === 'unavailable'
      ) {
        unavailableTimelineState = result.state;
      }
      return { messages, activeTurnTimeline: result.state };
    },
  );
  const belongsToForegroundConversation =
    !diagnostic.conversationId ||
    context.activeConversationIdRef.current === diagnostic.conversationId;
  if (
    belongsToForegroundConversation &&
    (diagnostic.code !== 'turn-snapshot-unavailable' || unavailableTimelineState)
  ) {
    context.setGlobalError(formatTimelineDiagnostics([diagnostic]));
  }
};

function applyTimelineMessagesToConversation(
  deliveries: readonly AgentTurnTimelineMessage[],
  context: MessageHandlerContext,
): void {
  const firstDelivery = deliveries[0];
  if (!firstDelivery) return;
  const markdownSessionRegistry = context.markdownSessionRegistry;
  if (!markdownSessionRegistry) {
    throw new Error('Agent Timeline handler requires the canonical Markdown session registry.');
  }
  let markdownPublication: AgentMarkdownSessionPublication | undefined;
  let projectedWorkItems: ReturnType<typeof projectActiveTurnTimelineWorkItems> = [];
  const diagnostics: Array<{ readonly code: string; readonly message: string }> = [];
  const acceptedTimelineDeliveries: AgentTurnTimelineMessage[] = [];
  let acceptedDeliveries = 0;

  flushSync(() => {
    updateConversation(
      context,
      firstDelivery.conversationId,
      (messages, _streamingMessageId, streaming) => {
        let activeState = streaming.activeTurnTimeline ?? null;
        const wasCompleted = activeState?.completed === true;
        for (const delivery of deliveries) {
          const projection = applyAgentTurnTimelineMessage({
            state: activeState,
            message: delivery,
          });
          activeState = projection.state;
          diagnostics.push(...projection.diagnostics);
          if (projection.diagnostics.length === 0) {
            acceptedDeliveries += 1;
            acceptedTimelineDeliveries.push(delivery);
          }
        }

        if (acceptedDeliveries === 0) {
          return { messages, activeTurnTimeline: activeState };
        }
        projectedWorkItems = projectActiveTurnTimelineWorkItems(activeState);
        markdownPublication = markdownSessionRegistry.commitTimelineDeliveries(
          acceptedTimelineDeliveries,
        );
        return {
          messages: projectMessagesWithActiveTurnTimeline(messages, activeState),
          streamingMessageId: wasCompleted ? streaming.streamingMessageId : firstDelivery.messageId,
          isThinking: false,
          activeTurnTimeline: activeState,
        };
      },
    );
  });

  // External-store publication must follow the synchronous React props commit.
  markdownPublication?.publish();
  const foregroundDiagnostics = diagnostics;
  if (
    foregroundDiagnostics.length > 0 &&
    context.activeConversationIdRef.current === firstDelivery.conversationId
  ) {
    context.setGlobalError(formatTimelineDiagnostics(foregroundDiagnostics));
  }
  if (projectedWorkItems.length > 0) {
    context.setWorkItemsByConversation((previous) =>
      upsertWorkItemsForConversation(previous, firstDelivery.conversationId, projectedWorkItems),
    );
  }
}

export function hasActiveTimelineForMessage(input: {
  readonly context: MessageHandlerContext;
  readonly conversationId: string | undefined;
  readonly messageId: string | undefined;
}): boolean {
  return getActiveTimelineForMessage(input.context, input.conversationId, input.messageId) !== null;
}

export function hasTimelineOwnershipForMessage(input: {
  readonly context: MessageHandlerContext;
  readonly conversationId: string | undefined;
  readonly messageId: string | undefined;
}): boolean {
  return getTimelineForMessage(input.context, input.conversationId, input.messageId) !== null;
}

export function getActiveTimelineForMessage(
  context: MessageHandlerContext,
  conversationId: string | undefined,
  messageId: string | undefined,
) {
  const timeline = getTimelineForMessage(context, conversationId, messageId);
  return timeline?.completed === true ? null : timeline;
}

function getTimelineForMessage(
  context: MessageHandlerContext,
  conversationId: string | undefined,
  messageId: string | undefined,
) {
  if (!conversationId) {
    return null;
  }
  const streaming = context.conversationStreamingRef.current.get(conversationId);
  const timeline = streaming?.activeTurnTimeline ?? null;
  if (!timeline) {
    return null;
  }
  if (messageId !== undefined && timeline.messageId !== messageId) {
    return null;
  }
  return timeline;
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
  defineHandler('agentTurnTimelineDiagnostic', handleAgentTurnTimelineDiagnostic),
];
