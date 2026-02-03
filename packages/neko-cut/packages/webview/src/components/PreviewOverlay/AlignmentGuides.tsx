/**
 * AlignmentGuides - 对齐辅助线组件
 * Shows alignment guides when elements are being moved
 */

import { memo, useMemo } from 'react';
import type { CoordinateMapper } from './hooks/useCoordinateMapping';

export interface AlignmentGuide {
  type: 'horizontal' | 'vertical';
  position: number; // In project coordinates (0-1)
  label?: string;
}

export interface AlignmentGuidesProps {
  /** Active guides to display */
  guides: AlignmentGuide[];
  /** Coordinate mapper */
  coordinateMapper: CoordinateMapper;
  /** Guide color */
  color?: string;
}

/**
 * Alignment guides component
 */
export const AlignmentGuides = memo(function AlignmentGuides({
  guides,
  coordinateMapper,
  color = '#ff00ff',
}: AlignmentGuidesProps) {
  const effectiveArea = coordinateMapper.getEffectiveArea();

  const renderedGuides = useMemo(() => {
    return guides.map((guide, index) => {
      if (guide.type === 'horizontal') {
        const canvasPos = coordinateMapper.projectToCanvas(0, guide.position);
        return (
          <line
            key={`h-${index}`}
            x1={effectiveArea.offsetX}
            y1={canvasPos.y}
            x2={effectiveArea.offsetX + effectiveArea.width}
            y2={canvasPos.y}
            stroke={color}
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        );
      } else {
        const canvasPos = coordinateMapper.projectToCanvas(guide.position, 0);
        return (
          <line
            key={`v-${index}`}
            x1={canvasPos.x}
            y1={effectiveArea.offsetY}
            x2={canvasPos.x}
            y2={effectiveArea.offsetY + effectiveArea.height}
            stroke={color}
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        );
      }
    });
  }, [guides, coordinateMapper, effectiveArea, color]);

  if (guides.length === 0) {
    return null;
  }

  return (
    <svg
      className="absolute inset-0 pointer-events-none overflow-visible"
      style={{ width: '100%', height: '100%' }}
    >
      {renderedGuides}
    </svg>
  );
});

/**
 * Calculate alignment guides for an element being moved
 */
export function calculateAlignmentGuides(
  elementX: number,
  elementY: number,
  elementWidth: number,
  elementHeight: number,
  snapThreshold: number = 0.02 // 2% of canvas
): AlignmentGuide[] {
  const guides: AlignmentGuide[] = [];

  // Element bounds
  const left = elementX - elementWidth / 2;
  const right = elementX + elementWidth / 2;
  const top = elementY - elementHeight / 2;
  const bottom = elementY + elementHeight / 2;

  // Check center alignment
  if (Math.abs(elementX - 0.5) < snapThreshold) {
    guides.push({ type: 'vertical', position: 0.5, label: 'Center' });
  }
  if (Math.abs(elementY - 0.5) < snapThreshold) {
    guides.push({ type: 'horizontal', position: 0.5, label: 'Center' });
  }

  // Check edge alignment (to canvas edges)
  if (Math.abs(left) < snapThreshold) {
    guides.push({ type: 'vertical', position: 0 });
  }
  if (Math.abs(right - 1) < snapThreshold) {
    guides.push({ type: 'vertical', position: 1 });
  }
  if (Math.abs(top) < snapThreshold) {
    guides.push({ type: 'horizontal', position: 0 });
  }
  if (Math.abs(bottom - 1) < snapThreshold) {
    guides.push({ type: 'horizontal', position: 1 });
  }

  return guides;
}

/**
 * Snap a position to alignment guides
 */
export function snapToGuides(
  x: number,
  y: number,
  width: number,
  height: number,
  snapThreshold: number = 0.02
): { x: number; y: number; snappedX: boolean; snappedY: boolean } {
  let snappedX = false;
  let snappedY = false;
  let newX = x;
  let newY = y;

  // Element bounds
  const left = x - width / 2;
  const right = x + width / 2;
  const top = y - height / 2;
  const bottom = y + height / 2;

  // Snap to center
  if (Math.abs(x - 0.5) < snapThreshold) {
    newX = 0.5;
    snappedX = true;
  }
  if (Math.abs(y - 0.5) < snapThreshold) {
    newY = 0.5;
    snappedY = true;
  }

  // Snap to edges (prioritize if closer than center)
  if (!snappedX) {
    if (Math.abs(left) < snapThreshold) {
      newX = width / 2;
      snappedX = true;
    } else if (Math.abs(right - 1) < snapThreshold) {
      newX = 1 - width / 2;
      snappedX = true;
    }
  }

  if (!snappedY) {
    if (Math.abs(top) < snapThreshold) {
      newY = height / 2;
      snappedY = true;
    } else if (Math.abs(bottom - 1) < snapThreshold) {
      newY = 1 - height / 2;
      snappedY = true;
    }
  }

  return { x: newX, y: newY, snappedX, snappedY };
}
