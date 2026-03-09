/**
 * MiniMap - Mini map component
 * Shows a bird's eye view of the canvas with current viewport indicator
 */

import { useMemo, useCallback, useRef } from 'react';
import type { CanvasNode, CanvasViewport } from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

export interface MiniMapProps {
  nodes: CanvasNode[];
  viewport: CanvasViewport;
  containerWidth: number;
  containerHeight: number;
  onViewportChange: (viewport: Partial<CanvasViewport>) => void;
  width?: number;
  height?: number;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_WIDTH = 200;
const DEFAULT_HEIGHT = 150;
const PADDING = 20;

// =============================================================================
// Helpers
// =============================================================================

function calculateBounds(nodes: CanvasNode[]): Bounds {
  if (nodes.length === 0) {
    return {
      minX: -500,
      minY: -500,
      maxX: 500,
      maxY: 500,
      width: 1000,
      height: 1000,
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + node.size.width);
    maxY = Math.max(maxY, node.position.y + node.size.height);
  }

  // Add some padding
  minX -= PADDING;
  minY -= PADDING;
  maxX += PADDING;
  maxY += PADDING;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

// =============================================================================
// Component
// =============================================================================

export function MiniMap({
  nodes,
  viewport,
  containerWidth,
  containerHeight,
  onViewportChange,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
}: MiniMapProps) {
  const miniMapRef = useRef<HTMLDivElement>(null);

  // Calculate content bounds
  const bounds = useMemo(() => calculateBounds(nodes), [nodes]);

  // Calculate scale to fit content in minimap
  const scale = useMemo(() => {
    const scaleX = (width - 20) / bounds.width;
    const scaleY = (height - 20) / bounds.height;
    return Math.min(scaleX, scaleY, 1);
  }, [width, height, bounds]);

  // Calculate viewport rectangle in minimap coordinates
  const viewportRect = useMemo(() => {
    // Visible area in canvas coordinates
    const visibleWidth = containerWidth / viewport.zoom;
    const visibleHeight = containerHeight / viewport.zoom;
    const visibleX = -viewport.pan.x / viewport.zoom;
    const visibleY = -viewport.pan.y / viewport.zoom;

    // Convert to minimap coordinates
    return {
      x: (visibleX - bounds.minX) * scale + 10,
      y: (visibleY - bounds.minY) * scale + 10,
      width: visibleWidth * scale,
      height: visibleHeight * scale,
    };
  }, [viewport, containerWidth, containerHeight, bounds, scale]);

  // Handle click on minimap to pan
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const rect = miniMapRef.current?.getBoundingClientRect();
      if (!rect) return;

      // Click position in minimap
      const clickX = e.clientX - rect.left - 10;
      const clickY = e.clientY - rect.top - 10;

      // Convert to canvas coordinates
      const canvasX = clickX / scale + bounds.minX;
      const canvasY = clickY / scale + bounds.minY;

      // Calculate new pan to center on clicked point
      const newPanX = -(canvasX - containerWidth / viewport.zoom / 2) * viewport.zoom;
      const newPanY = -(canvasY - containerHeight / viewport.zoom / 2) * viewport.zoom;

      onViewportChange({
        pan: { x: newPanX, y: newPanY },
      });
    },
    [scale, bounds, containerWidth, containerHeight, viewport.zoom, onViewportChange],
  );

  return (
    <div
      ref={miniMapRef}
      className="rounded-lg shadow-lg overflow-hidden cursor-pointer"
      style={{
        width,
        height,
        backgroundColor: 'var(--canvas-bg)',
        border: '1px solid var(--control-border)',
      }}
      onClick={handleClick}
    >
      {/* Content layer */}
      <svg width={width} height={height}>
        {/* Background */}
        <rect width={width} height={height} fill="var(--canvas-bg)" />

        {/* Nodes */}
        <g transform={`translate(10, 10)`}>
          {nodes.map((node) => {
            const x = (node.position.x - bounds.minX) * scale;
            const y = (node.position.y - bounds.minY) * scale;
            const w = node.size.width * scale;
            const h = node.size.height * scale;

            // Color based on node type
            let fill = '#4a4a4a';
            switch (node.type) {
              case 'media':
                fill = '#4ec9b0';
                break;
              case 'storyboard':
                fill = '#ce9178';
                break;
              case 'annotation':
                fill = '#dcdcaa';
                break;
              case 'group':
                fill = '#569cd6';
                break;
            }

            return (
              <rect
                key={node.id}
                x={x}
                y={y}
                width={Math.max(w, 2)}
                height={Math.max(h, 2)}
                fill={fill}
                opacity={0.8}
                rx={1}
              />
            );
          })}
        </g>

        {/* Viewport indicator */}
        <rect
          x={viewportRect.x}
          y={viewportRect.y}
          width={viewportRect.width}
          height={viewportRect.height}
          fill="none"
          stroke="var(--node-selected)"
          strokeWidth={2}
          opacity={0.8}
        />
      </svg>

      {/* Label */}
      <div
        className="absolute bottom-1 left-2 text-[10px] pointer-events-none"
        style={{ color: 'var(--toolbar-fg-secondary)' }}
      >
        {Math.round(viewport.zoom * 100)}%
      </div>
    </div>
  );
}
