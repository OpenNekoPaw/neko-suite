/**
 * PixelGrid - pixel grid overlay for pixel art mode
 *
 * Renders a grid overlay when zoom is high enough to see individual pixels.
 */
import { useMemo } from 'react';
import { useSketchStore } from '../stores';

interface PixelGridProps {
  canvasWidth: number;
  canvasHeight: number;
}

export function PixelGrid({ canvasWidth, canvasHeight }: PixelGridProps) {
  const zoom = useSketchStore((s) => s.viewport.zoom);
  const activeTool = useSketchStore((s) => s.activeTool);

  // Only show grid when zoomed in enough and using pixel tool
  const showGrid = activeTool === 'pixel' && zoom >= 4;

  const gridStyle = useMemo(() => {
    if (!showGrid) return null;
    const cellSize = zoom;
    return {
      backgroundSize: `${cellSize}px ${cellSize}px`,
      backgroundImage:
        'linear-gradient(to right, var(--vscode-editorIndentGuide-background) 1px, transparent 1px), ' +
        'linear-gradient(to bottom, var(--vscode-editorIndentGuide-background) 1px, transparent 1px)',
      opacity: 0.3,
    };
  }, [showGrid, zoom]);

  if (!gridStyle) return null;

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        width: canvasWidth * zoom,
        height: canvasHeight * zoom,
        ...gridStyle,
      }}
      aria-hidden="true"
    />
  );
}
