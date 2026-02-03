/**
 * useNodeDrag - Hook for node drag interactions
 * Handles mouse-based node dragging with canvas coordinate conversion
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { CanvasViewport } from '@uniedit/shared';

// =============================================================================
// Types
// =============================================================================

export interface UseNodeDragOptions {
  nodeId: string;
  initialPosition: { x: number; y: number };
  viewport: CanvasViewport;
  onDragStart?: (nodeId: string) => void;
  onDrag?: (nodeId: string, position: { x: number; y: number }) => void;
  onDragEnd?: (nodeId: string, position: { x: number; y: number }) => void;
  disabled?: boolean;
}

export interface UseNodeDragReturn {
  position: { x: number; y: number };
  isDragging: boolean;
  handlers: {
    onMouseDown: (e: React.MouseEvent) => void;
  };
}

// =============================================================================
// Hook
// =============================================================================

export function useNodeDrag({
  nodeId,
  initialPosition,
  viewport,
  onDragStart,
  onDrag,
  onDragEnd,
  disabled = false,
}: UseNodeDragOptions): UseNodeDragReturn {
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const positionStartRef = useRef<{ x: number; y: number } | null>(null);

  // Update position when initialPosition changes (external update)
  useEffect(() => {
    if (!isDragging) {
      setPosition(initialPosition);
    }
  }, [initialPosition, isDragging]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    if (e.button !== 0) return; // Only left click
    
    e.stopPropagation();
    e.preventDefault();
    
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    positionStartRef.current = { ...position };
    setIsDragging(true);
    onDragStart?.(nodeId);
  }, [disabled, position, nodeId, onDragStart]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current || !positionStartRef.current) return;

      // Calculate delta in screen space, then convert to canvas space
      const deltaX = (e.clientX - dragStartRef.current.x) / viewport.zoom;
      const deltaY = (e.clientY - dragStartRef.current.y) / viewport.zoom;

      const newPosition = {
        x: positionStartRef.current.x + deltaX,
        y: positionStartRef.current.y + deltaY,
      };

      setPosition(newPosition);
      onDrag?.(nodeId, newPosition);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!dragStartRef.current || !positionStartRef.current) return;

      const deltaX = (e.clientX - dragStartRef.current.x) / viewport.zoom;
      const deltaY = (e.clientY - dragStartRef.current.y) / viewport.zoom;

      const finalPosition = {
        x: positionStartRef.current.x + deltaX,
        y: positionStartRef.current.y + deltaY,
      };

      setPosition(finalPosition);
      setIsDragging(false);
      dragStartRef.current = null;
      positionStartRef.current = null;
      onDragEnd?.(nodeId, finalPosition);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, viewport.zoom, nodeId, onDrag, onDragEnd]);

  return {
    position,
    isDragging,
    handlers: {
      onMouseDown: handleMouseDown,
    },
  };
}
