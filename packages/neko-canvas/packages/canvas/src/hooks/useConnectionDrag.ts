/**
 * useConnectionDrag - Hook for connection creation via drag
 * Handles the interaction of dragging from an anchor to create a new connection
 */

import { useState, useCallback, useEffect } from 'react';
import type { CanvasViewport } from '@uniedit/shared';

// =============================================================================
// Types
// =============================================================================

export interface UseConnectionDragOptions {
  viewport: CanvasViewport;
  containerRef: React.RefObject<HTMLElement>;
  onConnectionStart?: (nodeId: string, anchor: string) => void;
  onConnectionComplete?: (
    sourceNodeId: string,
    sourceAnchor: string,
    targetNodeId: string,
    targetAnchor: string
  ) => void;
  onConnectionCancel?: () => void;
}

export interface PendingConnection {
  sourceNodeId: string;
  sourceAnchor: string;
  mousePosition: { x: number; y: number };
}

export interface UseConnectionDragReturn {
  pendingConnection: PendingConnection | null;
  isConnecting: boolean;
  startConnection: (nodeId: string, anchor: string, e: React.MouseEvent) => void;
  updateConnection: (e: MouseEvent) => void;
  completeConnection: (targetNodeId: string, targetAnchor: string) => void;
  cancelConnection: () => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useConnectionDrag({
  viewport,
  containerRef,
  onConnectionStart,
  onConnectionComplete,
  onConnectionCancel,
}: UseConnectionDragOptions): UseConnectionDragReturn {
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Convert screen coordinates to canvas coordinates
  const screenToCanvas = useCallback(
    (screenX: number, screenY: number): { x: number; y: number } => {
      const container = containerRef.current;
      if (!container) return { x: 0, y: 0 };

      const rect = container.getBoundingClientRect();
      const x = (screenX - rect.left - viewport.pan.x) / viewport.zoom;
      const y = (screenY - rect.top - viewport.pan.y) / viewport.zoom;

      return { x, y };
    },
    [viewport, containerRef]
  );

  // Start a new connection from an anchor
  const startConnection = useCallback(
    (nodeId: string, anchor: string, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      const canvasPos = screenToCanvas(e.clientX, e.clientY);

      setPendingConnection({
        sourceNodeId: nodeId,
        sourceAnchor: anchor,
        mousePosition: canvasPos,
      });
      setIsConnecting(true);
      onConnectionStart?.(nodeId, anchor);
    },
    [screenToCanvas, onConnectionStart]
  );

  // Update the pending connection position
  const updateConnection = useCallback(
    (e: MouseEvent) => {
      if (!isConnecting) return;

      const canvasPos = screenToCanvas(e.clientX, e.clientY);

      setPendingConnection((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          mousePosition: canvasPos,
        };
      });
    },
    [isConnecting, screenToCanvas]
  );

  // Complete the connection to a target anchor
  const completeConnection = useCallback(
    (targetNodeId: string, targetAnchor: string) => {
      if (!pendingConnection) return;

      // Don't connect to self
      if (pendingConnection.sourceNodeId === targetNodeId) {
        cancelConnection();
        return;
      }

      onConnectionComplete?.(
        pendingConnection.sourceNodeId,
        pendingConnection.sourceAnchor,
        targetNodeId,
        targetAnchor
      );

      setPendingConnection(null);
      setIsConnecting(false);
    },
    [pendingConnection, onConnectionComplete]
  );

  // Cancel the pending connection
  const cancelConnection = useCallback(() => {
    setPendingConnection(null);
    setIsConnecting(false);
    onConnectionCancel?.();
  }, [onConnectionCancel]);

  // Handle mouse events for connection dragging
  useEffect(() => {
    if (!isConnecting) return;

    const handleMouseMove = (e: MouseEvent) => {
      updateConnection(e);
    };

    const handleMouseUp = (e: MouseEvent) => {
      // Check if we're over an anchor point
      const target = e.target as HTMLElement;
      const anchorElement = target.closest('[data-anchor]');

      if (anchorElement) {
        const nodeId = anchorElement.getAttribute('data-node-id');
        const anchor = anchorElement.getAttribute('data-anchor');

        if (nodeId && anchor) {
          completeConnection(nodeId, anchor);
          return;
        }
      }

      // Cancel if not dropped on an anchor
      cancelConnection();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelConnection();
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isConnecting, updateConnection, completeConnection, cancelConnection]);

  return {
    pendingConnection,
    isConnecting,
    startConnection,
    updateConnection,
    completeConnection,
    cancelConnection,
  };
}
