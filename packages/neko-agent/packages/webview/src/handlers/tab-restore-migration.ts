import type { ContentBlock, Message } from '@neko-agent/types';
import type { StreamingState } from './types';

export interface RestoredConversationTabView {
  readonly messages: Message[];
  readonly streaming: StreamingState;
}

/**
 * Finalizes pre-Timeline streaming residue restored from an in-memory tab cache.
 * Canonical Timeline-owned messages remain untouched and must keep their registry session.
 */
export function migrateRestoredConversationTabView(input: {
  readonly messages?: readonly Message[];
  readonly streaming?: StreamingState;
}): RestoredConversationTabView {
  const messages = input.messages ?? [];
  const streaming = input.streaming ?? idleStreamingState();
  const timeline = streaming.activeTurnTimeline;
  const hasRecoverableTimelineOwnership =
    timeline !== null && timeline !== undefined && timeline.synchronization !== 'unavailable';
  const timelineMessageId = hasRecoverableTimelineOwnership ? timeline.messageId : undefined;
  let changed = false;

  const migratedMessages = messages.map((message) => {
    if (message.id === timelineMessageId) return message;
    const migrated = finalizeOrphanedStreamingMessage(message);
    changed ||= migrated !== message;
    return migrated;
  });

  if (hasRecoverableTimelineOwnership) {
    return {
      messages: changed ? migratedMessages : [...messages],
      streaming,
    };
  }

  return {
    messages: changed ? migratedMessages : [...messages],
    streaming: {
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
    const finalized = finalizeOrphanedStreamingBlock(block);
    blocksChanged ||= finalized !== block;
    return finalized;
  });

  if (message.isStreaming !== true && !blocksChanged) return message;
  return {
    ...message,
    isStreaming: false,
    ...(finalizedBlocks ? { contentBlocks: finalizedBlocks } : {}),
  };
}

function finalizeOrphanedStreamingBlock(block: ContentBlock): ContentBlock {
  if (block.type === 'text' && block.isStreaming === true) {
    return { ...block, isStreaming: false };
  }
  if (block.type === 'thinking' && block.isThinkingComplete === false) {
    return { ...block, isThinkingComplete: true };
  }
  return block;
}

function idleStreamingState(): StreamingState {
  return {
    streamingMessageId: null,
    isThinking: false,
    queuedMessageCount: 0,
    queuedMessages: [],
  };
}
