import React, { useEffect, useRef } from 'react';
import type { RenderFrameMeta, SceneDelta, SelectionTarget } from '@neko/shared';
import type { LocalPredictionSnapshot } from '../scene/LocalPredictionLayer';

type ViewportOverlayPatch = NonNullable<SceneDelta['overlay']>;
type ViewportPoint = { x: number; y: number };
type ProjectedBounds = NonNullable<ViewportOverlayPatch['projectedBounds']>[number];
type GizmoAnchor = NonNullable<ViewportOverlayPatch['gizmoAnchors']>[number];

export const MODEL_VIEWPORT_SELECTION_STYLE = {
  active: {
    stroke: 'rgba(255, 142, 28, 0.96)',
    glow: 'rgba(15, 23, 42, 0.72)',
    fill: 'rgba(255, 142, 28, 0.07)',
    center: 'rgba(255, 142, 28, 0.98)',
    lineWidth: 1.5,
    glowWidth: 3.5,
  },
  secondary: {
    stroke: 'rgba(45, 212, 191, 0.9)',
    glow: 'rgba(15, 23, 42, 0.58)',
    fill: 'rgba(45, 212, 191, 0.045)',
    center: 'rgba(45, 212, 191, 0.92)',
    lineWidth: 1.25,
    glowWidth: 2.75,
  },
  part: {
    stroke: 'rgba(250, 204, 21, 0.94)',
    glow: 'rgba(15, 23, 42, 0.66)',
    fill: 'rgba(250, 204, 21, 0.055)',
    center: 'rgba(250, 204, 21, 0.96)',
    lineWidth: 1.35,
    glowWidth: 3,
  },
} as const;

export const MODEL_VIEWPORT_GIZMO_STYLE = {
  x: 'rgba(239, 68, 68, 0.96)',
  y: 'rgba(34, 197, 94, 0.96)',
  z: 'rgba(59, 130, 246, 0.96)',
  shadow: 'rgba(15, 23, 42, 0.72)',
} as const;

export interface OverlayCanvasProps {
  viewportId: string;
  frameMeta: RenderFrameMeta | null;
  selectedNodeId: string | null;
  selectedTargets?: readonly SelectionTarget[];
  hasPendingPrediction?: boolean;
  overlay?: ViewportOverlayPatch | null;
  predictions?: LocalPredictionSnapshot[];
  topologyWarning?: string | null;
}

