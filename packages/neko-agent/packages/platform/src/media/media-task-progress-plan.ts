import * as path from 'path';
import type { GeneratedAsset } from '@neko/shared';
import type { GeneratedMediaTaskType } from './media-generated-asset';
import type { FinalizedMediaTaskOutputs } from './media-task-result';
import { filterLocalMediaPaths } from './media-task-view';
import type { MediaTaskStatus } from './types';

export const MEDIA_TASK_SAVE_NOTIFICATION_ACTION = 'Show in Folder';

export interface MediaTaskSaveNotificationPlan {
  label: string;
  filePath: string;
  relativePath: string;
  message: string;
  actionLabel: typeof MEDIA_TASK_SAVE_NOTIFICATION_ACTION;
}

export interface MediaTaskProgressDeliveryPlan {
  resultUrls: string[];
  thumbnailUrl?: string;
  localPaths: string[];
  generatedAssets: GeneratedAsset[];
  shouldPersistResultUrls: boolean;
  shouldUnsubscribe: boolean;
  notification?: MediaTaskSaveNotificationPlan;
}

export interface BuildMediaTaskProgressDeliveryPlanInput {
  status: MediaTaskStatus;
  taskType: GeneratedMediaTaskType;
  finalized: FinalizedMediaTaskOutputs;
  workspaceRoot?: string;
  showSaveNotification?: boolean;
}

export function buildMediaTaskProgressDeliveryPlan(
  input: BuildMediaTaskProgressDeliveryPlanInput,
): MediaTaskProgressDeliveryPlan {
  const resultUrls = [...input.finalized.resultUrls];
  const generatedAssets = [...input.finalized.generatedAssets];
  const completed = input.status === 'completed';
  const notification = buildSaveNotificationPlan({
    status: input.status,
    taskType: input.taskType,
    resultUrls,
    generatedAssets,
    workspaceRoot: input.workspaceRoot,
    showSaveNotification: input.showSaveNotification,
  });

  return {
    resultUrls,
    thumbnailUrl: input.finalized.thumbnailUrl,
    localPaths: filterLocalMediaPaths(resultUrls),
    generatedAssets,
    shouldPersistResultUrls: completed && resultUrls.length > 0,
    shouldUnsubscribe: isTerminalMediaTaskStatus(input.status),
    ...(notification ? { notification } : {}),
  };
}

export function isTerminalMediaTaskStatus(status: MediaTaskStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

function buildSaveNotificationPlan(input: {
  status: MediaTaskStatus;
  taskType: GeneratedMediaTaskType;
  resultUrls: readonly string[];
  generatedAssets: readonly GeneratedAsset[];
  workspaceRoot?: string;
  showSaveNotification?: boolean;
}): MediaTaskSaveNotificationPlan | undefined {
  if (
    input.status !== 'completed' ||
    !input.workspaceRoot ||
    input.generatedAssets.length === 0 ||
    input.showSaveNotification === false
  ) {
    return undefined;
  }

  const filePath = input.resultUrls[0];
  if (!filePath) return undefined;

  const label = toMediaTaskNotificationLabel(input.taskType);
  const relativePath = path.relative(input.workspaceRoot, filePath);
  return {
    label,
    filePath,
    relativePath,
    message: `${label} saved to ${relativePath}`,
    actionLabel: MEDIA_TASK_SAVE_NOTIFICATION_ACTION,
  };
}

function toMediaTaskNotificationLabel(taskType: GeneratedMediaTaskType): string {
  switch (taskType) {
    case 'video':
      return 'Video';
    case 'audio':
      return 'Audio';
    case 'image':
      return 'Image';
  }
}
