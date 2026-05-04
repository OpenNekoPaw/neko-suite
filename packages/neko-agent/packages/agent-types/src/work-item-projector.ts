import type {
  AgentBackgroundTask,
  AgentMediaTaskView,
  AgentWorkItem,
  AgentWorkItemBase,
  AgentWorkItemTaskStatus,
  AgentWorkItemTaskStep,
  AgentWorkItemTaskType,
  SubAgentWorkItem,
  SubAgentWorkItemEvent,
  TaskWorkItem,
} from './work-item';

export interface ProjectBackgroundTaskWorkItemInput {
  conversationId: string;
  task: AgentBackgroundTask;
  kind?: TaskWorkItem['kind'];
  parentMessageId?: string | null;
  parentToolCallId?: string | null;
}

export interface ProjectBackgroundTasksWorkItemsInput {
  conversationId: string;
  tasks: readonly AgentBackgroundTask[];
  kind?: TaskWorkItem['kind'];
}

export interface ProjectMediaTaskWorkItemInput {
  conversationId: string;
  task: AgentMediaTaskView;
  parentMessageId?: string | null;
  parentToolCallId?: string | null;
}

export function backgroundTaskToWorkItem(
  task: AgentBackgroundTask,
  conversationId: string,
  kind: TaskWorkItem['kind'],
  links: Partial<Pick<AgentWorkItemBase, 'parentMessageId' | 'parentToolCallId'>> = {},
): TaskWorkItem {
  return {
    id: task.id,
    conversationId,
    kind,
    parentMessageId: links.parentMessageId ?? null,
    parentToolCallId: links.parentToolCallId ?? null,
    title: task.name,
    summary: task.prompt,
    status: task.status,
    progress: task.progress,
    steps: task.steps,
    currentStepId: task.currentStepId,
    result: task.result,
    error: task.error,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    task,
  };
}

export function isTaskWorkItem(item: AgentWorkItem): item is TaskWorkItem {
  return item.kind === 'media-task' || item.kind === 'tool-background-task';
}

export function isSubAgentWorkItem(item: AgentWorkItem): item is SubAgentWorkItem {
  return item.kind === 'subagent';
}

export function projectMediaTaskToBackgroundTask(task: AgentMediaTaskView): AgentBackgroundTask {
  const outputs = task.outputs ?? [];
  const firstOutput = outputs[0];

  const outputResult: AgentBackgroundTask['result'] =
    firstOutput !== undefined
      ? {
          urls: outputs.map((output) => output.url).filter(Boolean),
          thumbnailUrl: firstOutput.thumbnailUrl,
          width: firstOutput.width,
          height: firstOutput.height,
          duration: firstOutput.duration,
        }
      : undefined;
  const result = task.result ?? outputResult;

  const promptText = task.request.prompt;
  const name = promptText.length > 50 ? `${promptText.slice(0, 47)}...` : promptText;

  return {
    id: task.id,
    type: toAgentWorkItemTaskType(task.type),
    name,
    prompt: promptText,
    providerId: task.providerId,
    providerName: task.modelId,
    status: toAgentWorkItemTaskStatus(task.status),
    progress: task.progress,
    createdAt: toDateString(task.createdAt),
    updatedAt: toDateString(task.updatedAt),
    result,
    error: task.error?.message,
  };
}

export function projectBackgroundTaskToWorkItem(
  input: ProjectBackgroundTaskWorkItemInput,
): TaskWorkItem {
  return backgroundTaskToWorkItem(
    input.task,
    input.conversationId,
    input.kind ?? 'tool-background-task',
    {
      parentMessageId: input.parentMessageId,
      parentToolCallId: input.parentToolCallId,
    },
  );
}

export function projectBackgroundTasksToWorkItems(
  input: ProjectBackgroundTasksWorkItemsInput,
): TaskWorkItem[] {
  return input.tasks.map((task) =>
    projectBackgroundTaskToWorkItem({
      conversationId: input.conversationId,
      task,
      kind: input.kind,
    }),
  );
}

