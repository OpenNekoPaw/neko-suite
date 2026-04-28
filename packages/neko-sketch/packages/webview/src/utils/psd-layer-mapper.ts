import type { PsdDocumentTreeWire, PsdImportIssue, PsdLayerNodeWire } from '@neko/shared';
import type { CanvasConfig, LayerData } from '../types';
import { generateLayerId } from '../layer';
import { createRasterLayerFromEncodedPng } from './raster-source';
import { isPsdGroupPassThroughBlendMode, mapPsdBlendMode } from './psd-blend-mode-map';

export interface PsdLayerMapResult {
  readonly canvas: CanvasConfig;
  readonly layers: readonly LayerData[];
  readonly issues: readonly PsdImportIssue[];
}

export function mapPsdDocumentTree(
  tree: PsdDocumentTreeWire,
  sourceIssues: readonly PsdImportIssue[] = [],
): PsdLayerMapResult {
  const issues: PsdImportIssue[] = [...sourceIssues];
  const layers = tree.layers.map((layer) => mapLayer(layer, [], issues));

  return {
    canvas: {
      width: tree.canvas.width,
      height: tree.canvas.height,
      dpi: tree.canvas.dpi,
      backgroundColor: tree.canvas.backgroundColor,
    },
    layers,
    issues,
  };
}

function mapLayer(
  node: PsdLayerNodeWire,
  parentPath: readonly string[],
  issues: PsdImportIssue[],
): LayerData {
  const layerPath = [...parentPath, node.name];
  if (node.kind === 'group') {
    return mapGroupLayer(node, layerPath, issues);
  }
  return mapRasterLayer(node, layerPath, issues);
}

function mapGroupLayer(
  node: PsdLayerNodeWire,
  layerPath: readonly string[],
  issues: PsdImportIssue[],
): LayerData {
  if (isPsdGroupPassThroughBlendMode(node.blendMode)) {
    pushIssueOnce(issues, {
      code: 'group-isolation-mismatch',
      severity: 'warning',
      message:
        'PSD pass-through group blending is not supported; the group was imported with normal isolation.',
      layerPath,
    });
  }

  return {
    id: node.id ?? generateLayerId(),
    name: node.name,
    type: 'group',
    visible: node.visible,
    locked: false,
    opacity: clampOpacity(node.opacity),
    blendMode: 'normal',
    width: node.width,
    height: node.height,
    offsetX: node.left,
    offsetY: node.top,
    clippingMask: node.clippingMask,
    maskLayerId: null,
    children: (node.children ?? []).map((child) => mapLayer(child, layerPath, issues)),
    texture: null,
    alphaLock: false,
  };
}

function mapRasterLayer(
  node: PsdLayerNodeWire,
  layerPath: readonly string[],
  issues: PsdImportIssue[],
): LayerData {
  const mapping = mapPsdBlendMode(node.blendMode, layerPath);
  if (mapping.issue) {
    pushIssueOnce(issues, mapping.issue);
  }

  if (!node.pixels) {
    pushIssueOnce(issues, {
      code: 'missing-pixel-data',
      severity: 'warning',
      message: `PSD layer "${node.name}" has no pixel data and was imported as an empty raster layer.`,
      layerPath,
    });
  }

  if (node.pixels) {
    const { layer } = createRasterLayerFromEncodedPng(node.pixels, {
      name: node.name,
      width: node.width,
      height: node.height,
      offsetX: node.left,
      offsetY: node.top,
      visible: node.visible,
      opacity: clampOpacity(node.opacity),
      blendMode: mapping.blendMode,
      clippingMask: node.clippingMask,
    });
    return { ...layer, id: node.id ?? layer.id };
  }

  return {
    id: node.id ?? generateLayerId(),
    name: node.name,
    type: 'raster',
    visible: node.visible,
    locked: false,
    opacity: clampOpacity(node.opacity),
    blendMode: mapping.blendMode,
    width: node.width,
    height: node.height,
    offsetX: node.left,
    offsetY: node.top,
    clippingMask: node.clippingMask,
    maskLayerId: null,
    children: [],
    texture: null,
    alphaLock: false,
  };
}

function clampOpacity(opacity: number): number {
  if (!Number.isFinite(opacity)) return 1;
  return Math.max(0, Math.min(1, opacity));
}

function pushIssueOnce(issues: PsdImportIssue[], issue: PsdImportIssue): void {
  if (hasIssue(issues, issue.code, issue.layerPath)) {
    return;
  }
  issues.push(issue);
}

function hasIssue(
  issues: readonly PsdImportIssue[],
  code: PsdImportIssue['code'],
  layerPath: readonly string[] | undefined,
): boolean {
  return issues.some((issue) => issue.code === code && sameLayerPath(issue.layerPath, layerPath));
}

function sameLayerPath(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  if (!left || !right) return left === right;
  if (left.length !== right.length) return false;
  return left.every((part, index) => part === right[index]);
}
