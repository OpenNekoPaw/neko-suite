/**
 * ManifestAdapter — translate raw asset manifest entries into workflow Asset objects.
 *
 * The raw entries come from whatever source the caller provides
 * (loadAssetManifests in AssetLibraryDeps). We keep the mapping small and
 * defensive so future manifest schema changes don't ripple here.
 *
 * See docs/architecture/asset-knowledge-graph.md §6.
 */

import type { Asset, AssetKind, RawAssetManifestEntry } from './types';

const TYPE_TO_KIND: Record<string, AssetKind> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  sequence: 'sequence',
  '3d-model': 'model-3d',
  'puppet-motion': 'motion',
  document: 'document',
};

export function indexManifest(
  entries: readonly RawAssetManifestEntry[],
): ReadonlyMap<string, Asset> {
  const byId = new Map<string, Asset>();
  for (const entry of entries) {
    const asset = projectEntry(entry);
    if (asset) byId.set(asset.id, asset);
  }
  return byId;
}

function projectEntry(entry: RawAssetManifestEntry): Asset | undefined {
  const kind = inferKind(entry);
  const variants = extractVariants(entry.metadata);

  return {
    id: entry.id,
    kind,
    path: entry.path,
    ...(entry.entityId !== undefined && { entityId: entry.entityId }),
    ...(entry.name !== undefined && { name: entry.name }),
    ...(entry.source !== undefined && { source: entry.source }),
    ...(variants !== undefined && { variants }),
  };
}

function inferKind(entry: RawAssetManifestEntry): AssetKind {
  const mapped = TYPE_TO_KIND[entry.type];
  if (mapped) return mapped;

  // Fallback: infer from path extension
  const ext = extractExt(entry.path);
  if (!ext) return 'other';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'webm', 'mkv'].includes(ext)) return 'video';
  if (['wav', 'mp3', 'ogg', 'm4a'].includes(ext)) return 'audio';
  if (['gltf', 'glb', 'fbx', 'obj'].includes(ext)) return 'model-3d';
  if (['nkpup', 'inp'].includes(ext)) return 'puppet-2d';
  if (['bvh', 'vmd'].includes(ext)) return 'motion';
  return 'other';
}

function extractExt(path: string): string | undefined {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return undefined;
  return name.slice(dot + 1).toLowerCase();
}

function extractVariants(
  metadata: Readonly<Record<string, unknown>> | undefined,
): Record<string, string | number | boolean> | undefined {
  if (!metadata) return undefined;
  const variants: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      variants[key] = value;
    }
  }
  return Object.keys(variants).length > 0 ? variants : undefined;
}