export function OverlayCanvas({
  viewportId,
  frameMeta,
  selectedNodeId,
  selectedTargets = [],
  hasPendingPrediction = false,
  overlay = null,
  predictions = [],
  topologyWarning = null,
}: OverlayCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width * scale));
    const height = Math.max(1, Math.floor(rect.height * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    if (!isOverlayFrameAligned(viewportId, frameMeta)) return;

    ctx.save();
    ctx.scale(scale, scale);
    const selectionContext = createSelectionFeedbackContext(
      selectedNodeId,
      selectedTargets,
      overlay,
    );
    drawProjectedBounds(ctx, overlay, selectionContext, rect.width, rect.height);

    drawLightHelpers(ctx, overlay, selectedNodeId, rect.width, rect.height);
    drawGizmoAnchors(ctx, overlay, selectionContext, rect.width, rect.height);
    drawPredictionOverlays(ctx, predictions, rect.width, rect.height);

    if (hasPendingPrediction || predictions.length > 0) {
      ctx.fillStyle = 'rgba(251, 191, 36, 0.95)';
      ctx.beginPath();
      ctx.arc(rect.width - 24, 24, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (topologyWarning) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.95)';
      ctx.fillRect(12, rect.height - 18, Math.min(rect.width - 24, 220), 3);
    }
    ctx.restore();
  }, [
    frameMeta,
    hasPendingPrediction,
    overlay,
    predictions,
    selectedNodeId,
    selectedTargets,
    topologyWarning,
    viewportId,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
}

export function isOverlayFrameAligned(
  viewportId: string,
  frameMeta: RenderFrameMeta | null,
): frameMeta is RenderFrameMeta {
  return frameMeta !== null && frameMeta.viewportId === viewportId;
}

function drawProjectedBounds(
  ctx: CanvasRenderingContext2D,
  overlay: ViewportOverlayPatch | null,
  selection: SelectionFeedbackContext,
  width: number,
  height: number,
): void {
  const bounds = overlay?.projectedBounds?.filter((item) =>
    isFeedbackItemSelected(item, selection),
  );
  if (!bounds || bounds.length === 0) {
    return;
  }

  ctx.save();
  ctx.lineJoin = 'round';
  for (const item of bounds) {
    if (!item.min || !item.max) continue;
    const minX = item.min.x * width;
    const minY = item.min.y * height;
    const maxX = item.max.x * width;
    const maxY = item.max.y * height;
    const boxWidth = maxX - minX;
    const boxHeight = maxY - minY;
    if (boxWidth <= 0 || boxHeight <= 0) continue;
    const style = resolveSelectionStyle(item, selection);
    ctx.fillStyle = style.fill;
    ctx.fillRect(minX, minY, boxWidth, boxHeight);
    ctx.strokeStyle = style.glow;
    ctx.lineWidth = style.glowWidth;
    ctx.strokeRect(minX, minY, boxWidth, boxHeight);
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = style.lineWidth;
    ctx.setLineDash(isPartTarget(item.target) ? [5, 4] : []);
    ctx.strokeRect(minX, minY, boxWidth, boxHeight);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawGizmoAnchors(
  ctx: CanvasRenderingContext2D,
  overlay: ViewportOverlayPatch | null,
  selection: SelectionFeedbackContext,
  width: number,
  height: number,
): void {
  const anchors = overlay?.gizmoAnchors?.filter((item) => isFeedbackItemActive(item, selection));
  const fallback = selection.activeNodeId && (!anchors || anchors.length === 0);
  const points = fallback
    ? [{ x: width / 2, y: height / 2 }]
    : (anchors ?? [])
        .map((anchor) => anchor.screenPosition)
        .filter((position): position is { x: number; y: number } => Boolean(position))
        .map((position) => ({ x: position.x * width, y: position.y * height }));

  for (const point of points) {
    drawSelectionGizmo(ctx, point, MODEL_VIEWPORT_SELECTION_STYLE.active.center);
  }
}

function drawSelectionGizmo(
  ctx: CanvasRenderingContext2D,
  origin: ViewportPoint,
  centerColor: string,
): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  drawGizmoAxis(ctx, origin, { x: 32, y: 0 }, MODEL_VIEWPORT_GIZMO_STYLE.x);
  drawGizmoAxis(ctx, origin, { x: 0, y: -32 }, MODEL_VIEWPORT_GIZMO_STYLE.y);
  drawGizmoAxis(ctx, origin, { x: 22, y: 20 }, MODEL_VIEWPORT_GIZMO_STYLE.z);

  ctx.fillStyle = centerColor;
  ctx.strokeStyle = MODEL_VIEWPORT_GIZMO_STYLE.shadow;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(origin.x, origin.y, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

interface SelectionFeedbackContext {
  readonly activeNodeId: string | null;
  readonly activeTargetKey: string | null;
  readonly selectedNodeIds: ReadonlySet<string>;
  readonly selectedTargetKeys: ReadonlySet<string>;
}

function createSelectionFeedbackContext(
  selectedNodeId: string | null,
  selectedTargets: readonly SelectionTarget[],
  overlay: ViewportOverlayPatch | null,
): SelectionFeedbackContext {
  const overlayTargets = overlay?.selectedTargets ?? [];
  const targets = overlayTargets.length > 0 ? overlayTargets : selectedTargets;
  const activeTarget = targets[0] ?? null;
  const activeNodeId = activeTarget?.nodeId ?? selectedNodeId;
  return {
    activeNodeId,
    activeTargetKey: activeTarget ? selectionTargetKey(activeTarget) : null,
    selectedNodeIds: new Set([
      ...(selectedNodeId ? [selectedNodeId] : []),
      ...(overlay?.selectedNodeIds ?? []),
      ...targets
        .map((target) => target.nodeId)
        .filter((nodeId): nodeId is string => typeof nodeId === 'string' && nodeId.length > 0),
    ]),
    selectedTargetKeys: new Set(targets.map(selectionTargetKey)),
  };
}

function isFeedbackItemSelected(
  item: ProjectedBounds | GizmoAnchor,
  selection: SelectionFeedbackContext,
): boolean {
  if (selection.selectedTargetKeys.size === 0 && selection.selectedNodeIds.size === 0) return true;
  if (item.target && selection.selectedTargetKeys.has(selectionTargetKey(item.target))) return true;
  return selection.selectedNodeIds.has(item.nodeId);
}

function isFeedbackItemActive(
  item: ProjectedBounds | GizmoAnchor,
  selection: SelectionFeedbackContext,
): boolean {
  if (item.target && selection.activeTargetKey === selectionTargetKey(item.target)) return true;
  return item.nodeId === selection.activeNodeId;
}

function resolveSelectionStyle(
  item: ProjectedBounds,
  selection: SelectionFeedbackContext,
): (typeof MODEL_VIEWPORT_SELECTION_STYLE)[keyof typeof MODEL_VIEWPORT_SELECTION_STYLE] {
  if (isFeedbackItemActive(item, selection)) {
    return isPartTarget(item.target)
      ? MODEL_VIEWPORT_SELECTION_STYLE.part
      : MODEL_VIEWPORT_SELECTION_STYLE.active;
  }
  return MODEL_VIEWPORT_SELECTION_STYLE.secondary;
}

function isPartTarget(target: SelectionTarget | undefined): boolean {
  return (
    target?.kind === 'materialSlot' ||
    target?.kind === 'submesh' ||
    target?.kind === 'primitive' ||
    target?.kind === 'characterRegion' ||
    target?.kind === 'morphControl'
  );
}

function selectionTargetKey(target: SelectionTarget): string {
  return [
    target.kind,
    target.nodeId ?? '',
    target.characterId ?? '',
    target.boneId ?? '',
    target.materialSlotId ?? '',
    target.submeshId ?? '',
    target.primitiveId ?? '',
    target.regionId ?? '',
    target.morphId ?? '',
    target.environmentId ?? '',
  ].join(':');
}

function drawGizmoAxis(
  ctx: CanvasRenderingContext2D,
  origin: ViewportPoint,
  vector: ViewportPoint,
  color: string,
): void {
  const end = { x: origin.x + vector.x, y: origin.y + vector.y };
  drawAxisLine(ctx, origin, end, MODEL_VIEWPORT_GIZMO_STYLE.shadow, 4.5);
  drawAxisLine(ctx, origin, end, color, 2.25);
  drawAxisArrowHead(ctx, end, vector, color);
}

function drawAxisLine(
  ctx: CanvasRenderingContext2D,
  start: ViewportPoint,
  end: ViewportPoint,
  color: string,
  lineWidth: number,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
}

function drawAxisArrowHead(
  ctx: CanvasRenderingContext2D,
  tip: ViewportPoint,
  vector: ViewportPoint,
  color: string,
): void {
  const length = Math.hypot(vector.x, vector.y);
  if (length <= 0) return;
  const ux = vector.x / length;
  const uy = vector.y / length;
  const size = 7;
  const wing = 4.5;
  const base = { x: tip.x - ux * size, y: tip.y - uy * size };
  const normal = { x: -uy, y: ux };

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(base.x + normal.x * wing, base.y + normal.y * wing);
  ctx.lineTo(base.x - normal.x * wing, base.y - normal.y * wing);
  ctx.closePath();
  ctx.fill();
}

function drawLightHelpers(
  ctx: CanvasRenderingContext2D,
  overlay: ViewportOverlayPatch | null,
  selectedNodeId: string | null,
  width: number,
  height: number,
): void {
  const anchors = overlay?.gizmoAnchors?.filter(
    (item) => item.target?.kind === 'node' && item.nodeId !== selectedNodeId,
  );
  if (!anchors || anchors.length === 0) return;

  ctx.save();
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.92)';
  ctx.fillStyle = 'rgba(250, 204, 21, 0.18)';
  ctx.lineWidth = 1.25;
  for (const anchor of anchors) {
    const position = anchor.screenPosition;
    if (!position) continue;
    const x = position.x * width;
    const y = position.y * height;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - 12);
    ctx.lineTo(x, y - 16);
    ctx.moveTo(x, y + 12);
    ctx.lineTo(x, y + 16);
    ctx.moveTo(x - 12, y);
    ctx.lineTo(x - 16, y);
    ctx.moveTo(x + 12, y);
    ctx.lineTo(x + 16, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPredictionOverlays(
  ctx: CanvasRenderingContext2D,
  predictions: LocalPredictionSnapshot[],
  width: number,
  height: number,
): void {
  for (const prediction of predictions) {
    if (prediction.kind === 'ik') {
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.95)';
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, 24, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (prediction.kind === 'morph') {
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.9)';
      ctx.strokeRect(width - 66, 42, 42, 12);
    }
    if (prediction.kind === 'brush' || prediction.kind === 'topology') {
      ctx.strokeStyle = 'rgba(248, 113, 113, 0.95)';
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, 36, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
