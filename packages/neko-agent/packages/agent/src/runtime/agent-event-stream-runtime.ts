import type {
  AgentPhase,
  Message,
  TaskCreatedMessage,
  TaskUpdatedMessage,
} from '@neko-agent/types';
import type { AgentEvent } from '../session/types';
import {
  applyAgentStreamEventToState,
  buildStreamCompleteProjectionMessage,
  createAgentStreamMessageId,
  createAgentStreamProjectionState,
  finalizeAgentStreamProjectionState,
  projectAgentStreamEventToHostMessages,
  type AgentStreamProjectionMessage,
} from './agent-stream-state';
import {
  startAgentStreamBackgroundTaskObserver,
  type AgentStreamBackgroundTaskObservedProgress,
  type AgentStreamBackgroundTaskProgressErrorEvent,
  type ObserveAgentStreamBackgroundTaskProgressInput,
  type StartAgentStreamBackgroundTaskObserverInput,
} from './agent-stream-task-observer';
import type { AgentStreamPersistenceSnapshot } from './message-runtime';
import type { AgentStreamBackgroundTaskPersistInput } from './agent-stream-background-task';
import { buildAgentAssistantMessageFromStream } from './message-runtime';

export type AgentEventStreamRuntimeMessage =
  | AgentStreamProjectionMessage
  | TaskCreatedMessage
  | TaskUpdatedMessage;

export interface AgentEventStreamRuntimeBackgroundTasks<
  TSourceTask = unknown,
  TDeliveryPlan = unknown,
> {
  readonly observeProgress?: (
    input: ObserveAgentStreamBackgroundTaskProgressInput<TSourceTask, TDeliveryPlan>,
  ) => void | (() => void);
  readonly createRecoveryProgress: StartAgentStreamBackgroundTaskObserverInput<
    TSourceTask,
    TDeliveryPlan
  >['createRecoveryProgress'];
  readonly createProgressDelivery: StartAgentStreamBackgroundTaskObserverInput<
    TSourceTask,
    TDeliveryPlan
  >['createProgressDelivery'];
  readonly persistResultUrls?: (
    input: AgentStreamBackgroundTaskPersistInput<TDeliveryPlan>,
  ) => void;
  readonly onIgnoredConversationTask?: StartAgentStreamBackgroundTaskObserverInput<
    TSourceTask,
    TDeliveryPlan
  >['onIgnoredConversationTask'];
  readonly onProgressDeliveryError?: StartAgentStreamBackgroundTaskObserverInput<
    TSourceTask,
    TDeliveryPlan
  >['onProgressDeliveryError'];
  readonly shouldForgetSubscriptionAfterProgressDelivery?: (
    progress: AgentStreamBackgroundTaskObservedProgress<TDeliveryPlan>,
  ) => boolean;
  readonly shouldForgetSubscriptionAfterProgressError?: (
    event: AgentStreamBackgroundTaskProgressErrorEvent<TSourceTask, TDeliveryPlan>,
  ) => boolean;
}

export interface ProcessAgentEventStreamRuntimeInput<
  TSourceTask = unknown,
  TDeliveryPlan = unknown,
> {
  readonly conversationId: string;
  readonly events: AsyncIterable<AgentEvent>;
  readonly messageId?: string;
  readonly createMessageId?: () => string;
  readonly postMessage: (message: AgentEventStreamRuntimeMessage) => void | Promise<void>;
  readonly onPhaseChange?: (phase: AgentPhase, toolName?: string) => void;
  readonly onPartialAssistantMessage?: (message: Message) => void;
  readonly partialAssistantSnapshotIntervalMs?: number;
  readonly backgroundTasks?: AgentEventStreamRuntimeBackgroundTasks<TSourceTask, TDeliveryPlan>;
  readonly now?: () => number;
}

const DEFAULT_PARTIAL_ASSISTANT_SNAPSHOT_INTERVAL_MS = 250;

export class AgentEventStreamRuntimeProcessor<TSourceTask = unknown, TDeliveryPlan = unknown> {
  private readonly progressSubscriptionsByConversation = new Map<string, Set<() => void>>();

