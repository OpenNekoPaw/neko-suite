import type { LayerData } from '../types';
import { readTextureAsBase64 } from './document-serializer';

export interface LayerImageExportInput {
  readonly layers: readonly LayerData[];
  readonly activeLayerId: string | null;
  readonly layerId?: string;
  readonly gl: WebGL2RenderingContext | null;
}

export function exportLayerImageDataBase64(input: LayerImageExportInput): string | null {
  const layer = resolveLayerForImageExport(input.layers, input.activeLayerId, input.layerId);
  if (!layer) {
    return null;
  }

  if (layer.pendingData) {
    return layer.pendingData;
  }

  if (!layer.texture || !input.gl) {
    return null;
  }

  return readTextureAsBase64(input.gl, layer.texture, layer.width, layer.height) ?? null;
}

export function resolveLayerForImageExport(
  layers: readonly LayerData[],
  activeLayerId: string | null,
  requestedLayerId?: string,
): LayerData | null {
  const targetId = requestedLayerId ?? activeLayerId;
  if (!targetId) {
    return null;
  }
  return findLayerById(layers, targetId);
}

function findLayerById(layers: readonly LayerData[], layerId: string): LayerData | null {
  for (const layer of layers) {
    if (layer.id === layerId) {
      return layer;
    }
    const child = findLayerById(layer.children, layerId);
    if (child) {
      return child;
    }
  }
  return null;
}
