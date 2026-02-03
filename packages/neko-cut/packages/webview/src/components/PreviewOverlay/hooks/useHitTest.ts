/**
 * useHitTest - 命中测试 Hook
 * Determines which element is at a given position
 */

import { useCallback } from 'react';
import type { TimelineElement } from '@neko/shared';
import type { CoordinateMapper } from './useCoordinateMapping';

export interface ElementBounds {
  elementId: string;
  trackId: string;
  // Bounds in project coordinates (0-1)
  left: number;
  top: number;
  right: number;
  bottom: number;
  // Transform info for rotation handling
  centerX: number;
  centerY: number;
  rotation: number;
}

export interface HitTestResult {
  elementId: string;
  trackId: string;
  element: TimelineElement;
}

export interface ControlPointHit {
  type: 'corner' | 'edge' | 'rotate';
  position: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate';
  elementId: string;
  trackId: string;
}

interface Track {
  id: string;
  elements: TimelineElement[];
}

export interface HitTestOptions {
  /** All tracks in the project */
  tracks: Track[];
  /** Current playback time */
  currentTime: number;
  /** Coordinate mapper */
  coordinateMapper: CoordinateMapper;
  /** Control point hit radius in canvas pixels */
  controlPointRadius?: number;
}

/**
 * Get element bounds in project coordinates (0-1)
 */
function getElementBounds(element: TimelineElement): ElementBounds | null {
  const transform = element.transform;

  // Default transform values
  const x = transform?.x ?? 0.5;
  const y = transform?.y ?? 0.5;
  const scaleX = transform?.scaleX ?? 1;
  const scaleY = transform?.scaleY ?? 1;
  const rotation = transform?.rotation ?? 0;

  // For simplicity, assume element occupies full canvas at scale 1
  // Actual implementation would need element dimensions
  const width = scaleX;
  const height = scaleY;

  // Calculate bounds (centered at x, y)
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  return {
    elementId: element.id,
    trackId: '', // Will be set by caller
    left: x - halfWidth,
    top: y - halfHeight,
    right: x + halfWidth,
    bottom: y + halfHeight,
    centerX: x,
    centerY: y,
    rotation,
  };
}

/**
 * Check if a point is inside rotated rectangle
 */
