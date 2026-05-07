import type { AgentPhase, TaskCreatedMessage, TaskUpdatedMessage } from '@neko-agent/types';
import type { AgentEvent } from '../session/types';
import {
  applyAgentStreamEventToState,
  createAgentStreamMessageId,
  createAgentStreamProjectionState,
  finalizeAgentStreamProjectionState,
  projectAgentStreamEventToWebviewMessages,
  type AgentStreamWebviewMessage,
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

export type AgentEventStreamRuntimeMessage =
  | AgentStreamWebviewMessage
  | TaskCreatedMessage
  | TaskUpdatedMessage;

export interface AgentEventStreamRuntimeBackgroundTasks<
  TSourceTask = unknown,
  TDeliveryPlan = unknown,
> {
  readonly observeProgress?: (
    input: ObserveAgentStreamBackgroundTaskProgressInput<TSourceTask, TDeliveryPlan>,
  ) => void | (() => void);
  readonly createFallbackProgress: StartAgentStreamBackgroundTaskObserverInput<
    TSourceTask,
    TDeliveryPlan
  >['createFallbackProgress'];
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
  readonly backgroundTasks?: AgentEventStreamRuntimeBackgroundTasks<TSourceTask, TDeliveryPlan>;
  readonly now?: () => number;
}

export class AgentEventStreamRuntimeProcessor<TSourceTask = unknown, TDeliveryPlan = unknown> {
  private readonly progressSubscriptionsByConversation = new Map<string, Set<() => void>>();

  async process(
    input: ProcessAgentEventStreamRuntimeInput<TSourceTask, TDeliveryPlan>,
  ): Promise<AgentStreamPersistenceSnapshot> {
    const streamingMessageId =
      input.messageId ?? input.createMessageId?.() ?? createAgentStreamMessageId();
    const streamState = createAgentStreamProjectionState();

    for await (const event of input.events) {
      const stateUpdate = applyAgentStreamEventToState(streamState, event, {
        now: input.now,
      });
      if (stateUpdate.phaseChange) {
        input.onPhaseChange?.(stateUpdate.phaseChange.phase, stateUpdate.phaseChange.toolName);
      }

      const messages = projectAgentStreamEventToWebviewMessages({
        conversationId: input.conversationId,
        messageId: streamingMessageId,
        event,
        plan: stateUpdate.plan,
      });
      for (const message of messages) {
        input.postMessage(message);
      }

      if (event.type === 'tool_result') {
        this.subscribeToBackgroundTaskProgress(input, streamingMessageId, event);
      }
    }

    finalizeAgentStreamProjectionState(streamState);

    return {
      accumulatedResponse: streamState.accumulatedResponse,
      accumulatedThinking: streamState.accumulatedThinking,
      hasError: streamState.hasError,
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
      createFallbackProgress: backgroundTasks.createFallbackProgress,
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
