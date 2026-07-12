import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { AgentQueuedMessageItem, Message } from '@neko-agent/types';
import type {
  ConversationActivationSource,
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
}): ConversationRenderSnapshot {
  const baseRevision = input.coordinator.read(input.conversationId)?.revision ?? 0;
  return input.coordinator.ingest({
    kind: 'host-snapshot',
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

export function commitConversationRenderActivation(input: {
  readonly coordinator: ConversationRenderCoordinator;
  readonly source: ConversationActivationSource;
  readonly conversation: ConversationRenderActivationInput;
  readonly visibleState: ConversationVisibleStatePort;
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
  transaction.commit({ visibleState: input.visibleState });
  return transaction.snapshot;
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

function toConversationStreamingSnapshot(
  streaming: ConversationRenderStreamingState,
): ConversationStreamingSnapshot {
  return {
    streamingMessageId: streaming.streamingMessageId,
    isThinking: streaming.isThinking,
    queuedMessageCount: streaming.queuedMessageCount ?? 0,
    queuedMessages: streaming.queuedMessages ?? [],
    ...(streaming.messageQueueVersion !== undefined
      ? { messageQueueVersion: streaming.messageQueueVersion }
      : {}),
  };
}

function toConversationRenderStreamingState(
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
  };
}
