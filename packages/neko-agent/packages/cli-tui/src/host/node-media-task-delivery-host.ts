import * as path from 'node:path';
import type { GeneratedAsset, RenderableGeneratedAsset } from '@neko/shared';
import { WORKSPACE_GENERATED_ASSET_ROOT, resolveWorkspaceGeneratedAssetRelativeDirectory } from '@neko/shared';
import {
  buildMediaTaskDeliverySettingsPlan,
  buildMediaTaskProgressViewDelivery,
  buildMediaTaskViewDelivery,
  GeneratedAssetIndex,
  generateAssetId,
  type DownloadMediaOptions,
  type MediaTask,
  type MediaTaskProgressViewDelivery,
  type MediaTaskViewDelivery,
  type Platform,
} from '@neko/platform';
import type { GeneratedMediaTaskType } from '@neko/platform/media/media-generated-asset';

export interface NodeMediaTaskDeliveryHostDeps {
  readonly platform?: Platform;
  readonly workspaceRoot: string;
  readonly assetIndex?: GeneratedAssetIndex;
}

export class NodeMediaTaskDeliveryHost {
  private readonly assetIndex: GeneratedAssetIndex;
  private readonly ownsAssetIndex: boolean;

  constructor(private readonly deps: NodeMediaTaskDeliveryHostDeps) {
    this.assetIndex =
      deps.assetIndex ??
      new GeneratedAssetIndex(path.join(deps.workspaceRoot, WORKSPACE_GENERATED_ASSET_ROOT));
    this.ownsAssetIndex = deps.assetIndex === undefined;
    void this.assetIndex.load();
  }

  dispose(): void {
    if (this.ownsAssetIndex) {
      this.assetIndex.dispose();
    }
  }

  createTaskViewDelivery(task: MediaTask): Promise<MediaTaskViewDelivery> {
    return buildMediaTaskViewDelivery({
      ...this.createDeliveryInput(task, toGeneratedMediaTaskType(task.type)),
      task,
    });
  }

  createProgressViewDelivery(
    task: MediaTask,
    taskType: GeneratedMediaTaskType,
  ): Promise<MediaTaskProgressViewDelivery> {
    return buildMediaTaskProgressViewDelivery({
      ...this.createDeliveryInput(task, taskType),
      task,
    });
  }

  private createDeliveryInput(task: MediaTask, taskType: GeneratedMediaTaskType) {
    const settingsPlan = buildMediaTaskDeliverySettingsPlan({
      workspaceRoot: this.deps.workspaceRoot,
      defaultOutputDir: resolveGeneratedOutputDir(this.deps.workspaceRoot, taskType),
      configuredOutputDir: '',
      configuredShowSaveNotification: false,
    });

    return {
      task,
      taskType,
      outputDir: settingsPlan.outputDir,
      saveOutputs: (id: string, dir: string, options?: DownloadMediaOptions) =>
        this.deps.platform?.media?.saveOutputs(id, dir, options) ?? Promise.resolve([]),
      assetIndex: this.assetIndex,
      generateAssetId,
      workspaceRoot: settingsPlan.workspaceRoot,
      showSaveNotification: settingsPlan.showSaveNotification,
      resolveResultUrl: (url: string) => url,
      toViewAsset,
    };
  }
}

function resolveGeneratedOutputDir(
  workspaceRoot: string,
  mediaKind: GeneratedMediaTaskType | 'file',
): string {
  return path.join(workspaceRoot, resolveWorkspaceGeneratedAssetRelativeDirectory({ mediaKind }));
}

function toGeneratedMediaTaskType(type: MediaTask['type']): GeneratedMediaTaskType {
  if (type.includes('video')) return 'video';
  if (type.includes('audio') || type.includes('music')) return 'audio';
  return 'image';
}

function toViewAsset(asset: GeneratedAsset): RenderableGeneratedAsset | undefined {
  const renderUri = asset.assetRef?.uri;
  if (!renderUri) {
    return undefined;
  }
  const { path: _path, ...assetWithoutPath } = asset;
  return {
    ...assetWithoutPath,
    renderUri,
  } as RenderableGeneratedAsset;
}
