/**
 * PerspectiveGridOverlay - SVG construction grid with draggable vanishing points
 */
import { useCallback, useMemo } from 'react';
import { useSketchStore } from '../stores';
import type {
  DocumentPoint,
  PerspectiveGridMode,
  PerspectiveVanishingPointKey,
  ViewportState,
} from '../types';
import { documentToScreenPoint, screenToDocumentPoint } from '../utils/viewport-transform';

interface PerspectiveGridOverlayProps {
  readonly viewport: ViewportState;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
}

interface GridLine {
  readonly from: DocumentPoint;
  readonly to: DocumentPoint;
  readonly key: string;
}

export function PerspectiveGridOverlay({
  viewport,
  canvasWidth,
  canvasHeight,
}: PerspectiveGridOverlayProps) {
  const grid = useSketchStore((s) => s.perspectiveGrid);
  const setVanishingPoint = useSketchStore((s) => s.setPerspectiveVanishingPoint);
  const viewportSize = { width: canvasWidth, height: canvasHeight };

  const activeKeys = useMemo(() => getActiveVanishingPointKeys(grid.mode), [grid.mode]);
  const lines = useMemo(
    () =>
      grid.enabled
        ? buildPerspectiveLines({
            mode: grid.mode,
            divisions: grid.divisions,
            width: canvasWidth,
            height: canvasHeight,
            vanishingPoints: grid.vanishingPoints,
          })
        : [],
    [canvasHeight, canvasWidth, grid],
  );

  const handleDrag = useCallback(
    (key: PerspectiveVanishingPointKey, event: React.PointerEvent<SVGCircleElement>) => {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      const svg = event.currentTarget.ownerSVGElement;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();

      const onMove = (moveEvent: PointerEvent) => {
        const point = screenToDocumentPoint(
          { x: moveEvent.clientX - rect.left, y: moveEvent.clientY - rect.top },
          viewport,
          viewportSize,
        );
        setVanishingPoint(key, { x: Math.round(point.x), y: Math.round(point.y) });
      };
      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    },
    [setVanishingPoint, viewport, viewportSize],
  );

  if (!grid.enabled) return null;

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
      style={{ overflow: 'visible', opacity: grid.opacity }}
    >
      <rect x={0} y={0} width="100%" height="100%" fill="transparent" pointerEvents="none" />
      {lines.map((line) => {
        const from = documentToScreenPoint(line.from, viewport, viewportSize);
        const to = documentToScreenPoint(line.to, viewport, viewportSize);
        return (
          <line
            key={line.key}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke="rgba(80, 190, 255, 0.72)"
            strokeWidth={1}
          />
        );
      })}
      {activeKeys.map((key) => {
        const point = grid.vanishingPoints[key];
        const screen = documentToScreenPoint(point, viewport, viewportSize);
        return (
          <g key={key}>
            <circle
              cx={screen.x}
              cy={screen.y}
              r={8}
              fill="rgba(255, 220, 80, 0.9)"
              stroke="rgba(32, 32, 32, 0.85)"
              strokeWidth={1.5}
              style={{ pointerEvents: 'auto', cursor: 'grab' }}
              onPointerDown={(event) => handleDrag(key, event)}
            />
            <text
              x={screen.x + 10}
              y={screen.y - 8}
              fill="rgba(255, 235, 150, 0.95)"
              fontSize={10}
              fontWeight={600}
            >
              {labelForVanishingPoint(key)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function buildPerspectiveLines({
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
}): readonly GridLine[] {
  const lines: GridLine[] = [];
  const boundary = buildBoundaryPoints(width, height, divisions);
  const activeKeys = getActiveVanishingPointKeys(mode);

  for (const key of activeKeys) {
    const vp = vanishingPoints[key];
    const targets = key === 'vertical' ? boundary.horizontal : boundary.all;
    for (const [index, target] of targets.entries()) {
      lines.push({ key: `${key}-${index}`, from: vp, to: target });
    }
  }

  if (mode === 'two-point' || mode === 'three-point') {
    lines.push({
      key: 'horizon',
      from: vanishingPoints.left,
      to: vanishingPoints.right,
    });
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
  const all: DocumentPoint[] = [];
  const horizontal: DocumentPoint[] = [];

  for (let i = 0; i <= divisions; i++) {
    const x = (width * i) / divisions;
    const top = { x, y: 0 };
    const bottom = { x, y: height };
    all.push(top, bottom);
    horizontal.push(top, bottom);
  }

  for (let i = 1; i < divisions; i++) {
    const y = (height * i) / divisions;
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

function labelForVanishingPoint(key: PerspectiveVanishingPointKey): string {
  switch (key) {
    case 'center':
      return 'VP';
    case 'left':
      return 'L';
    case 'right':
      return 'R';
    case 'vertical':
      return 'V';
  }
}
