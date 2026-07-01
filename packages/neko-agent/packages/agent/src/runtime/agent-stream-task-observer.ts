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

export interface AgentStreamBackgroundTaskWaitInput {
  readonly conversationId: string;
  readonly taskId: string;
  readonly toolCallId?: string;
  readonly taskType: BackgroundTaskView['type'];
  readonly signal: AbortSignal;
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
  readonly waitForCompletion?: (input: AgentStreamBackgroundTaskWaitInput) => Promise<TSourceTask>;
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
      readonly completion: Promise<AgentStreamBackgroundTaskCompletion>;
      readonly unsubscribe?: () => void;
    };

export type AgentStreamBackgroundTaskCompletion =
  | {
      readonly status: 'completed' | 'failed' | 'cancelled';
    }
  | {
      readonly status: 'ignored';
    }
  | {
      readonly status: 'observer-unavailable';
    }
  | {
      readonly status: 'delivery-error';
      readonly error: unknown;
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
      completion: Promise.resolve({ status: 'observer-unavailable' }),
    };
  }

  let settled = false;
  let resolveCompletion: (completion: AgentStreamBackgroundTaskCompletion) => void;
  const completion = new Promise<AgentStreamBackgroundTaskCompletion>((resolve) => {
    resolveCompletion = resolve;
  });
  const waitController = new AbortController();
  const complete = (next: AgentStreamBackgroundTaskCompletion) => {
    if (settled) return;
    settled = true;
    waitController.abort();
    resolveCompletion(next);
  };

  const context: AgentStreamBackgroundTaskDeliveryContext = {
    conversationId: input.conversationId,
    taskId: start.taskId,
    ...(start.toolCallId ? { toolCallId: start.toolCallId } : {}),
    taskType: start.taskType,
    baseTask: start.task,
  };

  const deliverObservedProgress = async (params: {
    readonly conversationId: string;
    readonly task: AgentStreamBackgroundTaskObservedProgress<TDeliveryPlan>;
    readonly sourceTask: TSourceTask;
  }): Promise<void> => {
    if (params.conversationId !== input.conversationId) {
      input.onIgnoredConversationTask?.({
        taskId: start.taskId,
        conversationId: input.conversationId,
        sourceTask: params.sourceTask,
      });
      complete({ status: 'ignored' });
      return;
    }

    const projection = projectAgentStreamBackgroundTaskProgress({
      conversationId: input.conversationId,
      baseTask: start.task,
      progress: params.task.progress,
      parentMessageId: input.messageId,
      parentToolCallId: start.toolCallId,
      deliveryPlan: params.task.deliveryPlan,
      persistResultUrls: params.task.persistResultUrls,
    });
    await input.postMessage(projection.message);

    if (projection.persistResultUrls) {
      input.persistResultUrls?.({
        conversationId: input.conversationId,
        taskId: start.taskId,
        ...(start.toolCallId ? { toolCallId: start.toolCallId } : {}),
        urls: projection.persistResultUrls,
        ...(projection.deliveryPlan !== undefined ? { deliveryPlan: projection.deliveryPlan } : {}),
      });
    }
    const status = projection.task.status;
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      complete({ status });
    }
  };

  const unsubscribe = observeProgress({
    taskId: start.taskId,
    conversationId: input.conversationId,
    unsubscribeOnIgnoredConversation: true,
    createRecoveryTaskView: (task) => ({
      progress: input.createRecoveryProgress(task),
    }),
    createTaskView: (task) => input.createProgressDelivery(task, context),
    onIgnoredConversationTask: (event) => {
      input.onIgnoredConversationTask?.(event);
      complete({ status: 'ignored' });
    },
    onProgressDeliveryError: (event) => {
      input.onProgressDeliveryError?.(event);
      if (!event.recoveryTask) {
        complete({ status: 'delivery-error', error: event.error });
      }
    },
    onTaskProgress: (event) => deliverObservedProgress(event),
  });

  if (input.waitForCompletion) {
    void input
      .waitForCompletion({
        conversationId: input.conversationId,
        taskId: start.taskId,
        ...(start.toolCallId ? { toolCallId: start.toolCallId } : {}),
        taskType: start.taskType,
        signal: waitController.signal,
      })
      .then(async (task) => {
        if (settled) return;
        await deliverObservedProgress({
          conversationId: input.conversationId,
          sourceTask: task,
          task: await input.createProgressDelivery(task, context),
        });
      })
      .catch(async (error: unknown) => {
        if (settled) return;
        const projection = projectAgentStreamBackgroundTaskProgress({
          conversationId: input.conversationId,
          baseTask: start.task,
          progress: {
            id: start.taskId,
            status: 'failed',
            progress: start.task.progress,
            error: formatBackgroundTaskWaitError(error),
            updatedAt: new Date(input.now?.() ?? Date.now()).toISOString(),
          },
          parentMessageId: input.messageId,
          parentToolCallId: start.toolCallId,
        });
        await input.postMessage(projection.message);
        complete({ status: 'delivery-error', error });
      });
  }
  const trackedUnsubscribe =
    typeof unsubscribe === 'function'
      ? () => {
          unsubscribe();
          complete({ status: 'cancelled' });
        }
      : undefined;

  return {
    started: true,
    taskId: start.taskId,
    task: start.task,
    completion,
    ...(trackedUnsubscribe ? { unsubscribe: trackedUnsubscribe } : {}),
  };
}

function formatBackgroundTaskWaitError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
