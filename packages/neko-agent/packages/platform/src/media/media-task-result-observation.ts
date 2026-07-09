import type {
  AgentTaskResultDeliveryPolicy,
  GeneratedAsset,
  PerceptualAssetRef,
  ResourceRef,
  Task,
  TaskLifecycleMetadata,
  TaskStatus,
  TaskType,
} from '@neko/shared';
import {
  createResourceFingerprint,
  createResourceRef,
  hashStableValue,
  isResourceRef,
} from '@neko/shared';
import type { MediaTaskProgressDeliveryPlan } from './media-task-progress-plan';
import type { MediaTask } from './types';

const GENERATED_RESOURCE_CACHE_PROVIDER_ID = 'generated-asset';

export type MediaTaskResultObservationAssetInput = Pick<
  GeneratedAsset,
  'id' | 'mimeType' | 'assetRef'
> &
  Partial<Pick<GeneratedAsset, 'path'>> & {
    readonly label?: string;
    readonly resourceRef?: ResourceRef;
  };

export interface MediaTaskResultObservationAssetData {
  readonly id: string;
  readonly mimeType?: string;
  readonly label?: string;
  readonly assetRef?: PerceptualAssetRef;
  readonly resourceRef?: ResourceRef;
  readonly localPath?: string;
}

export interface MediaTaskResultObservationProjectionInput {
  readonly conversationId: string;
  readonly taskId: string;
  readonly progress: number;
  readonly mediaTask: MediaTask;
  readonly deliveryPlan?: MediaTaskProgressDeliveryPlan;
  readonly assets?: readonly MediaTaskResultObservationAssetInput[];
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

function readMediaTaskRunStartedAt(
  metadata: Record<string, unknown> | undefined,
): number | undefined {
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
  const assets = projectMediaTaskResultObservationAssets([
    ...(input.deliveryPlan?.generatedAssets ?? []),
    ...(input.assets ?? []),
  ]);
  const hostOutputPaths = uniqueStrings([
    ...(input.deliveryPlan?.hostOutputPaths ?? []),
    ...assets.flatMap((asset) => (asset.localPath ? [asset.localPath] : [])),
  ]);

  return {
    mediaTaskId: input.taskId,
    mediaTaskType: input.mediaTask.type,
    providerId: input.mediaTask.providerId,
    modelId: input.mediaTask.modelId,
    ...(resultUrls.length > 0 ? { resultUrls } : {}),
    ...(hostOutputPaths.length > 0 ? { hostOutputPaths } : {}),
    ...(assets.length > 0 ? { assets } : {}),
  };
}

function projectMediaTaskResultObservationAssets(
  assets: readonly MediaTaskResultObservationAssetInput[],
): MediaTaskResultObservationAssetData[] {
  const projected: MediaTaskResultObservationAssetData[] = [];
  const seen = new Set<string>();

  for (const asset of assets) {
    const localPath = readAssetLocalPath(asset);
    const assetRef = asset.assetRef;
    const key = assetRef?.assetId ?? asset.id;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const resourceRef = readAssetResourceRef(asset) ?? createGeneratedResourceRef(asset, localPath);
    projected.push({
      id: asset.id,
      ...(asset.mimeType ? { mimeType: asset.mimeType } : {}),
      label: asset.label ?? assetRef?.uri ?? asset.id,
      ...(assetRef ? { assetRef } : {}),
      ...(resourceRef ? { resourceRef } : {}),
      ...(localPath ? { localPath } : {}),
    });
  }

  return projected;
}

function createGeneratedResourceRef(
  asset: MediaTaskResultObservationAssetInput,
  localPath: string | undefined,
): ResourceRef | undefined {
  if (!localPath) {
    return undefined;
  }
  const assetId = asset.assetRef?.assetId ?? asset.id;
  return createResourceRef({
    scope: 'project',
    provider: GENERATED_RESOURCE_CACHE_PROVIDER_ID,
    kind: 'generated',
    source: {
      kind: 'generated-asset',
      generatedAssetId: assetId,
      filePath: localPath,
      metadata: {
        path: localPath,
        ...(asset.mimeType ? { mimeType: asset.mimeType } : {}),
      },
    },
    locator: {
      kind: 'generated-asset',
      assetId,
    },
    fingerprint: createResourceFingerprint({
      strategy: 'provider',
      value: hashStableValue({ assetId, path: localPath }),
      providerId: GENERATED_RESOURCE_CACHE_PROVIDER_ID,
    }),
  });
}

function readAssetLocalPath(asset: MediaTaskResultObservationAssetInput): string | undefined {
  if (!('path' in asset)) {
    return undefined;
  }
  return typeof asset.path === 'string' && asset.path.length > 0 ? asset.path : undefined;
}

function readAssetResourceRef(asset: MediaTaskResultObservationAssetInput): ResourceRef | undefined {
  return isResourceRef(asset.resourceRef) ? asset.resourceRef : undefined;
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

function uniqueStrings(values: readonly string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
