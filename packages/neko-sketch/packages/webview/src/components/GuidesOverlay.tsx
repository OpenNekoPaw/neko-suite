/**
 * GuidesOverlay - ruler markings and draggable guide lines
 *
 * Renders horizontal/vertical rulers along canvas edges and
 * user-created guide lines as SVG overlays. Guides can be
 * dragged from rulers and repositioned.
 */
import { useCallback } from 'react';
import type { ViewportState } from '../types';

export interface Guide {
  readonly id: string;
  readonly axis: 'horizontal' | 'vertical';
  /** Position in document pixels */
  readonly position: number;
}

interface GuidesOverlayProps {
  guides: readonly Guide[];
  viewport: ViewportState;
  canvasWidth: number;
  canvasHeight: number;
  onAddGuide: (axis: 'horizontal' | 'vertical', position: number) => void;
  onMoveGuide: (id: string, position: number) => void;
  onRemoveGuide: (id: string) => void;
}

const RULER_SIZE = 16;
const TICK_INTERVAL = 50; // pixels in document space between major ticks

export function GuidesOverlay({
  guides,
  viewport,
  canvasWidth,
  canvasHeight,
  onAddGuide,
  onMoveGuide,
  onRemoveGuide,
}: GuidesOverlayProps) {
  const { zoom, panX, panY } = viewport;

  // Convert document coord to screen
  const toScreenX = (docX: number) => docX * zoom + panX;
  const toScreenY = (docY: number) => docY * zoom + panY;

  // Ruler tick marks
  const hTicks: number[] = [];
  const vTicks: number[] = [];
  const step = TICK_INTERVAL;
  for (let x = 0; x <= canvasWidth; x += step) hTicks.push(x);
  for (let y = 0; y <= canvasHeight; y += step) vTicks.push(y);

  const handleGuideDrag = useCallback(
    (id: string, axis: 'horizontal' | 'vertical', e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as SVGElement).setPointerCapture(e.pointerId);
      const onMove = (me: PointerEvent) => {
        const pos = axis === 'horizontal' ? (me.clientY - panY) / zoom : (me.clientX - panX) / zoom;
        onMoveGuide(id, Math.round(pos));
      };
      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    },
    [zoom, panX, panY, onMoveGuide],
  );

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
      style={{ overflow: 'visible' }}
    >
      {/* Horizontal ruler background — drag down to create horizontal guide */}
      <rect
        x={RULER_SIZE}
        y={0}
        width="100%"
        height={RULER_SIZE}
        fill="var(--vscode-editor-background)"
        opacity={0.8}
        style={{ pointerEvents: 'auto', cursor: 'ns-resize' }}
        onPointerDown={(e) => {
          e.preventDefault();
          const pos = (e.clientY - panY) / zoom;
          onAddGuide('horizontal', Math.round(pos));
        }}
      />
      {/* Vertical ruler background — drag right to create vertical guide */}
      <rect
        x={0}
        y={RULER_SIZE}
        width={RULER_SIZE}
        height="100%"
        fill="var(--vscode-editor-background)"
        opacity={0.8}
        style={{ pointerEvents: 'auto', cursor: 'ew-resize' }}
        onPointerDown={(e) => {
          e.preventDefault();
          const pos = (e.clientX - panX) / zoom;
          onAddGuide('vertical', Math.round(pos));
        }}
      />

      {/* Horizontal ruler ticks */}
      {hTicks.map((x) => {
        const sx = toScreenX(x);
        return (
          <g key={`ht-${x}`}>
            <line
              x1={sx}
              y1={0}
              x2={sx}
              y2={RULER_SIZE}
              stroke="var(--sketch-text-secondary)"
              strokeWidth={0.5}
            />
            <text x={sx + 2} y={RULER_SIZE - 3} fill="var(--sketch-text-secondary)" fontSize={8}>
              {x}
            </text>
          </g>
        );
      })}

      {/* Vertical ruler ticks */}
      {vTicks.map((y) => {
        const sy = toScreenY(y);
        return (
          <g key={`vt-${y}`}>
            <line
              x1={0}
              y1={sy}
              x2={RULER_SIZE}
              y2={sy}
              stroke="var(--sketch-text-secondary)"
              strokeWidth={0.5}
            />
            <text x={2} y={sy - 2} fill="var(--sketch-text-secondary)" fontSize={8}>
              {y}
            </text>
          </g>
        );
      })}

      {/* Guide lines */}
      {guides.map((g) => {
        if (g.axis === 'horizontal') {
          const sy = toScreenY(g.position);
          return (
            <line
              key={g.id}
              x1={0}
              y1={sy}
              x2="100%"
              y2={sy}
              stroke="rgba(0,200,255,0.5)"
              strokeWidth={1}
              strokeDasharray="6 3"
              style={{ pointerEvents: 'auto', cursor: 'ns-resize' }}
              onPointerDown={(e) => handleGuideDrag(g.id, 'horizontal', e)}
              onDoubleClick={() => onRemoveGuide(g.id)}
            />
          );
        }
        const sx = toScreenX(g.position);
        return (
          <line
            key={g.id}
            x1={sx}
            y1={0}
            x2={sx}
            y2="100%"
            stroke="rgba(0,200,255,0.5)"
            strokeWidth={1}
            strokeDasharray="6 3"
            style={{ pointerEvents: 'auto', cursor: 'ew-resize' }}
            onPointerDown={(e) => handleGuideDrag(g.id, 'vertical', e)}
            onDoubleClick={() => onRemoveGuide(g.id)}
          />
        );
      })}
    </svg>
  );
}
