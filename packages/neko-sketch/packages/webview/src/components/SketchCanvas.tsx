/**
 * SketchCanvas - WebGL canvas with renderer integration
 *
 * Initializes the WebGL renderer, handles resize, and
 * connects pointer input to the brush engine, pixel tool, and vector tool.
 *
 * Frame mode integration:
 *   - On currentFrameIndex change: save outgoing frame pixels, load incoming frame pixels.
 *   - Onion skin overlay rendered via a 2D canvas positioned over the WebGL canvas.
 *
 * Filter / particle integration:
 *   - Render loop uses renderWithEffects() to apply the filter chain and particle overlay.
 *
 * Vector drag preview:
 *   - A separate 2D canvas overlay shows the shape outline while dragging.
 */
import { useRef, useEffect, useCallback, useState } from 'react';
import { useSketchStore } from '../stores';
import { SketchRenderer } from '../engine';
import type { LightingConfig } from '../engine';
import type { LightSceneObject } from '../types/scene';
import { isLightObject } from '../types/scene';
import { BrushEngine } from '../brush';
import { decodeTextureStampAssetPixels } from '../brush';
import { usePointerInput } from '../hooks/usePointerInput';
import type {
  DocumentPoint,
  StrokePoint,
  LayerData,
  HistoryEntry,
  HistoryStateSnapshot,
  RegionSnapshot,
  RegionSnapshotPair,
} from '../types';
import type { VectorHandleMode, VectorLayerData, VectorNodeRef, VectorPath } from '../types/vector';
import type { OnionSkinGhost } from '../types/frame';
import type { ViewportState } from '../types';
import { drawPixel, drawLine, floodFill, patternFill } from '../tools/pixel-tool';
import type { PixelBrushSize } from '../tools/pixel-tool';
import { paintLinearGradient } from '../tools/gradient-tool';
import { cloneStampFromSource } from '../tools/clone-tool';
import { DEFAULT_TEXT_DATA, renderTextToImageData } from '../tools/text-tool';
import { canMergeLayerPixels, mergeLayerPixelsDown } from '../tools/layer-merge-tool';
import { createRectangle, createEllipse, createPolygon, createStar } from '../tools/vector-tool';
import {
  createVectorLayerData,
  getVectorLayerRenderSignature,
  getVectorHandleAnchorRefsForSelection,
  hasVectorNodeRef,
  hitTestVectorPathNode,
  listVectorPathHandleEdges,
  listVectorPathNodes,
  moveVectorLayerNodes,
  duplicateSelectedVectorPath,
  reverseSelectedVectorPath,
  selectVectorNodesInRect,
  setVectorHandleModeForSelection,
  setSelectedVectorPathClosed,
  toggleVectorNodeSelection,
} from '../tools/vector-editing';
import { renderPaths } from '../engine/vector-renderer';
import { computeOnionSkinGhosts } from '../utils/frame-manager';
import { atmosphereToEmitter } from '../data/atmosphere-presets';
import { computeParallaxOffsets, buildParallaxTransform } from '../engine/parallax-renderer';
import {
  hitTestHandle,
  applyHandleDrag,
  applyTransformToPixels,
  INITIAL_MATRIX,
} from '../tools/transform-tool';
import type { TransformState } from '../tools/transform-tool';
import { TransformOverlay } from './TransformOverlay';
import { GuidesOverlay } from './GuidesOverlay';
import type { Guide } from './GuidesOverlay';
import { ReferenceOverlay } from './ReferenceOverlay';
import type { ReferenceImage } from './ReferenceOverlay';
import { PixelGrid } from './PixelGrid';
import { PerspectiveGridOverlay } from './PerspectiveGridOverlay';
import { PositionedContextMenu as ContextMenu, type MenuItem } from '@neko/ui/primitives';
import { useTranslation } from '../i18n/I18nContext';
import { extractRegionSnapshot, findChangedPixelBounds } from '../utils/region-snapshot';
import { isComposingKeyboardEvent, isEditableTarget } from '@neko/ui/keyboard';
import {
  applyCanvasViewportTransform,
  documentToScreenPoint,
  getPanForDocumentPointAtScreenPoint,
  screenToDocumentPoint,
} from '../utils/viewport-transform';
import { snapPointToPerspectiveGrid } from '../utils/perspective-grid-snap';

// ─── Helpers ───

interface TextDraft {
  readonly docX: number;
  readonly docY: number;
  readonly screenX: number;
  readonly screenY: number;
  readonly text: string;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly color: string;
  readonly bold: boolean;
  readonly italic: boolean;
}

interface VectorNodeDragState {
  readonly layerId: string;
  readonly selectedNodeRefs: readonly VectorNodeRef[];
  readonly start: DocumentPoint;
  readonly startVectorData: VectorLayerData;
  readonly before: HistoryStateSnapshot;
  readonly moved: boolean;
}

interface VectorBoxSelectState {
  readonly layerId: string;
  readonly start: DocumentPoint;
  readonly additive: boolean;
}

type VectorPathCommand = 'close' | 'open' | 'reverse' | 'duplicate';

/** Convert screen coordinates to canvas coordinates accounting for viewport. */
function screenToCanvas(
  screenX: number,
  screenY: number,
  viewport: ViewportState,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } {
  return screenToDocumentPoint({ x: screenX, y: screenY }, viewport, {
    width: canvasWidth,
    height: canvasHeight,
  });
}

function snapShapePointToPerspectiveGrid(
  point: DocumentPoint,
  canvasWidth: number,
  canvasHeight: number,
): DocumentPoint {
  const grid = useSketchStore.getState().perspectiveGrid;
  return snapPointToPerspectiveGrid(point, grid, {
    width: canvasWidth,
    height: canvasHeight,
  }).point;
}

/** Clamp and snap brush size to a valid PixelBrushSize. */
function toPixelBrushSize(size: number): PixelBrushSize {
  const clamped = Math.min(8, Math.max(1, Math.round(size)));
  if (clamped <= 1) return 1;
  if (clamped <= 2) return 2;
  if (clamped <= 4) return 4;
  return 8;
}

function notifyHistoryReplay(entry: HistoryEntry | null, direction: 'undo' | 'redo'): void {
  if (!entry || (!entry.stateSnapshot && !entry.snapshot)) {
    return;
  }
  const vscode = (window as unknown as { __vscode_api__?: { postMessage(message: unknown): void } })
    .__vscode_api__;
  vscode?.postMessage({
    type: 'operationApplied',
    operation: {
      type: `sketch.history.${direction}`,
      meta: {
        id: `sketch-history-${direction}-${Date.now()}`,
        timestamp: Date.now(),
        source: 'user',
        description: `${direction}: ${entry.label}`,
      },
      payload: { historyEntryId: entry.id, actionType: entry.type },
    },
  });
}

function notifyDocumentEdited(description: string, type = 'sketch.pixel.edit'): void {
  const vscode = (window as unknown as { __vscode_api__?: { postMessage(message: unknown): void } })
    .__vscode_api__;
  vscode?.postMessage({
    type: 'operationApplied',
    operation: {
      type,
      meta: {
        id: `sketch-pixel-${Date.now()}`,
        timestamp: Date.now(),
        source: 'user',
        description,
      },
      payload: {},
    },
  });
}

/** Parse hex color string to normalized RGBA tuple (0-1 range). */
function hexToRGBA(hex: string): readonly [number, number, number, number] {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const a = clean.length >= 8 ? parseInt(clean.slice(6, 8), 16) / 255 : 1;
  return [r, g, b, a] as const;
}

/** Read pixels from a texture into an ImageData via a temporary framebuffer. */
function readTextureToImageData(
  renderer: SketchRenderer,
  texture: WebGLTexture,
  w: number,
  h: number,
): ImageData {
  const fbo = renderer.textures.createFramebuffer(texture);
  const pixels = renderer.textures.readPixels(fbo, 0, 0, w, h);
  renderer.textures.deleteFramebuffer(fbo);
  const buffer = new ArrayBuffer(pixels.length);
  const clamped = new Uint8ClampedArray(buffer);
  clamped.set(pixels);
  return new ImageData(clamped, w, h);
}

function readLayerTextureToImageData(
  renderer: SketchRenderer,
  layer: LayerData,
  fallbackWidth: number,
  fallbackHeight: number,
): ImageData {
  const width = Math.max(1, Math.round(layer.width || fallbackWidth));
  const height = Math.max(1, Math.round(layer.height || fallbackHeight));
  return layer.texture
    ? readTextureToImageData(renderer, layer.texture, width, height)
    : new ImageData(width, height);
}

/** Upload pixel data to a WebGL texture. */
function uploadImageDataToTexture(
  renderer: SketchRenderer,
  texture: WebGLTexture,
  imageData: ImageData,
): void {
  renderer.textures.updateTexture(
    texture,
    0,
    0,
    imageData.width,
    imageData.height,
    new Uint8Array(imageData.data.buffer),
  );
}

function buildRegionSnapshotPair(
  layerId: string,
  beforePixels: Uint8Array | Uint8ClampedArray,
  afterPixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): RegionSnapshotPair | null {
  const changedBounds = findChangedPixelBounds(beforePixels, afterPixels, width, height);
  if (!changedBounds) {
    return null;
  }

  const before = extractRegionSnapshot(layerId, beforePixels, width, height, changedBounds);
  const after = extractRegionSnapshot(layerId, afterPixels, width, height, changedBounds);
  return before && after ? { before, after } : null;
}

function pushRegionHistory(
  type: HistoryEntry['type'],
  label: string,
  snapshot: RegionSnapshotPair | null,
): void {
  if (!snapshot) {
    return;
  }

  useSketchStore.getState().pushHistory({
    type,
    label,
    snapshot,
  });
}

function pushStateHistory(
  type: HistoryEntry['type'],
  label: string,
  before: HistoryStateSnapshot | null,
  after: HistoryStateSnapshot,
): void {
  if (!before) {
    return;
  }

  useSketchStore.getState().pushHistory({
    type,
    label,
    snapshot: null,
    stateSnapshot: { before, after },
  });
}

function captureLayerStateSnapshot(): HistoryStateSnapshot {
  const state = useSketchStore.getState();
  return {
    layers: state.layers.map(cloneLayerForHistory),
    activeLayerId: state.activeLayerId,
  };
}

function cloneLayerForHistory(layer: LayerData): LayerData {
  return {
    ...layer,
    children: layer.children.map(cloneLayerForHistory),
  };
}

function hasLayerOffsetChanged(
  before: HistoryStateSnapshot,
  after: HistoryStateSnapshot,
  layerId: string,
): boolean {
  const beforeLayer = findLayerInSnapshot(before.layers, layerId);
  const afterLayer = findLayerInSnapshot(after.layers, layerId);
  return (
    beforeLayer?.offsetX !== afterLayer?.offsetX || beforeLayer?.offsetY !== afterLayer?.offsetY
  );
}

function findLayerInSnapshot(
  layers: readonly LayerData[] | undefined,
  layerId: string,
): LayerData | undefined {
  if (!layers) {
    return undefined;
  }

  for (const layer of layers) {
    if (layer.id === layerId) {
      return layer;
    }
    const child = findLayerInSnapshot(layer.children, layerId);
    if (child) {
      return child;
    }
  }

  return undefined;
}

function stampCloneSegment(params: {
  readonly targetData: Uint8ClampedArray;
  readonly sourceData: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
  readonly offset: { readonly x: number; readonly y: number };
  readonly radius: number;
  readonly hardness: number;
}): void {
  const dx = params.to.x - params.from.x;
  const dy = params.to.y - params.from.y;
  const distance = Math.hypot(dx, dy);
  const step = Math.max(1, params.radius * 0.5);
  const count = Math.max(1, Math.ceil(distance / step));

  for (let i = 0; i <= count; i++) {
    const t = i / count;
    cloneStampFromSource(
      params.targetData,
      params.sourceData,
      params.width,
      params.height,
      params.from.x + dx * t,
      params.from.y + dy * t,
      params.offset.x,
      params.offset.y,
      params.radius,
      params.hardness,
    );
  }
}

function createShapePaths(params: {
  readonly start: DocumentPoint;
  readonly end: DocumentPoint;
  readonly shapeType: string;
  readonly fill: NonNullable<VectorPath['fill']>;
  readonly polygonSides: number;
  readonly starPoints: number;
}): readonly VectorPath[] {
  const w = Math.abs(params.end.x - params.start.x);
  const h = Math.abs(params.end.y - params.start.y);
  const cx = (params.start.x + params.end.x) / 2;
  const cy = (params.start.y + params.end.y) / 2;
  const minX = Math.min(params.start.x, params.end.x);
  const minY = Math.min(params.start.y, params.end.y);
  const radius = Math.min(w, h) / 2;

  switch (params.shapeType) {
    case 'ellipse':
      return [createEllipse(cx, cy, w / 2, h / 2, params.fill)];
    case 'polygon':
      return [createPolygon(cx, cy, radius, params.polygonSides, params.fill)];
    case 'star':
      return [createStar(cx, cy, radius, radius * 0.4, params.starPoints, params.fill)];
    default:
      return [createRectangle(minX, minY, w, h, params.fill)];
  }
}

function renderVectorPathsToImageData(
  paths: readonly VectorPath[],
  width: number,
  height: number,
): ImageData | null {
  const offscreen = new OffscreenCanvas(width, height);
  const ctx = offscreen.getContext('2d');
  if (!ctx) {
    return null;
  }
  renderPaths(ctx as unknown as CanvasRenderingContext2D, paths);
  return ctx.getImageData(0, 0, width, height);
}

