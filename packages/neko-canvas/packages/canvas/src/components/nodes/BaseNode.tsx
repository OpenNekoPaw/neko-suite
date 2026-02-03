/**
 * BaseNode - Base node component
 * Provides common node frame with selection, dragging, and anchor points
 */

import { useCallback, type ReactNode } from 'react';
import type { CanvasNode, CanvasViewport } from '@uniedit/shared';
import { useNodeDrag } from '../../hooks/useNodeDrag';
import clsx from 'clsx';

// =============================================================================
// Types
// =============================================================================

export interface BaseNodeProps {
  node: CanvasNode;
  viewport: CanvasViewport;
  isSelected: boolean;
  onSelect?: (nodeId: string, multi: boolean) => void;
  onMove?: (nodeId: string, position: { x: number; y: number }) => void;
  onConnectionStart?: (nodeId: string, anchor: string) => void;
  children: ReactNode;
  className?: string;
}

type AnchorPosition = 'top' | 'right' | 'bottom' | 'left';

// =============================================================================
// Constants
// =============================================================================

const ANCHOR_POSITIONS: AnchorPosition[] = ['top', 'right', 'bottom', 'left'];

// =============================================================================
// Component
// =============================================================================

export function BaseNode({
  node,
  viewport,
  isSelected,
  onSelect,
  onMove,
  onConnectionStart,
  children,
  className,
}: BaseNodeProps) {
  // Node dragging
  const { position, isDragging, handlers: dragHandlers } = useNodeDrag({
    nodeId: node.id,
    initialPosition: node.position,
    viewport,
    onDragEnd: onMove,
    disabled: node.locked,
  });

  // Handle node click for selection
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(node.id, e.shiftKey || e.metaKey);
  }, [node.id, onSelect]);

  // Handle anchor click for connection
  const handleAnchorClick = useCallback((anchor: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    onConnectionStart?.(node.id, anchor);
  }, [node.id, onConnectionStart]);

  // Get anchor position styles
  const getAnchorStyle = (anchor: AnchorPosition): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: 'absolute',
      width: 12,
      height: 12,
      borderRadius: '50%',
      backgroundColor: 'var(--node-border)',
      border: '2px solid var(--node-bg)',
      cursor: 'crosshair',
      zIndex: 10,
    };

    switch (anchor) {
      case 'top':
        return { ...base, top: -6, left: '50%', transform: 'translateX(-50%)' };
      case 'right':
        return { ...base, right: -6, top: '50%', transform: 'translateY(-50%)' };
      case 'bottom':
        return { ...base, bottom: -6, left: '50%', transform: 'translateX(-50%)' };
      case 'left':
        return { ...base, left: -6, top: '50%', transform: 'translateY(-50%)' };
    }
  };

  return (
    <div
      className={clsx(
        'absolute select-none',
        isDragging && 'cursor-grabbing',
        !isDragging && !node.locked && 'cursor-grab',
        node.locked && 'cursor-not-allowed opacity-80',
        className
      )}
      style={{
        left: position.x,
        top: position.y,
        width: node.size.width,
        height: node.size.height,
        zIndex: isDragging ? 1000 : node.zIndex,
      }}
      onMouseDown={dragHandlers.onMouseDown}
      onClick={handleClick}
    >
      {/* Node content */}
      <div
        className={clsx(
          'w-full h-full rounded-lg border-2 shadow-lg overflow-hidden',
          'bg-[var(--node-bg)] transition-colors duration-150',
          isSelected ? 'border-[var(--node-selected)]' : 'border-[var(--node-border)]',
          isDragging && 'shadow-2xl'
        )}
      >
        {children}
      </div>

      {/* Connection anchors - only show when selected or hovering */}
      {isSelected && ANCHOR_POSITIONS.map((anchor) => (
        <div
          key={anchor}
          style={getAnchorStyle(anchor)}
          onClick={handleAnchorClick(anchor)}
          onMouseDown={(e) => e.stopPropagation()}
          className="hover:bg-[var(--node-selected)] hover:scale-125 transition-all duration-150"
        />
      ))}

      {/* Lock indicator */}
      {node.locked && (
        <div className="absolute top-1 right-1 text-xs text-gray-500">
          🔒
        </div>
      )}
    </div>
  );
}
