import type {
  AgentPhase,
  AgentTurnTimelineItemStatus,
  AgentTurnTimelineItem,
  AgentTurnTimelineMessage,
  AgentWorkItem,
  ContentBlock,
  Message,
  TaskCreatedMessage,
  TaskUpdatedMessage,
} from '@neko-agent/types';
import { buildAgentTurnTimelineMessage } from '@neko-agent/types';
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
  type AgentStreamBackgroundTaskCompletion,
  type AgentStreamBackgroundTaskProgressErrorEvent,
  type AgentStreamBackgroundTaskWaitInput,
  type ObserveAgentStreamBackgroundTaskProgressInput,
  type StartAgentStreamBackgroundTaskObserverInput,
} from './agent-stream-task-observer';
import type { AgentStreamPersistenceSnapshot } from './message-runtime';
import type { AgentStreamBackgroundTaskPersistInput } from './agent-stream-background-task';
import { applyToolResultBackfillToResult } from './tool-result-backfill';
import { buildAgentAssistantMessageFromStream } from './message-runtime';

export type AgentEventStreamRuntimeMessage =
  AgentStreamProjectionMessage | AgentTurnTimelineMessage | TaskCreatedMessage | TaskUpdatedMessage;

export interface AgentEventStreamRuntimeBackgroundTasks<
  TSourceTask = unknown,
  TDeliveryPlan = unknown,
