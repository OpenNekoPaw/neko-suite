import * as fs from 'fs/promises';
import type { PerceptionAssetLoader, ProviderReadyAssetPayload } from '@neko/ai-sdk';
import { getMimeType, type PerceptualAssetRef } from '@neko/shared';
import { resolveDocumentPath } from './documentPathResolver';

export function createLocalPerceptionAssetLoader(): PerceptionAssetLoader {
  return {
    load: async (ref, _policy) => loadPerceptionAsset(ref),
  };
}

async function loadPerceptionAsset(ref: PerceptualAssetRef): Promise<ProviderReadyAssetPayload> {
  const mimeType = ref.mimeType || getMimeType(ref.uri);
  if (ref.uri.startsWith('data:')) {
    return { kind: resolveProviderPayloadKind(mimeType), url: ref.uri, mimeType };
  }
  if (ref.uri.startsWith('http://') || ref.uri.startsWith('https://')) {
    return { kind: resolveProviderPayloadKind(mimeType), url: ref.uri, mimeType };
  }

  const resolvedPath = await resolveDocumentPath(ref.uri);
  const bytes = await fs.readFile(resolvedPath);
  return {
    kind: resolveProviderPayloadKind(mimeType),
    url: `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`,
    mimeType,
  };
}

function resolveProviderPayloadKind(mimeType: string): ProviderReadyAssetPayload['kind'] {
  return mimeType.startsWith('video/') ? 'video' : 'image';
}