function uploadVectorLayerTexture(
  renderer: SketchRenderer,
  layer: LayerData,
  paths: readonly VectorPath[],
  width: number,
  height: number,
): WebGLTexture | null {
  if (paths.length === 0) {
    return null;
  }
  const imageData = renderVectorPathsToImageData(paths, width, height);
  if (!imageData) {
    return null;
  }
  const texture = layer.texture ?? renderer.textures.createTexture(width, height);
  uploadImageDataToTexture(renderer, texture, imageData);
  return texture;
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

function updateLayerById(
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

function collectVectorLayers(layers: readonly LayerData[], result: LayerData[] = []): LayerData[] {
  for (const layer of layers) {
    if (layer.type === 'vector' && layer.vectorData) {
      result.push(layer);
    }
    collectVectorLayers(layer.children, result);
  }
  return result;
}

function getVectorTextureSignature(
  layerData: VectorLayerData,
  width: number,
  height: number,
): string {
  return `${width}x${height}:${getVectorLayerRenderSignature(layerData)}`;
}

function compositeImageDataOver(target: Uint8ClampedArray, source: Uint8ClampedArray): void {
  for (let i = 0; i < source.length; i += 4) {
    const sourceAlpha = source[i + 3]! / 255;
    if (sourceAlpha <= 0) {
      continue;
    }

    const destAlpha = target[i + 3]! / 255;
    const outAlpha = sourceAlpha + destAlpha * (1 - sourceAlpha);
    if (outAlpha <= 0) {
      continue;
    }

    const destFactor = destAlpha * (1 - sourceAlpha);
    target[i] = Math.round((source[i]! * sourceAlpha + target[i]! * destFactor) / outAlpha);
    target[i + 1] = Math.round(
      (source[i + 1]! * sourceAlpha + target[i + 1]! * destFactor) / outAlpha,
    );
    target[i + 2] = Math.round(
      (source[i + 2]! * sourceAlpha + target[i + 2]! * destFactor) / outAlpha,
    );
    target[i + 3] = Math.round(outAlpha * 255);
  }
}

/**
 * Render onion skin ghosts onto the 2D overlay canvas.
 *
 * The transform matches the WebGL viewport, including viewport rotation.
 */
function renderOnionSkinOverlay(
  onionCanvas: HTMLCanvasElement,
  ghosts: readonly OnionSkinGhost[],
  docW: number,
  docH: number,
  viewport: ViewportState,
): void {
  const phW = onionCanvas.width;
  const phH = onionCanvas.height;
  const ctx = onionCanvas.getContext('2d');
  if (!ctx || phW === 0 || phH === 0) return;

  ctx.clearRect(0, 0, phW, phH);
  if (ghosts.length === 0) return;

  // Reuse a single OffscreenCanvas for tinting all ghosts
  const tmp = new OffscreenCanvas(docW, docH);
  const tmpCtx = tmp.getContext('2d');
  if (!tmpCtx) return;

  ctx.save();
  applyCanvasViewportTransform(
    ctx,
    viewport,
    { width: phW, height: phH },
    { width: docW, height: docH },
  );

  for (const ghost of ghosts) {
    if (!ghost.frame.imageData) continue;

    // Draw frame pixels
    tmpCtx.clearRect(0, 0, docW, docH);
    tmpCtx.putImageData(ghost.frame.imageData, 0, 0);

    // Tint: multiply the existing pixels with the ghost colour
    tmpCtx.globalCompositeOperation = 'source-atop';
    const [r, g, b] = ghost.tint;
    tmpCtx.fillStyle = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},0.5)`;
    tmpCtx.fillRect(0, 0, docW, docH);
    tmpCtx.globalCompositeOperation = 'source-over';

    // Composite onto the overlay canvas at the correct viewport position
    ctx.globalAlpha = ghost.opacity;
    ctx.drawImage(tmp, 0, 0);
  }

  ctx.restore();
}

/** Clear a 2D overlay canvas. */
function clearOverlayCanvas(canvas: HTMLCanvasElement | null): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/**
 * Render a selection rectangle preview on a 2D overlay canvas.
 * Draws a blue dashed rectangle in document coordinates.
 */
function renderSelectionPreview(
  previewCanvas: HTMLCanvasElement,
  start: { x: number; y: number },
  end: { x: number; y: number },
  docW: number,
  docH: number,
  viewport: ViewportState,
): void {
  const phW = previewCanvas.width;
  const phH = previewCanvas.height;
  const ctx = previewCanvas.getContext('2d');
  if (!ctx || phW === 0 || phH === 0) return;

  ctx.clearRect(0, 0, phW, phH);

  const minX = Math.min(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const w = Math.abs(end.x - start.x);
  const h = Math.abs(end.y - start.y);
  if (w < 1 && h < 1) return;

  ctx.save();
  const { scaleX, scaleY } = applyCanvasViewportTransform(
    ctx,
    viewport,
    { width: phW, height: phH },
    { width: docW, height: docH },
  );

  const invScale = 1 / Math.min(scaleX, scaleY);
  ctx.lineWidth = invScale;
  ctx.setLineDash([4 * invScale, 4 * invScale]);
  ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';

  ctx.beginPath();
  ctx.rect(minX, minY, w, h);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

/** Render lasso path preview on a 2D overlay canvas. */
function renderLassoPreview(
  previewCanvas: HTMLCanvasElement,
  points: readonly { x: number; y: number }[],
  docW: number,
  docH: number,
  viewport: ViewportState,
): void {
  const phW = previewCanvas.width;
  const phH = previewCanvas.height;
  const ctx = previewCanvas.getContext('2d');
  if (!ctx || phW === 0 || phH === 0 || points.length < 2) return;

  ctx.clearRect(0, 0, phW, phH);

  ctx.save();
  const { scaleX, scaleY } = applyCanvasViewportTransform(
    ctx,
    viewport,
    { width: phW, height: phH },
    { width: docW, height: docH },
  );

  const invScale = 1 / Math.min(scaleX, scaleY);
  ctx.lineWidth = invScale;
  ctx.setLineDash([4 * invScale, 4 * invScale]);
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
  ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';

  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i]!.x, points[i]!.y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

/**
 * Render a vector shape drag preview on a 2D overlay canvas.
 *
 * Draws a translucent filled shape with a dashed stroke outline in document
 * coordinates, transformed to screen coordinates using the current viewport.
 */
function renderVectorPreview(
  previewCanvas: HTMLCanvasElement,
  start: { x: number; y: number },
  end: { x: number; y: number },
  shapeType: string,
  color: readonly [number, number, number, number],
  docW: number,
  docH: number,
  viewport: ViewportState,
): void {
  const phW = previewCanvas.width;
  const phH = previewCanvas.height;
  const ctx = previewCanvas.getContext('2d');
  if (!ctx || phW === 0 || phH === 0) return;

  ctx.clearRect(0, 0, phW, phH);

  const [r, g, b, a] = color;
  const rr = Math.round(r * 255);
  const gg = Math.round(g * 255);
  const bb = Math.round(b * 255);

  const minX = Math.min(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const w = Math.abs(end.x - start.x);
  const h = Math.abs(end.y - start.y);
  if (w < 1 && h < 1) return;

  ctx.save();
  const { scaleX, scaleY } = applyCanvasViewportTransform(
    ctx,
    viewport,
    { width: phW, height: phH },
    { width: docW, height: docH },
  );

  // Thin dashed line in document-pixel units
  const invScale = 1 / Math.min(scaleX, scaleY);
  ctx.lineWidth = invScale;
  ctx.setLineDash([4 * invScale, 4 * invScale]);
  ctx.fillStyle = `rgba(${rr},${gg},${bb},${(a * 0.2).toFixed(2)})`;
  ctx.strokeStyle = `rgba(${rr},${gg},${bb},${a.toFixed(2)})`;

  ctx.beginPath();
  if (shapeType === 'ellipse') {
    const cx = (start.x + end.x) / 2;
    const cy = (start.y + end.y) / 2;
    ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else {
    ctx.rect(minX, minY, w, h);
  }
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function renderVectorNodeOverlay(
  previewCanvas: HTMLCanvasElement,
  vectorData: VectorLayerData | undefined,
  docW: number,
  docH: number,
  viewport: ViewportState,
): void {
  const phW = previewCanvas.width;
  const phH = previewCanvas.height;
  const ctx = previewCanvas.getContext('2d');
  if (!ctx || phW === 0 || phH === 0) return;

  ctx.clearRect(0, 0, phW, phH);
  if (!vectorData || vectorData.paths.length === 0) return;

  ctx.save();
  const { scaleX, scaleY } = applyCanvasViewportTransform(
    ctx,
    viewport,
    { width: phW, height: phH },
    { width: docW, height: docH },
  );
  const invScale = 1 / Math.min(scaleX, scaleY);
  const selectedRefs = new Set(
    (vectorData.selectedNodeRefs ?? []).map(
      (ref) => `${ref.pathId}:${ref.segmentIndex}:${ref.pointIndex}`,
    ),
  );

  ctx.lineWidth = invScale;
  for (const path of vectorData.paths) {
    ctx.strokeStyle =
      path.id === vectorData.selectedPathId
        ? 'rgba(10, 132, 255, 0.65)'
        : 'rgba(128, 128, 128, 0.45)';
    ctx.setLineDash([3 * invScale, 3 * invScale]);
    for (const edge of listVectorPathHandleEdges(path)) {
      ctx.beginPath();
      ctx.moveTo(edge.from.x, edge.from.y);
      ctx.lineTo(edge.to.x, edge.to.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    for (const node of listVectorPathNodes(path)) {
      const key = `${node.ref.pathId}:${node.ref.segmentIndex}:${node.ref.pointIndex}`;
      const selected = selectedRefs.has(key);
      const isAnchor = node.ref.role === 'anchor';
      const size = (selected ? (isAnchor ? 7 : 6) : isAnchor ? 5 : 4) * invScale;
      ctx.beginPath();
      if (isAnchor) {
        ctx.rect(node.x - size / 2, node.y - size / 2, size, size);
      } else {
        ctx.arc(node.x, node.y, size / 2, 0, Math.PI * 2);
      }
      ctx.strokeStyle = isAnchor ? 'rgba(10, 132, 255, 0.85)' : 'rgba(255, 159, 10, 0.9)';
      ctx.fillStyle = selected
        ? 'rgba(255, 255, 255, 0.95)'
        : isAnchor
          ? 'rgba(10, 132, 255, 0.85)'
          : 'rgba(255, 159, 10, 0.86)';
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** SVG overlay showing light position indicators when lighting is enabled. */
function LightOverlay() {
  const scenes = useSketchStore((s) => s.scenes);
  const activeSceneId = useSketchStore((s) => s.activeSceneId);
  const viewport = useSketchStore((s) => s.viewport);
  const canvas = useSketchStore((s) => s.canvas);

  const scene = activeSceneId ? scenes.find((s) => s.id === activeSceneId) : null;
  if (!scene?.lightingEnabled) return null;

  const lights: import('../types/scene').LightSceneObject[] = [];
  for (const sl of scene.layers) {
    for (const obj of sl.objects) {
      if (isLightObject(obj)) {
        lights.push(obj);
      }
    }
  }
  if (lights.length === 0) return null;

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
      style={{ overflow: 'visible' }}
    >
      {lights.map((obj) => {
        // Convert document coordinates to CSS screen coordinates
        const screen = documentToScreenPoint({ x: obj.x, y: obj.y }, viewport, {
          width: canvas.width,
          height: canvas.height,
        });
        const sr = obj.properties.radius * viewport.zoom;
        const direction = obj.properties.direction;
        const dirX = Math.cos(direction);
        const dirY = Math.sin(direction);
        if (obj.properties.lightType === 'directional') {
          const halfLength = 36;
          return (
            <g key={obj.id}>
              <line
                x1={screen.x - dirX * halfLength}
                y1={screen.y - dirY * halfLength}
                x2={screen.x + dirX * halfLength}
                y2={screen.y + dirY * halfLength}
                stroke="rgba(255,200,50,0.75)"
                strokeWidth={2}
              />
              <circle cx={screen.x} cy={screen.y} r={5} fill="rgba(255,255,200,1)" />
            </g>
          );
        }

        const coneLeft = direction - obj.properties.coneAngle * 0.5;
        const coneRight = direction + obj.properties.coneAngle * 0.5;
        return (
          <g key={obj.id}>
            <circle
              cx={screen.x}
              cy={screen.y}
              r={sr}
              fill="none"
              stroke="rgba(255,200,50,0.25)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            {obj.properties.lightType === 'spot' && (
              <>
                <line
                  x1={screen.x}
                  y1={screen.y}
                  x2={screen.x + Math.cos(coneLeft) * sr}
                  y2={screen.y + Math.sin(coneLeft) * sr}
                  stroke="rgba(255,200,50,0.45)"
                  strokeWidth={1}
                />
                <line
                  x1={screen.x}
                  y1={screen.y}
                  x2={screen.x + Math.cos(coneRight) * sr}
                  y2={screen.y + Math.sin(coneRight) * sr}
                  stroke="rgba(255,200,50,0.45)"
                  strokeWidth={1}
                />
              </>
            )}
            <circle cx={screen.x} cy={screen.y} r={6} fill="rgba(255,200,50,0.8)" />
            <circle cx={screen.x} cy={screen.y} r={3} fill="rgba(255,255,200,1)" />
          </g>
        );
      })}
    </svg>
  );
}

export function SketchCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onionCanvasRef = useRef<HTMLCanvasElement>(null);
  const vectorPreviewCanvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<SketchRenderer | null>(null);
  const brushRef = useRef<BrushEngine | null>(null);
  const rafRef = useRef<number>(0);
  const needsRenderRef = useRef(true);
  const lastTimeRef = useRef(performance.now());

  // Pixel tool state
  const pixelDataRef = useRef<ImageData | null>(null);
  const pixelBeforeDataRef = useRef<Uint8Array | null>(null);
  const lastPixelPosRef = useRef<{ x: number; y: number } | null>(null);

  // Clone stamp state
  const cloneSourcePointRef = useRef<{ x: number; y: number } | null>(null);
  const cloneImageDataRef = useRef<ImageData | null>(null);
  const cloneSourcePixelsRef = useRef<Uint8ClampedArray | null>(null);
  const cloneBeforeDataRef = useRef<Uint8Array | null>(null);
  const cloneLastPosRef = useRef<{ x: number; y: number } | null>(null);
  const cloneOffsetRef = useRef<{ x: number; y: number } | null>(null);

  // Texture stamp asset textures are renderer-local and never stored in Zustand.
  const stampTextureCacheRef = useRef<Map<string, WebGLTexture>>(new Map());
  const activeStampTextureRef = useRef<WebGLTexture | null>(null);

  // Vector tool state
  const vectorStartRef = useRef<{ x: number; y: number } | null>(null);
  const vectorNodeDragRef = useRef<VectorNodeDragState | null>(null);
  const vectorBoxSelectRef = useRef<VectorBoxSelectState | null>(null);
  const vectorTextureSignatureRef = useRef<Map<string, string>>(new Map());

  // Move tool state — tracks starting screen position for pan delta
  const moveStartRef = useRef<{ x: number; y: number } | null>(null);
  const moveHistoryBeforeRef = useRef<HistoryStateSnapshot | null>(null);

  // Light drag state — when dragging a light object in move mode
  const lightDragRef = useRef<{
    sceneId: string;
    layerId: string;
    objectId: string;
    startX: number;
    startY: number;
  } | null>(null);

  // Select-rect tool state — tracks starting canvas position
  const selectStartRef = useRef<{ x: number; y: number } | null>(null);
  // Lasso selection: accumulates path points during drag
  const lassoPointsRef = useRef<{ x: number; y: number }[]>([]);
  // Free transform state
  const [transformState, setTransformState] = useState<TransformState | null>(null);
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);

  // Guides state (ruler guide lines)
  const [guides, setGuides] = useState<Guide[]>([]);
  const guideIdCounter = useRef(0);
  const addGuide = useCallback((axis: 'horizontal' | 'vertical', position: number) => {
    const id = `guide-${++guideIdCounter.current}`;
    setGuides((prev) => [...prev, { id, axis, position }]);
  }, []);
  const moveGuide = useCallback((id: string, position: number) => {
    setGuides((prev) => prev.map((g) => (g.id === id ? { ...g, position } : g)));
  }, []);
  const removeGuide = useCallback((id: string) => {
    setGuides((prev) => prev.filter((g) => g.id !== id));
  }, []);

  // Reference images state (floating overlays)
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const updateReferenceImage = useCallback((id: string, updates: Partial<ReferenceImage>) => {
    setReferenceImages((prev) => prev.map((img) => (img.id === id ? { ...img, ...updates } : img)));
  }, []);
  const removeReferenceImage = useCallback((id: string) => {
    setReferenceImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  // Alt key state for zoom tool (Alt+click = zoom out)
  const altHeldRef = useRef(false);

  // Brush stroke scratch texture (created in onStrokeStart, merged in onStrokeEnd)
  const strokeTexRef = useRef<WebGLTexture | null>(null);
  const strokeFboRef = useRef<WebGLFramebuffer | null>(null);

  // Frame mode: track previous frame index to detect switches
  const prevFrameIndexRef = useRef(-1);
  // Ref so the render loop / stroke handlers can read playing state without deps
  const isFramePlayingRef = useRef(false);

  // ── Store subscriptions ──
  const canvas = useSketchStore((s) => s.canvas);
  const viewport = useSketchStore((s) => s.viewport);
  const layers = useSketchStore((s) => s.layers);
  const brushSettings = useSketchStore((s) => s.brushSettings);
  const textureStampAssets = useSketchStore((s) => s.textureStampAssets);
  const activeTool = useSketchStore((s) => s.activeTool);
  const activeLayerId = useSketchStore((s) => s.activeLayerId);
  const pendingLayerMergeDownRequest = useSketchStore((s) => s.pendingLayerMergeDownRequest);
  const clearLayerMergeDownRequest = useSketchStore((s) => s.clearLayerMergeDownRequest);
  const markDirty = useSketchStore((s) => s.markDirty);
  const setHistoryRegionApplier = useSketchStore((s) => s.setHistoryRegionApplier);

  // Tool actions
  const setBrushColor = useSketchStore((s) => s.setBrushColor);
  const selectRect = useSketchStore((s) => s.selectRect);
  const panBy = useSketchStore((s) => s.panBy);

  // P1: filters and particles
  const filters = useSketchStore((s) => s.filters);
  const emitters = useSketchStore((s) => s.emitters);
  const isParticlePreviewActive = useSketchStore((s) => s.isParticlePreviewActive);

  // S.3: scene atmosphere effects
  const scenes = useSketchStore((s) => s.scenes);
  const activeSceneId = useSketchStore((s) => s.activeSceneId);

  // P0: frame mode
  const selectedFrameLayerId = useSketchStore((s) => s.selectedFrameLayerId);
  const currentFrameIndex = useSketchStore((s) => s.currentFrameIndex);
  const onionSkin = useSketchStore((s) => s.onionSkin);
  const isFramePlaying = useSketchStore((s) => s.isFramePlaying);

  // Keep isFramePlayingRef in sync without adding it as render-loop dep
  useEffect(() => {
    isFramePlayingRef.current = isFramePlaying;
  }, [isFramePlaying]);

  const applyTextDraft = useCallback(
    (draft: TextDraft) => {
      const renderer = rendererRef.current;
      if (!renderer || !activeLayerId || !draft.text.trim()) {
        setTextDraft(null);
        return;
      }

      const layer = useSketchStore.getState().layers.find((l) => l.id === activeLayerId);
      if (!layer) {
        setTextDraft(null);
        return;
      }

      const w = canvas.width;
      const h = canvas.height;
      const imageData = layer.texture
        ? readTextureToImageData(renderer, layer.texture, w, h)
        : new ImageData(w, h);
      const beforePixels = new Uint8Array(imageData.data);
      const textPixels = renderTextToImageData(
        {
          ...DEFAULT_TEXT_DATA,
          text: draft.text,
          fontFamily: draft.fontFamily,
          fontSize: draft.fontSize,
          color: draft.color,
          bold: draft.bold,
          italic: draft.italic,
        },
        w,
        h,
        draft.docX,
        draft.docY,
      );

      compositeImageDataOver(imageData.data, textPixels.data);
      const snapshot = buildRegionSnapshotPair(activeLayerId, beforePixels, imageData.data, w, h);
      if (!snapshot) {
        setTextDraft(null);
        return;
      }

      const texture = layer.texture ?? renderer.textures.createTexture(w, h);
      uploadImageDataToTexture(renderer, texture, imageData);
      const state = useSketchStore.getState();
      state.setLayers(state.layers.map((l) => (l.id === activeLayerId ? { ...l, texture } : l)));

      if (state.selectedFrameLayerId && !isFramePlayingRef.current) {
        state.updateFrameImageData(state.selectedFrameLayerId, state.currentFrameIndex, imageData);
      }

      pushRegionHistory('stroke', 'Text', snapshot);
      notifyDocumentEdited('Text');
      markDirty();
      needsRenderRef.current = true;
      setTextDraft(null);
    },
    [activeLayerId, canvas.height, canvas.width, markDirty],
  );

  const mergeLayerDown = useCallback(
    (layerId: string): boolean => {
      const renderer = rendererRef.current;
      if (!renderer) {
        return false;
      }

      const state = useSketchStore.getState();
      const layerIndex = state.layers.findIndex((layer) => layer.id === layerId);
      const layer = layerIndex >= 0 ? state.layers[layerIndex] : undefined;
      const belowLayer = layerIndex > 0 ? state.layers[layerIndex - 1] : undefined;
      if (!layer || !belowLayer || !canMergeLayerPixels(layer, belowLayer)) {
        return false;
      }

      const before = captureLayerStateSnapshot();
      const baseImage = readLayerTextureToImageData(
        renderer,
        belowLayer,
        canvas.width,
        canvas.height,
      );
      const blendImage = readLayerTextureToImageData(renderer, layer, canvas.width, canvas.height);
      const merged = mergeLayerPixelsDown({
        base: {
          imageData: baseImage,
          offsetX: belowLayer.offsetX,
          offsetY: belowLayer.offsetY,
        },
        blend: {
          imageData: blendImage,
          offsetX: layer.offsetX,
          offsetY: layer.offsetY,
        },
        blendMode: layer.blendMode,
        opacity: layer.opacity,
      });
      const mergedTexture = renderer.textures.createTexture(
        merged.imageData.width,
        merged.imageData.height,
        new Uint8Array(merged.imageData.data),
      );
      const mergedLayer: LayerData = {
        ...belowLayer,
        width: merged.imageData.width,
        height: merged.imageData.height,
        offsetX: merged.offsetX,
        offsetY: merged.offsetY,
        texture: mergedTexture,
        pendingData: undefined,
        normalTexture: null,
        pendingNormalData: undefined,
      };
      const nextLayers = state.layers
        .map((currentLayer, index) => (index === layerIndex - 1 ? mergedLayer : currentLayer))
        .filter((_, index) => index !== layerIndex);

      state.setLayers(nextLayers);
      state.setActiveLayer(mergedLayer.id);
      const after = captureLayerStateSnapshot();
      pushStateHistory('layer-merge', 'Merge Down', before, after);
      notifyDocumentEdited('Merge Down', 'sketch.layer.merge');
      markDirty();
      needsRenderRef.current = true;
      return true;
    },
    [canvas.height, canvas.width, markDirty],
  );

  useEffect(() => {
    if (!pendingLayerMergeDownRequest) {
      return;
    }

    mergeLayerDown(pendingLayerMergeDownRequest.layerId);
    clearLayerMergeDownRequest(pendingLayerMergeDownRequest.id);
  }, [clearLayerMergeDownRequest, mergeLayerDown, pendingLayerMergeDownRequest]);

  // Initialize renderer
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const renderer = new SketchRenderer();
    renderer.init(el, canvas.width, canvas.height);
    rendererRef.current = renderer;
    brushRef.current = new BrushEngine(renderer.pipeline);
    needsRenderRef.current = true;
    return () => {
      stampTextureCacheRef.current.clear();
      activeStampTextureRef.current = null;
      renderer.dispose();
      rendererRef.current = null;
      brushRef.current = null;
    };
  }, [canvas.width, canvas.height]);

  useEffect(() => {
    const renderer = rendererRef.current;
    const activeAssetId = brushSettings.stampAssetId ?? null;
    if (!renderer) {
      activeStampTextureRef.current = null;
      return;
    }

    const liveAssetIds = new Set(textureStampAssets.map((asset) => asset.id));
    for (const [assetId, texture] of stampTextureCacheRef.current) {
      if (!liveAssetIds.has(assetId)) {
        renderer.textures.deleteTexture(texture);
        stampTextureCacheRef.current.delete(assetId);
      }
    }

    if (!activeAssetId) {
      activeStampTextureRef.current = null;
      return;
    }

    const cached = stampTextureCacheRef.current.get(activeAssetId);
    if (cached) {
      activeStampTextureRef.current = cached;
      return;
    }

    const asset = textureStampAssets.find((item) => item.id === activeAssetId);
    if (!asset) {
      activeStampTextureRef.current = null;
      return;
    }

    let cancelled = false;
    void decodeTextureStampAssetPixels(asset)
      .then((decoded) => {
        if (cancelled) {
          return;
        }
        const texture = renderer.textures.createTexture(
          decoded.width,
          decoded.height,
          decoded.data,
        );
        stampTextureCacheRef.current.set(asset.id, texture);
        if ((useSketchStore.getState().brushSettings.stampAssetId ?? null) === asset.id) {
          activeStampTextureRef.current = texture;
        }
      })
      .catch(() => {
        if (!cancelled) {
          activeStampTextureRef.current = null;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [brushSettings.stampAssetId, canvas.height, canvas.width, textureStampAssets]);

  useEffect(() => {
    setHistoryRegionApplier((snapshot: RegionSnapshot) => {
      const renderer = rendererRef.current;
      if (!renderer) {
        return false;
      }

      const state = useSketchStore.getState();
      const layer = state.layers.find((item) => item.id === snapshot.layerId);
      if (!layer) {
        return false;
      }

      const texture =
        layer.texture ??
        renderer.textures.createTexture(layer.width || canvas.width, layer.height || canvas.height);
      renderer.textures.updateTexture(
        texture,
        snapshot.x,
        snapshot.y,
        snapshot.width,
        snapshot.height,
        snapshot.data,
      );
      if (!layer.texture) {
        state.setLayers(
          state.layers.map((item) => (item.id === layer.id ? { ...item, texture } : item)),
        );
      }
      needsRenderRef.current = true;
      return true;
    });

    return () => setHistoryRegionApplier(null);
  }, [canvas.height, canvas.width, setHistoryRegionApplier]);

  // Initialize layer textures — restore pending data from .nks and create fill layer textures
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    let changed = false;
    const updated = layers.map((layer) => {
      // Skip layers that already have a texture
      if (layer.texture) return layer;

      // Restore saved pixel data (base64 PNG from .nks file)
      if (layer.pendingData) {
        const img = new Image();
        img.src = `data:image/png;base64,${layer.pendingData}`;
        // Synchronous decode via canvas is not possible; schedule async restore
        const layerId = layer.id;
        void img.decode().then(() => {
          const offscreen = document.createElement('canvas');
          offscreen.width = layer.width;
          offscreen.height = layer.height;
          const ctx = offscreen.getContext('2d');
          if (!ctx) return;
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, layer.width, layer.height);
          const r = rendererRef.current;
          if (!r) return;
          const tex = r.textures.createTexture(
            layer.width,
            layer.height,
            new Uint8Array(imageData.data.buffer),
          );
          const state = useSketchStore.getState();
          state.setLayers(
            state.layers.map((l) =>
              l.id === layerId ? { ...l, texture: tex, pendingData: undefined } : l,
            ),
          );
          needsRenderRef.current = true;
        });
        // Clear pendingData immediately to avoid re-triggering
        changed = true;
        return { ...layer, pendingData: undefined };
      }

      // Restore saved normal map data (base64 PNG from .nks file)
      if (layer.pendingNormalData && !layer.normalTexture) {
        const normalImg = new Image();
        normalImg.src = `data:image/png;base64,${layer.pendingNormalData}`;
        const layerId = layer.id;
        void normalImg.decode().then(() => {
          const offscreen = document.createElement('canvas');
          offscreen.width = layer.width;
          offscreen.height = layer.height;
          const ctx = offscreen.getContext('2d');
          if (!ctx) return;
          ctx.drawImage(normalImg, 0, 0);
          const imageData = ctx.getImageData(0, 0, layer.width, layer.height);
          const r = rendererRef.current;
          if (!r) return;
          const normalTex = r.textures.createTexture(
            layer.width,
            layer.height,
            new Uint8Array(imageData.data.buffer),
          );
          const state = useSketchStore.getState();
          state.setLayers(
            state.layers.map((l) =>
              l.id === layerId
                ? { ...l, normalTexture: normalTex, pendingNormalData: undefined }
                : l,
            ),
          );
          needsRenderRef.current = true;
        });
        changed = true;
        return { ...layer, pendingNormalData: undefined };
      }

      // Create solid-color texture for fill layers
      if (layer.type === 'fill') {
        const w = layer.width;
        const h = layer.height;
        const pixels = new Uint8Array(w * h * 4);
        // Parse background color from canvas config
        const bgColor = canvas.backgroundColor ?? '#ffffff';
        const hex = bgColor.startsWith('#') ? bgColor.slice(1) : bgColor;
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        for (let i = 0; i < pixels.length; i += 4) {
          pixels[i] = r;
          pixels[i + 1] = g;
          pixels[i + 2] = b;
          pixels[i + 3] = 255;
        }
        const tex = renderer.textures.createTexture(w, h, pixels);
        changed = true;
        return { ...layer, texture: tex };
      }

      return layer;
    });

    if (changed) {
      useSketchStore.getState().setLayers(updated);
      needsRenderRef.current = true;
    }
  }, [layers, canvas.backgroundColor]);

  // Rebuild renderer-local vector textures after snapshot-based history replay.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    const vectorLayers = collectVectorLayers(layers);
    const liveVectorLayerIds = new Set(vectorLayers.map((layer) => layer.id));
    for (const layerId of Array.from(vectorTextureSignatureRef.current.keys())) {
      if (!liveVectorLayerIds.has(layerId)) {
        vectorTextureSignatureRef.current.delete(layerId);
      }
    }

    let changed = false;
    let updatedLayers = layers;
    for (const layer of vectorLayers) {
      const vectorData = layer.vectorData;
      if (!vectorData) {
        continue;
      }
      if (vectorData.paths.length === 0) {
        if (layer.texture) {
          updatedLayers = updateLayerById(updatedLayers, layer.id, (item) => ({
            ...item,
            width: canvas.width,
            height: canvas.height,
            texture: null,
          }));
          changed = true;
        }
        vectorTextureSignatureRef.current.delete(layer.id);
        continue;
      }

      const signature = getVectorTextureSignature(vectorData, canvas.width, canvas.height);
      if (layer.texture && vectorTextureSignatureRef.current.get(layer.id) === signature) {
        continue;
      }

      const texture = uploadVectorLayerTexture(
        renderer,
        layer,
        vectorData.paths,
        canvas.width,
        canvas.height,
      );
      if (!texture) {
        continue;
      }

      vectorTextureSignatureRef.current.set(layer.id, signature);
      updatedLayers = updateLayerById(updatedLayers, layer.id, (item) => ({
        ...item,
        width: canvas.width,
        height: canvas.height,
        texture,
      }));
      changed = true;
    }

    if (changed) {
      useSketchStore.getState().setLayers(updatedLayers);
      needsRenderRef.current = true;
    }
  }, [canvas.height, canvas.width, layers]);

  // Resize observer — keep WebGL + overlay canvases in sync with container
  useEffect(() => {
    const el = canvasRef.current;
    const onionEl = onionCanvasRef.current;
    const vectorEl = vectorPreviewCanvasRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(width * dpr);
      const h = Math.round(height * dpr);
      if (el.width !== w || el.height !== h) {
        // WebGLContext.resize expects CSS pixels and applies DPR internally.
        rendererRef.current?.resize(width, height);
        needsRenderRef.current = true;
      }
      // Keep overlay canvases at device pixel resolution
      if (onionEl) {
        onionEl.width = w;
        onionEl.height = h;
      }
      if (vectorEl) {
        vectorEl.width = w;
        vectorEl.height = h;
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Mark dirty when rendering-relevant state changes
  useEffect(() => {
    needsRenderRef.current = true;
  }, [
    layers,
    viewport,
    filters,
    emitters,
    isParticlePreviewActive,
    currentFrameIndex,
    onionSkin,
    scenes,
    activeSceneId,
  ]);

  useEffect(() => {
    const overlay = vectorPreviewCanvasRef.current;
    if (!overlay || activeTool !== 'vector') {
      if (activeTool !== 'shape' && activeTool !== 'select-rect' && activeTool !== 'select-lasso') {
        clearOverlayCanvas(overlay);
      }
      return;
    }

    const layer = activeLayerId ? findLayerById(layers, activeLayerId) : null;
    if (layer?.type !== 'vector') {
      clearOverlayCanvas(overlay);
      return;
    }

    renderVectorNodeOverlay(overlay, layer.vectorData, canvas.width, canvas.height, viewport);
  }, [activeLayerId, activeTool, canvas.height, canvas.width, layers, viewport]);

  // Continuous render loop — uses renderWithEffects for filter/particle support (P1)
  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      if (needsRenderRef.current) {
        const renderer = rendererRef.current;
        if (renderer) {
          const state = useSketchStore.getState();
          const now = performance.now();
          const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1);
          lastTimeRef.current = now;

          // Combine manual emitters with atmosphere effect from the active scene
          const activeScene = state.activeSceneId
            ? state.scenes.find((s) => s.id === state.activeSceneId)
            : null;
          const atmosphereEmitter = activeScene
            ? atmosphereToEmitter(activeScene.atmosphere)
            : null;
          const emittersForRender = [
            ...(state.isParticlePreviewActive ? state.emitters : []),
            ...(atmosphereEmitter ? [atmosphereEmitter] : []),
          ];

          // Inject active stroke texture as a temporary overlay for real-time preview
          let layersToRender: ReadonlyArray<LayerData> = state.layers;
          if (strokeTexRef.current && state.activeLayerId) {
            const strokeLayer: LayerData = {
              id: '__stroke_preview',
              name: '',
              type: 'raster',
              width: state.canvas.width,
              height: state.canvas.height,
              visible: true,
              locked: false,
              opacity: state.brushSettings.opacity,
              blendMode: 'normal',
              offsetX: 0,
              offsetY: 0,
              clippingMask: false,
              maskLayerId: null,
              children: [],
              texture: strokeTexRef.current,
              alphaLock: false,
            };
            // Insert stroke layer right after the active layer
            const mutable = [...state.layers];
            const idx = mutable.findIndex((l) => l.id === state.activeLayerId);
            if (idx >= 0) {
              mutable.splice(idx + 1, 0, strokeLayer);
            } else {
              mutable.push(strokeLayer);
            }
            layersToRender = mutable;
          }

          // Compute per-layer parallax transforms when a scene is active
          let layerTransforms: Map<string, Float32Array> | undefined;
          if (activeScene) {
            const views = computeParallaxOffsets(activeScene.layers, activeScene.camera);
            const el = canvasRef.current;
            if (el) {
              const cssW = el.clientWidth;
              const cssH = el.clientHeight;
              layerTransforms = new Map();
              for (const view of views) {
                const sl = activeScene.layers.find((l) => l.id === view.layerId);
                if (sl?.canvasLayerId) {
                  layerTransforms.set(
                    sl.canvasLayerId,
                    buildParallaxTransform(view, activeScene.camera, cssW, cssH),
                  );
                }
              }
            }
          }

          // Apply layer offsetX/offsetY as transforms for the move tool
          for (const lr of layersToRender) {
            const ox = lr.offsetX ?? 0;
            const oy = lr.offsetY ?? 0;
            if ((ox !== 0 || oy !== 0) && !layerTransforms?.has(lr.id)) {
              if (!layerTransforms) layerTransforms = new Map();
              // Convert document-pixel offset to NDC-space translation
              const tx = (ox / state.canvas.width) * 2;
              const ty = -(oy / state.canvas.height) * 2;
              layerTransforms.set(lr.id, new Float32Array([1, 0, 0, 0, 1, 0, tx, ty, 1]));
            }
          }

          // Gather lighting configuration from active scene
          let lightingConfig: LightingConfig | undefined;
          if (activeScene?.lightingEnabled) {
            const lights: LightSceneObject[] = [];
            for (const sl of activeScene.layers) {
              for (const obj of sl.objects) {
                if (isLightObject(obj)) lights.push(obj);
              }
            }
            // Find first available normal map texture from visible layers
            let normalMapTex: WebGLTexture | null = null;
            for (const lr of layersToRender) {
              if (lr.visible && lr.normalTexture) {
                normalMapTex = lr.normalTexture;
                break;
              }
            }
            lightingConfig = {
              enabled: true,
              lights,
              ambient: activeScene.ambientLight,
              normalMapTex,
            };
          }

          renderer.renderWithEffects(
            layersToRender,
            state.viewport,
            state.filters,
            emittersForRender,
            emittersForRender.length > 0,
            dt,
            layerTransforms,
            lightingConfig,
          );

          // Onion skin overlay (P0)
          const onionEl = onionCanvasRef.current;
          if (onionEl) {
            if (state.onionSkin.enabled && state.selectedFrameLayerId) {
              const frameLayer = state.frameLayers.find((l) => l.id === state.selectedFrameLayerId);
              if (frameLayer) {
                const ghosts = computeOnionSkinGhosts(
                  frameLayer,
                  state.currentFrameIndex,
                  state.onionSkin,
                );
                renderOnionSkinOverlay(
                  onionEl,
                  ghosts,
                  state.canvas.width,
                  state.canvas.height,
                  state.viewport,
                );
              } else {
                clearOverlayCanvas(onionEl);
              }
            } else {
              clearOverlayCanvas(onionEl);
            }
          }

          needsRenderRef.current = false;
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── Frame save/restore on frame index change (P0) ──
  useEffect(() => {
    if (!selectedFrameLayerId) {
      prevFrameIndexRef.current = -1;
      return;
    }

    const renderer = rendererRef.current;
    if (!renderer) return;

    const prevIdx = prevFrameIndexRef.current;
    const state = useSketchStore.getState();

    // Save the outgoing frame only when the user manually switches (not during playback)
    if (prevIdx >= 0 && prevIdx !== currentFrameIndex && !isFramePlayingRef.current) {
      const activeLayer = state.layers.find((l) => l.id === state.activeLayerId);
      if (activeLayer?.texture) {
        const imgData = readTextureToImageData(
          renderer,
          activeLayer.texture,
          state.canvas.width,
          state.canvas.height,
        );
        state.updateFrameImageData(selectedFrameLayerId, prevIdx, imgData);
      }
    }

    prevFrameIndexRef.current = currentFrameIndex;

    // Load the incoming frame's pixels into the active layer texture
    const frameLayer = state.frameLayers.find((l) => l.id === selectedFrameLayerId);
    const newFrame = frameLayer?.frames.find((f) => f.index === currentFrameIndex);
    const activeLayer = state.layers.find((l) => l.id === state.activeLayerId);

    if (activeLayer?.texture) {
      if (newFrame?.imageData) {
        uploadImageDataToTexture(renderer, activeLayer.texture, newFrame.imageData);
      } else {
        // Clear texture for blank frames
        const empty = new Uint8Array(state.canvas.width * state.canvas.height * 4);
        renderer.textures.updateTexture(
          activeLayer.texture,
          0,
          0,
          state.canvas.width,
          state.canvas.height,
          empty,
        );
      }
    }

    needsRenderRef.current = true;
  }, [currentFrameIndex, selectedFrameLayerId]);

  // Determine which tools accept pointer input
  const isPointerTool =
    activeTool === 'brush' ||
    activeTool === 'eraser' ||
    activeTool === 'pixel' ||
    activeTool === 'shape' ||
    activeTool === 'vector' ||
    activeTool === 'eyedropper' ||
    activeTool === 'fill' ||
    activeTool === 'move' ||
    activeTool === 'zoom' ||
    activeTool === 'transform' ||
    activeTool === 'select-rect' ||
    activeTool === 'select-lasso' ||
    activeTool === 'select-wand';

  const onStrokeStart = useCallback(
    (point: StrokePoint) => {
      if (!activeLayerId || spaceHeldRef.current) return;
      const renderer = rendererRef.current;
      if (!renderer) return;

      if (activeTool === 'pixel') {
        const layer = useSketchStore.getState().layers.find((l) => l.id === activeLayerId);
        if (!layer) return;

        const w = canvas.width;
        const h = canvas.height;
        const imageData = layer.texture
          ? readTextureToImageData(renderer, layer.texture, w, h)
          : new ImageData(w, h);

        pixelBeforeDataRef.current = new Uint8Array(imageData.data);
        pixelDataRef.current = imageData;
        const { x: px, y: py } = screenToCanvas(
          point.x,
          point.y,
          viewport,
          canvas.width,
          canvas.height,
        );
        const ix = Math.floor(px);
        const iy = Math.floor(py);
        drawPixel(
          imageData,
          ix,
          iy,
          hexToRGBA(brushSettings.color),
          toPixelBrushSize(brushSettings.size),
        );
        lastPixelPosRef.current = { x: ix, y: iy };
        needsRenderRef.current = true;
        return;
      }

      if (activeTool === 'eyedropper') {
        // Read pixel color from the WebGL canvas at the pointer position
        const el = canvasRef.current;
        if (!el) return;
        const dpr = window.devicePixelRatio || 1;
        const readX = Math.floor(point.x * dpr);
        const readY = Math.floor((el.clientHeight - point.y) * dpr); // GL y-flip
        const gl = el.getContext('webgl2');
        if (!gl) return;
        const pixel = new Uint8Array(4);
        gl.readPixels(readX, readY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        const hex = `#${(pixel[0] ?? 0).toString(16).padStart(2, '0')}${(pixel[1] ?? 0).toString(16).padStart(2, '0')}${(pixel[2] ?? 0).toString(16).padStart(2, '0')}`;
        setBrushColor(hex);
        // Switch back to brush after picking
        useSketchStore.getState().setActiveTool('brush');
        return;
      }

      if (activeTool === 'fill') {
        // Flood fill at click position with current brush color
        const layer = useSketchStore.getState().layers.find((l) => l.id === activeLayerId);
        if (!layer) return;
        const w = canvas.width;
        const h = canvas.height;
        const imageData = layer.texture
          ? readTextureToImageData(renderer, layer.texture, w, h)
          : new ImageData(w, h);
        const beforePixels = new Uint8Array(imageData.data);

        const { x: fx, y: fy } = screenToCanvas(
          point.x,
          point.y,
          viewport,
          canvas.width,
          canvas.height,
        );
        const fillSettings = useSketchStore.getState().fillSettings;
        if (fillSettings.pattern === 'solid') {
          floodFill(imageData, Math.floor(fx), Math.floor(fy), hexToRGBA(brushSettings.color));
        } else {
          patternFill(
            imageData,
            Math.floor(fx),
            Math.floor(fy),
            hexToRGBA(brushSettings.color),
            fillSettings.pattern,
            fillSettings.patternSize,
          );
        }
        const snapshot = buildRegionSnapshotPair(activeLayerId, beforePixels, imageData.data, w, h);
        if (!snapshot) return;

        const texture = layer.texture ?? renderer.textures.createTexture(w, h);
        uploadImageDataToTexture(renderer, texture, imageData);
        const state = useSketchStore.getState();
        state.setLayers(state.layers.map((l) => (l.id === activeLayerId ? { ...l, texture } : l)));
        pushRegionHistory('fill', 'Flood fill', snapshot);
        notifyDocumentEdited('Flood fill');
        markDirty();
        needsRenderRef.current = true;
        return;
      }

      if (activeTool === 'transform') {
        const { x: dx, y: dy } = screenToCanvas(
          point.x,
          point.y,
          viewport,
          canvas.width,
          canvas.height,
        );

        // If transform is already active, check handle hit
        if (transformState) {
          const handle = hitTestHandle(dx, dy, transformState.bounds, transformState.matrix);
          if (handle) {
            setTransformState({
              ...transformState,
              activeHandle: handle,
              dragStart: { x: dx, y: dy },
            });
            return;
          }
          // Click outside handles — confirm transform
          const layer = useSketchStore
            .getState()
            .layers.find((l) => l.id === transformState.layerId);
          if (layer?.texture && rendererRef.current) {
            const imgData = readTextureToImageData(
              rendererRef.current,
              layer.texture,
              canvas.width,
              canvas.height,
            );
            const transformed = applyTransformToPixels(
              imgData,
              transformState.matrix,
              canvas.width,
              canvas.height,
            );
            const snapshot = buildRegionSnapshotPair(
              layer.id,
              imgData.data,
              transformed.data,
              canvas.width,
              canvas.height,
            );
            uploadImageDataToTexture(rendererRef.current, layer.texture, transformed);
            pushRegionHistory('transform', 'Apply transform', snapshot);
            if (snapshot) {
              notifyDocumentEdited('Apply transform');
            }
            markDirty();
          }
          setTransformState(null);
          needsRenderRef.current = true;
          return;
        }

        // Start new transform on active layer
        if (activeLayerId) {
          setTransformState({
            layerId: activeLayerId,
            matrix: INITIAL_MATRIX,
            bounds: { x: 0, y: 0, width: canvas.width, height: canvas.height },
            activeHandle: null,
            dragStart: null,
          });
        }
        return;
      }

      if (activeTool === 'zoom') {
        // Click to zoom in, Alt+click to zoom out
        const state = useSketchStore.getState();
        const el = canvasRef.current;
        if (!el) return;
        const factor = altHeldRef.current ? 1 / 1.5 : 1.5;
        const newZoom = Math.max(0.1, Math.min(32, state.viewport.zoom * factor));
        const cursor = { x: point.x, y: point.y };
        const documentPoint = screenToDocumentPoint(cursor, state.viewport, state.canvas);
        const pan = getPanForDocumentPointAtScreenPoint(
          documentPoint,
          cursor,
          { zoom: newZoom, rotation: state.viewport.rotation },
          state.canvas,
        );
        useSketchStore.getState().setViewport({ zoom: newZoom, ...pan });
        needsRenderRef.current = true;
        return;
      }

      if (activeTool === 'move') {
        // Check if clicking on a light object first
        const { x: cx, y: cy } = screenToCanvas(
          point.x,
          point.y,
          viewport,
          canvas.width,
          canvas.height,
        );
        const state = useSketchStore.getState();
        const scene = state.activeSceneId
          ? state.scenes.find((s) => s.id === state.activeSceneId)
          : null;
        if (scene?.lightingEnabled) {
          for (const sl of scene.layers) {
            for (const obj of sl.objects) {
              if (isLightObject(obj)) {
                const dx = cx - obj.x;
                const dy = cy - obj.y;
                const hitRadius = Math.max(20, obj.properties.radius * 0.1);
                if (dx * dx + dy * dy < hitRadius * hitRadius) {
                  lightDragRef.current = {
                    sceneId: scene.id,
                    layerId: sl.id,
                    objectId: obj.id,
                    startX: point.x,
                    startY: point.y,
                  };
                  return;
                }
              }
            }
          }
        }
        // Start layer drag — tracks screen position for delta
        moveStartRef.current = { x: point.x, y: point.y };
        moveHistoryBeforeRef.current = activeLayerId ? captureLayerStateSnapshot() : null;
        return;
      }

      if (activeTool === 'select-rect') {
        // Start rectangular selection
        const { x, y } = screenToCanvas(point.x, point.y, viewport, canvas.width, canvas.height);
        selectStartRef.current = { x, y };
        return;
      }

      if (activeTool === 'select-lasso') {
        // Start lasso selection path
        const { x, y } = screenToCanvas(point.x, point.y, viewport, canvas.width, canvas.height);
        lassoPointsRef.current = [{ x, y }];
        return;
      }

      if (activeTool === 'select-wand') {
        // Magic wand: instant selection on click
        const layer = useSketchStore.getState().layers.find((l) => l.id === activeLayerId);
        if (!layer?.texture || !renderer) return;
        const { x, y } = screenToCanvas(point.x, point.y, viewport, canvas.width, canvas.height);
        const fbo = renderer.textures.createFramebuffer(layer.texture);
        const pixels = renderer.textures.readPixels(fbo, 0, 0, canvas.width, canvas.height);
        renderer.textures.deleteFramebuffer(fbo);
        useSketchStore.getState().selectWand(pixels, x, y, 30, true);
        needsRenderRef.current = true;
        return;
      }

      if (activeTool === 'vector') {
        const { x, y } = screenToCanvas(point.x, point.y, viewport, canvas.width, canvas.height);
        const state = useSketchStore.getState();
        const layer = findLayerById(state.layers, activeLayerId);
        if (layer?.type !== 'vector' || !layer.vectorData) {
          return;
        }
        const currentVectorData = layer.vectorData;
        const additiveSelection = Boolean(point.shiftKey || point.metaKey || point.ctrlKey);

        for (const path of currentVectorData.paths) {
          const hit = hitTestVectorPathNode(path, { x, y }, Math.max(6 / viewport.zoom, 4));
          if (hit) {
            const before = captureLayerStateSnapshot();
            const currentSelection = currentVectorData.selectedNodeRefs ?? [];
            const wasSelected = hasVectorNodeRef(currentSelection, hit.ref);
            const selectedNodeRefs = additiveSelection
              ? toggleVectorNodeSelection(currentSelection, hit.ref)
              : wasSelected
                ? currentSelection
                : [hit.ref];
            const vectorData: VectorLayerData = {
              ...currentVectorData,
              selectedPathId: path.id,
              selectedNodeRefs,
            };
            state.setLayers(
              updateLayerById(state.layers, layer.id, (item) => ({ ...item, vectorData })),
            );
            if (selectedNodeRefs.length > 0 && (!additiveSelection || !wasSelected)) {
              vectorNodeDragRef.current = {
                layerId: layer.id,
                selectedNodeRefs,
                start: { x, y },
                startVectorData: vectorData,
                before,
                moved: false,
              };
            } else {
              vectorNodeDragRef.current = null;
            }
            needsRenderRef.current = true;
            return;
          }
        }

        vectorBoxSelectRef.current = {
          layerId: layer.id,
          start: { x, y },
          additive: additiveSelection,
        };
        needsRenderRef.current = true;
        return;
      }

      if (activeTool === 'shape') {
        const { x, y } = screenToCanvas(point.x, point.y, viewport, canvas.width, canvas.height);
        vectorStartRef.current = snapShapePointToPerspectiveGrid(
          { x, y },
          canvas.width,
          canvas.height,
        );
        return;
      }

      // Gradient: drag to define start→end, apply on release
      if (activeTool === 'gradient') {
        const { x, y } = screenToCanvas(point.x, point.y, viewport, canvas.width, canvas.height);
        selectStartRef.current = { x, y };
        return;
      }

      // Text: click to place text insertion point (opens text editor overlay)
      if (activeTool === 'text') {
        const { x, y } = screenToCanvas(point.x, point.y, viewport, canvas.width, canvas.height);
        setTextDraft({
          docX: x,
          docY: y,
          screenX: point.x,
          screenY: point.y,
          text: DEFAULT_TEXT_DATA.text,
          fontFamily: DEFAULT_TEXT_DATA.fontFamily,
          fontSize: DEFAULT_TEXT_DATA.fontSize,
          color: brushSettings.color,
          bold: DEFAULT_TEXT_DATA.bold,
          italic: DEFAULT_TEXT_DATA.italic,
        });
        return;
      }

      // Clone stamp: Alt+click sets source, normal click clones
      if (activeTool === 'clone') {
        const { x, y } = screenToCanvas(point.x, point.y, viewport, canvas.width, canvas.height);
        if (altHeldRef.current) {
          cloneSourcePointRef.current = { x, y };
          return;
        }

        const source = cloneSourcePointRef.current;
        if (!source) return;
        const layer = useSketchStore.getState().layers.find((l) => l.id === activeLayerId);
        if (!layer) return;

        const w = canvas.width;
        const h = canvas.height;
        const imageData = layer.texture
          ? readTextureToImageData(renderer, layer.texture, w, h)
          : new ImageData(w, h);
        cloneImageDataRef.current = imageData;
        cloneSourcePixelsRef.current = new Uint8ClampedArray(imageData.data);
        cloneBeforeDataRef.current = new Uint8Array(imageData.data);
        cloneLastPosRef.current = { x, y };
        cloneOffsetRef.current = { x: source.x - x, y: source.y - y };
        stampCloneSegment({
          targetData: imageData.data,
          sourceData: cloneSourcePixelsRef.current,
          width: w,
          height: h,
          from: { x, y },
          to: { x, y },
          offset: cloneOffsetRef.current,
          radius: Math.max(1, brushSettings.size / 2),
          hardness: brushSettings.hardness,
        });
        needsRenderRef.current = true;
        return;
      }

      // Default: brush / eraser — draw to scratch texture, merge on stroke end
      const { x, y } = screenToCanvas(point.x, point.y, viewport, canvas.width, canvas.height);
      const tex = renderer.textures.createTexture(canvas.width, canvas.height);
      const fbo = renderer.textures.createFramebuffer(tex);
      strokeTexRef.current = tex;
      strokeFboRef.current = fbo;
      const storeState = useSketchStore.getState();
      const activeLayer = storeState.layers.find((l) => l.id === activeLayerId);
      const symmetryConfig = storeState.symmetry;
      // Set symmetry axis to canvas center if not explicitly positioned
      const symWithDefaults =
        symmetryConfig.mode !== 'none'
          ? {
              ...symmetryConfig,
              axisX: symmetryConfig.axisX || canvas.width / 2,
              axisY: symmetryConfig.axisY || canvas.height / 2,
            }
          : symmetryConfig;
      brushRef.current?.beginStroke(
        { ...point, x, y },
        brushSettings,
        fbo,
        canvas.width,
        canvas.height,
        activeLayer?.alphaLock ?? false,
        symWithDefaults,
        brushSettings.type === 'stamp' ? activeStampTextureRef.current : null,
      );
      needsRenderRef.current = true;
    },
    [
      brushSettings,
      activeLayerId,
      activeTool,
      canvas.width,
      canvas.height,
      viewport,
      setBrushColor,
    ],
  );

  const onStrokeMove = useCallback(
    (point: StrokePoint) => {
      if (activeTool === 'pixel') {
        const imageData = pixelDataRef.current;
        const lastPos = lastPixelPosRef.current;
        if (!imageData || !lastPos) return;

        const { x: px, y: py } = screenToCanvas(
          point.x,
          point.y,
          viewport,
          canvas.width,
          canvas.height,
        );
        const ix = Math.floor(px);
        const iy = Math.floor(py);
        drawLine(
          imageData,
          lastPos.x,
          lastPos.y,
          ix,
          iy,
          hexToRGBA(brushSettings.color),
          toPixelBrushSize(brushSettings.size),
        );
        lastPixelPosRef.current = { x: ix, y: iy };
        needsRenderRef.current = true;
        return;
      }

      if (activeTool === 'clone') {
        const imageData = cloneImageDataRef.current;
        const sourceData = cloneSourcePixelsRef.current;
        const lastPos = cloneLastPosRef.current;
        const offset = cloneOffsetRef.current;
        if (!imageData || !sourceData || !lastPos || !offset) return;

        const { x, y } = screenToCanvas(point.x, point.y, viewport, canvas.width, canvas.height);
        stampCloneSegment({
          targetData: imageData.data,
          sourceData,
          width: canvas.width,
          height: canvas.height,
          from: lastPos,
          to: { x, y },
          offset,
          radius: Math.max(1, brushSettings.size / 2),
          hardness: brushSettings.hardness,
        });
        cloneLastPosRef.current = { x, y };
        needsRenderRef.current = true;
        return;
      }

      if (activeTool === 'vector') {
        const drag = vectorNodeDragRef.current;
        const renderer = rendererRef.current;
        const boxSelect = vectorBoxSelectRef.current;
        if (!drag) {
          if (!boxSelect) return;
          const previewEl = vectorPreviewCanvasRef.current;
          if (!previewEl) return;
          const { x, y } = screenToCanvas(point.x, point.y, viewport, canvas.width, canvas.height);
          renderSelectionPreview(
            previewEl,
            boxSelect.start,
            { x, y },
            canvas.width,
            canvas.height,
            viewport,
          );
          return;
        }
        if (!renderer) return;

        const { x, y } = screenToCanvas(point.x, point.y, viewport, canvas.width, canvas.height);
        const state = useSketchStore.getState();
        const layer = findLayerById(state.layers, drag.layerId);
        if (!layer?.vectorData) return;

        const updatedVectorData = moveVectorLayerNodes(
          {
            ...drag.startVectorData,
            selectedNodeRefs: drag.selectedNodeRefs,
            selectedPathId: drag.selectedNodeRefs[0]?.pathId ?? drag.startVectorData.selectedPathId,
          },
          drag.selectedNodeRefs,
          { dx: x - drag.start.x, dy: y - drag.start.y },
        );
        const texture = uploadVectorLayerTexture(
          renderer,
          layer,
          updatedVectorData.paths,
          canvas.width,
          canvas.height,
        );
        if (!texture) return;

        vectorTextureSignatureRef.current.set(
          drag.layerId,
          getVectorTextureSignature(updatedVectorData, canvas.width, canvas.height),
        );
        state.setLayers(
          updateLayerById(state.layers, drag.layerId, (item) => ({
            ...item,
            texture,
            vectorData: updatedVectorData,
          })),
        );
        vectorNodeDragRef.current = { ...drag, moved: true };
        markDirty();
        needsRenderRef.current = true;
        return;
      }

      if (activeTool === 'move') {
        // Light drag takes priority
        const ld = lightDragRef.current;
        if (ld) {
          const from = screenToCanvas(ld.startX, ld.startY, viewport, canvas.width, canvas.height);
          const to = screenToCanvas(point.x, point.y, viewport, canvas.width, canvas.height);
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          lightDragRef.current = { ...ld, startX: point.x, startY: point.y };
          const state = useSketchStore.getState();
          const sc = state.scenes.find((s) => s.id === ld.sceneId);
          const sl = sc?.layers.find((l) => l.id === ld.layerId);
          const obj = sl?.objects.find((o) => o.id === ld.objectId);
          if (obj) {
            state.updateSceneObject(ld.sceneId, ld.layerId, ld.objectId, {
              x: obj.x + dx,
              y: obj.y + dy,
            });
          }
          needsRenderRef.current = true;
          return;
        }

        // Move active layer by adjusting offsetX/offsetY
        const last = moveStartRef.current;
        if (!last) return;
        const from = screenToCanvas(last.x, last.y, viewport, canvas.width, canvas.height);
        const to = screenToCanvas(point.x, point.y, viewport, canvas.width, canvas.height);
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        moveStartRef.current = { x: point.x, y: point.y };
        if (activeLayerId) {
          const state = useSketchStore.getState();
          state.setLayers(
            state.layers.map((l) =>
              l.id === activeLayerId
                ? { ...l, offsetX: (l.offsetX ?? 0) + dx, offsetY: (l.offsetY ?? 0) + dy }
                : l,
            ),
          );
        }
        needsRenderRef.current = true;
        return;
      }

      if (activeTool === 'select-rect') {
        // Render selection preview rectangle
        const start = selectStartRef.current;
        const previewEl = vectorPreviewCanvasRef.current;
        if (!start || !previewEl) return;
        const { x: ex, y: ey } = screenToCanvas(
          point.x,
          point.y,
          viewport,
          canvas.width,
          canvas.height,
        );
        renderSelectionPreview(
          previewEl,
          start,
          { x: ex, y: ey },
          canvas.width,
          canvas.height,
          viewport,
        );
        return;
      }

      if (activeTool === 'select-lasso') {
        // Accumulate lasso path points and render preview
        const { x, y } = screenToCanvas(point.x, point.y, viewport, canvas.width, canvas.height);
        lassoPointsRef.current.push({ x, y });
        // Render lasso path preview on overlay canvas
        const previewEl = vectorPreviewCanvasRef.current;
        if (previewEl && lassoPointsRef.current.length > 1) {
          renderLassoPreview(
            previewEl,
            lassoPointsRef.current,
            canvas.width,
            canvas.height,
            viewport,
          );
        }
        return;
      }

      if (activeTool === 'transform' && transformState?.activeHandle && transformState.dragStart) {
        const { x: dx, y: dy } = screenToCanvas(
          point.x,
          point.y,
          viewport,
          canvas.width,
          canvas.height,
        );
        const deltaX = dx - transformState.dragStart.x;
        const deltaY = dy - transformState.dragStart.y;
        const newMatrix = applyHandleDrag(
          transformState.matrix,
          transformState.activeHandle,
          deltaX,
          deltaY,
          transformState.bounds,
        );
        setTransformState({ ...transformState, matrix: newMatrix, dragStart: { x: dx, y: dy } });
        needsRenderRef.current = true;
        return;
      }

      // Tools that do nothing on move (single-click or handled elsewhere)
      if (
        activeTool === 'zoom' ||
        activeTool === 'eyedropper' ||
        activeTool === 'fill' ||
        activeTool === 'transform' ||
        activeTool === 'select-wand' ||
        activeTool === 'text'
      ) {
        return;
      }

      if (activeTool === 'shape') {
        const start = vectorStartRef.current;
        const vectorEl = vectorPreviewCanvasRef.current;
        if (!start || !vectorEl) return;
        const { x: ex, y: ey } = screenToCanvas(
          point.x,
          point.y,
          viewport,
          canvas.width,
          canvas.height,
        );
        const end = snapShapePointToPerspectiveGrid({ x: ex, y: ey }, canvas.width, canvas.height);
        renderVectorPreview(
          vectorEl,
          start,
          end,
          useSketchStore.getState().activeShapeType,
          hexToRGBA(brushSettings.color),
          canvas.width,
          canvas.height,
          viewport,
        );
        return;
      }

      const { x: bx, y: by } = screenToCanvas(
        point.x,
        point.y,
        viewport,
        canvas.width,
        canvas.height,
      );
      brushRef.current?.addPoint({ ...point, x: bx, y: by });
      needsRenderRef.current = true;
    },
    [activeTool, brushSettings, viewport, panBy, activeLayerId, canvas.width, canvas.height],
  );

  const onStrokeEnd = useCallback(
    (point: StrokePoint) => {
      const renderer = rendererRef.current;

      if (activeTool === 'vector') {
        const drag = vectorNodeDragRef.current;
        if (!drag) {
          const boxSelect = vectorBoxSelectRef.current;
          if (!boxSelect) return;
          clearOverlayCanvas(vectorPreviewCanvasRef.current);
          vectorBoxSelectRef.current = null;

          const { x, y } = screenToCanvas(point.x, point.y, viewport, canvas.width, canvas.height);
          const state = useSketchStore.getState();
          const layer = findLayerById(state.layers, boxSelect.layerId);
          if (layer?.type !== 'vector' || !layer.vectorData) return;

          const width = x - boxSelect.start.x;
          const height = y - boxSelect.start.y;
          const minDrag = Math.max(2 / viewport.zoom, 1);
          const result =
            Math.abs(width) >= minDrag && Math.abs(height) >= minDrag
              ? selectVectorNodesInRect(
                  layer.vectorData,
                  {
                    x: boxSelect.start.x,
                    y: boxSelect.start.y,
                    width,
                    height,
                  },
                  { additive: boxSelect.additive },
                )
              : {
                  layerData: boxSelect.additive
                    ? layer.vectorData
                    : { ...layer.vectorData, selectedNodeRefs: [] },
                  changed:
                    !boxSelect.additive && (layer.vectorData.selectedNodeRefs ?? []).length > 0,
                };
          if (result.changed) {
            state.setLayers(
              updateLayerById(state.layers, layer.id, (item) => ({
                ...item,
                vectorData: result.layerData,
              })),
            );
          } else {
            const overlay = vectorPreviewCanvasRef.current;
            if (overlay) {
              renderVectorNodeOverlay(
                overlay,
                result.layerData,
                canvas.width,
                canvas.height,
                viewport,
              );
            }
          }
          needsRenderRef.current = true;
          return;
        }
        if (!drag.moved) {
          vectorNodeDragRef.current = null;
          needsRenderRef.current = true;
          return;
        }
        const after = captureLayerStateSnapshot();
        const label = drag.selectedNodeRefs.length > 1 ? 'Edit vector nodes' : 'Edit vector node';
        pushStateHistory('transform', label, drag.before, after);
        notifyDocumentEdited(label, 'sketch.vector.edit');
        vectorNodeDragRef.current = null;
        markDirty();
        needsRenderRef.current = true;
        return;
      }

      if (activeTool === 'pixel') {
        const imageData = pixelDataRef.current;
        if (!imageData || !renderer || !activeLayerId) return;
        const beforePixels = pixelBeforeDataRef.current;

        const layer = useSketchStore.getState().layers.find((l) => l.id === activeLayerId);
        if (!layer) return;
        const snapshot = beforePixels
          ? buildRegionSnapshotPair(
              activeLayerId,
              beforePixels,
              imageData.data,
              canvas.width,
              canvas.height,
            )
          : null;
        if (!snapshot) {
          pixelDataRef.current = null;
          pixelBeforeDataRef.current = null;
          lastPixelPosRef.current = null;
          return;
        }

        const texture =
          layer.texture ?? renderer.textures.createTexture(canvas.width, canvas.height);

        uploadImageDataToTexture(renderer, texture, imageData);

        const state = useSketchStore.getState();
        state.setLayers(state.layers.map((l) => (l.id === activeLayerId ? { ...l, texture } : l)));

        // Persist to current frame if in frame mode
        if (state.selectedFrameLayerId && !isFramePlayingRef.current) {
          state.updateFrameImageData(
            state.selectedFrameLayerId,
            state.currentFrameIndex,
            imageData,
          );
        }

        pushRegionHistory('stroke', 'Pixel stroke', snapshot);
        notifyDocumentEdited('Pixel stroke');
        pixelDataRef.current = null;
        pixelBeforeDataRef.current = null;
        lastPixelPosRef.current = null;
        markDirty();
        needsRenderRef.current = true;
        return;
      }

      if (activeTool === 'move') {
        // Finish light drag if active
        if (lightDragRef.current) {
          lightDragRef.current = null;
          markDirty();
          needsRenderRef.current = true;
          return;
        }
        // Finish layer move — apply final delta
        const last = moveStartRef.current;
        if (last && activeLayerId) {
          const from = screenToCanvas(last.x, last.y, viewport, canvas.width, canvas.height);
          const to = screenToCanvas(point.x, point.y, viewport, canvas.width, canvas.height);
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const state = useSketchStore.getState();
          state.setLayers(
            state.layers.map((l) =>
              l.id === activeLayerId
                ? { ...l, offsetX: (l.offsetX ?? 0) + dx, offsetY: (l.offsetY ?? 0) + dy }
                : l,
            ),
          );
          const before = moveHistoryBeforeRef.current;
          const after = captureLayerStateSnapshot();
          if (before && hasLayerOffsetChanged(before, after, activeLayerId)) {
            pushStateHistory('transform', 'Move layer', before, after);
            notifyDocumentEdited('Move layer', 'sketch.layer.move');
          }
          markDirty();
          needsRenderRef.current = true;
        }
        moveStartRef.current = null;
        moveHistoryBeforeRef.current = null;
        return;
      }

      if (activeTool === 'select-rect') {
        // Finish rectangular selection + clear preview overlay
        clearOverlayCanvas(vectorPreviewCanvasRef.current);
        const start = selectStartRef.current;
        if (!start) return;
        const { x: ex, y: ey } = screenToCanvas(
          point.x,
          point.y,
          viewport,
          canvas.width,
          canvas.height,
        );
        const x = Math.floor(Math.min(start.x, ex));
        const y = Math.floor(Math.min(start.y, ey));
        const w = Math.floor(Math.abs(ex - start.x));
        const h = Math.floor(Math.abs(ey - start.y));
        if (w > 0 && h > 0) {
          selectRect(x, y, w, h);
        }
        selectStartRef.current = null;
        return;
      }

      if (activeTool === 'select-lasso') {
        // Finish lasso selection + clear preview
        clearOverlayCanvas(vectorPreviewCanvasRef.current);
        const pts = lassoPointsRef.current;
        if (pts.length >= 3) {
          useSketchStore.getState().selectLasso(pts);
        }
        lassoPointsRef.current = [];
        return;
      }

      if (activeTool === 'transform' && transformState?.activeHandle) {
        // Release handle — stop dragging but keep transform active
        setTransformState({ ...transformState, activeHandle: null, dragStart: null });
        return;
      }

      if (activeTool === 'clone') {
        const imageData = cloneImageDataRef.current;
        const beforePixels = cloneBeforeDataRef.current;
        if (!imageData || !beforePixels || !renderer || !activeLayerId) {
          cloneImageDataRef.current = null;
          cloneSourcePixelsRef.current = null;
          cloneBeforeDataRef.current = null;
          cloneLastPosRef.current = null;
          cloneOffsetRef.current = null;
          return;
        }

        const layer = useSketchStore.getState().layers.find((l) => l.id === activeLayerId);
        if (!layer) {
          cloneImageDataRef.current = null;
          cloneSourcePixelsRef.current = null;
          cloneBeforeDataRef.current = null;
          cloneLastPosRef.current = null;
          cloneOffsetRef.current = null;
          return;
        }
        const snapshot = buildRegionSnapshotPair(
          activeLayerId,
          beforePixels,
          imageData.data,
          canvas.width,
          canvas.height,
        );
        if (!snapshot) {
          cloneImageDataRef.current = null;
          cloneSourcePixelsRef.current = null;
          cloneBeforeDataRef.current = null;
          cloneLastPosRef.current = null;
          cloneOffsetRef.current = null;
          return;
        }

        const texture =
          layer.texture ?? renderer.textures.createTexture(canvas.width, canvas.height);
        uploadImageDataToTexture(renderer, texture, imageData);
        const state = useSketchStore.getState();
        state.setLayers(state.layers.map((l) => (l.id === activeLayerId ? { ...l, texture } : l)));

        if (state.selectedFrameLayerId && !isFramePlayingRef.current) {
          state.updateFrameImageData(
            state.selectedFrameLayerId,
            state.currentFrameIndex,
            imageData,
          );
        }

        pushRegionHistory('stroke', 'Clone stamp', snapshot);
        notifyDocumentEdited('Clone stamp');
        cloneImageDataRef.current = null;
        cloneSourcePixelsRef.current = null;
        cloneBeforeDataRef.current = null;
        cloneLastPosRef.current = null;
        cloneOffsetRef.current = null;
        markDirty();
        needsRenderRef.current = true;
        return;
      }

      // Single-click or no-end-action tools
      if (
        activeTool === 'zoom' ||
        activeTool === 'eyedropper' ||
        activeTool === 'fill' ||
        activeTool === 'text'
      ) {
        return;
      }

      if (activeTool === 'gradient') {
        // Finish gradient drag — apply gradient to active layer
        const start = selectStartRef.current;
        if (!start || !renderer || !activeLayerId) return;
        const layer = useSketchStore.getState().layers.find((l) => l.id === activeLayerId);
        if (!layer) {
          selectStartRef.current = null;
          return;
        }

        const { x: endX, y: endY } = screenToCanvas(
          point.x,
          point.y,
          viewport,
          canvas.width,
          canvas.height,
        );
        const distance = Math.hypot(endX - start.x, endY - start.y);
        if (distance < 1) {
          selectStartRef.current = null;
          return;
        }

        const w = canvas.width;
        const h = canvas.height;
        const imageData = layer.texture
          ? readTextureToImageData(renderer, layer.texture, w, h)
          : new ImageData(w, h);
        const beforePixels = new Uint8Array(imageData.data);
        paintLinearGradient(imageData.data, {
          width: w,
          height: h,
          startX: start.x,
          startY: start.y,
          endX,
          endY,
          color: hexToRGBA(brushSettings.color),
        });
        const snapshot = buildRegionSnapshotPair(activeLayerId, beforePixels, imageData.data, w, h);
        if (!snapshot) {
          selectStartRef.current = null;
          return;
        }

        const texture = layer.texture ?? renderer.textures.createTexture(w, h);
        uploadImageDataToTexture(renderer, texture, imageData);
        const state = useSketchStore.getState();
        state.setLayers(state.layers.map((l) => (l.id === activeLayerId ? { ...l, texture } : l)));

        if (state.selectedFrameLayerId && !isFramePlayingRef.current) {
          state.updateFrameImageData(
            state.selectedFrameLayerId,
            state.currentFrameIndex,
            imageData,
          );
        }

        pushRegionHistory('fill', 'Linear gradient', snapshot);
        notifyDocumentEdited('Linear gradient');
        selectStartRef.current = null;
        markDirty();
        needsRenderRef.current = true;
        return;
      }

      if (activeTool === 'shape') {
        const start = vectorStartRef.current;
        if (!start || !renderer || !activeLayerId) return;

        const { x: endX, y: endY } = screenToCanvas(
          point.x,
          point.y,
          viewport,
          canvas.width,
          canvas.height,
        );
        const end = snapShapePointToPerspectiveGrid(
          { x: endX, y: endY },
          canvas.width,
          canvas.height,
        );

        const w = Math.abs(end.x - start.x);
        const h = Math.abs(end.y - start.y);

        if (w < 2 && h < 2) {
          vectorStartRef.current = null;
          return;
        }

        const color = hexToRGBA(brushSettings.color);
        const fill = {
          color: [color[0], color[1], color[2], color[3]] as [number, number, number, number],
          rule: 'nonzero' as const,
        };

        const storeState = useSketchStore.getState();
        const shapeType = storeState.activeShapeType;
        const paths = createShapePaths({
          start,
          end,
          shapeType,
          fill,
          polygonSides: storeState.polygonSides,
          starPoints: storeState.starPoints,
        });

        const layer = findLayerById(storeState.layers, activeLayerId);
        if (!layer) {
          vectorStartRef.current = null;
          return;
        }

        if (layer.type === 'vector') {
          const before = captureLayerStateSnapshot();
          const currentVectorData = layer.vectorData ?? createVectorLayerData();
          const updatedVectorData: VectorLayerData = {
            ...currentVectorData,
            paths: [...currentVectorData.paths, ...paths],
            selectedPathId: paths[0]?.id ?? currentVectorData.selectedPathId ?? null,
            selectedNodeRefs: [],
          };
          const texture = uploadVectorLayerTexture(
            renderer,
            layer,
            updatedVectorData.paths,
            canvas.width,
            canvas.height,
          );
          if (!texture) {
            vectorStartRef.current = null;
            return;
          }
          vectorTextureSignatureRef.current.set(
            layer.id,
            getVectorTextureSignature(updatedVectorData, canvas.width, canvas.height),
          );
          storeState.setLayers(
            updateLayerById(storeState.layers, activeLayerId, (item) => ({
              ...item,
              texture,
              vectorData: updatedVectorData,
            })),
          );
          const after = captureLayerStateSnapshot();
          vectorStartRef.current = null;
          clearOverlayCanvas(vectorPreviewCanvasRef.current);
          pushStateHistory('stroke', 'Draw vector shape', before, after);
          notifyDocumentEdited('Draw vector shape', 'sketch.vector.edit');
          markDirty();
          needsRenderRef.current = true;
          return;
        }

        const offscreen = new OffscreenCanvas(canvas.width, canvas.height);
        const ctx = offscreen.getContext('2d');
        if (!ctx) {
          vectorStartRef.current = null;
          return;
        }

        renderPaths(ctx as unknown as CanvasRenderingContext2D, paths);
        const shapeData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        const texture =
          layer.texture ?? renderer.textures.createTexture(canvas.width, canvas.height);

        const readFbo = renderer.textures.createFramebuffer(texture);
        const existing = renderer.textures.readPixels(readFbo, 0, 0, canvas.width, canvas.height);
        renderer.textures.deleteFramebuffer(readFbo);
        const beforePixels = new Uint8Array(existing);

        const src = shapeData.data;
        for (let i = 0; i < src.length; i += 4) {
          const sa = src[i + 3]! / 255;
          if (sa > 0) {
            existing[i] = Math.round(src[i]! * sa + existing[i]! * (1 - sa));
            existing[i + 1] = Math.round(src[i + 1]! * sa + existing[i + 1]! * (1 - sa));
            existing[i + 2] = Math.round(src[i + 2]! * sa + existing[i + 2]! * (1 - sa));
            existing[i + 3] = Math.round(Math.min(255, src[i + 3]! + existing[i + 3]! * (1 - sa)));
          }
        }

        const snapshot = buildRegionSnapshotPair(
          activeLayerId,
          beforePixels,
          existing,
          canvas.width,
          canvas.height,
        );
        renderer.textures.updateTexture(texture, 0, 0, canvas.width, canvas.height, existing);

        const state = useSketchStore.getState();
        state.setLayers(state.layers.map((l) => (l.id === activeLayerId ? { ...l, texture } : l)));

        // Persist to current frame if in frame mode
        if (state.selectedFrameLayerId && !isFramePlayingRef.current) {
          const savedData = readTextureToImageData(renderer, texture, canvas.width, canvas.height);
          state.updateFrameImageData(
            state.selectedFrameLayerId,
            state.currentFrameIndex,
            savedData,
          );
        }

        vectorStartRef.current = null;
        clearOverlayCanvas(vectorPreviewCanvasRef.current);
        pushRegionHistory('stroke', 'Draw shape', snapshot);
        if (snapshot) {
          notifyDocumentEdited('Draw shape');
        }
        markDirty();
        needsRenderRef.current = true;
        return;
      }

      // Default: brush / eraser — merge scratch texture into active layer
      const result = brushRef.current?.endStroke();
      if (result && renderer && activeLayerId && strokeTexRef.current && strokeFboRef.current) {
        const state = useSketchStore.getState();
        const layer = state.layers.find((l) => l.id === activeLayerId);
        if (layer) {
          const w = canvas.width;
          const h = canvas.height;

          // Get or create layer texture
          const layerTex = layer.texture ?? renderer.textures.createTexture(w, h);

          // Read stroke pixels from scratch FBO
          const strokePixels = renderer.textures.readPixels(strokeFboRef.current, 0, 0, w, h);

          // Read existing layer pixels
          const layerFbo = renderer.textures.createFramebuffer(layerTex);
          const layerPixels = renderer.textures.readPixels(layerFbo, 0, 0, w, h);
          renderer.textures.deleteFramebuffer(layerFbo);
          const beforePixels = new Uint8Array(layerPixels);

          // Alpha composite stroke over layer.
          // Stroke FBO pixels are in premultiplied alpha format (GPU blending
          // outputs rgb = color.rgb * alpha, a = alpha). Layer pixels are straight.
          const isEraser = activeTool === 'eraser';
          for (let i = 0; i < strokePixels.length; i += 4) {
            const sa = strokePixels[i + 3]! / 255;
            if (sa > 0) {
              if (isEraser) {
                // Eraser: reduce layer alpha
                layerPixels[i + 3] = Math.round(Math.max(0, layerPixels[i + 3]! * (1 - sa)));
              } else {
                // Premultiplied-over-straight composite:
                // Convert layer to premultiplied, blend, then convert back.
                const da = layerPixels[i + 3]! / 255;
                const outA = sa + da * (1 - sa);
                if (outA > 0) {
                  const invA = 1 / outA;
                  layerPixels[i] = Math.round(
                    Math.min(255, (strokePixels[i]! + layerPixels[i]! * da * (1 - sa)) * invA),
                  );
                  layerPixels[i + 1] = Math.round(
                    Math.min(
                      255,
                      (strokePixels[i + 1]! + layerPixels[i + 1]! * da * (1 - sa)) * invA,
                    ),
                  );
                  layerPixels[i + 2] = Math.round(
                    Math.min(
                      255,
                      (strokePixels[i + 2]! + layerPixels[i + 2]! * da * (1 - sa)) * invA,
                    ),
                  );
                }
                layerPixels[i + 3] = Math.round(Math.min(255, outA * 255));
              }
            }
          }

          const snapshot = buildRegionSnapshotPair(activeLayerId, beforePixels, layerPixels, w, h);
          renderer.textures.updateTexture(layerTex, 0, 0, w, h, layerPixels);
          state.setLayers(
            state.layers.map((l) => (l.id === activeLayerId ? { ...l, texture: layerTex } : l)),
          );

          // Persist to current frame if in frame mode
          if (state.selectedFrameLayerId && !isFramePlayingRef.current) {
            const imgData = readTextureToImageData(renderer, layerTex, w, h);
            state.updateFrameImageData(
              state.selectedFrameLayerId,
              state.currentFrameIndex,
              imgData,
            );
          }
          pushRegionHistory(
            'stroke',
            activeTool === 'eraser' ? 'Erase stroke' : 'Brush stroke',
            snapshot,
          );
          if (snapshot) {
            notifyDocumentEdited(activeTool === 'eraser' ? 'Erase stroke' : 'Brush stroke');
          }
        }

        // Cleanup scratch texture
        renderer.textures.deleteFramebuffer(strokeFboRef.current);
        renderer.textures.deleteTexture(strokeTexRef.current);
        strokeTexRef.current = null;
        strokeFboRef.current = null;

        markDirty();
        needsRenderRef.current = true;
      }
    },
    [
      activeTool,
      activeLayerId,
      markDirty,
      canvas.width,
      canvas.height,
      viewport,
      brushSettings,
      selectRect,
      panBy,
    ],
  );

  usePointerInput(canvasRef, { onStrokeStart, onStrokeMove, onStrokeEnd }, isPointerTool);

  // ── Zoom & Pan interactions ──
  const isPanningRef = useRef(false);
  const panLastPosRef = useRef<{ x: number; y: number } | null>(null);
  const spaceHeldRef = useRef(false);

  // Wheel zoom (centered on cursor)
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const state = useSketchStore.getState();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newZoom = Math.max(0.1, Math.min(32, state.viewport.zoom * factor));
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const cursor = { x: cx, y: cy };
      const documentPoint = screenToDocumentPoint(cursor, state.viewport, {
        width: state.canvas.width,
        height: state.canvas.height,
      });
      const pan = getPanForDocumentPointAtScreenPoint(
        documentPoint,
        cursor,
        { zoom: newZoom, rotation: state.viewport.rotation },
        { width: state.canvas.width, height: state.canvas.height },
      );
      useSketchStore.getState().setViewport({ zoom: newZoom, ...pan });
      needsRenderRef.current = true;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Middle-button drag pan + Space+drag pan
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      // Middle mouse button (button=1) or space+left click
      if (e.button === 1 || (e.button === 0 && spaceHeldRef.current)) {
        e.preventDefault();
        isPanningRef.current = true;
        panLastPosRef.current = { x: e.clientX, y: e.clientY };
        el.setPointerCapture(e.pointerId);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!isPanningRef.current || !panLastPosRef.current) return;
      const dx = e.clientX - panLastPosRef.current.x;
      const dy = e.clientY - panLastPosRef.current.y;
      panLastPosRef.current = { x: e.clientX, y: e.clientY };
      panBy(dx, dy);
      needsRenderRef.current = true;
    };
    const onUp = (e: PointerEvent) => {
      if (isPanningRef.current) {
        isPanningRef.current = false;
        panLastPosRef.current = null;
        el.releasePointerCapture(e.pointerId);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isComposingKeyboardEvent(e) || isEditableTarget(e.target)) {
        return;
      }
      if (e.code === 'Space' && !e.repeat) {
        spaceHeldRef.current = true;
        el.style.cursor = 'grab';
      }
      if (e.key === 'Alt') {
        altHeldRef.current = true;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeldRef.current = false;
        el.style.cursor = '';
      }
      if (e.key === 'Alt') {
        altHeldRef.current = false;
      }
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [panBy]);

  // ── Tool cursor mapping ──
  const TOOL_CURSORS: Record<string, string> = {
    brush: 'crosshair',
    eraser: 'crosshair',
    'select-rect': 'crosshair',
    'select-lasso': 'crosshair',
    'select-wand': 'crosshair',
    move: 'grab',
    shape: 'crosshair',
    transform: 'default',
    eyedropper: 'crosshair',
    fill: 'crosshair',
    zoom: 'zoom-in',
    pixel: 'crosshair',
  };
  // Dynamic cursor: alt+zoom shows zoom-out
  const toolCursor =
    activeTool === 'zoom' && altHeldRef.current
      ? 'zoom-out'
      : (TOOL_CURSORS[activeTool] ?? 'crosshair');

  // ── Transform menu (shown when transform tool clicks canvas) ──
  const [transformMenu, setTransformMenu] = useState<{ x: number; y: number } | null>(null);

  // ── Canvas right-click context menu ──
  const { t } = useTranslation();
  const [canvasMenu, setCanvasMenu] = useState<{ x: number; y: number } | null>(null);
  const selectAll = useSketchStore((s) => s.selectAll);
  const clearSelection = useSketchStore((s) => s.clearSelection);
  const selection = useSketchStore((s) => s.selection);
  const undo = useSketchStore((s) => s.undo);
  const redo = useSketchStore((s) => s.redo);
  const canUndo = useSketchStore((s) => s.canUndo);
  const canRedo = useSketchStore((s) => s.canRedo);

  // ── Layer pixel operations (flip, rotate, clear) ──
  const flipActiveLayerH = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer || !activeLayerId) return;
    const layer = useSketchStore.getState().layers.find((l) => l.id === activeLayerId);
    if (!layer?.texture) return;
    const w = canvas.width;
    const h = canvas.height;
    const imgData = readTextureToImageData(renderer, layer.texture, w, h);
    const beforePixels = new Uint8Array(imgData.data);
    // Flip horizontal: swap columns
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < Math.floor(w / 2); x++) {
        const left = (y * w + x) * 4;
        const right = (y * w + (w - 1 - x)) * 4;
        for (let c = 0; c < 4; c++) {
          const tmp = imgData.data[left + c]!;
          imgData.data[left + c] = imgData.data[right + c]!;
          imgData.data[right + c] = tmp;
        }
      }
    }
    const snapshot = buildRegionSnapshotPair(activeLayerId, beforePixels, imgData.data, w, h);
    uploadImageDataToTexture(renderer, layer.texture, imgData);
    pushRegionHistory('transform', 'Flip layer horizontal', snapshot);
    if (snapshot) {
      notifyDocumentEdited('Flip layer horizontal');
    }
    markDirty();
    needsRenderRef.current = true;
  }, [activeLayerId, canvas.width, canvas.height, markDirty]);

  const flipActiveLayerV = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer || !activeLayerId) return;
    const layer = useSketchStore.getState().layers.find((l) => l.id === activeLayerId);
    if (!layer?.texture) return;
    const w = canvas.width;
    const h = canvas.height;
    const imgData = readTextureToImageData(renderer, layer.texture, w, h);
    const beforePixels = new Uint8Array(imgData.data);
    // Flip vertical: swap rows
    for (let y = 0; y < Math.floor(h / 2); y++) {
      for (let x = 0; x < w; x++) {
        const top = (y * w + x) * 4;
        const bottom = ((h - 1 - y) * w + x) * 4;
        for (let c = 0; c < 4; c++) {
          const tmp = imgData.data[top + c]!;
          imgData.data[top + c] = imgData.data[bottom + c]!;
          imgData.data[bottom + c] = tmp;
        }
      }
    }
    const snapshot = buildRegionSnapshotPair(activeLayerId, beforePixels, imgData.data, w, h);
    uploadImageDataToTexture(renderer, layer.texture, imgData);
    pushRegionHistory('transform', 'Flip layer vertical', snapshot);
    if (snapshot) {
      notifyDocumentEdited('Flip layer vertical');
    }
    markDirty();
    needsRenderRef.current = true;
  }, [activeLayerId, canvas.width, canvas.height, markDirty]);

  const rotateActiveLayer90 = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer || !activeLayerId) return;
    const layer = useSketchStore.getState().layers.find((l) => l.id === activeLayerId);
    if (!layer?.texture) return;
    const w = canvas.width;
    const h = canvas.height;
    // For non-square canvases, rotation crops/pads. Keep it simple: rotate in-place.
    const imgData = readTextureToImageData(renderer, layer.texture, w, h);
    const beforePixels = new Uint8Array(imgData.data);
    const rotated = new ImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // 90° CW: (x, y) → (h-1-y, x) — clamped to canvas bounds
        const srcX = y;
        const srcY = w - 1 - x;
        if (srcX >= 0 && srcX < w && srcY >= 0 && srcY < h) {
          const si = (srcY * w + srcX) * 4;
          const di = (y * w + x) * 4;
          rotated.data[di] = imgData.data[si]!;
          rotated.data[di + 1] = imgData.data[si + 1]!;
          rotated.data[di + 2] = imgData.data[si + 2]!;
          rotated.data[di + 3] = imgData.data[si + 3]!;
        }
      }
    }
    const snapshot = buildRegionSnapshotPair(activeLayerId, beforePixels, rotated.data, w, h);
    uploadImageDataToTexture(renderer, layer.texture, rotated);
    pushRegionHistory('transform', 'Rotate layer 90 degrees', snapshot);
    if (snapshot) {
      notifyDocumentEdited('Rotate layer 90 degrees');
    }
    markDirty();
    needsRenderRef.current = true;
  }, [activeLayerId, canvas.width, canvas.height, markDirty]);

  const clearActiveLayer = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer || !activeLayerId) return;
    const layer = useSketchStore.getState().layers.find((l) => l.id === activeLayerId);
    if (!layer?.texture) return;
    const before = readTextureToImageData(renderer, layer.texture, canvas.width, canvas.height);
    const empty = new Uint8Array(canvas.width * canvas.height * 4);
    const snapshot = buildRegionSnapshotPair(
      activeLayerId,
      before.data,
      empty,
      canvas.width,
      canvas.height,
    );
    if (!snapshot) return;
    renderer.textures.updateTexture(layer.texture, 0, 0, canvas.width, canvas.height, empty);
    pushRegionHistory('clear', 'Clear layer', snapshot);
    notifyDocumentEdited('Clear layer');
    markDirty();
    needsRenderRef.current = true;
  }, [activeLayerId, canvas.width, canvas.height, markDirty]);

  const setSelectedVectorHandleMode = useCallback(
    (mode: VectorHandleMode) => {
      const state = useSketchStore.getState();
      if (!state.activeLayerId) return;
      const layer = findLayerById(state.layers, state.activeLayerId);
      if (layer?.type !== 'vector' || !layer.vectorData) return;

      const result = setVectorHandleModeForSelection(layer.vectorData, mode);
      if (!result.changed) return;

      const before = captureLayerStateSnapshot();
      state.setLayers(
        updateLayerById(state.layers, layer.id, (item) => ({
          ...item,
          vectorData: result.layerData,
        })),
      );
      const after = captureLayerStateSnapshot();
      pushStateHistory('transform', `Set vector handle mode: ${mode}`, before, after);
      notifyDocumentEdited(`Set vector handle mode: ${mode}`, 'sketch.vector.edit');
      markDirty();
      needsRenderRef.current = true;
    },
    [markDirty],
  );

  const applySelectedVectorPathCommand = useCallback(
    (command: VectorPathCommand) => {
      const state = useSketchStore.getState();
      if (!state.activeLayerId) return;
      const layer = findLayerById(state.layers, state.activeLayerId);
      if (layer?.type !== 'vector' || !layer.vectorData) return;

      const result =
        command === 'close'
          ? setSelectedVectorPathClosed(layer.vectorData, true)
          : command === 'open'
            ? setSelectedVectorPathClosed(layer.vectorData, false)
            : command === 'reverse'
              ? reverseSelectedVectorPath(layer.vectorData)
              : duplicateSelectedVectorPath(layer.vectorData);
      if (!result.changed) return;

      const renderer = rendererRef.current;
      const before = captureLayerStateSnapshot();
      const texture = renderer
        ? uploadVectorLayerTexture(
            renderer,
            layer,
            result.layerData.paths,
            canvas.width,
            canvas.height,
          )
        : null;
      if (texture) {
        vectorTextureSignatureRef.current.set(
          layer.id,
          getVectorTextureSignature(result.layerData, canvas.width, canvas.height),
        );
      }
      state.setLayers(
        updateLayerById(state.layers, layer.id, (item) => ({
          ...item,
          ...(texture ? { texture } : {}),
          vectorData: result.layerData,
        })),
      );
      const after = captureLayerStateSnapshot();
      const label =
        command === 'close'
          ? 'Close vector path'
          : command === 'open'
            ? 'Open vector path'
            : command === 'reverse'
              ? 'Reverse vector path'
              : 'Duplicate vector path';
      pushStateHistory('transform', label, before, after);
      notifyDocumentEdited(label, 'sketch.vector.edit');
      markDirty();
      needsRenderRef.current = true;
    },
    [canvas.height, canvas.width, markDirty],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setCanvasMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // Transform menu items (shown when transform tool clicks canvas)
  const transformMenuItems = useCallback(
    (): MenuItem[] => [
      { label: t('sketch.canvas.flipH'), onClick: flipActiveLayerH },
      { label: t('sketch.canvas.flipV'), onClick: flipActiveLayerV },
      { separator: true },
      { label: t('sketch.canvas.rotate90'), onClick: rotateActiveLayer90 },
      { separator: true },
      { label: t('sketch.canvas.clearLayer'), danger: true, onClick: clearActiveLayer },
    ],
    [t, flipActiveLayerH, flipActiveLayerV, rotateActiveLayer90, clearActiveLayer],
  );

  const contextMenuItems = useCallback((): MenuItem[] => {
    const state = useSketchStore.getState();
    const items: MenuItem[] = [
      {
        label: t('sketch.canvas.undo'),
        shortcut: '⌘Z',
        disabled: !state.canUndo,
        onClick: () => notifyHistoryReplay(undo(), 'undo'),
      },
      {
        label: t('sketch.canvas.redo'),
        shortcut: '⇧⌘Z',
        disabled: !state.canRedo,
        onClick: () => notifyHistoryReplay(redo(), 'redo'),
      },
      { separator: true },
      {
        label: t('sketch.canvas.selectAll'),
        shortcut: '⌘A',
        onClick: () => selectAll(),
      },
    ];
    if (state.selection) {
      items.push({
        label: t('sketch.canvas.deselect'),
        onClick: () => clearSelection(),
      });
    }
    const activeLayer = state.activeLayerId
      ? findLayerById(state.layers, state.activeLayerId)
      : null;
    const selectedHandleAnchors =
      activeLayer?.type === 'vector' && activeLayer.vectorData
        ? getVectorHandleAnchorRefsForSelection(activeLayer.vectorData)
        : [];
    const selectedVectorPath =
      activeLayer?.type === 'vector' && activeLayer.vectorData
        ? (activeLayer.vectorData.paths.find(
            (path) => path.id === activeLayer.vectorData?.selectedPathId,
          ) ?? null)
        : null;
    if (state.activeTool === 'vector' && selectedVectorPath) {
      items.push(
        { separator: true },
        {
          label: selectedVectorPath.closed
            ? t('sketch.vector.openPath')
            : t('sketch.vector.closePath'),
          onClick: () =>
            applySelectedVectorPathCommand(selectedVectorPath.closed ? 'open' : 'close'),
        },
        {
          label: t('sketch.vector.reversePath'),
          onClick: () => applySelectedVectorPathCommand('reverse'),
        },
        {
          label: t('sketch.vector.duplicatePath'),
          onClick: () => applySelectedVectorPathCommand('duplicate'),
        },
      );
    }
    if (state.activeTool === 'vector' && selectedHandleAnchors.length > 0) {
      items.push(
        { separator: true },
        {
          label: t('sketch.vector.handleMode'),
          disabled: false,
          onClick: () => undefined,
          submenu: [
            {
              label: t('sketch.vector.handleMode.corner'),
              onClick: () => setSelectedVectorHandleMode('corner'),
            },
            {
              label: t('sketch.vector.handleMode.smooth'),
              onClick: () => setSelectedVectorHandleMode('smooth'),
            },
            {
              label: t('sketch.vector.handleMode.mirrored'),
              onClick: () => setSelectedVectorHandleMode('mirrored'),
            },
          ],
        },
      );
    }
    items.push(
      { separator: true },
      { label: t('sketch.canvas.flipH'), onClick: flipActiveLayerH },
      { label: t('sketch.canvas.flipV'), onClick: flipActiveLayerV },
      { label: t('sketch.canvas.rotate90'), onClick: rotateActiveLayer90 },
      { separator: true },
      { label: t('sketch.canvas.clearLayer'), danger: true, onClick: clearActiveLayer },
      { separator: true },
      {
        label: 'Add Reference Image...',
        onClick: () => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              const src = reader.result as string;
              const id = `ref-${Date.now()}`;
              setReferenceImages((prev) => [
                ...prev,
                { id, src, x: 50, y: 50, width: 200, height: 200, opacity: 0.5 },
              ]);
            };
            reader.readAsDataURL(file);
          };
          input.click();
        },
      },
      { separator: true },
      {
        label: t('sketch.canvas.zoomIn'),
        onClick: () => {
          const s = useSketchStore.getState();
          const newZoom = Math.min(32, s.viewport.zoom * 1.5);
          const center = { x: s.canvas.width / 2, y: s.canvas.height / 2 };
          const documentPoint = screenToDocumentPoint(center, s.viewport, s.canvas);
          const pan = getPanForDocumentPointAtScreenPoint(
            documentPoint,
            center,
            { zoom: newZoom, rotation: s.viewport.rotation },
            s.canvas,
          );
          s.setViewport({ zoom: newZoom, ...pan });
          needsRenderRef.current = true;
        },
      },
      {
        label: t('sketch.canvas.zoomOut'),
        onClick: () => {
          const s = useSketchStore.getState();
          const newZoom = Math.max(0.1, s.viewport.zoom / 1.5);
          const center = { x: s.canvas.width / 2, y: s.canvas.height / 2 };
          const documentPoint = screenToDocumentPoint(center, s.viewport, s.canvas);
          const pan = getPanForDocumentPointAtScreenPoint(
            documentPoint,
            center,
            { zoom: newZoom, rotation: s.viewport.rotation },
            s.canvas,
          );
          s.setViewport({ zoom: newZoom, ...pan });
          needsRenderRef.current = true;
        },
      },
      { separator: true },
      {
        label: t('sketch.canvas.rotateViewLeft'),
        onClick: () => {
          useSketchStore.getState().rotateViewportBy(-Math.PI / 12);
          needsRenderRef.current = true;
        },
      },
      {
        label: t('sketch.canvas.rotateViewRight'),
        onClick: () => {
          useSketchStore.getState().rotateViewportBy(Math.PI / 12);
          needsRenderRef.current = true;
        },
      },
      {
        label: t('sketch.canvas.resetRotation'),
        onClick: () => {
          useSketchStore.getState().resetViewportRotation();
          needsRenderRef.current = true;
        },
      },
      {
        label: t('sketch.canvas.resetZoom'),
        onClick: () => {
          useSketchStore.getState().resetViewport();
          needsRenderRef.current = true;
        },
      },
    );
    return items;
  }, [
    t,
    selectAll,
    clearSelection,
    selection,
    undo,
    redo,
    canUndo,
    canRedo,
    flipActiveLayerH,
    flipActiveLayerV,
    rotateActiveLayer90,
    clearActiveLayer,
    setSelectedVectorHandleMode,
    applySelectedVectorPathCommand,
  ]);

  return (
    <div
      className="relative block w-full h-full"
      style={{ cursor: toolCursor }}
      onContextMenu={handleContextMenu}
    >
      <canvas
        ref={canvasRef}
        id="sketch-canvas"
        className="block w-full h-full"
        style={{ touchAction: 'none' }}
      />
      {/* Onion skin overlay — pointer-events:none so it does not block drawing */}
      <canvas
        ref={onionCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        aria-hidden="true"
      />
      {/* Vector drag preview — dashed outline shown while drawing shapes */}
      <canvas
        ref={vectorPreviewCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        aria-hidden="true"
      />
      {/* Pixel grid — visible only in pixel tool at sufficient zoom */}
      <PixelGrid canvasWidth={canvas.width} canvasHeight={canvas.height} />
      {/* Perspective construction grid */}
      <PerspectiveGridOverlay
        viewport={viewport}
        canvasWidth={canvas.width}
        canvasHeight={canvas.height}
      />
      {/* Ruler and guide lines overlay */}
      <GuidesOverlay
        guides={guides}
        viewport={viewport}
        canvasWidth={canvas.width}
        canvasHeight={canvas.height}
        onAddGuide={addGuide}
        onMoveGuide={moveGuide}
        onRemoveGuide={removeGuide}
      />
      {/* Reference images overlay */}
      <ReferenceOverlay
        images={referenceImages}
        onUpdate={updateReferenceImage}
        onRemove={removeReferenceImage}
      />
      {/* Light position indicators — shows light icons when lighting is active */}
      <LightOverlay />
      {/* Transform handles — visible when transform tool is active */}
      {transformState && (
        <TransformOverlay
          transform={transformState}
          viewport={viewport}
          canvasWidth={canvas.width}
          canvasHeight={canvas.height}
        />
      )}

      {textDraft && (
        <div
          className="absolute z-40 w-72 border border-[var(--vscode-input-border)] bg-[var(--vscode-editor-background)] p-2 shadow-lg"
          style={{
            left: Math.max(8, Math.min(textDraft.screenX, window.innerWidth - 320)),
            top: Math.max(8, Math.min(textDraft.screenY, window.innerHeight - 220)),
            borderRadius: 4,
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Escape') {
              setTextDraft(null);
            }
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              applyTextDraft(textDraft);
            }
          }}
        >
          <textarea
            autoFocus
            className="min-h-20 w-full resize-y border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-2 py-1 text-xs text-[var(--vscode-input-foreground)]"
            style={{ borderRadius: 4 }}
            value={textDraft.text}
            onChange={(event) =>
              setTextDraft((current) =>
                current ? { ...current, text: event.target.value } : current,
              )
            }
            aria-label={t('sketch.text.content')}
          />
          <div className="mt-2 grid grid-cols-[1fr_auto_auto_auto] items-end gap-2">
            <label className="text-xs text-[var(--vscode-descriptionForeground)]">
              <span className="mb-1 block">{t('sketch.text.size')}</span>
              <input
                className="w-full border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-2 py-1 text-xs text-[var(--vscode-input-foreground)]"
                style={{ borderRadius: 4 }}
                type="number"
                min={8}
                max={256}
                value={textDraft.fontSize}
                onChange={(event) =>
                  setTextDraft((current) =>
                    current
                      ? {
                          ...current,
                          fontSize: Math.max(8, Math.min(256, Number(event.target.value) || 8)),
                        }
                      : current,
                  )
                }
              />
            </label>
            <label className="text-xs text-[var(--vscode-descriptionForeground)]">
              <span className="mb-1 block">{t('sketch.text.color')}</span>
              <input
                className="h-7 w-9 border border-[var(--vscode-input-border)] bg-transparent p-0"
                type="color"
                value={textDraft.color}
                onChange={(event) =>
                  setTextDraft((current) =>
                    current ? { ...current, color: event.target.value } : current,
                  )
                }
              />
            </label>
            <button
              type="button"
              className="h-7 border border-[var(--vscode-button-border)] px-2 text-xs font-bold hover:bg-[var(--vscode-button-hoverBackground)]"
              style={{
                borderRadius: 4,
                background: textDraft.bold ? 'var(--vscode-button-secondaryBackground)' : undefined,
              }}
              onClick={() =>
                setTextDraft((current) => (current ? { ...current, bold: !current.bold } : current))
              }
              aria-label={t('sketch.text.bold')}
              title={t('sketch.text.bold')}
            >
              B
            </button>
            <button
              type="button"
              className="h-7 border border-[var(--vscode-button-border)] px-2 text-xs italic hover:bg-[var(--vscode-button-hoverBackground)]"
              style={{
                borderRadius: 4,
                background: textDraft.italic
                  ? 'var(--vscode-button-secondaryBackground)'
                  : undefined,
              }}
              onClick={() =>
                setTextDraft((current) =>
                  current ? { ...current, italic: !current.italic } : current,
                )
              }
              aria-label={t('sketch.text.italic')}
              title={t('sketch.text.italic')}
            >
              I
            </button>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              className="border border-[var(--vscode-button-border)] px-2 py-1 text-xs hover:bg-[var(--vscode-button-hoverBackground)]"
              style={{ borderRadius: 4 }}
              onClick={() => setTextDraft(null)}
            >
              {t('sketch.text.cancel')}
            </button>
            <button
              type="button"
              className="border border-[var(--vscode-button-border)] bg-[var(--vscode-button-background)] px-2 py-1 text-xs font-medium text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]"
              style={{ borderRadius: 4 }}
              onClick={() => applyTextDraft(textDraft)}
            >
              {t('sketch.text.apply')}
            </button>
          </div>
        </div>
      )}

      {/* Canvas right-click context menu */}
      {canvasMenu && (
        <ContextMenu
          x={canvasMenu.x}
          y={canvasMenu.y}
          items={contextMenuItems()}
          onClose={() => setCanvasMenu(null)}
        />
      )}

      {/* Transform tool action menu */}
      {transformMenu && (
        <ContextMenu
          x={transformMenu.x}
          y={transformMenu.y}
          items={transformMenuItems()}
          onClose={() => setTransformMenu(null)}
        />
      )}
    </div>
  );
}