export function projectMediaTaskToWorkItem(input: ProjectMediaTaskWorkItemInput): TaskWorkItem {
  return projectBackgroundTaskToWorkItem({
    conversationId: input.conversationId,
    task: projectMediaTaskToBackgroundTask(input.task),
    kind: 'media-task',
    parentMessageId: input.parentMessageId,
    parentToolCallId: input.parentToolCallId,
  });
}

export function projectSubAgentEventToWorkItem(event: SubAgentWorkItemEvent): SubAgentWorkItem {
  const status = toSubAgentWorkItemStatus(event.data?.status ?? event.type);
  const progress = toSubAgentProgress(event.type, event.data?.progress);
  const result = event.data?.result;
  const description = event.data?.description;
  const subagentType = event.data?.subagentType;
  const step = projectSubAgentEventStep(event, status);

  return {
    id: event.subAgentId,
    conversationId: event.conversationId,
    kind: 'subagent',
    parentMessageId: event.data?.parentMessageId ?? null,
    parentToolCallId: event.data?.parentToolCallId ?? null,
    title: description || subagentType || `SubAgent ${event.subAgentId}`,
    summary: description,
    status,
    progress,
    ...(step ? { steps: [step], currentStepId: step.id } : {}),
    error: event.data?.error ?? result?.error,
    createdAt: new Date(event.timestamp).toISOString(),
    updatedAt: new Date(event.timestamp).toISOString(),
    subAgent: {
      parentAgentId: event.parentAgentId,
      type: subagentType,
      runMode: event.data?.runMode,
      modelTier: event.data?.modelTier,
      response: result?.response,
    },
  };
}

export function toSubAgentWorkItemStatus(status: unknown): AgentWorkItemTaskStatus {
  switch (status) {
    case 'running':
    case 'started':
    case 'progress':
      return 'processing';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'spawned':
    case 'pending':
    default:
      return 'queued';
  }
}

function projectSubAgentEventStep(
  event: SubAgentWorkItemEvent,
  status: AgentWorkItemTaskStatus,
): AgentWorkItemTaskStep | null {
  const timestamp = event.timestamp;
  const progressText = event.data?.progress;

  if (event.type === 'progress' && progressText) {
    return {
      id: `progress-${timestamp}`,
      name: stripLeadingPercent(progressText),
      status: 'running',
      startTime: timestamp,
      message: progressText,
    };
  }

  if (event.type === 'started') {
    return {
      id: 'subagent-started',
      name: 'Started',
      status: 'running',
      startTime: timestamp,
      message: event.data?.description,
    };
  }

  if (event.type === 'completed') {
    return {
      id: 'subagent-completed',
      name: 'Completed',
      status: 'completed',
      startTime: timestamp,
      endTime: timestamp,
      message: event.data?.result?.response,
    };
  }

  if (event.type === 'failed' || status === 'failed') {
    return {
      id: 'subagent-failed',
      name: 'Failed',
      status: 'failed',
      startTime: timestamp,
      endTime: timestamp,
      message: event.data?.error ?? event.data?.result?.error,
    };
  }

  if (event.type === 'cancelled' || status === 'cancelled') {
    return {
      id: 'subagent-cancelled',
      name: 'Cancelled',
      status: 'failed',
      startTime: timestamp,
      endTime: timestamp,
    };
  }

  return null;
}

function stripLeadingPercent(progress: string): string {
  return progress.replace(/^\s*\d+%\s*/, '').trim() || progress;
}

function toAgentWorkItemTaskType(mediaType: string): AgentWorkItemTaskType {
  if (mediaType === 'audio') return 'audio';
  if (mediaType === 'video') return 'video';
  return 'image';
}

function toAgentWorkItemTaskStatus(status: string): AgentWorkItemTaskStatus {
  switch (status) {
    case 'pending':
      return 'queued';
    case 'processing':
    case 'running':
      return 'processing';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'queued';
  }
}

function toSubAgentProgress(eventType: string, progressText: string | undefined): number {
  if (eventType === 'completed') return 100;
  if (eventType === 'failed' || eventType === 'cancelled') return 100;

  const parsed = progressText?.match(/\d+/)?.[0];
  if (parsed) return Math.min(99, Math.max(0, Number(parsed)));
  return eventType === 'started' ? 5 : 0;
}

function toDateString(value: string | Date): string {
  if (typeof value === 'string') return value;
  return value.toISOString();
}
