/**
 * useNodeResize - Hook for node resize interactions
 * Handles mouse-based node resizing with canvas coordinate conversion.
 * Supports 8 resize handles (corners + edges).
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { CanvasViewport } from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface UseNodeResizeOptions {
  nodeId: string;
  initialSize: { width: number; height: number };
  initialPosition: { x: number; y: number };
  viewport: CanvasViewport;
  minWidth?: number;
  minHeight?: number;
  onResize?: (
    nodeId: string,
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => void;
  onResizeEnd?: (
    nodeId: string,
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => void;
  disabled?: boolean;
}

export interface UseNodeResizeReturn {
  size: { width: number; height: number };
  position: { x: number; y: number };
  isResizing: boolean;
  startResize: (handle: ResizeHandle, e: React.MouseEvent) => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useNodeResize({
  nodeId,
  initialSize,
  initialPosition,
  viewport,
  minWidth = 80,
  minHeight = 60,
  onResize,
  onResizeEnd,
  disabled = false,
}: UseNodeResizeOptions): UseNodeResizeReturn {
  const [size, setSize] = useState(initialSize);
  const [position, setPosition] = useState(initialPosition);
  const [isResizing, setIsResizing] = useState(false);

  const handleRef = useRef<ResizeHandle | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const sizeStartRef = useRef<{ width: number; height: number } | null>(null);
  const posStartRef = useRef<{ x: number; y: number } | null>(null);

  // Sync from external updates when not resizing
  useEffect(() => {
    if (!isResizing) {
      setSize(initialSize);
      setPosition(initialPosition);
    }
  }, [initialSize, initialPosition, isResizing]);

  const startResize = useCallback(
    (handle: ResizeHandle, e: React.MouseEvent) => {
      if (disabled) return;
      e.stopPropagation();
      e.preventDefault();

      handleRef.current = handle;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      sizeStartRef.current = { ...size };
      posStartRef.current = { ...position };
      setIsResizing(true);
    },
    [disabled, size, position],
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const handle = handleRef.current;
      const start = dragStartRef.current;
      const startSize = sizeStartRef.current;
      const startPos = posStartRef.current;
      if (!handle || !start || !startSize || !startPos) return;

      const dx = (e.clientX - start.x) / viewport.zoom;
      const dy = (e.clientY - start.y) / viewport.zoom;

      let newW = startSize.width;
      let newH = startSize.height;
      let newX = startPos.x;
      let newY = startPos.y;

      // Horizontal
      if (handle.includes('e')) {
        newW = Math.max(minWidth, startSize.width + dx);
      } else if (handle.includes('w')) {
        const dw = Math.min(dx, startSize.width - minWidth);
        newW = startSize.width - dw;
        newX = startPos.x + dw;
      }

      // Vertical
      if (handle.includes('s')) {
        newH = Math.max(minHeight, startSize.height + dy);
      } else if (handle.includes('n')) {
        const dh = Math.min(dy, startSize.height - minHeight);
        newH = startSize.height - dh;
        newY = startPos.y + dh;
      }

      const newSize = { width: newW, height: newH };
      const newPos = { x: newX, y: newY };
      setSize(newSize);
      setPosition(newPos);
      onResize?.(nodeId, newSize, newPos);
    };

    const handleMouseUp = () => {
      const newSize = { ...size };
      const newPos = { ...position };
      setIsResizing(false);
      handleRef.current = null;
      dragStartRef.current = null;
      sizeStartRef.current = null;
      posStartRef.current = null;
      onResizeEnd?.(nodeId, newSize, newPos);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    isResizing,
    viewport.zoom,
    nodeId,
    minWidth,
    minHeight,
    onResize,
    onResizeEnd,
    size,
    position,
  ]);

  return { size, position, isResizing, startResize };
}
