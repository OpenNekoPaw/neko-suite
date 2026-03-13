/**
 * Vector Tool
 *
 * Bezier path editing and shape generation utilities.
 */
import type { VectorPath, PathSegment, FillStyle, StrokeStyle } from '../types/vector';

let vectorIdCounter = 0;

function nextId(): string {
  return `vpath-${++vectorIdCounter}-${Date.now()}`;
}

/**
 * Create a new empty vector path.
 */
export function createPath(
  fill: FillStyle | null = null,
  stroke: StrokeStyle | null = null,
): VectorPath {
  return { id: nextId(), segments: [], closed: false, fill, stroke };
}

/**
 * Add a move-to segment to start a new sub-path.
 */
export function moveTo(path: VectorPath, x: number, y: number): VectorPath {
  return {
    ...path,
    segments: [...path.segments, { type: 'move', points: [[x, y]] }],
  };
}

/**
 * Add a line-to segment.
 */
export function lineTo(path: VectorPath, x: number, y: number): VectorPath {
  return {
    ...path,
    segments: [...path.segments, { type: 'line', points: [[x, y]] }],
  };
}

/**
 * Add a cubic bezier segment.
 */
export function cubicTo(
  path: VectorPath,
  cp1x: number,
  cp1y: number,
  cp2x: number,
  cp2y: number,
  x: number,
  y: number,
): VectorPath {
  return {
    ...path,
    segments: [
      ...path.segments,
      {
        type: 'cubic',
        points: [
          [cp1x, cp1y],
          [cp2x, cp2y],
          [x, y],
        ],
      },
    ],
  };
}

/**
 * Close the path.
 */
export function closePath(path: VectorPath): VectorPath {
  return { ...path, closed: true };
}

// ─── Shape Generators ───

/**
 * Generate a rectangle path.
 */
export function createRectangle(
  x: number,
  y: number,
  width: number,
  height: number,
  fill: FillStyle | null = null,
  stroke: StrokeStyle | null = null,
): VectorPath {
  const segments: PathSegment[] = [
    { type: 'move', points: [[x, y]] },
    { type: 'line', points: [[x + width, y]] },
    { type: 'line', points: [[x + width, y + height]] },
    { type: 'line', points: [[x, y + height]] },
    { type: 'line', points: [[x, y]] },
  ];
  return { id: nextId(), segments, closed: true, fill, stroke };
}

/**
 * Generate an ellipse path using cubic bezier approximation.
 */
export function createEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fill: FillStyle | null = null,
  stroke: StrokeStyle | null = null,
): VectorPath {
  // Cubic bezier approximation of a circle using kappa
  const k = 0.5522847498;
  const kx = rx * k;
  const ky = ry * k;

  const segments: PathSegment[] = [
    { type: 'move', points: [[cx, cy - ry]] },
    {
      type: 'cubic',
      points: [
        [cx + kx, cy - ry],
        [cx + rx, cy - ky],
        [cx + rx, cy],
      ],
    },
    {
      type: 'cubic',
      points: [
        [cx + rx, cy + ky],
        [cx + kx, cy + ry],
        [cx, cy + ry],
      ],
    },
    {
      type: 'cubic',
      points: [
        [cx - kx, cy + ry],
        [cx - rx, cy + ky],
        [cx - rx, cy],
      ],
    },
    {
      type: 'cubic',
      points: [
        [cx - rx, cy - ky],
        [cx - kx, cy - ry],
        [cx, cy - ry],
      ],
    },
  ];
  return { id: nextId(), segments, closed: true, fill, stroke };
}

/**
 * Generate a regular polygon path.
 */
export function createPolygon(
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  fill: FillStyle | null = null,
  stroke: StrokeStyle | null = null,
): VectorPath {
  const n = Math.max(3, sides);
  const segments: PathSegment[] = [];

  for (let i = 0; i <= n; i++) {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    segments.push({ type: i === 0 ? 'move' : 'line', points: [[x, y]] });
  }

  return { id: nextId(), segments, closed: true, fill, stroke };
}

/**
 * Generate a star path.
 */
export function createStar(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  points: number,
  fill: FillStyle | null = null,
  stroke: StrokeStyle | null = null,
): VectorPath {
  const n = Math.max(3, points);
  const segments: PathSegment[] = [];
  const totalPoints = n * 2;

  for (let i = 0; i <= totalPoints; i++) {
    const angle = (i / totalPoints) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    segments.push({ type: i === 0 ? 'move' : 'line', points: [[x, y]] });
  }

  return { id: nextId(), segments, closed: true, fill, stroke };
}
