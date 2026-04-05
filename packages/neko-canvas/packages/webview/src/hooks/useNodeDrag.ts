/**
 * useNodeDrag - Hook for node drag interactions
 * Handles mouse-based node dragging with canvas coordinate conversion
 */

import { useState, useEffect } from 'react';
import { useDrag } from '@neko/shared/components';
import type { CanvasViewport } from '@neko/shared';

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
// Context
// =============================================================================

interface NodeDragCtx {
  startX: number;
  startY: number;
  posX: number;
  posY: number;
  zoom: number;
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

  const { isDragging, bindDrag } = useDrag<NodeDragCtx>({
    onStart: (e) => {
      if (disabled || e.button !== 0) return undefined;
      onDragStart?.(nodeId);
      return {
        startX: e.clientX,
        startY: e.clientY,
        posX: position.x,
        posY: position.y,
        zoom: viewport.zoom,
      };
    },
    onMove: (e, ctx) => {
      const newPosition = {
        x: ctx.posX + (e.clientX - ctx.startX) / ctx.zoom,
        y: ctx.posY + (e.clientY - ctx.startY) / ctx.zoom,
      };
      setPosition(newPosition);
      onDrag?.(nodeId, newPosition);
    },
    onEnd: (e, ctx) => {
      const finalPosition = {
        x: ctx.posX + (e.clientX - ctx.startX) / ctx.zoom,
        y: ctx.posY + (e.clientY - ctx.startY) / ctx.zoom,
      };
      setPosition(finalPosition);
      onDragEnd?.(nodeId, finalPosition);
    },
  });

  // Update position when initialPosition changes (external update)
  useEffect(() => {
    if (!isDragging) {
      setPosition(initialPosition);
    }
  }, [initialPosition, isDragging]);

  return {
    position,
    isDragging,
    handlers: bindDrag,
  };
}
