import {
  isDocumentArchiveResourceRef,
  isResourceRef,
  type DocumentArchiveResourceRef,
  type ResourceRef,
} from '@neko/shared';

export interface ImportedGeneratedAssetPayload {
  path: string;
  mediaType: 'image' | 'video' | 'audio';
  name: string;
  originalPath?: string;
  documentResourceRef?: DocumentArchiveResourceRef;
  resourceRef?: ResourceRef;
}

export interface ImportedGeneratedAssetNodeInput {
  readonly assetPath: string;
  readonly runtimeAssetPath?: string;
  readonly documentResourceRef?: DocumentArchiveResourceRef;
  readonly resourceRef?: ResourceRef;
}

export function normalizeImportedGeneratedAsset(
  value: unknown,
): ImportedGeneratedAssetPayload | null {
  if (typeof value !== 'object' || value === null) return null;
  const asset = value as Record<string, unknown>;
  const path = typeof asset.path === 'string' ? asset.path : '';
  if (!path) return null;

  const mediaType = normalizeImportedMediaType(asset.type ?? asset.mediaType, path);
  const name =
    typeof asset.name === 'string' && asset.name
      ? asset.name
      : getImportedAssetFileName(
          typeof asset.originalPath === 'string' && asset.originalPath ? asset.originalPath : path,
        );

  return {
    path,
    mediaType,
    name,
    ...(typeof asset.originalPath === 'string' && asset.originalPath
      ? { originalPath: asset.originalPath }
      : {}),
    ...(isDocumentArchiveResourceRef(asset.documentResourceRef)
      ? { documentResourceRef: asset.documentResourceRef }
      : {}),
    ...(isResourceRef(asset.resourceRef) ? { resourceRef: asset.resourceRef } : {}),
  };
}

export function getImportedGeneratedAssetNodeInput(
  asset: ImportedGeneratedAssetPayload,
): ImportedGeneratedAssetNodeInput {
  const hasLinkedResource = Boolean(asset.documentResourceRef || asset.resourceRef);
  return {
    assetPath: hasLinkedResource ? '' : asset.path,
    ...(hasLinkedResource ? { runtimeAssetPath: asset.path } : {}),
    ...(asset.documentResourceRef ? { documentResourceRef: asset.documentResourceRef } : {}),
    ...(asset.resourceRef ? { resourceRef: asset.resourceRef } : {}),
  };
}

export function normalizeImportedMediaType(
  value: unknown,
  assetPath: string,
): ImportedGeneratedAssetPayload['mediaType'] {
  if (value === 'video' || value === 'generated-video') return 'video';
  if (value === 'audio' || value === 'generated-audio') return 'audio';
  if (value === 'image' || value === 'generated-image' || value === 'generated-storyboard') {
    return 'image';
  }

  const cleanPath = assetPath.split('?')[0]?.split('#')[0] ?? assetPath;
  const ext = cleanPath.split('.').pop()?.toLowerCase() ?? '';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext)) return 'audio';
  return 'image';
}

function getImportedAssetFileName(assetPath: string): string {
  try {
    const url = new URL(assetPath);
    const name = url.pathname.split('/').pop();
    return name ? decodeURIComponent(name) : 'generated-asset';
  } catch {
    return assetPath.split(/[\\/]/).pop() || 'generated-asset';
  }
}
