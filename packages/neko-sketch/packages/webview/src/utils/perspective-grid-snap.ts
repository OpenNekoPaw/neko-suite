import type {
  DocumentPoint,
  PerspectiveGridMode,
  PerspectiveGridState,
  PerspectiveVanishingPointKey,
} from '../types';

export interface PerspectiveSnapResult {
  readonly point: DocumentPoint;
  readonly snapped: boolean;
  readonly distance: number;
  readonly lineKey?: string;
}

export interface PerspectiveSnapOptions {
  readonly threshold?: number;
}

interface PerspectiveGridLine {
  readonly from: DocumentPoint;
  readonly to: DocumentPoint;
  readonly key: string;
}

const DEFAULT_SNAP_THRESHOLD = 12;

export function snapPointToPerspectiveGrid(
  point: DocumentPoint,
  grid: PerspectiveGridState,
  canvas: { readonly width: number; readonly height: number },
  options: PerspectiveSnapOptions = {},
): PerspectiveSnapResult {
  if (!grid.enabled || !grid.snapEnabled) {
    return { point, snapped: false, distance: Infinity };
  }

  const threshold = options.threshold ?? DEFAULT_SNAP_THRESHOLD;
  const lines = buildPerspectiveSnapLines({
    mode: grid.mode,
    divisions: grid.divisions,
    width: canvas.width,
    height: canvas.height,
    vanishingPoints: grid.vanishingPoints,
  });

  let best: PerspectiveSnapResult = { point, snapped: false, distance: threshold };
  for (const line of lines) {
    const projected = projectPointToSegment(point, line.from, line.to);
    if (projected.distance <= best.distance) {
      best = {
        point: projected.point,
        snapped: true,
        distance: projected.distance,
        lineKey: line.key,
      };
    }
  }

  return best.snapped ? best : { point, snapped: false, distance: Infinity };
}

function buildPerspectiveSnapLines({
  mode,
  divisions,
  width,
  height,
  vanishingPoints,
}: {
  readonly mode: PerspectiveGridMode;
  readonly divisions: number;
  readonly width: number;
  readonly height: number;
  readonly vanishingPoints: Readonly<Record<PerspectiveVanishingPointKey, DocumentPoint>>;
}): readonly PerspectiveGridLine[] {
  const lines: PerspectiveGridLine[] = [];
  const boundary = buildBoundaryPoints(width, height, divisions);

  for (const key of getActiveVanishingPointKeys(mode)) {
    const vp = vanishingPoints[key];
    const targets = key === 'vertical' ? boundary.horizontal : boundary.all;
    for (const [index, target] of targets.entries()) {
      lines.push({ key: `${key}-${index}`, from: vp, to: target });
    }
  }

  return lines;
}

function buildBoundaryPoints(
  width: number,
  height: number,
  divisions: number,
): {
  readonly all: readonly DocumentPoint[];
  readonly horizontal: readonly DocumentPoint[];
} {
  const safeDivisions = Math.max(2, Math.round(divisions));
  const all: DocumentPoint[] = [];
  const horizontal: DocumentPoint[] = [];

  for (let i = 0; i <= safeDivisions; i++) {
    const x = (width * i) / safeDivisions;
    const top = { x, y: 0 };
    const bottom = { x, y: height };
    all.push(top, bottom);
    horizontal.push(top, bottom);
  }

  for (let i = 1; i < safeDivisions; i++) {
    const y = (height * i) / safeDivisions;
    all.push({ x: 0, y }, { x: width, y });
  }

  return { all, horizontal };
}

function getActiveVanishingPointKeys(
  mode: PerspectiveGridMode,
): readonly PerspectiveVanishingPointKey[] {
  switch (mode) {
    case 'one-point':
      return ['center'];
    case 'two-point':
      return ['left', 'right'];
    case 'three-point':
      return ['left', 'right', 'vertical'];
  }
}

function projectPointToSegment(
  point: DocumentPoint,
  from: DocumentPoint,
  to: DocumentPoint,
): { readonly point: DocumentPoint; readonly distance: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    return { point: from, distance: distanceBetween(point, from) };
  }

  const rawT = ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSq;
  const t = Math.max(0, Math.min(1, rawT));
  const projected = {
    x: from.x + dx * t,
    y: from.y + dy * t,
  };
  return { point: projected, distance: distanceBetween(point, projected) };
}

function distanceBetween(left: DocumentPoint, right: DocumentPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}
