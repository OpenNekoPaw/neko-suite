import type { MediaTask } from '@neko/platform';
import type { MediaTaskProgressDeliveryPlan } from '@neko/platform/media/media-task-progress-plan';
import type {
  AgentTaskResultDeliveryPolicy,
  GeneratedAsset,
  Task,
  TaskLifecycleMetadata,
  TaskStatus,
  TaskType,
} from '@neko/shared';

export interface MediaTaskResultObservationProjectionInput {
  readonly conversationId: string;
  readonly taskId: string;
  readonly progress: number;
  readonly mediaTask: MediaTask;
  readonly deliveryPlan?: MediaTaskProgressDeliveryPlan;
  readonly assets?: readonly Pick<GeneratedAsset, 'id' | 'mimeType' | 'assetRef'>[];
  readonly resultUrls?: readonly string[];
  readonly error?: string;
}

export function toMediaTaskResultObservationTask(
  input: MediaTaskResultObservationProjectionInput,
): Task {
  const task = input.mediaTask;
  const deliveryPolicy = readMediaTaskResultDeliveryPolicy(task.request.metadata);
  const ownerRunId = readMediaTaskRunId(task.request.metadata);
  const ownerRunStartedAt = readMediaTaskRunStartedAt(task.request.metadata);
  const lifecycle: TaskLifecycleMetadata = {
    ownerConversationId: input.conversationId,
    ...(ownerRunId ? { ownerRunId } : {}),
    ...(ownerRunStartedAt !== undefined ? { ownerRunStartedAt } : {}),
    runMode: 'background',
    costPhase: 'idle',
    interruptPolicy: 'detach-and-continue',
    recoverPolicy: 'snapshot-only',
    ...(deliveryPolicy ? { resultDeliveryPolicy: deliveryPolicy } : {}),
  };
  const outputData = buildMediaTaskResultObservationData(input);
  const error = input.error ?? formatMediaTaskError(task);

  return {
    id: input.taskId,
    type: toAgentTaskType(task.type),
    status: toAgentTaskStatus(task.status),
    input: {
      type: toAgentTaskType(task.type),
      payload: {
        prompt: task.request.prompt,
        providerId: task.providerId,
        modelId: task.modelId,
        mediaTaskType: task.type,
      },
      lifecycle,
    },
    output: {
      data: outputData,
      ...(error ? { error } : {}),
    },
    progress: input.progress,
    createdAt: task.createdAt.getTime(),
    updatedAt: (task.completedAt ?? task.updatedAt).getTime(),
    ...(error ? { error } : {}),
    lifecycle,
  };
}

export function readMediaTaskResultDeliveryPolicy(
  metadata: Record<string, unknown> | undefined,
): AgentTaskResultDeliveryPolicy | undefined {
  const value = metadata?.['resultDeliveryPolicy'] ?? metadata?.['agentTaskResultDeliveryPolicy'];
  if (!isRecord(value)) return undefined;
  const kind = value['kind'];
  switch (kind) {
    case 'notify-only':
      return { kind };
    case 'append-observation':
      return { kind };
    case 'ask-user-to-continue':
    case 'auto-resume-agent':
      return {
        kind,
        ...(typeof value['prompt'] === 'string' ? { prompt: value['prompt'] } : {}),
      };
    default:
      return undefined;
  }
}

function readMediaTaskRunId(metadata: Record<string, unknown> | undefined): string | undefined {
  const value = metadata?.['runId'];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readMediaTaskRunStartedAt(metadata: Record<string, unknown> | undefined): number | undefined {
  const value = metadata?.['runStartedAt'];
  return typeof value === 'number' ? value : undefined;
}

function buildMediaTaskResultObservationData(
  input: MediaTaskResultObservationProjectionInput,
): Record<string, unknown> {
  const resultUrls = [
    ...(input.deliveryPlan?.resultUrls ?? []),
    ...(input.resultUrls ?? []),
  ].filter(isHttpUrl);
  const assets = [
    ...(input.deliveryPlan?.generatedAssets ?? []),
    ...(input.assets ?? []),
  ].map((asset) => ({
    id: asset.id,
    mimeType: asset.mimeType,
    label: asset.assetRef?.uri ?? asset.id,
  }));

  return {
    mediaTaskId: input.taskId,
    mediaTaskType: input.mediaTask.type,
    providerId: input.mediaTask.providerId,
    modelId: input.mediaTask.modelId,
    ...(resultUrls.length > 0 ? { resultUrls } : {}),
    ...(assets.length > 0 ? { assets } : {}),
  };
}

function toAgentTaskStatus(status: MediaTask['status']): TaskStatus {
  if (status === 'processing') return 'running';
  return status;
}

function toAgentTaskType(type: MediaTask['type']): TaskType {
  if (type.includes('image')) return 'image_generation';
  if (type.includes('video')) return 'video_generation';
  if (type.includes('audio') || type.includes('music')) return 'audio_generation';
  if (type === 'workflow') return 'workflow';
  return 'custom';
}

function formatMediaTaskError(task: MediaTask): string | undefined {
  if (!task.error) return undefined;
  return task.error.message || task.error.code;
}

function isHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
