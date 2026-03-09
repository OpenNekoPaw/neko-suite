/**
 * useCanvasCoordinates - Canvas coordinate mapping hook
 * Converts between screen coordinates and canvas coordinates
 */

import { useCallback, useMemo } from 'react';
import type { CanvasViewport } from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

export interface UseCanvasCoordinatesOptions {
  containerRef: React.RefObject<HTMLElement>;
  viewport: CanvasViewport;
}

export interface CanvasCoordinateMapper {
  /** Screen pixel -> Canvas coordinate */
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number };
  /** Canvas coordinate -> Screen pixel */
  canvasToScreen: (canvasX: number, canvasY: number) => { x: number; y: number };
  /** Get visible canvas bounds */
  getVisibleBounds: () => { x: number; y: number; width: number; height: number };
  /** Check if canvas point is visible */
  isPointVisible: (canvasX: number, canvasY: number) => boolean;
  /** Check if canvas rect intersects viewport */
  isRectVisible: (rect: { x: number; y: number; width: number; height: number }) => boolean;
}

// =============================================================================
// Hook
// =============================================================================

export function useCanvasCoordinates(options: UseCanvasCoordinatesOptions): CanvasCoordinateMapper {
  const { containerRef, viewport } = options;

  // Screen to canvas coordinate conversion
  const screenToCanvas = useCallback(
    (screenX: number, screenY: number) => {
      const container = containerRef.current;
      if (!container) {
        return { x: screenX, y: screenY };
      }

      const rect = container.getBoundingClientRect();
      const relativeX = screenX - rect.left;
      const relativeY = screenY - rect.top;

      // Convert from screen space to canvas space
      const canvasX = (relativeX - viewport.pan.x) / viewport.zoom;
      const canvasY = (relativeY - viewport.pan.y) / viewport.zoom;

      return { x: canvasX, y: canvasY };
    },
    [containerRef, viewport.pan.x, viewport.pan.y, viewport.zoom],
  );

  // Canvas to screen coordinate conversion
  const canvasToScreen = useCallback(
    (canvasX: number, canvasY: number) => {
      const container = containerRef.current;
      if (!container) {
        return { x: canvasX, y: canvasY };
      }

      const rect = container.getBoundingClientRect();

      // Convert from canvas space to screen space
      const screenX = canvasX * viewport.zoom + viewport.pan.x + rect.left;
      const screenY = canvasY * viewport.zoom + viewport.pan.y + rect.top;

      return { x: screenX, y: screenY };
    },
    [containerRef, viewport.pan.x, viewport.pan.y, viewport.zoom],
  );

  // Get visible canvas bounds
  const getVisibleBounds = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    const rect = container.getBoundingClientRect();

    // Top-left corner in canvas coordinates
    const topLeft = {
      x: -viewport.pan.x / viewport.zoom,
      y: -viewport.pan.y / viewport.zoom,
    };

    // Size in canvas coordinates
    const width = rect.width / viewport.zoom;
    const height = rect.height / viewport.zoom;

    return {
      x: topLeft.x,
      y: topLeft.y,
      width,
      height,
    };
  }, [containerRef, viewport.pan.x, viewport.pan.y, viewport.zoom]);

  // Check if a canvas point is visible
  const isPointVisible = useCallback(
    (canvasX: number, canvasY: number) => {
      const bounds = getVisibleBounds();
      return (
        canvasX >= bounds.x &&
        canvasX <= bounds.x + bounds.width &&
        canvasY >= bounds.y &&
        canvasY <= bounds.y + bounds.height
      );
    },
    [getVisibleBounds],
  );

  // Check if a canvas rect intersects the viewport
  const isRectVisible = useCallback(
    (rect: { x: number; y: number; width: number; height: number }) => {
      const bounds = getVisibleBounds();

      // Check for intersection
      return !(
        rect.x + rect.width < bounds.x ||
        rect.x > bounds.x + bounds.width ||
        rect.y + rect.height < bounds.y ||
        rect.y > bounds.y + bounds.height
      );
    },
    [getVisibleBounds],
  );

  // Memoize the mapper object
  const mapper = useMemo<CanvasCoordinateMapper>(
    () => ({
      screenToCanvas,
      canvasToScreen,
      getVisibleBounds,
      isPointVisible,
      isRectVisible,
    }),
    [screenToCanvas, canvasToScreen, getVisibleBounds, isPointVisible, isRectVisible],
  );

  return mapper;
}
