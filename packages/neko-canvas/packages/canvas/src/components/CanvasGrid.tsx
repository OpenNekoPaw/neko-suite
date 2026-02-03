/**
 * CanvasGrid - Background grid component
 * Renders a dot grid pattern that scales with zoom
 */

import { useMemo } from 'react';
import type { CanvasViewport } from '@neko/shared';

// =============================================================================
// Constants
// =============================================================================

export const GRID_SIZE = 20;
export const GRID_MAJOR_INTERVAL = 5;

// =============================================================================
// Types
// =============================================================================

export interface CanvasGridProps {
  viewport: CanvasViewport;
  width: number;
  height: number;
}

// =============================================================================
// Component
// =============================================================================

export function CanvasGrid({ viewport, width, height }: CanvasGridProps) {
  // Calculate grid pattern based on zoom level
  const gridPattern = useMemo(() => {
    const { zoom, pan } = viewport;

    // Adjust grid size based on zoom
    let effectiveGridSize = GRID_SIZE;
    if (zoom < 0.5) {
      effectiveGridSize = GRID_SIZE * 2;
    } else if (zoom < 0.25) {
      effectiveGridSize = GRID_SIZE * 4;
    }

    const scaledGridSize = effectiveGridSize * zoom;

    // Calculate offset to align grid with pan
    const offsetX = pan.x % scaledGridSize;
    const offsetY = pan.y % scaledGridSize;

    return {
      gridSize: scaledGridSize,
      offsetX,
      offsetY,
      majorInterval: GRID_MAJOR_INTERVAL,
    };
  }, [viewport]);

  // Generate grid dots
  const dots = useMemo(() => {
    const { gridSize, offsetX, offsetY, majorInterval } = gridPattern;
    const result: Array<{ x: number; y: number; isMajor: boolean }> = [];

    // Calculate number of dots needed
    const cols = Math.ceil(width / gridSize) + 2;
    const rows = Math.ceil(height / gridSize) + 2;

    // Calculate starting indices for major grid alignment
    const startCol = Math.floor(-offsetX / gridSize);
    const startRow = Math.floor(-offsetY / gridSize);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = offsetX + col * gridSize;
        const y = offsetY + row * gridSize;

        // Skip dots outside visible area
        if (x < -gridSize || x > width + gridSize || y < -gridSize || y > height + gridSize) {
          continue;
        }

        // Determine if this is a major grid point
        const globalCol = startCol + col;
        const globalRow = startRow + row;
        const isMajor = globalCol % majorInterval === 0 && globalRow % majorInterval === 0;

        result.push({ x, y, isMajor });
      }
    }

    return result;
  }, [gridPattern, width, height]);

  // Don't render too many dots at low zoom
  if (viewport.zoom < 0.15) {
    return (
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundColor: 'var(--canvas-bg)',
        }}
      />
    );
  }

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={width}
      height={height}
      style={{ overflow: 'hidden' }}
    >
      {/* Background */}
      <rect width={width} height={height} fill="var(--canvas-bg)" />

      {/* Grid dots */}
      {dots.map((dot, index) => (
        <circle
          key={index}
          cx={dot.x}
          cy={dot.y}
          r={dot.isMajor ? 1.5 : 1}
          fill={dot.isMajor ? 'var(--canvas-grid-major)' : 'var(--canvas-grid)'}
        />
      ))}
    </svg>
  );
}