function isPointInRotatedRect(
  pointX: number,
  pointY: number,
  bounds: ElementBounds
): boolean {
  const { centerX, centerY, left, top, right, bottom, rotation } = bounds;

  // If no rotation, simple bounds check
  if (rotation === 0) {
    return pointX >= left && pointX <= right && pointY >= top && pointY <= bottom;
  }

  // Transform point to element's local coordinate system
  const rad = (-rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Translate point to origin (element center)
  const dx = pointX - centerX;
  const dy = pointY - centerY;

  // Rotate point
  const localX = dx * cos - dy * sin + centerX;
  const localY = dx * sin + dy * cos + centerY;

  // Check bounds in local space
  return localX >= left && localX <= right && localY >= top && localY <= bottom;
}

/**
 * Hook for hit testing elements at a given position
 */
export function useHitTest(options: HitTestOptions) {
  const { tracks, currentTime, coordinateMapper, controlPointRadius = 8 } = options;

  /**
   * Get all visible elements at current time
   */
  const getVisibleElements = useCallback((): Array<{ element: TimelineElement; trackId: string }> => {
    const visible: Array<{ element: TimelineElement; trackId: string }> = [];

    for (const track of tracks) {
      for (const element of track.elements) {
        // Check if element is visible at current time
        const effectiveStart = element.startTime + element.trimStart;
        const effectiveEnd = element.startTime + element.duration - element.trimEnd;

        if (currentTime >= effectiveStart && currentTime < effectiveEnd) {
          // Skip hidden or audio-only elements
          if (element.hidden) continue;
          if (element.type === 'audio') continue;

          visible.push({ element, trackId: track.id });
        }
      }
    }

    return visible;
  }, [tracks, currentTime]);

  /**
   * Hit test at canvas coordinates
   * Returns the topmost element at the position
   */
  const hitTest = useCallback(
    (canvasX: number, canvasY: number): HitTestResult | null => {
      const projectPos = coordinateMapper.canvasToProject(canvasX, canvasY);
      const visibleElements = getVisibleElements();

      // Iterate in reverse order (top elements first)
      for (let i = visibleElements.length - 1; i >= 0; i--) {
        const { element, trackId } = visibleElements[i];
        const bounds = getElementBounds(element);

        if (bounds && isPointInRotatedRect(projectPos.x, projectPos.y, bounds)) {
          return { elementId: element.id, trackId, element };
        }
      }

      return null;
    },
    [coordinateMapper, getVisibleElements]
  );

  /**
   * Hit test for control points of a selected element
   */
  const hitTestControlPoint = useCallback(
    (
      canvasX: number,
      canvasY: number,
      selectedElementId: string,
      selectedTrackId: string
    ): ControlPointHit | null => {
      // Find the selected element
      let selectedElement: TimelineElement | null = null;
      for (const track of tracks) {
        if (track.id === selectedTrackId) {
          selectedElement = track.elements.find((e) => e.id === selectedElementId) ?? null;
          break;
        }
      }

      if (!selectedElement) return null;

      const bounds = getElementBounds(selectedElement);
      if (!bounds) return null;

      // Get control point positions in canvas coordinates
      const { left, top, right, bottom, centerX, centerY } = bounds;

      const controlPoints: Array<{
        position: ControlPointHit['position'];
        type: ControlPointHit['type'];
        x: number;
        y: number;
      }> = [
        { position: 'nw', type: 'corner', x: left, y: top },
        { position: 'n', type: 'edge', x: centerX, y: top },
        { position: 'ne', type: 'corner', x: right, y: top },
        { position: 'e', type: 'edge', x: right, y: centerY },
        { position: 'se', type: 'corner', x: right, y: bottom },
        { position: 's', type: 'edge', x: centerX, y: bottom },
        { position: 'sw', type: 'corner', x: left, y: bottom },
        { position: 'w', type: 'edge', x: left, y: centerY },
        // Rotation handle at top center, offset above
        { position: 'rotate', type: 'rotate', x: centerX, y: top - 0.05 },
      ];

      const projectPos = coordinateMapper.canvasToProject(canvasX, canvasY);
      const effectiveArea = coordinateMapper.getEffectiveArea();

      // Hit radius in project coordinates
      const hitRadiusX = controlPointRadius / effectiveArea.width;
      const hitRadiusY = controlPointRadius / effectiveArea.height;

      for (const cp of controlPoints) {
        const dx = projectPos.x - cp.x;
        const dy = projectPos.y - cp.y;

        // Elliptical hit test
        if ((dx * dx) / (hitRadiusX * hitRadiusX) + (dy * dy) / (hitRadiusY * hitRadiusY) <= 1) {
          return {
            type: cp.type,
            position: cp.position,
            elementId: selectedElementId,
            trackId: selectedTrackId,
          };
        }
      }

      return null;
    },
    [tracks, coordinateMapper, controlPointRadius]
  );

  /**
   * Hit test for multiple elements in a rect (for box selection)
   */
  const hitTestRect = useCallback(
    (
      canvasX1: number,
      canvasY1: number,
      canvasX2: number,
      canvasY2: number
    ): HitTestResult[] => {
      const p1 = coordinateMapper.canvasToProject(canvasX1, canvasY1);
      const p2 = coordinateMapper.canvasToProject(canvasX2, canvasY2);

      const rectLeft = Math.min(p1.x, p2.x);
      const rectRight = Math.max(p1.x, p2.x);
      const rectTop = Math.min(p1.y, p2.y);
      const rectBottom = Math.max(p1.y, p2.y);

      const visibleElements = getVisibleElements();
      const results: HitTestResult[] = [];

      for (const { element, trackId } of visibleElements) {
        const bounds = getElementBounds(element);
        if (!bounds) continue;

        // Check if element bounds intersect with selection rect
        const intersects =
          bounds.left < rectRight &&
          bounds.right > rectLeft &&
          bounds.top < rectBottom &&
          bounds.bottom > rectTop;

        if (intersects) {
          results.push({ elementId: element.id, trackId, element });
        }
      }

      return results;
    },
    [coordinateMapper, getVisibleElements]
  );

  return {
    hitTest,
    hitTestControlPoint,
    hitTestRect,
    getVisibleElements,
  };
}
