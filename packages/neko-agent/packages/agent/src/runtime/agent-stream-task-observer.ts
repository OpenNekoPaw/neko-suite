import type { TaskCreatedMessage, TaskUpdatedMessage } from '@neko-agent/types';
import type { BackgroundTaskProgressPatch, BackgroundTaskView } from '../task/task-view-projector';
import type { AgentEvent } from '../session/types';
import {
  type AgentStreamBackgroundTaskPersistInput,
  projectAgentStreamBackgroundTaskProgress,
  projectAgentStreamBackgroundTaskStart,
} from './agent-stream-background-task';

export interface AgentStreamBackgroundTaskDeliveryContext {
  readonly conversationId: string;
  readonly taskId: string;
  readonly toolCallId?: string;
  readonly taskType: BackgroundTaskView['type'];
  readonly baseTask: BackgroundTaskView;
}

export interface AgentStreamBackgroundTaskObservedProgress<TDeliveryPlan = unknown> {
  readonly progress: BackgroundTaskProgressPatch;
  readonly deliveryPlan?: TDeliveryPlan;
  readonly persistResultUrls?: readonly string[];
}

export interface AgentStreamBackgroundTaskProgressEvent<
  TSourceTask = unknown,
  TDeliveryPlan = unknown,
> {
  readonly conversationId: string;
  readonly task: AgentStreamBackgroundTaskObservedProgress<TDeliveryPlan>;
  readonly sourceTask: TSourceTask;
}

export interface AgentStreamBackgroundTaskIgnoredEvent<TSourceTask = unknown> {
  readonly taskId: string;
  readonly conversationId: string;
  readonly sourceTask: TSourceTask;
}

export interface AgentStreamBackgroundTaskProgressErrorEvent<
  TSourceTask = unknown,
  TDeliveryPlan = unknown,
> {
  readonly taskId: string;
  readonly conversationId: string;
  readonly sourceTask: TSourceTask;
  readonly error: unknown;
  readonly recoveryTask?: AgentStreamBackgroundTaskObservedProgress<TDeliveryPlan>;
}

export interface ObserveAgentStreamBackgroundTaskProgressInput<
  TSourceTask = unknown,
  TDeliveryPlan = unknown,
> {
  readonly taskId: string;
  readonly conversationId: string;
  readonly unsubscribeOnIgnoredConversation: boolean;
  readonly createRecoveryTaskView: (
    task: TSourceTask,
  ) => AgentStreamBackgroundTaskObservedProgress<TDeliveryPlan>;
  readonly createTaskView: (
    task: TSourceTask,
  ) =>
    | AgentStreamBackgroundTaskObservedProgress<TDeliveryPlan>
    | Promise<AgentStreamBackgroundTaskObservedProgress<TDeliveryPlan>>;
  readonly onTaskProgress: (
    event: AgentStreamBackgroundTaskProgressEvent<TSourceTask, TDeliveryPlan>,
  ) => void | Promise<void>;
  readonly onIgnoredConversationTask?: (
    event: AgentStreamBackgroundTaskIgnoredEvent<TSourceTask>,
  ) => void;
  readonly onProgressDeliveryError?: (
    event: AgentStreamBackgroundTaskProgressErrorEvent<TSourceTask, TDeliveryPlan>,
  ) => void;
}

export interface StartAgentStreamBackgroundTaskObserverInput<
  TSourceTask = unknown,
  TDeliveryPlan = unknown,
