import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type { GeneratedAsset, TaskRunScope } from '@neko/shared';
import type { DownloadMediaOptions } from './media-file-downloader';
import { buildGeneratedMediaAssets, type GeneratedMediaTaskType } from './media-generated-asset';
import type { MediaTask } from './types';

export function getMediaTaskPrimaryOutputUrl(
  task: Pick<MediaTask, 'outputs'> | undefined,
): string | undefined {
  return task?.outputs?.find((output) => output.url.length > 0)?.url;
}

export interface GeneratedAssetSink {
  add(asset: GeneratedAsset): void | Promise<void>;
}

export interface FinalizeCompletedMediaTaskOutputsInput {
  task: MediaTask;
  taskType: GeneratedMediaTaskType;
  outputDir?: string;
  saveOutputs?: (
    taskScope: TaskRunScope,
    outputDir: string,
    options?: DownloadMediaOptions,
  ) => Promise<string[]>;
  transcodeFile?: DownloadMediaOptions['transcodeFile'];
  assetIndex?: GeneratedAssetSink;
  generateAssetId: () => string;
  computeContentDigest?: (filePath: string) => Promise<string>;
  logger?: {
    info?(message: string, details?: unknown): void;
    warn?(message: string, details?: unknown): void;
  };
}

export interface FinalizedMediaTaskOutputs {
  resultUrls: string[];
  thumbnailUrl?: string;
  hostOutputPaths: string[];
  generatedAssets: GeneratedAsset[];
}

export async function finalizeCompletedMediaTaskOutputs(
  input: FinalizeCompletedMediaTaskOutputsInput,
): Promise<FinalizedMediaTaskOutputs> {
  const outputs = input.task.outputs ?? [];
  const remoteOnlyResult = {
    resultUrls: outputs.map((output) => output.url).filter(Boolean),
    thumbnailUrl: outputs[0]?.url,
    hostOutputPaths: [],
    generatedAssets: [],
  };

  if (
    input.task.status !== 'completed' ||
    outputs.length === 0 ||
    !input.outputDir ||
    !input.saveOutputs
  ) {
    return remoteOnlyResult;
  }

  try {
    const hostOutputPaths = await input.saveOutputs(input.task.scope, input.outputDir, {
      transcodeFile: input.transcodeFile,
    });
    if (hostOutputPaths.length === 0) {
      return remoteOnlyResult;
    }

    const computeContentDigest = input.computeContentDigest ?? computeFileContentDigest;
    const contentDigests = await Promise.all(hostOutputPaths.map(computeContentDigest));
    const generatedAssets = buildGeneratedMediaAssets({
      hostOutputPaths,
      contentDigests,
      taskId: input.task.id,
      providerId: input.task.providerId,
      outputs,
      taskType: input.taskType,
      prompt: input.task.request?.prompt,
      model: input.task.modelId,
      request: input.task.request,
      generateAssetId: input.generateAssetId,
    });

    if (input.assetIndex && generatedAssets.length > 0) {
      for (const asset of generatedAssets) {
        await input.assetIndex.add(asset);
      }
      input.logger?.info?.(`Registered ${generatedAssets.length} generated asset(s) in index`);
    }

    return {
      resultUrls: generatedAssets
        .map((asset) => asset.assetRef?.uri)
        .filter((uri): uri is string => typeof uri === 'string' && uri.length > 0),
      thumbnailUrl: generatedAssets[0]?.assetRef?.uri,
      hostOutputPaths,
      generatedAssets,
    };
  } catch (error) {
    input.logger?.warn?.('Failed to save generated media outputs', error);
    return remoteOnlyResult;
  }
}

async function computeFileContentDigest(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('end', resolve);
    stream.once('error', reject);
  });
  return `sha256:${hash.digest('hex')}`;
}
