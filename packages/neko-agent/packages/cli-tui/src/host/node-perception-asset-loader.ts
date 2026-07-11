import type { PerceptionAssetLoader, ProviderReadyAssetPayload } from '@neko/ai-sdk';
import {
  getMimeType,
  type ContentDocumentSourceRef,
  type ContentSourceRef,
  type DocumentArchiveResourceRef,
  type PerceptualAssetRef,
} from '@neko/shared';
import type { AgentContentAccessRuntime } from '@neko/agent/runtime';

export function createNodePerceptionAssetLoader(
  contentAccessRuntime: AgentContentAccessRuntime,
): PerceptionAssetLoader {
  return {
    load: async (ref) => loadPerceptionAsset(ref, contentAccessRuntime),
  };
}

async function loadPerceptionAsset(
  ref: PerceptualAssetRef,
  contentAccessRuntime: AgentContentAccessRuntime,
): Promise<ProviderReadyAssetPayload> {
  const mimeType = ref.mimeType || getMimeType(ref.uri);
  const hasStableResourceRef =
    ref.resourceRef !== undefined || ref.documentResourceRef !== undefined;
  if (!hasStableResourceRef && ref.uri.startsWith('data:')) {
    return { kind: resolveProviderPayloadKind(mimeType), url: ref.uri, mimeType };
  }
  if (!hasStableResourceRef && (ref.uri.startsWith('http://') || ref.uri.startsWith('https://'))) {
    return { kind: resolveProviderPayloadKind(mimeType), url: ref.uri, mimeType };
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

  const loadedMimeType = loaded.mimeType ?? mimeType;
  return {
    kind: resolveProviderPayloadKind(loadedMimeType),
    url: `data:${loadedMimeType};base64,${Buffer.from(loaded.bytes).toString('base64')}`,
    mimeType: loadedMimeType,
  };
}

function createPerceptionAssetSource(ref: PerceptualAssetRef): ContentSourceRef {
  if (ref.resourceRef) {
    return ref.resourceRef;
  }
  if (ref.documentResourceRef) {
    return createDocumentEntrySource(ref.documentResourceRef);
  }
  return {
    kind: 'file',
    path: ref.uri,
  };
}

function createDocumentEntrySource(ref: DocumentArchiveResourceRef): ContentDocumentSourceRef {
  return {
    kind: 'document',
    source: {
      kind: 'document',
      document: ref.source,
    },
    ...(ref.entryPath ? { entryPath: ref.entryPath } : {}),
    ...(ref.entryPath || ref.locator
      ? {
          locator: {
            kind: 'document',
            ...(ref.entryPath ? { entryPath: ref.entryPath } : {}),
            ...(ref.locator ? { locator: ref.locator } : {}),
          },
        }
      : {}),
  };
}

function resolveProviderPayloadKind(mimeType: string): ProviderReadyAssetPayload['kind'] {
  if (mimeType.startsWith('audio/')) return 'audio';
  return mimeType.startsWith('video/') ? 'video' : 'image';
}
