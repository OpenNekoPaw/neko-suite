/**
 * Layer Manager
 *
 * Manages the layer tree: CRUD, reorder, group/ungroup.
 * Operates on the Zustand store's layer data.
 */
import type { LayerData, LayerType } from '../types';

let nextId = 1;

/** Generate a unique layer ID */
export function generateLayerId(): string {
  return `layer-${Date.now()}-${nextId++}`;
}

/** Create a new raster layer with default settings */
export function createLayer(
  name: string,
  width: number,
  height: number,
  type: LayerType = 'raster',
): LayerData {
  return {
    id: generateLayerId(),
    name,
    type,
    visible: true,
    locked: false,
    opacity: 1.0,
    blendMode: 'normal',
    width,
    height,
    offsetX: 0,
    offsetY: 0,
    clippingMask: false,
    maskLayerId: null,
    children: [],
    texture: null,
  };
}

/** Find a layer by ID in a nested tree */
export function findLayer(layers: ReadonlyArray<LayerData>, id: string): LayerData | undefined {
  for (const layer of layers) {
    if (layer.id === id) return layer;
    const found = findLayer(layer.children, id);
    if (found) return found;
  }
  return undefined;
}

/** Find the parent of a layer and its index */
export function findLayerParent(
  layers: LayerData[],
  id: string,
): { parent: LayerData[] | null; index: number } | null {
  for (let i = 0; i < layers.length; i++) {
    if (layers[i]?.id === id) {
      return { parent: null, index: i }; // top-level
    }
    const result = findLayerParentInChildren(layers[i]!.children, id);
    if (result) return result;
  }
  return null;
}

function findLayerParentInChildren(
  children: LayerData[],
  id: string,
): { parent: LayerData[]; index: number } | null {
  for (let i = 0; i < children.length; i++) {
    if (children[i]?.id === id) {
      return { parent: children, index: i };
    }
    const result = findLayerParentInChildren(children[i]!.children, id);
    if (result) return result;
  }
  return null;
}

/** Add a layer at the top of the list */
export function addLayer(layers: LayerData[], newLayer: LayerData): LayerData[] {
  return [...layers, newLayer];
}

/** Remove a layer by ID (deep) */
export function removeLayer(layers: LayerData[], id: string): LayerData[] {
  return layers
    .filter((l) => l.id !== id)
    .map((l) => ({
      ...l,
      children: removeLayer(l.children, id),
    }));
}

/** Move a layer to a new position */
export function moveLayer(layers: LayerData[], layerId: string, targetIndex: number): LayerData[] {
  const flat = layers.filter((l) => l.id !== layerId);
  const layer = findLayer(layers, layerId);
  if (!layer) return layers;

  const result = [...flat];
  const clampedIndex = Math.max(0, Math.min(result.length, targetIndex));
  result.splice(clampedIndex, 0, layer as LayerData);
  return result;
}

/** Duplicate a layer */
export function duplicateLayer(layers: LayerData[], id: string): LayerData[] {
  const source = findLayer(layers, id);
  if (!source) return layers;

  const duplicate: LayerData = {
    ...source,
    id: generateLayerId(),
    name: `${source.name} copy`,
    texture: null, // Texture must be cloned separately by the renderer
    children: [],
  };

  const index = layers.findIndex((l) => l.id === id);
  if (index < 0) return layers;

  const result = [...layers];
  result.splice(index + 1, 0, duplicate);
  return result;
}

/** Update layer properties */
export function updateLayer(
  layers: LayerData[],
  id: string,
  updates: Partial<Pick<LayerData, 'name' | 'visible' | 'locked' | 'opacity' | 'blendMode'>>,
): LayerData[] {
  return layers.map((l) => {
    if (l.id === id) {
      return { ...l, ...updates };
    }
    return { ...l, children: updateLayer(l.children, id, updates) };
  });
}

/** Group selected layers into a new group */
export function groupLayers(
  layers: LayerData[],
  layerIds: string[],
  groupName = 'Group',
): LayerData[] {
  const group = createLayer(groupName, 0, 0, 'group');
  const grouped: LayerData[] = [];
  const remaining: LayerData[] = [];
  let insertIndex = -1;

  layers.forEach((layer, index) => {
    if (layerIds.includes(layer.id)) {
      grouped.push(layer);
      if (insertIndex < 0) insertIndex = index;
    } else {
      remaining.push(layer);
    }
  });

  if (grouped.length === 0) return layers;

  const groupWithChildren: LayerData = {
    ...group,
    children: grouped,
  };

  const result = [...remaining];
  result.splice(Math.max(0, insertIndex), 0, groupWithChildren);
  return result;
}

/** Flatten all visible layers into one */
export function flattenLayerList(layers: ReadonlyArray<LayerData>): LayerData[] {
  const result: LayerData[] = [];
  for (const layer of layers) {
    if (layer.type === 'group') {
      result.push(...flattenLayerList(layer.children));
    } else {
      result.push(layer);
    }
  }
  return result;
}
