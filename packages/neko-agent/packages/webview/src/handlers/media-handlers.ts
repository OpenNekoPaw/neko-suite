/**
 * Media Task Message Handlers
 *
 * Handles: mediaTaskCreated, mediaTaskProgress
 *
 * On creation outside an active timeline: merges the projected work item,
 * appends the assistant TaskCard host message, and stops the thinking indicator.
 * On progress: updates task in the per-conversation work item store.
 */

import { defineHandler } from './types';
import type { MessageHandler, HandlerRegistration } from './types';
import type { MediaTaskCreatedMessage, MediaTaskProgressMessage } from './messages';
import { appendMediaTaskMessageToMessages } from '@/presenters/work-item-message-presenter';
import { upsertWorkItemsForConversation } from '@/presenters/work-item-state-presenter';
import {
  getActiveTimelineForMessage,
  hasActiveTimelineWorkItem,
  rejectActiveTimelineNonTimelineMessage,
} from './timeline-handlers';

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * Handle 'mediaTaskCreated' — task just submitted to the provider.
 * Stops the thinking indicator, adds a work item, and appends an assistant
 * message so the TaskCard renders inline when no active timeline owns placement.
 */
const handleMediaTaskCreated: MessageHandler<'mediaTaskCreated'> = (
  message: MediaTaskCreatedMessage,
  context,
) => {
  const conversationId = message.conversationId;
  const workItem = message.workItem;

  if (!conversationId || workItem.conversationId !== conversationId) return;

  const activeTimeline = getActiveTimelineForMessage(
    context,
    conversationId,
    message.messageId ?? workItem.parentMessageId ?? undefined,
  );
  if (activeTimeline) {
    if (hasActiveTimelineWorkItem(activeTimeline.items, workItem.id)) {
      return;
    }
    rejectActiveTimelineNonTimelineMessage({
      context,
      messageType: message.type,
      reason: 'active timeline media updates must arrive as agentTurnTimeline',
    });
    return;
  }

  context.setWorkItemsByConversation((prev) =>
    upsertWorkItemsForConversation(prev, conversationId, [workItem]),
  );

  // Stop thinking indicator (only for the active conversation)
  if (context.isCurrentConversation(conversationId)) {
    context.setIsThinking(false);
    context.setStreamingMessageId(null);
    context.setQueuedMessageCount?.(0);

    // Append an assistant message that embeds the TaskCard for non-timeline placement.
    context.setMessages((prev) => appendMediaTaskMessageToMessages(prev, workItem.id));
  } else if (conversationId) {
    // Non-current conversation: update refs only
    context.updateNonCurrentConversation(conversationId, (messages, streaming) => ({
      messages: appendMediaTaskMessageToMessages(messages, workItem.id),
      streaming: {
        ...streaming,
        isThinking: false,
        streamingMessageId: null,
        queuedMessageCount: 0,
      },
    }));
  }
};

/**
 * Handle 'mediaTaskProgress' — task status/progress updated.
 * Only updates work items; TaskCard re-renders automatically.
 */
const handleMediaTaskProgress: MessageHandler<'mediaTaskProgress'> = (
  message: MediaTaskProgressMessage,
  context,
) => {
  const conversationId = message.conversationId;
  const workItem = message.workItem;
  if (!conversationId || workItem.conversationId !== conversationId) return;

  const activeTimeline = getActiveTimelineForMessage(
    context,
    conversationId,
    message.messageId ?? workItem.parentMessageId ?? undefined,
  );
  if (activeTimeline) {
    if (hasActiveTimelineWorkItem(activeTimeline.items, workItem.id)) {
      return;
    }
    rejectActiveTimelineNonTimelineMessage({
      context,
      messageType: message.type,
      reason: 'active timeline media updates must arrive as agentTurnTimeline',
    });
    return;
  }

  context.setWorkItemsByConversation((prev) =>
    upsertWorkItemsForConversation(prev, conversationId, [workItem]),
  );
};

// ---------------------------------------------------------------------------
// Registrations
// ---------------------------------------------------------------------------

export const mediaHandlers: HandlerRegistration[] = [
  defineHandler('mediaTaskCreated', handleMediaTaskCreated),
  defineHandler('mediaTaskProgress', handleMediaTaskProgress),
];
