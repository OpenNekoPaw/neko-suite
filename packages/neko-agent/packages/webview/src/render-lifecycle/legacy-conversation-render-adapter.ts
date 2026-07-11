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

export interface LegacyConversationStreamingState {
  readonly streamingMessageId: string | null;
  readonly isThinking: boolean;
  readonly queuedMessageCount?: number;
  readonly queuedMessages?: readonly AgentQueuedMessageItem[];
  readonly messageQueueVersion?: number;
  readonly activeTurnTimeline?: ActiveTurnTimelineState | null;
}

export interface ConversationActivationProjectionInput {
  readonly activeConversationId: string;
  readonly messages: readonly Message[];
  readonly streaming: LegacyConversationStreamingState;
}

export interface ConversationVisibleStateAdapterInput {
  readonly activeConversationIdRef: MutableRefObject<string | null>;
  readonly streamingMessageIdRef: MutableRefObject<string | null>;
  readonly conversationMessagesRef: MutableRefObject<Map<string, Message[]>>;
  readonly conversationStreamingRef: MutableRefObject<
    Map<string, LegacyConversationStreamingState>
  >;
  readonly setMessages: Dispatch<SetStateAction<Message[]>>;
  readonly setStreamingMessageId: Dispatch<SetStateAction<string | null>>;
  readonly setIsThinking: Dispatch<SetStateAction<boolean>>;
  readonly setQueuedMessageCount?: Dispatch<SetStateAction<number>>;
  readonly setQueuedMessages?: Dispatch<SetStateAction<readonly AgentQueuedMessageItem[]>>;
  readonly setActiveConversationId: Dispatch<SetStateAction<string | null>>;
}

export function ingestLegacyConversationRenderSnapshot(input: {
  readonly coordinator: ConversationRenderCoordinator;
  readonly conversationId: string;
  readonly messages: readonly Message[];
  readonly streaming: LegacyConversationStreamingState;
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

export function commitLegacyConversationCache(input: {
  readonly snapshot: ConversationRenderSnapshot;
  readonly conversationMessagesRef: MutableRefObject<Map<string, Message[]>>;
  readonly conversationStreamingRef: MutableRefObject<
    Map<string, LegacyConversationStreamingState>
  >;
}): void {
  input.conversationMessagesRef.current.set(input.snapshot.conversationId, [
    ...input.snapshot.messages,
  ]);
  input.conversationStreamingRef.current.set(
    input.snapshot.conversationId,
    toLegacyConversationStreamingState(input.snapshot.streaming),
  );
}

export function commitConversationRenderActivation(input: {
  readonly coordinator: ConversationRenderCoordinator;
  readonly source: ConversationActivationSource;
  readonly projection: ConversationActivationProjectionInput;
  readonly visibleState: ConversationVisibleStatePort;
  readonly markdown: ConversationMarkdownTimelineResourceOwner;
}): ConversationRenderSnapshot {
  const currentRevision =
    input.coordinator.read(input.projection.activeConversationId)?.revision ?? 0;
  input.coordinator.ingest({
    kind: 'host-snapshot',
    conversationId: input.projection.activeConversationId,
    baseRevision: currentRevision,
    messages: input.projection.messages,
    streaming: toConversationStreamingSnapshot(input.projection.streaming),
  });
  const transaction = input.coordinator.prepareActivation({
    kind: 'activation',
    conversationId: input.projection.activeConversationId,
    source: input.source,
  });
  transaction.commit({ visibleState: input.visibleState, markdown: input.markdown });
  return transaction.snapshot;
}

export function createConversationVisibleStatePort(
  input: ConversationVisibleStateAdapterInput,
): ConversationVisibleStatePort {
  return {
    commit(snapshot): void {
      const streaming = toLegacyConversationStreamingState(snapshot.streaming);
      const messages = [...snapshot.messages];
      commitLegacyConversationCache({
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
        'Legacy Markdown activation adapter does not own conversation disposal; use the registry lifecycle owner.',
      );
    },
  };
}

export function toConversationStreamingSnapshot(
  streaming: LegacyConversationStreamingState,
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

export function toLegacyConversationStreamingState(
  streaming: ConversationStreamingSnapshot,
): LegacyConversationStreamingState {
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
