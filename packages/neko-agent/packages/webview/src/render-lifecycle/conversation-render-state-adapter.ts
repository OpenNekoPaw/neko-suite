import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { AgentQueuedMessageItem, Message } from '@neko-agent/types';
import type { ActiveTurnTimelineState } from '@/presenters/active-turn-timeline-presenter';
import type { AgentMarkdownSessionPublication } from '@/markdown/agent-markdown-session-registry';
import type {
  ConversationActivationSource,
  ConversationMarkdownTimelineResourceOwner,
  ConversationRenderSnapshot,
  ConversationStreamingSnapshot,
  ConversationVisibleStatePort,
} from './conversation-render-contract';
import { ConversationRenderCoordinator } from './conversation-render-coordinator';
import { ConversationRenderLifecycleError } from './conversation-render-contract';

export interface ConversationRenderStreamingState {
  readonly streamingMessageId: string | null;
  readonly isThinking: boolean;
  readonly queuedMessageCount?: number;
  readonly queuedMessages?: readonly AgentQueuedMessageItem[];
  readonly messageQueueVersion?: number;
  readonly activeTurnTimeline?: ActiveTurnTimelineState | null;
}

export interface ConversationRenderActivationInput {
  readonly conversationId: string;
  readonly messages: readonly Message[];
  readonly streaming: ConversationRenderStreamingState;
}

export interface ConversationVisibleStateAdapterInput {
  readonly activeConversationIdRef: MutableRefObject<string | null>;
  readonly streamingMessageIdRef: MutableRefObject<string | null>;
  readonly conversationMessagesRef: MutableRefObject<Map<string, Message[]>>;
  readonly conversationStreamingRef: MutableRefObject<
    Map<string, ConversationRenderStreamingState>
  >;
  readonly setMessages: Dispatch<SetStateAction<Message[]>>;
  readonly setStreamingMessageId: Dispatch<SetStateAction<string | null>>;
  readonly setIsThinking: Dispatch<SetStateAction<boolean>>;
  readonly setQueuedMessageCount?: Dispatch<SetStateAction<number>>;
  readonly setQueuedMessages?: Dispatch<SetStateAction<readonly AgentQueuedMessageItem[]>>;
  readonly setActiveConversationId: Dispatch<SetStateAction<string | null>>;
}

export function ingestConversationRenderSnapshot(input: {
  readonly coordinator: ConversationRenderCoordinator;
  readonly conversationId: string;
  readonly messages: readonly Message[];
  readonly streaming: ConversationRenderStreamingState;
  readonly kind?: 'host-snapshot' | 'timeline-commit';
}): ConversationRenderSnapshot {
  const baseRevision = input.coordinator.read(input.conversationId)?.revision ?? 0;
  return input.coordinator.ingest({
    kind: input.kind ?? 'host-snapshot',
    conversationId: input.conversationId,
    baseRevision,
    messages: input.messages,
    streaming: toConversationStreamingSnapshot(input.streaming),
  });
}

export function commitConversationSnapshotProjection(input: {
  readonly snapshot: ConversationRenderSnapshot;
  readonly conversationMessagesRef: MutableRefObject<Map<string, Message[]>>;
  readonly conversationStreamingRef: MutableRefObject<
    Map<string, ConversationRenderStreamingState>
  >;
}): void {
  input.conversationMessagesRef.current.set(input.snapshot.conversationId, [
    ...input.snapshot.messages,
  ]);
  input.conversationStreamingRef.current.set(
    input.snapshot.conversationId,
    toConversationRenderStreamingState(input.snapshot.streaming),
  );
}

export function discardConversationSnapshotProjection(input: {
  readonly conversationId: string;
  readonly conversationMessagesRef: MutableRefObject<Map<string, Message[]>>;
  readonly conversationStreamingRef: MutableRefObject<
    Map<string, ConversationRenderStreamingState>
  >;
}): void {
  input.conversationMessagesRef.current.delete(input.conversationId);
  input.conversationStreamingRef.current.delete(input.conversationId);
}

export function createRetainedConversationRenderActivation(input: {
  readonly conversationId: string;
  readonly cachedMessages?: readonly Message[];
  readonly cachedStreaming?: ConversationRenderStreamingState;
}): ConversationRenderActivationInput {
  const streaming = input.cachedStreaming ?? {
    streamingMessageId: null,
    isThinking: false,
    queuedMessageCount: 0,
    queuedMessages: [],
  };
  return {
    conversationId: input.conversationId,
    messages: projectActivationMessages({
      conversationId: input.conversationId,
      messages: input.cachedMessages ?? [],
      streaming,
    }),
    streaming: projectActivationStreaming(streaming),
  };
}

export function commitConversationRenderActivation(input: {
  readonly coordinator: ConversationRenderCoordinator;
  readonly source: ConversationActivationSource;
  readonly conversation: ConversationRenderActivationInput;
  readonly visibleState: ConversationVisibleStatePort;
  readonly markdown: ConversationMarkdownTimelineResourceOwner;
}): ConversationRenderSnapshot {
  const currentRevision = input.coordinator.read(input.conversation.conversationId)?.revision ?? 0;
  input.coordinator.ingest({
    kind: 'host-snapshot',
    conversationId: input.conversation.conversationId,
    baseRevision: currentRevision,
    messages: input.conversation.messages,
    streaming: toConversationStreamingSnapshot(input.conversation.streaming),
  });
  const transaction = input.coordinator.prepareActivation({
    kind: 'activation',
    conversationId: input.conversation.conversationId,
    source: input.source,
  });
  transaction.commit({ visibleState: input.visibleState, markdown: input.markdown });
  return transaction.snapshot;
}

