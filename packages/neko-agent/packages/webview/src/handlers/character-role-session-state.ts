import type { Message } from '@neko-agent/types';
import {
  idleStreamingState,
  projectCharacterRoleSessionView,
} from '@/presenters/character-role-session-presenter';
import type { MessageHandlerContext, StreamingState } from './types';
import { migrateRestoredConversationTabView } from './tab-restore-migration';

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

export function activateCharacterRoleSessionView(
  context: MessageHandlerContext,
  input: {
    readonly sessionId: string;
    readonly cachedMessages?: readonly Message[];
    readonly cachedStreaming?: StreamingState;
  },
): void {
  const restored = migrateRestoredConversationTabView({
    messages: input.cachedMessages,
    streaming: input.cachedStreaming ?? idleStreamingState(),
  });
  const projection = projectCharacterRoleSessionView({
    sessionId: input.sessionId,
    cachedMessages: restored.messages,
    cachedStreaming: restored.streaming,
  });

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
