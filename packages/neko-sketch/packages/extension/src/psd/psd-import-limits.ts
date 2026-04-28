import type { PsdDocumentTreeWire, PsdImportIssue, PsdLayerNodeWire } from '@neko/shared';

export interface PsdImportLimits {
  readonly maxTextureSize: number;
  readonly maxLayerCount: number;
  readonly maxPixelBytes: number;
}

export const DEFAULT_PSD_IMPORT_LIMITS: PsdImportLimits = {
  maxTextureSize: 8192,
  maxLayerCount: 100,
  maxPixelBytes: 512 * 1024 * 1024,
};

export function enforcePsdImportLimits(
  tree: PsdDocumentTreeWire,
  limits: PsdImportLimits = DEFAULT_PSD_IMPORT_LIMITS,
): { readonly tree: PsdDocumentTreeWire; readonly issues: readonly PsdImportIssue[] } {
  const issues: PsdImportIssue[] = [];
  const layerCount = countLayers(tree.layers);
  if (layerCount > limits.maxLayerCount) {
    issues.push({
      code: 'layer-count-exceeded',
      severity: 'warning',
      message: `PSD has ${layerCount} layers, exceeding the recommended limit of ${limits.maxLayerCount}.`,
    });
  }

  const sanitizedLayers = sanitizeLayers(tree.layers, limits, [], issues);
  const budgeted = enforcePixelBudget(sanitizedLayers, limits);
  const totalBytes = estimatePixelBytes(sanitizedLayers);
  if (totalBytes > limits.maxPixelBytes) {
    for (const droppedLayer of budgeted.droppedLayers) {
      issues.push({
        code: 'memory-budget-exceeded',
        severity: 'warning',
        message: `PSD raster pixel budget ${formatBytes(totalBytes)} exceeds ${formatBytes(limits.maxPixelBytes)}; pixel data was dropped from "${droppedLayer.layerPath.join(' / ')}".`,
        layerPath: droppedLayer.layerPath,
      });
    }
  }

  return {
    tree: { ...tree, layers: budgeted.layers },
    issues,
  };
}

function sanitizeLayers(
  layers: readonly PsdLayerNodeWire[],
  limits: PsdImportLimits,
  parentPath: readonly string[],
  issues: PsdImportIssue[],
): readonly PsdLayerNodeWire[] {
  return layers.map((layer) => {
    const layerPath = [...parentPath, layer.name];
    const children = layer.children
      ? sanitizeLayers(layer.children, limits, layerPath, issues)
      : undefined;
    const exceedsTextureSize =
      layer.kind === 'raster' &&
      (layer.width > limits.maxTextureSize || layer.height > limits.maxTextureSize);
    if (exceedsTextureSize) {
      issues.push({
        code: 'texture-size-exceeded',
        severity: 'warning',
        message: `Layer "${layer.name}" exceeds max texture size ${limits.maxTextureSize} and was imported without pixel data.`,
        layerPath,
      });
      return { ...layer, children, pixels: undefined };
    }
    return { ...layer, children };
  });
}

function countLayers(layers: readonly PsdLayerNodeWire[]): number {
  return layers.reduce((sum, layer) => sum + 1 + countLayers(layer.children ?? []), 0);
}

function estimatePixelBytes(layers: readonly PsdLayerNodeWire[]): number {
  return layers.reduce((sum, layer) => {
    const self = layer.kind === 'raster' && layer.pixels ? layer.width * layer.height * 4 : 0;
    return sum + self + estimatePixelBytes(layer.children ?? []);
  }, 0);
}

interface PixelBudgetEntry {
  readonly key: string;
  readonly bytes: number;
  readonly layerPath: readonly string[];
}

function enforcePixelBudget(
  layers: readonly PsdLayerNodeWire[],
  limits: PsdImportLimits,
): {
  readonly layers: readonly PsdLayerNodeWire[];
  readonly droppedLayers: readonly PixelBudgetEntry[];
} {
  const entries = collectPixelBudgetEntries(layers, []);
  let totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  if (totalBytes <= limits.maxPixelBytes) {
    return { layers, droppedLayers: [] };
  }

  const droppedKeys = new Set<string>();
  const droppedLayers: PixelBudgetEntry[] = [];
  const largestFirst = [...entries].sort((a, b) => b.bytes - a.bytes);
  for (const entry of largestFirst) {
    if (totalBytes <= limits.maxPixelBytes) break;
    droppedKeys.add(entry.key);
    droppedLayers.push(entry);
    totalBytes -= entry.bytes;
  }

  return {
    layers: dropPixelDataByKey(layers, droppedKeys, []),
    droppedLayers,
  };
}

function collectPixelBudgetEntries(
  layers: readonly PsdLayerNodeWire[],
  parentIndexPath: readonly number[],
  parentLayerPath: readonly string[] = [],
): readonly PixelBudgetEntry[] {
  return layers.flatMap((layer, index) => {
    const indexPath = [...parentIndexPath, index];
    const layerPath = [...parentLayerPath, layer.name];
    const self =
      layer.kind === 'raster' && layer.pixels
        ? [{ key: indexPath.join('/'), bytes: layer.width * layer.height * 4, layerPath }]
        : [];
    return [...self, ...collectPixelBudgetEntries(layer.children ?? [], indexPath, layerPath)];
  });
}

function dropPixelDataByKey(
  layers: readonly PsdLayerNodeWire[],
  droppedKeys: ReadonlySet<string>,
  parentIndexPath: readonly number[],
): readonly PsdLayerNodeWire[] {
  return layers.map((layer, index) => {
    const indexPath = [...parentIndexPath, index];
    const children = layer.children
      ? dropPixelDataByKey(layer.children, droppedKeys, indexPath)
      : undefined;
    if (layer.kind === 'raster' && droppedKeys.has(indexPath.join('/'))) {
      return { ...layer, children, pixels: undefined };
    }
    return { ...layer, children };
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes}B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.ceil(bytes / 1024)}KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)}MB`;
}
