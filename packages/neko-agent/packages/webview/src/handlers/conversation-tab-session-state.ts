import { projectConversationTabActivation } from '@/presenters/conversation-tab-activation-presenter';
import type { ActiveTurnTimelineState } from '@/presenters/active-turn-timeline-presenter';
import type { AgentMarkdownSessionPublication } from '@/markdown/agent-markdown-session-registry';
import type { MessageHandlerContext } from './types';
import type { ConversationActivationSource } from '@/render-lifecycle/conversation-render-contract';
import {
  commitConversationRenderActivation,
  createConversationMarkdownTimelineResourceOwner,
  createConversationVisibleStatePort,
} from '@/render-lifecycle/legacy-conversation-render-adapter';

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
  source: ConversationActivationSource,
): void {
  const coordinator = context.conversationRenderCoordinator;
  if (!coordinator) {
    throw new Error('Conversation activation requires the canonical render coordinator.');
  }
  const projection = projectConversationTabActivation({
    conversationId,
    cachedMessages: context.conversationMessagesRef.current.get(conversationId),
    cachedStreaming: context.conversationStreamingRef.current.get(conversationId),
  });

  context.isTablessConversationViewRef.current = false;
  commitConversationRenderActivation({
    coordinator,
    source,
    projection,
    visibleState: createConversationVisibleStatePort({
      activeConversationIdRef: context.activeConversationIdRef,
      streamingMessageIdRef: context.streamingMessageIdRef,
      conversationMessagesRef: context.conversationMessagesRef,
      conversationStreamingRef: context.conversationStreamingRef,
      setMessages: context.setMessages,
      setStreamingMessageId: context.setStreamingMessageId,
      setIsThinking: context.setIsThinking,
      setQueuedMessageCount: context.setQueuedMessageCount,
      setQueuedMessages: context.setQueuedMessages,
      setActiveConversationId: context.setActiveConversationId,
    }),
    markdown: createConversationMarkdownTimelineResourceOwner((timeline) =>
      commitActiveTurnTimelineMarkdownSnapshot(context, timeline),
    ),
  });
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