> {
  readonly observeProgress?: (
    input: ObserveAgentStreamBackgroundTaskProgressInput<TSourceTask, TDeliveryPlan>,
  ) => void | (() => void);
  readonly waitForCompletion?: (input: AgentStreamBackgroundTaskWaitInput) => Promise<TSourceTask>;
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
    const timeline = createAgentTurnTimelineProjection({
      conversationId: input.conversationId,
      messageId: streamingMessageId,
      now: input.now,
    });
    const backgroundTaskCompletions: Promise<AgentStreamBackgroundTaskCompletion>[] = [];
    let lastPartialSnapshotAt = 0;

    for await (const event of input.events) {
      const eventTime = input.now?.() ?? Date.now();
      const stateUpdate = applyAgentStreamEventToState(streamState, event, {
        now: () => eventTime,
      });
      if (stateUpdate.phaseChange) {
        input.onPhaseChange?.(stateUpdate.phaseChange.phase, stateUpdate.phaseChange.toolName);
      }

      const timelineMessage = timeline.project(event, eventTime);
      if (timelineMessage) {
        await input.postMessage(timelineMessage);
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
        if (!shouldPostProjectionMessageToWebview(message)) {
          continue;
        }
        await input.postMessage(message);
      }

      if (event.type === 'tool_result') {
        const completion = this.subscribeToBackgroundTaskProgress(
          input,
          streamingMessageId,
          event,
          timeline,
        );
        if (completion) {
          backgroundTaskCompletions.push(completion);
        }
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
    if (backgroundTaskCompletions.length > 0) {
      await Promise.all(backgroundTaskCompletions);
    }
    const finalTimelineMessage = timeline.complete(streamState.contentBlocks);
    if (finalTimelineMessage) {
      await input.postMessage(finalTimelineMessage);
    }
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
    timeline: AgentTurnTimelineProjection,
  ): Promise<AgentStreamBackgroundTaskCompletion> | undefined {
    const backgroundTasks = input.backgroundTasks;
    if (!backgroundTasks) {
      return undefined;
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
      postMessage: async (message) => {
        const timelineMessage = timeline.projectWorkItem(message.workItem);
        if (timelineMessage) {
          await input.postMessage(timelineMessage);
        }
      },
      observeProgress: backgroundTasks.observeProgress,
      waitForCompletion: backgroundTasks.waitForCompletion,
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
    return observer.started ? observer.completion : undefined;
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

function shouldPostProjectionMessageToWebview(message: AgentStreamProjectionMessage): boolean {
  switch (message.type) {
    case 'messageQueued':
    case 'contextTokenCount':
    case 'streamComplete':
      return true;
    case 'streamThinking':
    case 'streamText':
    case 'toolCall':
    case 'toolResult':
    case 'toolResultBackfill':
    case 'toolConfirmation':
    case 'error':
      return false;
  }
  return false;
}

function createAgentTurnTimelineProjection(input: {
  readonly conversationId: string;
  readonly messageId: string;
  readonly now?: () => number;
}): AgentTurnTimelineProjection {
  const turnId = `turn-${input.messageId}`;
  let sequence = 0;
  let activeTextItem: AgentTurnTimelineItem | null = null;
  let activeThinkingItem: AgentTurnTimelineItem | null = null;
  const toolItemsByToolCallId = new Map<string, AgentTurnTimelineItem>();
  const workItemsById = new Map<string, AgentTurnTimelineItem>();

  const nextSequence = () => {
    sequence += 1;
    return sequence;
  };

  const closeText = (eventTime: number): AgentTurnTimelineItem[] => {
    const events: AgentTurnTimelineItem[] = [];
    if (activeTextItem?.kind === 'assistant_text' && activeTextItem.status === 'streaming') {
      activeTextItem = { ...activeTextItem, status: 'complete', updatedAt: eventTime };
      events.push(activeTextItem);
      activeTextItem = null;
    }
    if (activeThinkingItem?.kind === 'thinking' && activeThinkingItem.status === 'streaming') {
      activeThinkingItem = { ...activeThinkingItem, status: 'complete', updatedAt: eventTime };
      events.push(activeThinkingItem);
      activeThinkingItem = null;
    }
    return events;
  };

  const buildMessage = (
    events: readonly AgentTurnTimelineItem[],
    finalContentBlocks?: readonly ContentBlock[],
  ): AgentTurnTimelineMessage | null => {
    if (events.length === 0 && (!finalContentBlocks || finalContentBlocks.length === 0)) {
      return null;
    }
    return buildAgentTurnTimelineMessage({
      conversationId: input.conversationId,
      turnId,
      messageId: input.messageId,
      events,
      ...(finalContentBlocks ? { finalContentBlocks } : {}),
    });
  };

  return {
    project(event, eventTime) {
      switch (event.type) {
        case 'assistant_text_replacement': {
          const closedThinking = closeThinking(activeThinkingItem, eventTime);
          if (closedThinking) activeThinkingItem = null;
          const events: AgentTurnTimelineItem[] = closedThinking ? [closedThinking] : [];
          if (activeTextItem?.kind === 'assistant_text') {
            activeTextItem = {
              ...activeTextItem,
              payload: {
                ...activeTextItem.payload,
                content: '',
                replaceContent: true,
              },
              status: 'streaming',
              updatedAt: eventTime,
            };
            events.push(activeTextItem);
            return buildMessage(events);
          }

          activeTextItem = {
            conversationId: input.conversationId,
            turnId,
            messageId: input.messageId,
            itemId: `text-${nextSequence()}`,
            sequence,
            kind: 'assistant_text',
            status: 'streaming',
            payload: { content: '', format: 'markdown', replaceContent: true },
            createdAt: eventTime,
            updatedAt: eventTime,
          };
          events.push(activeTextItem);
          return buildMessage(events);
        }
        case 'thinking_content': {
          if (activeThinkingItem?.kind === 'thinking') {
            activeThinkingItem = {
              ...activeThinkingItem,
              payload: {
                ...activeThinkingItem.payload,
                content: `${activeThinkingItem.payload.content}${event.thinking ?? ''}`,
              },
              updatedAt: eventTime,
            };
          } else {
            activeThinkingItem = {
              conversationId: input.conversationId,
              turnId,
              messageId: input.messageId,
              itemId: `thinking-${nextSequence()}`,
              sequence,
              kind: 'thinking',
              status: 'streaming',
              payload: { content: event.thinking ?? '' },
              createdAt: eventTime,
              updatedAt: eventTime,
            };
          }
          return buildMessage([activeThinkingItem]);
        }
        case 'text':
        case 'text_delta': {
          const closedThinking = closeThinking(activeThinkingItem, eventTime);
          if (closedThinking) activeThinkingItem = null;
          const events: AgentTurnTimelineItem[] = closedThinking ? [closedThinking] : [];
          if (activeTextItem?.kind === 'assistant_text') {
            activeTextItem = {
              ...activeTextItem,
              payload: {
                ...activeTextItem.payload,
                content: `${activeTextItem.payload.content}${event.content ?? ''}`,
              },
              updatedAt: eventTime,
            };
          } else {
            activeTextItem = {
              conversationId: input.conversationId,
              turnId,
              messageId: input.messageId,
              itemId: `text-${nextSequence()}`,
              sequence,
              kind: 'assistant_text',
              status: 'streaming',
              payload: { content: event.content ?? '', format: 'markdown' },
              createdAt: eventTime,
              updatedAt: eventTime,
            };
          }
          events.push(activeTextItem);
          return buildMessage(events);
        }
        case 'tool_call': {
          const events = closeText(eventTime);
          const toolCall = event.toolCall;
          if (!toolCall) {
            return buildMessage(events);
          }
          const item: AgentTurnTimelineItem = {
            conversationId: input.conversationId,
            turnId,
            messageId: input.messageId,
            itemId: `tool-${toolCall.id}`,
            sequence: nextSequence(),
            kind: 'tool_call',
            status: 'pending',
            payload: { toolCall },
            createdAt: eventTime,
            updatedAt: eventTime,
          };
          toolItemsByToolCallId.set(toolCall.id, item);
          return buildMessage([...events, item]);
        }
        case 'tool_result': {
          const result = event.toolResult;
          if (!result?.toolCallId) {
            return null;
          }
          const existingItem = toolItemsByToolCallId.get(result.toolCallId);
          if (!existingItem || existingItem.kind !== 'tool_call') {
            return null;
          }
          const existingToolCall = existingItem.payload.toolCall;
          const item: AgentTurnTimelineItem = {
            conversationId: input.conversationId,
            turnId,
            messageId: input.messageId,
            itemId: existingItem.itemId,
            sequence: existingItem.sequence,
            kind: 'tool_call',
            status: result.success ? 'succeeded' : 'failed',
            payload: {
              toolCall: {
                id: result.toolCallId,
                name: existingToolCall.name,
                arguments: existingToolCall.arguments,
                result: {
                  success: result.success,
                  data: result.data,
                  error: result.error,
                  ...(result.attachments ? { attachments: result.attachments } : {}),
                  ...(result.perceptionCards ? { perceptionCards: result.perceptionCards } : {}),
                  ...(result.backfillDiagnostics
                    ? { backfillDiagnostics: result.backfillDiagnostics }
                    : {}),
                  ...(result.artifacts ? { artifacts: result.artifacts } : {}),
                },
              },
            },
            createdAt: existingItem.createdAt,
            updatedAt: eventTime,
          };
          toolItemsByToolCallId.set(result.toolCallId, item);
          return buildMessage([item]);
        }
        case 'tool_result_backfill': {
          const backfill = event.toolResultBackfill;
          if (!backfill?.toolCallId) {
            return null;
          }
          const existingItem = toolItemsByToolCallId.get(backfill.toolCallId);
          if (!existingItem || existingItem.kind !== 'tool_call') {
            return null;
          }
          const existingToolCall = existingItem.payload.toolCall;
          const mergedResult = applyToolResultBackfillToResult(existingToolCall.result, backfill);
          const item: AgentTurnTimelineItem = {
            ...existingItem,
            status: mergedResult.result.success ? 'succeeded' : 'failed',
            payload: {
              toolCall: {
                ...existingToolCall,
                result: mergedResult.result,
              },
            },
            updatedAt: eventTime,
          };
          toolItemsByToolCallId.set(backfill.toolCallId, item);
          return buildMessage([item]);
        }
        case 'tool_confirmation': {
          const toolCall = event.toolConfirmation?.toolCall;
          if (!toolCall?.id) {
            return null;
          }
          const existingItem = toolItemsByToolCallId.get(toolCall.id);
          if (!existingItem || existingItem.kind !== 'tool_call') {
            return null;
          }
          const item: AgentTurnTimelineItem = {
            ...existingItem,
            status: 'pending',
            payload: {
              toolCall: {
                ...existingItem.payload.toolCall,
                pendingConfirmation: true,
                confirmation: {
                  action: event.toolConfirmation?.action ?? '',
                  description: event.toolConfirmation?.description ?? '',
                  details: event.toolConfirmation?.details ?? {},
                },
              },
            },
            updatedAt: eventTime,
          };
          toolItemsByToolCallId.set(toolCall.id, item);
          return buildMessage([item]);
        }
        case 'error': {
          const events = closeText(eventTime);
          const errorCode = readErrorCode(event.error);
          const errorDetails = readErrorDetails(event.error);
          const item: AgentTurnTimelineItem = {
            conversationId: input.conversationId,
            turnId,
            messageId: input.messageId,
            itemId: `error-${nextSequence()}`,
            sequence,
            kind: 'error',
            status: 'failed',
            payload: {
              message: event.error?.message ?? 'An error occurred',
              ...(errorCode ? { code: errorCode } : {}),
              ...(errorDetails ? { details: errorDetails } : {}),
            },
            createdAt: eventTime,
            updatedAt: eventTime,
          };
          return buildMessage([...events, item]);
        }
        case 'done':
          return null;
        default:
          return null;
      }
    },
    complete(contentBlocks) {
      const eventTime = input.now?.() ?? Date.now();
      const events = closeText(eventTime);
      return buildMessage(events, contentBlocks);
    },
    projectWorkItem(workItem) {
      const eventTime = input.now?.() ?? Date.now();
      const existing = workItemsById.get(workItem.id);
      const sequenceValue = existing?.sequence ?? nextSequence();
      const core = {
        conversationId: input.conversationId,
        turnId,
        messageId: input.messageId,
        itemId: `${workItem.kind}-${workItem.id}`,
        sequence: sequenceValue,
        status: toTimelineStatus(workItem.status),
        createdAt: existing?.createdAt ?? eventTime,
        updatedAt: eventTime,
      };
      const anchor = workItem.parentToolCallId
        ? { parentAnchor: 'tool_call' as const, parentToolCallId: workItem.parentToolCallId }
        : { parentAnchor: 'turn' as const };
      const item: AgentTurnTimelineItem =
        workItem.kind === 'media-task'
          ? {
              ...core,
              ...anchor,
              kind: 'media',
              payload: { workItem },
            }
          : {
              ...core,
              ...anchor,
              kind: 'task',
              payload: { workItem },
            };
      workItemsById.set(workItem.id, item);
      return buildMessage([item]);
    },
  };
}

interface AgentTurnTimelineProjection {
  readonly project: (event: AgentEvent, eventTime: number) => AgentTurnTimelineMessage | null;
  readonly complete: (contentBlocks: readonly ContentBlock[]) => AgentTurnTimelineMessage | null;
  readonly projectWorkItem: (workItem: AgentWorkItem) => AgentTurnTimelineMessage | null;
}

function toTimelineStatus(status: AgentWorkItem['status']): AgentTurnTimelineItemStatus {
  switch (status) {
    case 'completed':
      return 'succeeded';
    case 'failed':
    case 'cancelled':
      return 'failed';
    case 'queued':
    case 'processing':
      return 'pending';
  }
}

function closeThinking(
  item: AgentTurnTimelineItem | null,
  eventTime: number,
): AgentTurnTimelineItem | null {
  if (item?.kind !== 'thinking' || item.status !== 'streaming') {
    return null;
  }
  return { ...item, status: 'complete', updatedAt: eventTime };
}

function isPersistablePartialEvent(event: AgentEvent): boolean {
  return (
    event.type === 'thinking_content' ||
    event.type === 'text' ||
    event.type === 'text_delta' ||
    event.type === 'assistant_text_replacement' ||
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

function readErrorCode(error: AgentEvent['error']): string | undefined {
  if (!isRecord(error)) return undefined;
  const code = error['code'];
  return typeof code === 'string' && code.length > 0 ? code : undefined;
}

function readErrorDetails(error: AgentEvent['error']): Record<string, unknown> | undefined {
  if (!isRecord(error)) return undefined;
  const context = error['context'];
  return isRecord(context) ? context : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
