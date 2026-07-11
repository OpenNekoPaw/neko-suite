import { projectConversationTabActivation } from '@/presenters/conversation-tab-activation-presenter';
import type { MessageHandlerContext } from './types';

export function persistCurrentVisibleConversation(context: MessageHandlerContext): void {
  const conversationId = context.activeConversationIdRef.current;
  if (!conversationId) return;

  context.conversationMessagesRef.current.set(conversationId, context.messages);
  context.conversationStreamingRef.current.set(conversationId, {
    ...(context.conversationStreamingRef.current.get(conversationId) ?? {}),
    streamingMessageId: context.streamingMessageIdRef.current,
    isThinking: context.isThinking,
    queuedMessageCount: context.queuedMessageCount ?? 0,
    queuedMessages: context.queuedMessages ?? [],
  });
}

export function activateConversationTabView(
  context: MessageHandlerContext,
  conversationId: string,
): void {
  const projection = projectConversationTabActivation({
    conversationId,
    cachedMessages: context.conversationMessagesRef.current.get(conversationId),
    cachedStreaming: context.conversationStreamingRef.current.get(conversationId),
  });

  context.isTablessConversationViewRef.current = false;
  context.conversationMessagesRef.current.set(projection.activeConversationId, projection.messages);
  context.conversationStreamingRef.current.set(
    projection.activeConversationId,
    projection.streaming,
  );
  context.setMessages(projection.messages);
  context.setStreamingMessageId(projection.streaming.streamingMessageId);
  context.streamingMessageIdRef.current = projection.streaming.streamingMessageId;
  context.setIsThinking(projection.streaming.isThinking);
  context.setQueuedMessageCount?.(projection.streaming.queuedMessageCount ?? 0);
  context.setQueuedMessages?.(projection.streaming.queuedMessages ?? []);
  context.activeConversationIdRef.current = projection.activeConversationId;
  context.setActiveConversationId(projection.activeConversationId);
}