function projectActivationMessages(input: ConversationRenderActivationInput): Message[] {
  const timeline = input.streaming.activeTurnTimeline;
  const timelineMessageId =
    timeline && timeline.synchronization !== 'unavailable' ? timeline.messageId : undefined;
  return input.messages.map((message) => {
    if (message.id === timelineMessageId) return message;
    return finalizeOrphanedStreamingMessage(message);
  });
}

function projectActivationStreaming(
  streaming: ConversationRenderStreamingState,
): ConversationRenderStreamingState {
  const timeline = streaming.activeTurnTimeline;
  const hasRecoverableTimelineOwnership =
    timeline !== null && timeline !== undefined && timeline.synchronization !== 'unavailable';
  return hasRecoverableTimelineOwnership
    ? streaming
    : {
        ...streaming,
        streamingMessageId: null,
        isThinking: false,
        ...(timeline?.synchronization === 'unavailable' ? { activeTurnTimeline: null } : {}),
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

export function createConversationVisibleStatePort(
  input: ConversationVisibleStateAdapterInput,
): ConversationVisibleStatePort {
  return {
    commit(snapshot): void {
      if (snapshot.visibility !== 'foreground') {
        throw new ConversationRenderLifecycleError({
          code: 'background-visible-state-write',
          message: `Background conversation ${snapshot.conversationId} cannot update foreground visible state.`,
          conversationId: snapshot.conversationId,
          targetRevision: snapshot.revision,
          messageId: snapshot.streaming.activeTurnTimeline?.messageId,
          turnId: snapshot.streaming.activeTurnTimeline?.turnId,
        });
      }
      const streaming = toConversationRenderStreamingState(snapshot.streaming);
      const messages = [...snapshot.messages];
      commitConversationSnapshotProjection({
        snapshot,
        conversationMessagesRef: input.conversationMessagesRef,
        conversationStreamingRef: input.conversationStreamingRef,
      });
      input.setMessages(messages);
      input.setStreamingMessageId(streaming.streamingMessageId);
      input.streamingMessageIdRef.current = streaming.streamingMessageId;
      input.setIsThinking(streaming.isThinking);
      input.setQueuedMessageCount?.(streaming.queuedMessageCount ?? 0);
      input.setQueuedMessages?.(streaming.queuedMessages ?? []);
      input.activeConversationIdRef.current = snapshot.conversationId;
      input.setActiveConversationId(snapshot.conversationId);
    },
    currentConversationId: () => input.activeConversationIdRef.current,
  };
}

export function createConversationMarkdownTimelineResourceOwner(
  commitTimelineSnapshot: (
    timeline: ActiveTurnTimelineState,
  ) => AgentMarkdownSessionPublication | undefined,
): ConversationMarkdownTimelineResourceOwner {
  return {
    prepare(snapshot) {
      const timeline = snapshot.streaming.activeTurnTimeline;
      return timeline ? (commitTimelineSnapshot(timeline) ?? NOOP_PUBLICATION) : NOOP_PUBLICATION;
    },
    disposeConversation(): void {
      throw new Error(
        'Conversation Markdown activation adapter does not own conversation disposal; use the registry lifecycle owner.',
      );
    },
  };
}

export function toConversationStreamingSnapshot(
  streaming: ConversationRenderStreamingState,
): ConversationStreamingSnapshot {
  const activeTurnTimeline = streaming.activeTurnTimeline ?? null;
  const hasExplicitReleasedTimeline =
    Object.prototype.hasOwnProperty.call(streaming, 'activeTurnTimeline') &&
    streaming.activeTurnTimeline === null;
  return {
    streamingMessageId: streaming.streamingMessageId,
    isThinking: streaming.isThinking,
    queuedMessageCount: streaming.queuedMessageCount ?? 0,
    queuedMessages: streaming.queuedMessages ?? [],
    ...(streaming.messageQueueVersion !== undefined
      ? { messageQueueVersion: streaming.messageQueueVersion }
      : {}),
    activeTurnTimeline,
    synchronization:
      activeTurnTimeline?.synchronization ??
      (hasExplicitReleasedTimeline ? 'unavailable' : 'synchronized'),
  };
}

export function toConversationRenderStreamingState(
  streaming: ConversationStreamingSnapshot,
): ConversationRenderStreamingState {
  return {
    streamingMessageId: streaming.streamingMessageId,
    isThinking: streaming.isThinking,
    queuedMessageCount: streaming.queuedMessageCount,
    queuedMessages: streaming.queuedMessages,
    ...(streaming.messageQueueVersion !== undefined
      ? { messageQueueVersion: streaming.messageQueueVersion }
      : {}),
    ...(streaming.activeTurnTimeline !== null || streaming.synchronization === 'unavailable'
      ? { activeTurnTimeline: streaming.activeTurnTimeline }
      : {}),
  };
}

const NOOP_PUBLICATION: AgentMarkdownSessionPublication = {
  publish(): void {},
};
