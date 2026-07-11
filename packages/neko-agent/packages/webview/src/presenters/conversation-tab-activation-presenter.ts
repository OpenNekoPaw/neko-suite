import type {
  AgentQueuedMessageItem,
  ConversationStreamingState,
  Message,
} from '@neko-agent/types';
import type { ActiveTurnTimelineState } from './active-turn-timeline-presenter';

export interface ConversationTabStreamingState extends ConversationStreamingState {
  readonly queuedMessages?: readonly AgentQueuedMessageItem[];
  readonly activeTurnTimeline?: ActiveTurnTimelineState | null;
}

export interface ConversationTabActivationProjection {
  readonly activeConversationId: string;
  readonly messages: Message[];
  readonly streaming: ConversationTabStreamingState;
}

/**
 * Projects every tab activation through the same Timeline ownership boundary.
 * A streaming marker is renderable only while a recoverable Timeline owns it.
 */
export function projectConversationTabActivation(input: {
  readonly conversationId: string;
  readonly cachedMessages?: readonly Message[];
  readonly cachedStreaming?: ConversationTabStreamingState;
}): ConversationTabActivationProjection {
  const messages = input.cachedMessages ?? [];
  const streaming = input.cachedStreaming ?? idleStreamingState();
  const timeline = streaming.activeTurnTimeline;
  const hasRecoverableTimelineOwnership =
    timeline !== null && timeline !== undefined && timeline.synchronization !== 'unavailable';
  const timelineMessageId = hasRecoverableTimelineOwnership ? timeline.messageId : undefined;
  let changed = false;

  const projectedMessages = messages.map((message) => {
    if (message.id === timelineMessageId) return message;
    const projected = finalizeOrphanedStreamingMessage(message);
    changed ||= projected !== message;
    return projected;
  });

  return {
    activeConversationId: input.conversationId,
    messages: changed ? projectedMessages : [...messages],
    streaming: hasRecoverableTimelineOwnership
      ? streaming
      : {
          ...streaming,
          streamingMessageId: null,
          isThinking: false,
          ...(timeline?.synchronization === 'unavailable' ? { activeTurnTimeline: null } : {}),
        },
  };
}

function finalizeOrphanedStreamingMessage(message: Message): Message {
  const contentBlocks = message.contentBlocks;
  let blocksChanged = false;
  const finalizedBlocks = contentBlocks?.map((block) => {
    if (block.type === 'text' && block.isStreaming === true) {
      blocksChanged = true;
      return { ...block, isStreaming: false };
    }
    if (block.type === 'thinking' && block.isThinkingComplete === false) {
      blocksChanged = true;
      return { ...block, isThinkingComplete: true };
    }
    return block;
  });

  if (message.isStreaming !== true && !blocksChanged) return message;
  return {
    ...message,
    isStreaming: false,
    ...(finalizedBlocks ? { contentBlocks: finalizedBlocks } : {}),
  };
}

function idleStreamingState(): ConversationTabStreamingState {
  return {
    streamingMessageId: null,
    isThinking: false,
    queuedMessageCount: 0,
    queuedMessages: [],
  };
}
