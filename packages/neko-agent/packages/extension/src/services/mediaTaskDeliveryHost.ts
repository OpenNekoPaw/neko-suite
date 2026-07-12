/**
 * Media task delivery host adapter.
 *
 * Platform owns media delivery plans and view projection. This adapter owns
 * VSCode-only effects: settings lookup, webview URI conversion, notifications,
 * and "show in folder" commands.
 */

import * as vscode from 'vscode';
import type { Platform } from '@neko/platform';
import {
  resolveWorkspaceGeneratedAssetRelativeDirectory,
  type GeneratedAsset,
  type TaskRunScope,
} from '@neko/shared';
import {
  DEFAULT_MEDIA_TASK_CONFIGURED_OUTPUT_DIR,
  DEFAULT_MEDIA_TASK_SHOW_SAVE_NOTIFICATION,
  MEDIA_TASK_DELIVERY_CONFIG_SECTION,
  MEDIA_TASK_OUTPUT_DIR_SETTING_KEY,
  MEDIA_TASK_SHOW_SAVE_NOTIFICATION_SETTING_KEY,
  buildMediaTaskDeliverySettingsPlan,
  buildMediaTaskProgressViewDelivery,
  buildMediaTaskViewDelivery,
  isTerminalMediaTaskStatus,
  type DownloadMediaOptions,
  type MediaTask,
  type MediaTaskProgressViewDelivery,
  type MediaTaskViewDelivery,
  type MediaTaskView,
} from '@neko/platform';
import {
  MEDIA_TASK_SAVE_NOTIFICATION_ACTION,
  type MediaTaskSaveNotificationPlan,
} from '@neko/platform/media/media-task-progress-plan';
import type { GeneratedMediaTaskType } from '@neko/platform/media/media-generated-asset';
import {
  createMediaTaskView,
  toMediaBackgroundTaskType,
} from '@neko/platform/media/media-task-view';
import { GeneratedAssetIndex, generateAssetId } from '@neko/platform/media/generated-asset-index';
import { createWorkspaceGeneratedAssetIndex } from './generatedAssetOpenResolver';
import { getLogger } from '../base';
import type { AgentLocalResourceAccess } from './localResourceAccess';

const logger = getLogger('MediaTaskDeliveryHost');

export interface MediaTaskDeliveryHostDeps {
  platform?: Platform;
  assetIndex?: GeneratedAssetIndex;
  transcodeFile?: (
    inputPath: string,
    outputPath: string,
    mediaType: 'audio' | 'video',
  ) => Promise<boolean>;
  localResourceAccess?: AgentLocalResourceAccess;
}

export class MediaTaskDeliveryHost {
  private readonly assetIndex: GeneratedAssetIndex | undefined;
  private readonly ownsAssetIndex: boolean;

  constructor(private readonly deps: MediaTaskDeliveryHostDeps) {
    const createdAssetIndex = deps.assetIndex ?? createWorkspaceGeneratedAssetIndex({ logger });
    this.assetIndex = createdAssetIndex;
    this.ownsAssetIndex = deps.assetIndex === undefined && createdAssetIndex !== undefined;
  }

  dispose(): void {
    if (this.ownsAssetIndex) {
      this.assetIndex?.dispose();
    }
  }

  async createTaskView(webview: vscode.Webview, task: MediaTask): Promise<MediaTaskView> {
    if (!isTerminalMediaTaskStatus(task.status)) {
      return createMediaTaskView(task);
    }

    const delivery = await this.createTaskViewDelivery(webview, task);
    return delivery.view;
  }

  async createTaskViewDelivery(
    webview: vscode.Webview,
    task: MediaTask,
  ): Promise<MediaTaskViewDelivery> {
    const delivery = await buildMediaTaskViewDelivery({
      ...this.createDeliveryInput(webview, task, toMediaBackgroundTaskType(task.type)),
      task,
    });
    this.showSaveNotification(delivery.deliveryPlan.notification);
    return delivery;
  }

