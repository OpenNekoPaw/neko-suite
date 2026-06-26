import type { PerceptionAssetLoader, ProviderReadyAssetPayload } from '@neko/ai-sdk';
import { getMimeType, type ContentSourceRef, type PerceptualAssetRef } from '@neko/shared';
import { createDocumentResourceRefFromArchiveRef } from '@neko/shared/vscode/extension';
import type { AgentContentAccessRuntime } from '@neko/agent/runtime';

export function createLocalPerceptionAssetLoader(
  contentAccessRuntime?: AgentContentAccessRuntime,
): PerceptionAssetLoader {
  return {
    load: async (ref, _policy) => loadPerceptionAsset(ref, contentAccessRuntime),
  };
}

async function loadPerceptionAsset(
  ref: PerceptualAssetRef,
  contentAccessRuntime: AgentContentAccessRuntime | undefined,
): Promise<ProviderReadyAssetPayload> {
  const mimeType = ref.mimeType || getMimeType(ref.uri);
  if (ref.uri.startsWith('data:')) {
    return { kind: resolveProviderPayloadKind(mimeType), url: ref.uri, mimeType };
  }
  if (ref.uri.startsWith('http://') || ref.uri.startsWith('https://')) {
    return { kind: resolveProviderPayloadKind(mimeType), url: ref.uri, mimeType };
  }

  if (!contentAccessRuntime) {
    throw new Error('Perception asset loading requires AgentContentAccessRuntime.');
  }

  const loaded = await contentAccessRuntime.loadProviderAsset({
    caller: 'perception-asset-loader',
    source: createPerceptionAssetSource(ref),
    preferredTarget: 'bytes',
    mimeTypeHint: mimeType,
  });
  if (loaded.status !== 'ready' || !loaded.bytes) {
    throw new Error(
      loaded.diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message ??
        `Perception asset is not ready: ${loaded.status}`,
    );
  }

  return {
    kind: resolveProviderPayloadKind(loaded.mimeType ?? mimeType),
    url: `data:${loaded.mimeType ?? mimeType};base64,${Buffer.from(loaded.bytes).toString('base64')}`,
    mimeType: loaded.mimeType ?? mimeType,
  };
}

function createPerceptionAssetSource(ref: PerceptualAssetRef): ContentSourceRef {
  if (ref.documentResourceRef) {
    return createDocumentResourceRefFromArchiveRef(ref.documentResourceRef, 'project');
  }
  return {
    kind: 'file',
    path: ref.uri,
  };
}

function resolveProviderPayloadKind(mimeType: string): ProviderReadyAssetPayload['kind'] {
  return mimeType.startsWith('video/') ? 'video' : 'image';
}
