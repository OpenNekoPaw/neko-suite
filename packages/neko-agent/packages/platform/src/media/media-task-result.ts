import type { GeneratedAsset } from '@neko/shared';
import type { DownloadMediaOptions } from './media-file-downloader';
import { buildGeneratedMediaAssets, type GeneratedMediaTaskType } from './media-generated-asset';
import type { MediaTask } from './types';

export function getMediaTaskPrimaryOutputUrl(
  task: Pick<MediaTask, 'outputs'> | undefined,
): string | undefined {
  return task?.outputs?.find((output) => output.url.length > 0)?.url;
}

export interface GeneratedAssetSink {
  add(asset: GeneratedAsset): void;
}

export interface FinalizeCompletedMediaTaskOutputsInput {
  task: MediaTask;
  taskType: GeneratedMediaTaskType;
  outputDir?: string;
  saveOutputs?: (
    taskId: string,
    outputDir: string,
    options?: DownloadMediaOptions,
  ) => Promise<string[]>;
  transcodeFile?: DownloadMediaOptions['transcodeFile'];
  assetIndex?: GeneratedAssetSink;
  generateAssetId: () => string;
  logger?: {
    info?(message: string, details?: unknown): void;
    warn?(message: string, details?: unknown): void;
  };
}

export interface FinalizedMediaTaskOutputs {
  resultUrls: string[];
  thumbnailUrl?: string;
  generatedAssets: GeneratedAsset[];
}

export async function finalizeCompletedMediaTaskOutputs(
  input: FinalizeCompletedMediaTaskOutputsInput,
): Promise<FinalizedMediaTaskOutputs> {
  const outputs = input.task.outputs ?? [];
  const fallback = {
    resultUrls: outputs.map((output) => output.url).filter(Boolean),
    thumbnailUrl: outputs[0]?.url,
    generatedAssets: [],
  };

  if (
    input.task.status !== 'completed' ||
    outputs.length === 0 ||
    !input.outputDir ||
    !input.saveOutputs
  ) {
    return fallback;
  }

  try {
    const localPaths = await input.saveOutputs(input.task.id, input.outputDir, {
      transcodeFile: input.transcodeFile,
    });
    if (localPaths.length === 0) {
      return fallback;
    }

    const generatedAssets = buildGeneratedMediaAssets({
      localPaths,
      outputs,
      taskType: input.taskType,
      prompt: input.task.request?.prompt,
      model: input.task.modelId,
      request: input.task.request,
      generateAssetId: input.generateAssetId,
    });

    if (input.assetIndex && generatedAssets.length > 0) {
      for (const asset of generatedAssets) {
        input.assetIndex.add(asset);
      }
      input.logger?.info?.(`Registered ${generatedAssets.length} generated asset(s) in index`);
    }

    return {
      resultUrls: localPaths,
      thumbnailUrl: localPaths[0],
      generatedAssets,
    };
  } catch (error) {
    input.logger?.warn?.('Failed to save generated media outputs', error);
    return fallback;
  }
}
