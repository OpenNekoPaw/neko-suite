/**
 * TransformOverlay - SVG overlay for transform handles
 *
 * Renders 8 scale handles + 1 rotate handle around the active layer bounds.
 * Visible only when the transform tool is active and a transform is in progress.
 */
import type { TransformState, HandleType } from '../tools/transform-tool';
import { getHandlePositions } from '../tools/transform-tool';
import type { ViewportState } from '../types';
import { documentToScreenPoint } from '../utils/viewport-transform';

interface TransformOverlayProps {
  transform: TransformState;
  viewport: ViewportState;
  canvasWidth: number;
  canvasHeight: number;
}

const HANDLE_SIZE = 6;

const HANDLE_CURSORS: Record<HandleType, string> = {
  tl: 'nwse-resize',
  tc: 'ns-resize',
  tr: 'nesw-resize',
  ml: 'ew-resize',
  mr: 'ew-resize',
  bl: 'nesw-resize',
  bc: 'ns-resize',
  br: 'nwse-resize',
  rotate: 'grab',
};

export function TransformOverlay({
  transform,
  viewport,
  canvasWidth,
  canvasHeight,
}: TransformOverlayProps) {
  const { bounds, matrix } = transform;
  const handles = getHandlePositions(bounds, matrix);
  const viewportSize = { width: canvasWidth, height: canvasHeight };

  // Convert document coords to screen coords
  const toScreen = (dx: number, dy: number) =>
    documentToScreenPoint({ x: dx, y: dy }, viewport, viewportSize);

  const corners = {
    tl: toScreen(handles.tl.x, handles.tl.y),
    tr: toScreen(handles.tr.x, handles.tr.y),
    bl: toScreen(handles.bl.x, handles.bl.y),
    br: toScreen(handles.br.x, handles.br.y),
  };

  // Bounding box path
  const boxPath = `M${corners.tl.x},${corners.tl.y} L${corners.tr.x},${corners.tr.y} L${corners.br.x},${corners.br.y} L${corners.bl.x},${corners.bl.y} Z`;

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
      style={{ overflow: 'visible' }}
    >
      {/* Bounding box outline */}
      <path
        d={boxPath}
        fill="none"
        stroke="rgba(59,130,246,0.8)"
        strokeWidth={1}
        strokeDasharray="4 4"
      />

      {/* Handle squares */}
      {(Object.entries(handles) as [HandleType, { x: number; y: number }][]).map(([type, pos]) => {
        const screen = toScreen(pos.x, pos.y);
        const isRotate = type === 'rotate';
        return (
          <rect
            key={type}
            x={screen.x - HANDLE_SIZE / 2}
            y={screen.y - HANDLE_SIZE / 2}
            width={HANDLE_SIZE}
            height={HANDLE_SIZE}
            rx={isRotate ? HANDLE_SIZE / 2 : 1}
            fill={isRotate ? 'rgba(59,130,246,0.9)' : 'white'}
            stroke="rgba(59,130,246,0.9)"
            strokeWidth={1}
            style={{ cursor: HANDLE_CURSORS[type], pointerEvents: 'auto' }}
          />
        );
      })}
    </svg>
  );
}