> {
  readonly conversationId: string;
  readonly messageId: string;
  readonly event: AgentEvent;
  readonly postMessage: (message: TaskCreatedMessage | TaskUpdatedMessage) => void | Promise<void>;
  readonly observeProgress?: (
    input: ObserveAgentStreamBackgroundTaskProgressInput<TSourceTask, TDeliveryPlan>,
  ) => void | (() => void);
  readonly createRecoveryProgress: (task: TSourceTask) => BackgroundTaskProgressPatch;
  readonly createProgressDelivery: (
    task: TSourceTask,
    context: AgentStreamBackgroundTaskDeliveryContext,
  ) =>
    | AgentStreamBackgroundTaskObservedProgress<TDeliveryPlan>
    | Promise<AgentStreamBackgroundTaskObservedProgress<TDeliveryPlan>>;
  readonly persistResultUrls?: (
    input: AgentStreamBackgroundTaskPersistInput<TDeliveryPlan>,
  ) => void;
  readonly onIgnoredConversationTask?: (
    event: AgentStreamBackgroundTaskIgnoredEvent<TSourceTask>,
  ) => void;
  readonly onProgressDeliveryError?: (
    event: AgentStreamBackgroundTaskProgressErrorEvent<TSourceTask, TDeliveryPlan>,
  ) => void;
  readonly now?: () => number;
}

export type StartAgentStreamBackgroundTaskObserverResult =
  | {
      readonly started: false;
    }
  | {
      readonly started: true;
      readonly taskId: string;
      readonly task: BackgroundTaskView;
      readonly unsubscribe?: () => void;
    };

export function startAgentStreamBackgroundTaskObserver<
  TSourceTask = unknown,
  TDeliveryPlan = unknown,
>(
  input: StartAgentStreamBackgroundTaskObserverInput<TSourceTask, TDeliveryPlan>,
): StartAgentStreamBackgroundTaskObserverResult {
  const start = projectAgentStreamBackgroundTaskStart({
    conversationId: input.conversationId,
    messageId: input.messageId,
    event: input.event,
    now: input.now,
  });
  if (!start) return { started: false };

  void input.postMessage(start.message);

  const observeProgress = input.observeProgress;
  if (!observeProgress) {
    return {
      started: true,
      taskId: start.taskId,
      task: start.task,
    };
  }

  const context: AgentStreamBackgroundTaskDeliveryContext = {
    conversationId: input.conversationId,
    taskId: start.taskId,
    ...(start.toolCallId ? { toolCallId: start.toolCallId } : {}),
    taskType: start.taskType,
    baseTask: start.task,
  };
  const unsubscribe = observeProgress({
    taskId: start.taskId,
    conversationId: input.conversationId,
    unsubscribeOnIgnoredConversation: true,
    createRecoveryTaskView: (task) => ({
      progress: input.createRecoveryProgress(task),
    }),
    createTaskView: (task) => input.createProgressDelivery(task, context),
    onIgnoredConversationTask: input.onIgnoredConversationTask,
    onProgressDeliveryError: input.onProgressDeliveryError,
    onTaskProgress: async ({ conversationId, task, sourceTask }) => {
      if (conversationId !== input.conversationId) {
        input.onIgnoredConversationTask?.({
          taskId: start.taskId,
          conversationId: input.conversationId,
          sourceTask,
        });
        return;
      }

      const projection = projectAgentStreamBackgroundTaskProgress({
        conversationId: input.conversationId,
        baseTask: start.task,
        progress: task.progress,
        parentMessageId: input.messageId,
        parentToolCallId: start.toolCallId,
        deliveryPlan: task.deliveryPlan,
        persistResultUrls: task.persistResultUrls,
      });
      await input.postMessage(projection.message);

      if (projection.persistResultUrls) {
        input.persistResultUrls?.({
          conversationId: input.conversationId,
          taskId: start.taskId,
          ...(start.toolCallId ? { toolCallId: start.toolCallId } : {}),
          urls: projection.persistResultUrls,
          ...(projection.deliveryPlan !== undefined
            ? { deliveryPlan: projection.deliveryPlan }
            : {}),
        });
      }
    },
  });

  return {
    started: true,
    taskId: start.taskId,
    task: start.task,
    ...(typeof unsubscribe === 'function' ? { unsubscribe } : {}),
  };
}
