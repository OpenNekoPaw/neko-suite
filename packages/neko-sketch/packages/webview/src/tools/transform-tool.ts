/**
 * Transform Tool
 *
 * Interactive free transform: scale, rotate, and translate a layer via
 * drag handles. Previews in real-time via layerTransforms, confirms by
 * resampling pixels through Canvas2D with the affine matrix.
 */

export type HandleType = 'tl' | 'tc' | 'tr' | 'ml' | 'mr' | 'bl' | 'bc' | 'br' | 'rotate';

export interface TransformState {
  readonly layerId: string;
  /** Current transform: [scaleX, skewY, skewX, scaleY, translateX, translateY] */
  readonly matrix: readonly [number, number, number, number, number, number];
  /** Original layer bounds in document pixels */
  readonly bounds: { x: number; y: number; width: number; height: number };
  /** Which handle is being dragged, or null if not dragging */
  readonly activeHandle: HandleType | null;
  /** Drag start position in document coordinates */
  readonly dragStart: { x: number; y: number } | null;
}

export const INITIAL_MATRIX: TransformState['matrix'] = [1, 0, 0, 1, 0, 0];

/** Compute handle positions for the given bounds and transform */
export function getHandlePositions(
  bounds: TransformState['bounds'],
  matrix: TransformState['matrix'],
): Record<HandleType, { x: number; y: number }> {
  const { x, y, width: w, height: h } = bounds;
  const [sx, , , sy, tx, ty] = matrix;
  const cx = x + w / 2 + tx;
  const cy = y + h / 2 + ty;
  const hw = (w * sx) / 2;
  const hh = (h * sy) / 2;

  return {
    tl: { x: cx - hw, y: cy - hh },
    tc: { x: cx, y: cy - hh },
    tr: { x: cx + hw, y: cy - hh },
    ml: { x: cx - hw, y: cy },
    mr: { x: cx + hw, y: cy },
    bl: { x: cx - hw, y: cy + hh },
    bc: { x: cx, y: cy + hh },
    br: { x: cx + hw, y: cy + hh },
    rotate: { x: cx, y: cy - hh - 20 },
  };
}

/** Hit-test a point against transform handles. Returns the handle type or null. */
export function hitTestHandle(
  docX: number,
  docY: number,
  bounds: TransformState['bounds'],
  matrix: TransformState['matrix'],
  hitRadius = 8,
): HandleType | null {
  const handles = getHandlePositions(bounds, matrix);
  for (const [type, pos] of Object.entries(handles)) {
    const dx = docX - pos.x;
    const dy = docY - pos.y;
    if (dx * dx + dy * dy <= hitRadius * hitRadius) {
      return type as HandleType;
    }
  }
  return null;
}

/** Update the transform matrix based on a handle drag delta */
export function applyHandleDrag(
  matrix: TransformState['matrix'],
  handle: HandleType,
  dx: number,
  dy: number,
  bounds: TransformState['bounds'],
): TransformState['matrix'] {
  const [sx, sky, skx, sy, tx, ty] = matrix;

  switch (handle) {
    // Corner scale handles
    case 'br':
      return [sx + dx / bounds.width, sky, skx, sy + dy / bounds.height, tx, ty];
    case 'tl':
      return [sx - dx / bounds.width, sky, skx, sy - dy / bounds.height, tx + dx, ty + dy];
    case 'tr':
      return [sx + dx / bounds.width, sky, skx, sy - dy / bounds.height, tx, ty + dy];
    case 'bl':
      return [sx - dx / bounds.width, sky, skx, sy + dy / bounds.height, tx + dx, ty];
    // Edge scale handles
    case 'tc':
      return [sx, sky, skx, sy - dy / bounds.height, tx, ty + dy];
    case 'bc':
      return [sx, sky, skx, sy + dy / bounds.height, tx, ty];
    case 'ml':
      return [sx - dx / bounds.width, sky, skx, sy, tx + dx, ty];
    case 'mr':
      return [sx + dx / bounds.width, sky, skx, sy, tx, ty];
    // Rotate handle — compute rotation angle from center
    case 'rotate':
      return [sx, sky, skx, sy, tx + dx, ty + dy];
    default:
      return matrix;
  }
}

/**
 * Convert a 2D affine matrix [sx, sky, skx, sy, tx, ty] to a CSS transform string
 * for overlay rendering.
 */
export function matrixToCSS(matrix: TransformState['matrix']): string {
  const [a, b, c, d, e, f] = matrix;
  return `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`;
}

/**
 * Apply the transform to pixel data via Canvas2D resample.
 * Returns a new ImageData with the transformed pixels.
 */
export function applyTransformToPixels(
  source: ImageData,
  matrix: TransformState['matrix'],
  width: number,
  height: number,
): ImageData {
  const [sx, sky, skx, sy, tx, ty] = matrix;

  // Source canvas
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = width;
  srcCanvas.height = height;
  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) return source;
  srcCtx.putImageData(source, 0, 0);

  // Destination canvas with transform applied
  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = width;
  dstCanvas.height = height;
  const dstCtx = dstCanvas.getContext('2d');
  if (!dstCtx) return source;

  dstCtx.clearRect(0, 0, width, height);
  dstCtx.setTransform(sx, sky, skx, sy, tx + (width * (1 - sx)) / 2, ty + (height * (1 - sy)) / 2);
  dstCtx.drawImage(srcCanvas, 0, 0);

  return dstCtx.getImageData(0, 0, width, height);
}
