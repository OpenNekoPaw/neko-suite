import React, { useEffect, useRef } from 'react';
import type { RenderFrameMeta, SceneDelta } from '@neko/shared';
import type { LocalPredictionSnapshot } from '../scene/LocalPredictionLayer';

type ViewportOverlayPatch = NonNullable<SceneDelta['overlay']>;

export interface OverlayCanvasProps {
  viewportId: string;
  frameMeta: RenderFrameMeta | null;
  selectedNodeId: string | null;
  hasPendingPrediction?: boolean;
  overlay?: ViewportOverlayPatch | null;
  predictions?: LocalPredictionSnapshot[];
  topologyWarning?: string | null;
}

export function OverlayCanvas({
  viewportId,
  frameMeta,
  selectedNodeId,
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
    ctx.strokeStyle = 'rgba(96, 165, 250, 0.9)';
    ctx.lineWidth = 1.5;
    drawProjectedBounds(ctx, overlay, selectedNodeId, rect.width, rect.height);

    drawLightHelpers(ctx, overlay, selectedNodeId, rect.width, rect.height);
    drawGizmoAnchors(ctx, overlay, selectedNodeId, rect.width, rect.height);
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
  selectedNodeId: string | null,
  width: number,
  height: number,
): void {
  const bounds = overlay?.projectedBounds?.filter(
    (item) => !selectedNodeId || item.nodeId === selectedNodeId,
  );
  if (!bounds || bounds.length === 0) {
    if (selectedNodeId) {
      ctx.strokeRect(12, 12, width - 24, height - 24);
    }
    return;
  }

  for (const item of bounds) {
    if (!item.min || !item.max) continue;
    const minX = item.min.x * width;
    const minY = item.min.y * height;
    const maxX = item.max.x * width;
    const maxY = item.max.y * height;
    ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
  }
}

function drawGizmoAnchors(
  ctx: CanvasRenderingContext2D,
  overlay: ViewportOverlayPatch | null,
  selectedNodeId: string | null,
  width: number,
  height: number,
): void {
  const anchors = overlay?.gizmoAnchors?.filter(
    (item) => !selectedNodeId || item.nodeId === selectedNodeId,
  );
  const fallback = selectedNodeId && (!anchors || anchors.length === 0);
  const points = fallback
    ? [{ x: width / 2, y: height / 2 }]
    : (anchors ?? [])
        .map((anchor) => anchor.screenPosition)
        .filter((position): position is { x: number; y: number } => Boolean(position))
        .map((position) => ({ x: position.x * width, y: position.y * height }));

  for (const point of points) {
    ctx.beginPath();
    ctx.moveTo(point.x - 18, point.y);
    ctx.lineTo(point.x + 18, point.y);
    ctx.moveTo(point.x, point.y - 18);
    ctx.lineTo(point.x, point.y + 18);
    ctx.stroke();
  }
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
