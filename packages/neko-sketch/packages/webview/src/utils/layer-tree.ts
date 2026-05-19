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

export function updateLayerById(
  layers: readonly LayerData[],
  layerId: string,
  update: (layer: LayerData) => LayerData,
): LayerData[] {
  return layers.map((layer) => {
    if (layer.id === layerId) {
      return update(layer);
    }
    return { ...layer, children: updateLayerById(layer.children, layerId, update) };
  });
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