  async createProgressViewDelivery(
    webview: vscode.Webview,
    task: MediaTask,
    taskType: GeneratedMediaTaskType,
  ): Promise<MediaTaskProgressViewDelivery> {
    const delivery = await buildMediaTaskProgressViewDelivery({
      ...this.createDeliveryInput(webview, task, taskType),
      task,
    });
    this.showSaveNotification(delivery.deliveryPlan.notification);
    return delivery;
  }

  showSaveNotification(notification: MediaTaskSaveNotificationPlan | undefined): void {
    if (!notification) return;

    vscode.window
      .showInformationMessage(notification.message, notification.actionLabel)
      .then((action) => {
        if (action === MEDIA_TASK_SAVE_NOTIFICATION_ACTION) {
          vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(notification.filePath));
        }
      });
  }

  toWebviewMediaUri(webview: vscode.Webview, filePath: string | undefined): string | undefined {
    if (!filePath) return undefined;
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return filePath;
    }
    try {
      if (this.deps.localResourceAccess) {
        return this.deps.localResourceAccess.toWebviewUri(
          webview,
          filePath,
          'neko-agent.media-task',
        );
      }
      logger.warn('Local resource access service unavailable for media task projection', {
        filePath,
      });
      return undefined;
    } catch (error) {
      logger.warn('Failed to convert path to webview URI:', { filePath, error });
      return undefined;
    }
  }

  private createDeliveryInput(
    webview: vscode.Webview,
    task: MediaTask,
    taskType: GeneratedMediaTaskType,
  ) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const mediaConfig = vscode.workspace.getConfiguration(MEDIA_TASK_DELIVERY_CONFIG_SECTION);
    const settingsPlan = buildMediaTaskDeliverySettingsPlan({
      workspaceRoot: workspaceFolder?.uri.fsPath,
      defaultOutputDir: workspaceFolder
        ? resolveGeneratedOutputDir(workspaceFolder.uri.fsPath, taskType)
        : undefined,
      configuredOutputDir: mediaConfig.get<string>(
        MEDIA_TASK_OUTPUT_DIR_SETTING_KEY,
        DEFAULT_MEDIA_TASK_CONFIGURED_OUTPUT_DIR,
      ),
      configuredShowSaveNotification: mediaConfig.get<boolean>(
        MEDIA_TASK_SHOW_SAVE_NOTIFICATION_SETTING_KEY,
        DEFAULT_MEDIA_TASK_SHOW_SAVE_NOTIFICATION,
      ),
    });

    return {
      task,
      taskType,
      outputDir: settingsPlan.outputDir,
      saveOutputs: (scope: TaskRunScope, dir: string, options?: DownloadMediaOptions) =>
        this.deps.platform?.media?.saveOutputs(scope, dir, options) ?? Promise.resolve([]),
      transcodeFile: this.deps.transcodeFile,
      assetIndex: this.assetIndex,
      generateAssetId,
      logger,
      workspaceRoot: settingsPlan.workspaceRoot,
      showSaveNotification: settingsPlan.showSaveNotification,
      resolveResultUrl: (url: string) => this.toWebviewMediaUri(webview, url),
      toViewAsset: (asset: GeneratedAsset) => {
        if (!this.deps.localResourceAccess) {
          logger.warn('Local resource access service unavailable for generated asset projection', {
            assetId: asset.id,
            path: asset.path,
          });
          return undefined;
        }
        try {
          return this.deps.localResourceAccess.toWebviewAsset(webview, asset);
        } catch (error) {
          logger.warn('Failed to project generated asset for Webview display', {
            assetId: asset.id,
            path: asset.path,
            error,
          });
          return undefined;
        }
      },
    };
  }
}

function resolveGeneratedOutputDir(
  workspaceRoot: string,
  mediaKind: GeneratedMediaTaskType | 'file',
): string {
  return vscode.Uri.joinPath(
    vscode.Uri.file(workspaceRoot),
    resolveWorkspaceGeneratedAssetRelativeDirectory({ mediaKind }),
  ).fsPath;
}