  async process(
    input: ProcessAgentEventStreamRuntimeInput<TSourceTask, TDeliveryPlan>,
  ): Promise<AgentStreamPersistenceSnapshot> {
    const streamingMessageId =
      input.messageId ?? input.createMessageId?.() ?? createAgentStreamMessageId();
    const streamState = createAgentStreamProjectionState();
    const partialSnapshotIntervalMs =
      input.partialAssistantSnapshotIntervalMs ?? DEFAULT_PARTIAL_ASSISTANT_SNAPSHOT_INTERVAL_MS;
    let lastPartialSnapshotAt = 0;

    for await (const event of input.events) {
      const eventTime = input.now?.() ?? Date.now();
      const stateUpdate = applyAgentStreamEventToState(streamState, event, {
        now: () => eventTime,
      });
      if (stateUpdate.phaseChange) {
        input.onPhaseChange?.(stateUpdate.phaseChange.phase, stateUpdate.phaseChange.toolName);
      }

      const messages = projectAgentStreamEventToHostMessages({
        conversationId: input.conversationId,
        messageId: streamingMessageId,
        event,
        plan: stateUpdate.plan,
      });
      for (const message of messages) {
        if (message.type === 'streamComplete') {
          continue;
        }
        await input.postMessage(message);
      }

      if (event.type === 'tool_result') {
        this.subscribeToBackgroundTaskProgress(input, streamingMessageId, event);
      }

      if (
        shouldEmitPartialAssistantSnapshot({
          event,
          eventTime,
          lastPartialSnapshotAt,
          partialSnapshotIntervalMs,
        })
      ) {
        const partialMessage = buildAgentAssistantMessageFromStream({
          id: streamingMessageId,
          timestamp: eventTime,
          stream: {
            accumulatedResponse: streamState.accumulatedResponse,
            accumulatedThinking: streamState.accumulatedThinking,
            hasError: streamState.hasError,
            ...(streamState.errorMessage ? { errorMessage: streamState.errorMessage } : {}),
            collectedToolCalls: streamState.collectedToolCalls,
            contentBlocks: streamState.contentBlocks,
          },
        });
        if (partialMessage) {
          lastPartialSnapshotAt = eventTime;
          input.onPartialAssistantMessage?.({
            ...partialMessage,
            isStreaming: true,
            contentBlocks: partialMessage.contentBlocks?.map((block) => ({ ...block })),
          });
        }
      }
    }

    finalizeAgentStreamProjectionState(streamState);
    await input.postMessage(
      buildStreamCompleteProjectionMessage({
        conversationId: input.conversationId,
        messageId: streamingMessageId,
        contentBlocks: streamState.contentBlocks,
      }),
    );

    return {
      accumulatedResponse: streamState.accumulatedResponse,
      accumulatedThinking: streamState.accumulatedThinking,
      hasError: streamState.hasError,
      ...(streamState.errorMessage ? { errorMessage: streamState.errorMessage } : {}),
      collectedToolCalls: streamState.collectedToolCalls,
      contentBlocks: streamState.contentBlocks,
    };
  }

  clearConversation(conversationId: string): void {
    const subscriptions = this.progressSubscriptionsByConversation.get(conversationId);
    if (!subscriptions) {
      return;
    }

    for (const unsubscribe of subscriptions) {
      unsubscribe();
    }
    this.progressSubscriptionsByConversation.delete(conversationId);
  }

  dispose(): void {
    for (const conversationId of Array.from(this.progressSubscriptionsByConversation.keys())) {
      this.clearConversation(conversationId);
    }
  }

  private subscribeToBackgroundTaskProgress(
    input: ProcessAgentEventStreamRuntimeInput<TSourceTask, TDeliveryPlan>,
    streamingMessageId: string,
    event: AgentEvent,
  ): void {
    const backgroundTasks = input.backgroundTasks;
    if (!backgroundTasks) {
      return;
    }

    let trackedUnsubscribe: (() => void) | undefined;
    const forgetSubscription = () => {
      if (trackedUnsubscribe) {
        this.progressSubscriptionsByConversation
          .get(input.conversationId)
          ?.delete(trackedUnsubscribe);
      }
    };

    const observer = startAgentStreamBackgroundTaskObserver<TSourceTask, TDeliveryPlan>({
      conversationId: input.conversationId,
      messageId: streamingMessageId,
      event,
      postMessage: (message) => {
        input.postMessage(message);
      },
      observeProgress: backgroundTasks.observeProgress,
      createRecoveryProgress: backgroundTasks.createRecoveryProgress,
      createProgressDelivery: async (task, context) => {
        const progress = await backgroundTasks.createProgressDelivery(task, context);
        if (backgroundTasks.shouldForgetSubscriptionAfterProgressDelivery?.(progress)) {
          forgetSubscription();
        }
        return progress;
      },
      persistResultUrls: backgroundTasks.persistResultUrls,
      onIgnoredConversationTask: (ignoredEvent) => {
        backgroundTasks.onIgnoredConversationTask?.(ignoredEvent);
        forgetSubscription();
      },
      onProgressDeliveryError: (errorEvent) => {
        backgroundTasks.onProgressDeliveryError?.(errorEvent);
        if (backgroundTasks.shouldForgetSubscriptionAfterProgressError?.(errorEvent)) {
          forgetSubscription();
        }
      },
      now: input.now,
    });

    if (observer.started && observer.unsubscribe) {
      trackedUnsubscribe = observer.unsubscribe;
      this.trackProgressSubscription(input.conversationId, trackedUnsubscribe);
    }
  }

  private trackProgressSubscription(conversationId: string, unsubscribe: () => void): void {
    const subscriptions = this.progressSubscriptionsByConversation.get(conversationId) ?? new Set();
    subscriptions.add(unsubscribe);
    this.progressSubscriptionsByConversation.set(conversationId, subscriptions);
  }
}

function shouldEmitPartialAssistantSnapshot(input: {
  readonly event: AgentEvent;
  readonly eventTime: number;
  readonly lastPartialSnapshotAt: number;
  readonly partialSnapshotIntervalMs: number;
}): boolean {
  if (!isPersistablePartialEvent(input.event)) {
    return false;
  }
  if (input.lastPartialSnapshotAt === 0) {
    return true;
  }
  if (input.partialSnapshotIntervalMs <= 0) {
    return true;
  }
  if (isStructuralPartialEvent(input.event)) {
    return true;
  }
  return input.eventTime - input.lastPartialSnapshotAt >= input.partialSnapshotIntervalMs;
}

function isPersistablePartialEvent(event: AgentEvent): boolean {
  return (
    event.type === 'thinking_content' ||
    event.type === 'text' ||
    event.type === 'text_delta' ||
    event.type === 'tool_call' ||
    event.type === 'tool_result' ||
    event.type === 'tool_result_backfill' ||
    event.type === 'error'
  );
}

function isStructuralPartialEvent(event: AgentEvent): boolean {
  return (
    event.type === 'tool_call' ||
    event.type === 'tool_result' ||
    event.type === 'tool_result_backfill' ||
    event.type === 'error'
  );
}
