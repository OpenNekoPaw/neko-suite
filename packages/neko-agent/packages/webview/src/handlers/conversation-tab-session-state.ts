import { projectConversationTabActivation } from '@/presenters/conversation-tab-activation-presenter';
import type { ActiveTurnTimelineState } from '@/presenters/active-turn-timeline-presenter';
import type { AgentMarkdownSessionPublication } from '@/markdown/agent-markdown-session-registry';
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

  const timeline = projection.streaming.activeTurnTimeline;
  const markdownPublication = timeline
    ? commitActiveTurnTimelineMarkdownSnapshot(context, timeline)
    : undefined;

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
  markdownPublication?.publish();
}

export function commitActiveTurnTimelineMarkdownSnapshot(
  context: MessageHandlerContext,
  timeline: ActiveTurnTimelineState,
): AgentMarkdownSessionPublication | undefined {
  const registry = context.markdownSessionRegistry;
  if (!registry) {
    const hasMarkdownItems = timeline.items.some(
      (item) => item.kind === 'assistant_text' || item.kind === 'thinking',
    );
    if (hasMarkdownItems) {
      throw new Error(
        `Markdown session registry is required to activate Timeline-owned conversation ${timeline.conversationId}.`,
      );
    }
    return undefined;
  }
  return registry.commitTimelineSnapshot({
    conversationId: timeline.conversationId,
    messageId: timeline.messageId,
    items: timeline.items,
  });
}
