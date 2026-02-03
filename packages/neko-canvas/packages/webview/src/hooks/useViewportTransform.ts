/**
 * useViewportTransform - Viewport transformation hook
 * Handles pan (drag) and zoom (wheel) operations
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { CanvasViewport } from '@neko/shared';

// =============================================================================
// Constants
// =============================================================================

/** 最小缩放比例 (5%) */
export const MIN_ZOOM = 0.05;
/** 最大缩放比例 (1600%) */
export const MAX_ZOOM = 16;
/** 滚轮缩放灵敏度 */
export const ZOOM_WHEEL_SENSITIVITY = 0.001;
/** 预设缩放级别 */
export const ZOOM_PRESETS = [0.05, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 4, 8, 16];

// =============================================================================
// Types
// =============================================================================

export interface ViewportTransformState {
  isPanning: boolean;
  startPan: { x: number; y: number };
  startViewport: CanvasViewport;
}

export interface UseViewportTransformOptions {
  viewport: CanvasViewport;
  onViewportChange: (viewport: Partial<CanvasViewport>) => void;
  minZoom?: number;
  maxZoom?: number;
}

export interface UseViewportTransformReturn {
  state: ViewportTransformState;
  handlers: {
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseUp: () => void;
    onMouseLeave: () => void;
    onWheel: (e: React.WheelEvent) => void;
  };
  panTo: (position: { x: number; y: number }) => void;
  zoomTo: (zoom: number, center?: { x: number; y: number }) => void;
  fitContent: (bounds: { x: number; y: number; width: number; height: number }, containerSize: { width: number; height: number }) => void;
  resetViewport: () => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useViewportTransform(options: UseViewportTransformOptions): UseViewportTransformReturn {
  const {
    viewport,
    onViewportChange,
    minZoom = MIN_ZOOM,
    maxZoom = MAX_ZOOM,
  } = options;

  // State
  const [state, setState] = useState<ViewportTransformState>({
    isPanning: false,
    startPan: { x: 0, y: 0 },
    startViewport: { pan: { x: 0, y: 0 }, zoom: 1 },
  });

  // Track space key for pan mode
  const isSpacePressed = useRef(false);

  // Handle space key for pan mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        isSpacePressed.current = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpacePressed.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Mouse down - start panning
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    // Only pan with middle mouse button or space + left click
    const shouldPan = e.button === 1 || (e.button === 0 && isSpacePressed.current);

    if (!shouldPan) return;

    e.preventDefault();

    setState({
      isPanning: true,
      startPan: { x: e.clientX, y: e.clientY },
      startViewport: { ...viewport },
    });
  }, [viewport]);

  // Mouse move - update pan
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!state.isPanning) return;

    const deltaX = e.clientX - state.startPan.x;
    const deltaY = e.clientY - state.startPan.y;

    onViewportChange({
      pan: {
        x: state.startViewport.pan.x + deltaX,
        y: state.startViewport.pan.y + deltaY,
      },
    });
  }, [state.isPanning, state.startPan, state.startViewport, onViewportChange]);

  // Mouse up - end panning
  const onMouseUp = useCallback(() => {
    if (state.isPanning) {
      setState(prev => ({ ...prev, isPanning: false }));
    }
  }, [state.isPanning]);

  // Mouse leave - end panning
  const onMouseLeave = useCallback(() => {
    if (state.isPanning) {
      setState(prev => ({ ...prev, isPanning: false }));
    }
  }, [state.isPanning]);

  // Wheel - zoom
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();

    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Calculate zoom delta
    const delta = -e.deltaY * ZOOM_WHEEL_SENSITIVITY;
    const newZoom = Math.max(minZoom, Math.min(maxZoom, viewport.zoom * (1 + delta)));

    // Zoom towards mouse position
    const zoomRatio = newZoom / viewport.zoom;
    const newPanX = mouseX - (mouseX - viewport.pan.x) * zoomRatio;
    const newPanY = mouseY - (mouseY - viewport.pan.y) * zoomRatio;

    onViewportChange({
      zoom: newZoom,
      pan: { x: newPanX, y: newPanY },
    });
  }, [viewport, minZoom, maxZoom, onViewportChange]);

  // Programmatic pan
  const panTo = useCallback((position: { x: number; y: number }) => {
    onViewportChange({ pan: position });
  }, [onViewportChange]);

  // Programmatic zoom
  const zoomTo = useCallback((zoom: number, center?: { x: number; y: number }) => {
    const clampedZoom = Math.max(minZoom, Math.min(maxZoom, zoom));

    if (center) {
      const zoomRatio = clampedZoom / viewport.zoom;
      const newPanX = center.x - (center.x - viewport.pan.x) * zoomRatio;
      const newPanY = center.y - (center.y - viewport.pan.y) * zoomRatio;
      onViewportChange({ zoom: clampedZoom, pan: { x: newPanX, y: newPanY } });
    } else {
      onViewportChange({ zoom: clampedZoom });
    }
  }, [viewport, minZoom, maxZoom, onViewportChange]);

  // Fit content in view
  const fitContent = useCallback((
    bounds: { x: number; y: number; width: number; height: number },
    containerSize: { width: number; height: number }
  ) => {
    if (bounds.width === 0 || bounds.height === 0) {
      onViewportChange({ pan: { x: 0, y: 0 }, zoom: 1 });
      return;
    }

    const padding = 50;
    const availableWidth = containerSize.width - padding * 2;
    const availableHeight = containerSize.height - padding * 2;

    const scaleX = availableWidth / bounds.width;
    const scaleY = availableHeight / bounds.height;
    const zoom = Math.max(minZoom, Math.min(maxZoom, Math.min(scaleX, scaleY)));

    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;

    const panX = containerSize.width / 2 - centerX * zoom;
    const panY = containerSize.height / 2 - centerY * zoom;

    onViewportChange({ zoom, pan: { x: panX, y: panY } });
  }, [minZoom, maxZoom, onViewportChange]);

  // Reset viewport
  const resetViewport = useCallback(() => {
    onViewportChange({ pan: { x: 0, y: 0 }, zoom: 1 });
  }, [onViewportChange]);

  return {
    state,
    handlers: {
      onMouseDown,
      onMouseMove,
      onMouseUp,
      onMouseLeave,
      onWheel,
    },
    panTo,
    zoomTo,
    fitContent,
    resetViewport,
  };
}
