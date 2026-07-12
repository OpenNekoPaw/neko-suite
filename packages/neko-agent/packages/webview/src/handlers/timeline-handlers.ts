import type { AgentTurnTimelineItem } from '@neko-agent/types';
import type { MessageHandlerContext } from './types';

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
