import {
  createPerceptionPipeline,
  type IPerceptionPipeline,
  type MediaProbePort,
  type PerceptualAssetResolverPort,
  type ResolvedPerceptualAsset,
} from '@neko/agent/runtime';
import {
  GeminiMediaUnderstandingClient,
  type GeneratedAssetIndex,
  type Platform,
  type ConfigManager,
} from '@neko/platform';
import type { PerceptionAssetLoader } from '@neko/ai-sdk';
import type { IService, PerceptualAssetRef } from '@neko/shared';

export interface NodePerceptionPipelineOptions {
  readonly platform: Pick<Platform, 'config'>;
  readonly service: IService;
  readonly assetLoader: PerceptionAssetLoader;
  readonly workspaceRoot: string;
  readonly assetIndex: GeneratedAssetIndex;
}

export function createNodePerceptionPipeline(
  options: NodePerceptionPipelineOptions,
): IPerceptionPipeline {
  return createPerceptionPipeline({
    resolver: createRefPerceptionResolver({
      workspaceRoot: options.workspaceRoot,
      assetIndex: options.assetIndex,
    }),
    mediaProbe: createNodeMediaProbe(),
    perceptionClient: new GeminiMediaUnderstandingClient({
      service: options.service,
      configManager: options.platform.config as Pick<
        ConfigManager,
        'resolveModelRefForPurpose' | 'getModel'
      >,
      assetLoader: options.assetLoader,
    }),
  });
}

function createRefPerceptionResolver(options: {
  readonly workspaceRoot: string;
  readonly assetIndex: GeneratedAssetIndex;
}): PerceptualAssetResolverPort {
  return {
    resolve: async (selector) => {
      const generatedRef = await resolveGeneratedAssetRef(selector.assetId, options);
      const ref = generatedRef ?? selector.ref;
      if (!ref) {
        throw new Error(
          'Perception pipeline requires a PerceptualAssetRef for native media analysis.',
        );
      }
      const mimeType = ref.mimeType;
      return {
        assetId: selector.assetId,
        ref,
        uri: ref.uri,
        modality: inferPerceptionModality(mimeType),
        mimeType,
        resolvedPath: isRemoteOrInlineUri(ref.uri) ? undefined : ref.uri,
        metadata: {
          ...(ref.label ? { label: ref.label } : {}),
          ...(ref.timestampMs !== undefined ? { timestampMs: ref.timestampMs } : {}),
        },
      };
    },
  };
}

async function resolveGeneratedAssetRef(
  assetId: string,
  options: { readonly workspaceRoot: string; readonly assetIndex: GeneratedAssetIndex },
): Promise<PerceptualAssetRef | undefined> {
  let asset = options.assetIndex.get(assetId);
  if (!asset) {
    await options.assetIndex.load();
    asset = options.assetIndex.get(assetId);
  }
  if (!asset) return undefined;
  const uri = asset.path || asset.assetRef?.uri;
  if (!uri) {
    throw new Error(`Generated asset ${assetId} has no resolvable URI.`);
  }
  return {
    assetId,
    uri,
    mimeType: asset.assetRef?.mimeType ?? asset.mimeType,
    ...(asset.assetRef?.resourceRef ? { resourceRef: asset.assetRef.resourceRef } : {}),
    ...(asset.assetRef?.documentResourceRef
      ? { documentResourceRef: asset.assetRef.documentResourceRef }
      : {}),
    ...(asset.assetRef?.label ? { label: asset.assetRef.label } : {}),
  };
}

function createNodeMediaProbe(): MediaProbePort {
  return {
    probe: async (asset) => ({
      format: inferFormatFromMimeType(asset.mimeType),
      mimeType: asset.mimeType,
      byteSize: asset.byteSize ?? 0,
    }),
  };
}

function inferPerceptionModality(mimeType: string): ResolvedPerceptualAsset['modality'] {
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('image/')) return 'image';
  return 'data';
}

function inferFormatFromMimeType(mimeType: string): string {
  const slash = mimeType.indexOf('/');
  return slash >= 0 ? mimeType.slice(slash + 1) : mimeType;
}

function isRemoteOrInlineUri(uri: string): boolean {
  return uri.startsWith('data:') || uri.startsWith('http://') || uri.startsWith('https://');
}
