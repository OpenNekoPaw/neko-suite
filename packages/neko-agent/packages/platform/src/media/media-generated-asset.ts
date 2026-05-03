import * as path from 'path';
import type { GeneratedAsset, GeneratedAudio, GeneratedImage, GeneratedVideo } from '@neko/shared';
import type { MediaGenerationRequestBase, MediaOutput } from './types';

export type GeneratedMediaTaskType = 'image' | 'video' | 'audio';

export interface BuildGeneratedMediaAssetsInput {
  localPaths: readonly string[];
  outputs: readonly MediaOutput[];
  taskType: GeneratedMediaTaskType;
  prompt?: string;
  model?: string;
  request?: Pick<MediaGenerationRequestBase, 'metadata'>;
  generateAssetId: () => string;
  now?: () => string;
}

export function buildGeneratedMediaAssets(input: BuildGeneratedMediaAssetsInput): GeneratedAsset[] {
  const generatedAt = input.now?.() ?? new Date().toISOString();
  const assets: GeneratedAsset[] = [];
  const lineage = extractGeneratedAssetLineage(input.request?.metadata);

  for (let i = 0; i < input.localPaths.length; i++) {
    const localPath = input.localPaths[i];
    if (!localPath) continue;

    const output = input.outputs[i];
    const base = {
      id: input.generateAssetId(),
      path: localPath,
      mimeType: output?.mimeType ?? inferGeneratedMediaMimeType(localPath),
      generatedAt,
      prompt: input.prompt,
      model: input.model,
      ...lineage,
    };

    switch (input.taskType) {
      case 'image': {
        const width = output?.width ?? 1024;
        const height = output?.height ?? 1024;
        const asset: GeneratedImage = {
          ...base,
          type: 'generated-image',
          width,
          height,
          ratio: computeAspectRatioLabel(width, height),
        };
        assets.push(asset);
        break;
      }
      case 'video': {
        const asset: GeneratedVideo = {
          ...base,
          type: 'generated-video',
          duration: output?.duration ?? 0,
          width: output?.width ?? 1280,
          height: output?.height ?? 720,
          fps: 24,
        };
        assets.push(asset);
        break;
      }
      case 'audio': {
        const asset: GeneratedAudio = {
          ...base,
          type: 'generated-audio',
          duration: output?.duration ?? 0,
          sampleRate: 44100,
          channels: 2,
        };
        assets.push(asset);
        break;
      }
    }
  }

  return assets;
}

export function inferGeneratedMediaMimeType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.flac': 'audio/flac',
    '.ogg': 'audio/ogg',
    '.aac': 'audio/aac',
  };
  return mimeTypes[extension] ?? 'application/octet-stream';
}

export function computeAspectRatioLabel(width: number, height: number): string {
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function extractGeneratedAssetLineage(
  metadata: Record<string, unknown> | undefined,
): Pick<GeneratedAsset, 'characterIds' | 'sourceNodeId'> {
  if (!metadata) return {};

  const sourceNodeId =
    typeof metadata['sourceNodeId'] === 'string' ? metadata['sourceNodeId'] : undefined;
  const characterIds = Array.isArray(metadata['characterIds'])
    ? metadata['characterIds'].filter(
        (value): value is string => typeof value === 'string' && value.length > 0,
      )
    : undefined;

  return {
    sourceNodeId,
    characterIds: characterIds && characterIds.length > 0 ? characterIds : undefined,
  };
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
