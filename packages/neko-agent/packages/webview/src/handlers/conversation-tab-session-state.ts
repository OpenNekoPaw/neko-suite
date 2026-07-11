import type { ActiveTurnTimelineState } from '@/presenters/active-turn-timeline-presenter';
import type { AgentMarkdownSessionPublication } from '@/markdown/agent-markdown-session-registry';
import type { MessageHandlerContext } from './types';
import {
  ConversationRenderLifecycleError,
  type ConversationActivationSource,
} from '@/render-lifecycle/conversation-render-contract';
import {
  commitConversationRenderActivation,
  commitConversationSnapshotProjection,
  createConversationMarkdownTimelineResourceOwner,
  createConversationVisibleStatePort,
  createRetainedConversationRenderActivation,
  ingestConversationRenderSnapshot,
} from '@/render-lifecycle/conversation-render-state-adapter';

export function persistCurrentVisibleConversation(context: MessageHandlerContext): void {
  const conversationId = context.activeConversationIdRef.current;
  if (!conversationId) return;

  const coordinator = context.conversationRenderCoordinator;
  if (!coordinator) {
    throw new Error('Conversation persistence requires the canonical render coordinator.');
  }
  const snapshot = ingestConversationRenderSnapshot({
    coordinator,
    conversationId,
    messages: context.messages,
    streaming: {
      ...(context.conversationStreamingRef.current.get(conversationId) ?? {}),
      streamingMessageId: context.streamingMessageIdRef.current,
      isThinking: context.isThinking,
      queuedMessageCount: context.queuedMessageCount ?? 0,
      queuedMessages: context.queuedMessages ?? [],
    },
  });
  commitConversationSnapshotProjection({
    snapshot,
    conversationMessagesRef: context.conversationMessagesRef,
    conversationStreamingRef: context.conversationStreamingRef,
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
  context.isTablessConversationViewRef.current = false;
  commitConversationRenderActivation({
    coordinator,
    source,
    conversation: createRetainedConversationRenderActivation({
      conversationId,
      cachedMessages: context.conversationMessagesRef.current.get(conversationId),
      cachedStreaming: context.conversationStreamingRef.current.get(conversationId),
    }),
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
      throw new ConversationRenderLifecycleError({
        code: 'markdown-resource-owner-missing',
        message: `Markdown session registry is required to activate Timeline-owned conversation ${timeline.conversationId}.`,
        conversationId: timeline.conversationId,
        currentRevision: context.conversationRenderCoordinator?.revision(timeline.conversationId),
        messageId: timeline.messageId,
        turnId: timeline.turnId,
      });
    }
    return undefined;
  }
  return registry.commitTimelineSnapshot({
    conversationId: timeline.conversationId,
    messageId: timeline.messageId,
    items: timeline.items,
  });
}
