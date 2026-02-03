/**
 * useCoordinateMapping - 坐标映射 Hook
 * Canvas pixel coordinates <-> Project relative coordinates (0-1)
 *
 * Handles letterbox/pillarbox scenarios where canvas aspect ratio
 * differs from project aspect ratio.
 */

import { useCallback, useMemo } from 'react';

export interface CoordinateMappingOptions {
  /** Canvas display rect (from getBoundingClientRect) */
  canvasRect: DOMRect | null;
  /** Project resolution */
  projectWidth: number;
  projectHeight: number;
}

export interface CoordinateMapper {
  /** Convert canvas pixel coordinates to project relative coordinates (0-1) */
  canvasToProject: (canvasX: number, canvasY: number) => { x: number; y: number };
  /** Convert project relative coordinates to canvas pixel coordinates */
  projectToCanvas: (projectX: number, projectY: number) => { x: number; y: number };
  /** Get the effective canvas area (excluding letterbox/pillarbox) */
  getEffectiveArea: () => {
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  };
  /** Check if a point is within the effective canvas area */
  isPointInEffectiveArea: (canvasX: number, canvasY: number) => boolean;
}

/**
 * Hook for coordinate mapping between canvas and project space
 */
export function useCoordinateMapping(options: CoordinateMappingOptions): CoordinateMapper {
  const { canvasRect, projectWidth, projectHeight } = options;

  // Calculate effective area considering aspect ratio
  const effectiveArea = useMemo(() => {
    if (!canvasRect || canvasRect.width === 0 || canvasRect.height === 0) {
      return { offsetX: 0, offsetY: 0, width: 0, height: 0 };
    }

    const canvasAspect = canvasRect.width / canvasRect.height;
    const projectAspect = projectWidth / projectHeight;

    let offsetX = 0;
    let offsetY = 0;
    let effectiveWidth = canvasRect.width;
    let effectiveHeight = canvasRect.height;

    if (canvasAspect > projectAspect) {
      // Canvas is wider - pillarbox (black bars on sides)
      effectiveWidth = canvasRect.height * projectAspect;
      offsetX = (canvasRect.width - effectiveWidth) / 2;
    } else if (canvasAspect < projectAspect) {
      // Canvas is taller - letterbox (black bars top/bottom)
      effectiveHeight = canvasRect.width / projectAspect;
      offsetY = (canvasRect.height - effectiveHeight) / 2;
    }

    return { offsetX, offsetY, width: effectiveWidth, height: effectiveHeight };
  }, [canvasRect, projectWidth, projectHeight]);

  // Canvas pixel -> Project relative (0-1)
  const canvasToProject = useCallback(
    (canvasX: number, canvasY: number): { x: number; y: number } => {
      if (effectiveArea.width === 0 || effectiveArea.height === 0) {
        return { x: 0, y: 0 };
      }

      // Subtract offset and normalize
      const relX = (canvasX - effectiveArea.offsetX) / effectiveArea.width;
      const relY = (canvasY - effectiveArea.offsetY) / effectiveArea.height;

      return { x: relX, y: relY };
    },
    [effectiveArea]
  );

  // Project relative (0-1) -> Canvas pixel
  const projectToCanvas = useCallback(
    (projectX: number, projectY: number): { x: number; y: number } => {
      const canvasX = projectX * effectiveArea.width + effectiveArea.offsetX;
      const canvasY = projectY * effectiveArea.height + effectiveArea.offsetY;

      return { x: canvasX, y: canvasY };
    },
    [effectiveArea]
  );

  // Get effective area
  const getEffectiveArea = useCallback(() => effectiveArea, [effectiveArea]);

  // Check if point is in effective area
  const isPointInEffectiveArea = useCallback(
    (canvasX: number, canvasY: number): boolean => {
      const { offsetX, offsetY, width, height } = effectiveArea;
      return (
        canvasX >= offsetX &&
        canvasX <= offsetX + width &&
        canvasY >= offsetY &&
        canvasY <= offsetY + height
      );
    },
    [effectiveArea]
  );

  return {
    canvasToProject,
    projectToCanvas,
    getEffectiveArea,
    isPointInEffectiveArea,
  };
}
