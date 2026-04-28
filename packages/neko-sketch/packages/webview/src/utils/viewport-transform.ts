import type { ViewportState } from '../types';

export interface ViewportPoint {
  readonly x: number;
  readonly y: number;
}

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export function screenToDocumentPoint(
  point: ViewportPoint,
  viewport: ViewportState,
  size: ViewportSize,
): ViewportPoint {
  const unrotated = rotateScreenPoint(point, viewportCenter(size), -viewport.rotation);
  return {
    x: (unrotated.x - viewport.panX) / viewport.zoom,
    y: (unrotated.y - viewport.panY) / viewport.zoom,
  };
}

export function documentToScreenPoint(
  point: ViewportPoint,
  viewport: ViewportState,
  size: ViewportSize,
): ViewportPoint {
  return rotateScreenPoint(
    {
      x: point.x * viewport.zoom + viewport.panX,
      y: point.y * viewport.zoom + viewport.panY,
    },
    viewportCenter(size),
    viewport.rotation,
  );
}

export function getPanForDocumentPointAtScreenPoint(
  documentPoint: ViewportPoint,
  screenPoint: ViewportPoint,
  viewport: Pick<ViewportState, 'zoom' | 'rotation'>,
  size: ViewportSize,
): Pick<ViewportState, 'panX' | 'panY'> {
  const unrotated = rotateScreenPoint(screenPoint, viewportCenter(size), -viewport.rotation);
  return {
    panX: unrotated.x - documentPoint.x * viewport.zoom,
    panY: unrotated.y - documentPoint.y * viewport.zoom,
  };
}

export function applyCanvasViewportTransform(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  viewport: ViewportState,
  viewportSize: ViewportSize,
  documentSize: ViewportSize,
): { readonly scaleX: number; readonly scaleY: number } {
  const scaleX = (viewport.zoom * viewportSize.width) / documentSize.width;
  const scaleY = (viewport.zoom * viewportSize.height) / documentSize.height;
  const tx = (viewportSize.width / 2) * (1 - viewport.zoom) + viewport.panX;
  const ty = (viewportSize.height / 2) * (1 - viewport.zoom) + viewport.panY;
  const center = viewportCenter(viewportSize);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(center.x, center.y);
  ctx.rotate(viewport.rotation);
  ctx.translate(-center.x, -center.y);
  ctx.transform(scaleX, 0, 0, scaleY, tx, ty);

  return { scaleX, scaleY };
}

export function buildViewportTransformMatrix(
  viewport: ViewportState,
  canvasWidth: number,
  canvasHeight: number,
  cssWidth = canvasWidth,
  cssHeight = canvasHeight,
): Float32Array {
  const sx = viewport.zoom;
  const sy = viewport.zoom;
  const tx = viewport.zoom - 1 + (viewport.panX / cssWidth) * 2;
  const ty = 1 - viewport.zoom - (viewport.panY / cssHeight) * 2;

  if (viewport.rotation === 0) {
    return new Float32Array([sx, 0, 0, 0, sy, 0, tx, ty, 1]);
  }

  const c = Math.cos(viewport.rotation);
  const s = Math.sin(viewport.rotation);
  return new Float32Array([
    c * sx,
    -s * sx,
    0,
    s * sy,
    c * sy,
    0,
    c * tx + s * ty,
    -s * tx + c * ty,
    1,
  ]);
}

function viewportCenter(size: ViewportSize): ViewportPoint {
  return { x: size.width / 2, y: size.height / 2 };
}

function rotateScreenPoint(
  point: ViewportPoint,
  center: ViewportPoint,
  radians: number,
): ViewportPoint {
  if (radians === 0) {
    return point;
  }
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * c - dy * s,
    y: center.y + dx * s + dy * c,
  };
}
