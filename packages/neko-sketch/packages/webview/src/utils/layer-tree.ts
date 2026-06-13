import type { LayerData } from '../types';

export function findLayerById(layers: readonly LayerData[], layerId: string): LayerData | null {
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

export function findLastEditableLayer(layers: readonly LayerData[]): LayerData | null {
  for (let index = layers.length - 1; index >= 0; index--) {
    const layer = layers[index];
    if (!layer) continue;
    const child = findLastEditableLayer(layer.children);
    if (child) {
      return child;
    }
    if (layer.type !== 'group') {
      return layer;
    }
  }
  return null;
}
