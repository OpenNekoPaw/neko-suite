import type {
  AgentBackgroundTask,
  Message,
  TaskCreatedMessage,
  TaskUpdatedMessage,
} from '@neko-agent/types';
import { buildTaskCreatedMessage, buildTaskUpdatedMessage } from '@neko-agent/types';
import type { AgentEvent } from '../session/types';
import {
  createBackgroundTaskViewFromToolResultData,
  mergeBackgroundTaskProgressView,
  type BackgroundTaskProgressPatch,
  type BackgroundTaskView,
} from '../task/task-view-projector';
import { updateBackgroundTaskToolResultUrls } from './message-resource-projector';
import { projectBackgroundTaskToWorkItem } from './work-item-projector';

export interface AgentStreamBackgroundTaskStartInput {
  readonly conversationId: string;
  readonly messageId: string;
  readonly event: AgentEvent;
  readonly now?: () => number;
}

export interface AgentStreamBackgroundTaskStartProjection {
  readonly taskId: string;
  readonly taskType: BackgroundTaskView['type'];
  readonly task: BackgroundTaskView;
  readonly toolCallId?: string;
  readonly message: TaskCreatedMessage;
}

export interface AgentStreamBackgroundTaskProgressInput<TDeliveryPlan = unknown> {
  readonly conversationId: string;
  readonly baseTask: BackgroundTaskView;
  readonly progress: BackgroundTaskProgressPatch;
  readonly deliveryPlan?: TDeliveryPlan;
  readonly persistResultUrls?: readonly string[];
}

export interface AgentStreamBackgroundTaskProgressProjection<TDeliveryPlan = unknown> {
  readonly task: BackgroundTaskView;
  readonly deliveryPlan?: TDeliveryPlan;
  readonly persistResultUrls?: readonly string[];
  readonly message: TaskUpdatedMessage;
}

export interface PersistAgentStreamBackgroundTaskResultUrlsInput {
  readonly conversationId: string;
  readonly taskId: string;
  readonly urls: readonly string[];
  readonly getMessages: (conversationId: string) => readonly Message[] | undefined;
  readonly updateMessages: (conversationId: string, messages: Message[]) => void;
  readonly onError?: (error: unknown) => void;
}

export function projectAgentStreamBackgroundTaskStart(
  input: AgentStreamBackgroundTaskStartInput,
): AgentStreamBackgroundTaskStartProjection | null {
  if (input.event.type !== 'tool_result') return null;

  const task = createBackgroundTaskViewFromToolResultData(input.event.toolResult?.data, {
    now: input.now,
  });
  if (!task) return null;

  const toolCallId = input.event.toolResult?.toolCallId;
  const backgroundTask = toAgentBackgroundTask(task);
  return {
    taskId: task.id,
    taskType: task.type,
    task,
    ...(toolCallId !== undefined ? { toolCallId } : {}),
    message: buildTaskCreatedMessage({
      conversationId: input.conversationId,
      messageId: input.messageId,
      ...(toolCallId !== undefined ? { toolCallId } : {}),
      workItem: projectBackgroundTaskToWorkItem({
        conversationId: input.conversationId,
        task: backgroundTask,
        parentMessageId: input.messageId,
        parentToolCallId: toolCallId ?? null,
      }),
    }),
  };
}

export function projectAgentStreamBackgroundTaskProgress<TDeliveryPlan = unknown>(
  input: AgentStreamBackgroundTaskProgressInput<TDeliveryPlan>,
): AgentStreamBackgroundTaskProgressProjection<TDeliveryPlan> {
  const task = mergeBackgroundTaskProgressView(input.baseTask, input.progress);

  return {
    task,
    ...(input.deliveryPlan !== undefined ? { deliveryPlan: input.deliveryPlan } : {}),
    ...(input.persistResultUrls && input.persistResultUrls.length > 0
      ? { persistResultUrls: [...input.persistResultUrls] }
      : {}),
    message: buildTaskUpdatedMessage({
      conversationId: input.conversationId,
      workItem: projectBackgroundTaskToWorkItem({
        conversationId: input.conversationId,
        task: toAgentBackgroundTask(task),
      }),
    }),
  };
}

export function persistAgentStreamBackgroundTaskResultUrls(
  input: PersistAgentStreamBackgroundTaskResultUrlsInput,
): boolean {
  try {
    const messages = input.getMessages(input.conversationId);
    if (!messages) return false;

    const result = updateBackgroundTaskToolResultUrls(messages, input.taskId, input.urls);
    if (!result.updated) return false;

    input.updateMessages(input.conversationId, result.messages);
    return true;
  } catch (error) {
    input.onError?.(error);
    return false;
  }
}

function toAgentBackgroundTask(task: BackgroundTaskView): AgentBackgroundTask {
  return {
    id: task.id,
    type: task.type,
    name: task.name,
    prompt: task.prompt,
    providerId: task.providerId,
    providerName: task.providerName,
    status: task.status,
    progress: task.progress,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    ...(isAgentBackgroundTaskResult(task.result) ? { result: task.result } : {}),
    ...(task.error !== undefined ? { error: task.error } : {}),
  };
}

function isAgentBackgroundTaskResult(
  value: unknown,
): value is NonNullable<AgentBackgroundTask['result']> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
