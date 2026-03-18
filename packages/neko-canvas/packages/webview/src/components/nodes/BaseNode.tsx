/**
 * BaseNode - Base node component
 * Provides common node frame with selection, dragging, and port/anchor points.
 *
 * Port system:
 * - If node.ports is defined and non-empty, renders typed input/output ports
 * - Otherwise falls back to legacy 4-direction anchor points
 */

import { useCallback, useMemo, type ReactNode } from 'react';
import type { CanvasViewport, CanvasNodeType, PortDefinition } from '@neko/shared';
import { getDefaultPorts } from '@neko/shared';
import { useNodeDrag } from '../../hooks/useNodeDrag';
import { useNodeResize, type ResizeHandle } from '../../hooks/useNodeResize';
import { useNodeRotate } from '../../hooks/useNodeRotate';
import clsx from 'clsx';

// =============================================================================
// Types
// =============================================================================

/** Minimal node shape that BaseNode needs — accepts both CanvasNode and extended types */
interface BaseNodeInput {
  id: string;
  type: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  rotation?: number;
  locked?: boolean;
  ports?: PortDefinition[];
}

export interface BaseNodeProps {
  node: BaseNodeInput;
  viewport: CanvasViewport;
  isSelected: boolean;
  /** Container ref for coordinate conversion (needed for rotation) */
  containerRef?: React.RefObject<HTMLElement | null>;
  onSelect?: (nodeId: string, multi: boolean) => void;
  /** Called on every mousemove during drag (real-time position update) */
  onDrag?: (nodeId: string, position: { x: number; y: number }) => void;
  /** Called on mouseup when drag ends (final position + history) */
  onMove?: (nodeId: string, position: { x: number; y: number }) => void;
  /** Called on every mousemove during resize */
  onResize?: (
    nodeId: string,
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => void;
  /** Called on mouseup when resize ends */
  onResizeEnd?: (
    nodeId: string,
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => void;
  /** Called on every mousemove during rotation */
  onRotate?: (nodeId: string, rotation: number) => void;
  /** Called on mouseup when rotation ends */
  onRotateEnd?: (nodeId: string, rotation: number) => void;
  onConnectionStart?: (nodeId: string, anchor: string, e: React.MouseEvent) => void;
  children: ReactNode;
  className?: string;
}

type AnchorPosition = 'top' | 'right' | 'bottom' | 'left';

// =============================================================================
// Constants
// =============================================================================

const ANCHOR_POSITIONS: AnchorPosition[] = ['top', 'right', 'bottom', 'left'];

const PORT_COLORS: Record<string, string> = {
  input: '#3b82f6', // blue-500
  output: '#22c55e', // green-500
};

const PORT_DATA_COLORS: Record<string, string> = {
  image: '#f59e0b', // amber-500
  video: '#8b5cf6', // violet-500
  audio: '#ec4899', // pink-500
  text: '#06b6d4', // cyan-500
  any: '#6b7280', // gray-500
};

// =============================================================================
// Resize handle config
// =============================================================================

const RESIZE_HANDLES: { handle: ResizeHandle; cursor: string; style: React.CSSProperties }[] = [
  { handle: 'n', cursor: 'ns-resize', style: { top: -4, left: 8, right: 8, height: 8 } },
  { handle: 's', cursor: 'ns-resize', style: { bottom: -4, left: 8, right: 8, height: 8 } },
  { handle: 'e', cursor: 'ew-resize', style: { right: -4, top: 8, bottom: 8, width: 8 } },
  { handle: 'w', cursor: 'ew-resize', style: { left: -4, top: 8, bottom: 8, width: 8 } },
  { handle: 'ne', cursor: 'nesw-resize', style: { top: -4, right: -4, width: 10, height: 10 } },
  { handle: 'nw', cursor: 'nesw-resize', style: { top: -4, left: -4, width: 10, height: 10 } },
  { handle: 'se', cursor: 'nwse-resize', style: { bottom: -4, right: -4, width: 10, height: 10 } },
  { handle: 'sw', cursor: 'nwse-resize', style: { bottom: -4, left: -4, width: 10, height: 10 } },
];

// =============================================================================
// Component
// =============================================================================

export function BaseNode({
  node,
  viewport,
  isSelected,
  containerRef,
  onSelect,
  onDrag,
  onMove,
  onResize,
  onResizeEnd,
  onRotate,
  onRotateEnd,
  onConnectionStart,
  children,
  className,
}: BaseNodeProps) {
  // Node dragging
  const {
    position: dragPosition,
    isDragging,
    handlers: dragHandlers,
  } = useNodeDrag({
    nodeId: node.id,
    initialPosition: node.position,
    viewport,
    onDrag,
    onDragEnd: onMove,
    disabled: node.locked,
  });

  // Node resizing
  const {
    size,
    position: resizePosition,
    isResizing,
    startResize,
  } = useNodeResize({
    nodeId: node.id,
    initialSize: node.size,
    initialPosition: node.position,
    viewport,
    onResize,
    onResizeEnd,
    disabled: node.locked,
  });

  // Node rotation
  const nodeCenter = useMemo(
    () => ({
      x: node.position.x + node.size.width / 2,
      y: node.position.y + node.size.height / 2,
    }),
    [node.position.x, node.position.y, node.size.width, node.size.height],
  );

  const {
    rotation: currentRotation,
    isRotating,
    startRotate,
  } = useNodeRotate({
    nodeId: node.id,
    initialRotation: node.rotation ?? 0,
    nodeCenter,
    viewport,
    containerRef: containerRef ?? { current: null },
    onRotate,
    onRotateEnd,
    disabled: node.locked,
  });

  // Use resize position/size when resizing, otherwise drag position + node size
  const currentPosition = isResizing ? resizePosition : dragPosition;
  const currentSize = isResizing ? size : node.size;

  // Resolve ports: explicit node.ports > default ports for type > empty
  const ports = node.ports ?? getDefaultPorts(node.type as CanvasNodeType);
  const hasPorts = ports.length > 0;

  // Handle node click for selection
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect?.(node.id, e.shiftKey || e.metaKey);
    },
    [node.id, onSelect],
  );

  // Handle anchor/port mousedown for drag-based connection
  const handleAnchorMouseDown = useCallback(
    (anchor: string) => (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onConnectionStart?.(node.id, anchor, e);
    },
    [node.id, onConnectionStart],
  );

  // Get legacy anchor position styles
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

  // Get port position styles
  const getPortStyle = (
    port: PortDefinition,
    index: number,
    totalOnSide: number,
  ): React.CSSProperties => {
    const portColor = PORT_DATA_COLORS[port.dataType ?? 'any'] ?? PORT_COLORS[port.type];
    const base: React.CSSProperties = {
      position: 'absolute',
      width: 14,
      height: 14,
      borderRadius: '50%',
      backgroundColor: portColor,
      border: '2px solid var(--node-bg)',
      cursor: 'crosshair',
      zIndex: 10,
    };

    // Calculate offset for multiple ports on the same side
    const spacing = 100 / (totalOnSide + 1);
    const percent = `${spacing * (index + 1)}%`;

    switch (port.position) {
      case 'top':
        return { ...base, top: -7, left: percent, transform: 'translateX(-50%)' };
      case 'right':
        return { ...base, right: -7, top: percent, transform: 'translateY(-50%)' };
      case 'bottom':
        return { ...base, bottom: -7, left: percent, transform: 'translateX(-50%)' };
      case 'left':
        return { ...base, left: -7, top: percent, transform: 'translateY(-50%)' };
    }
  };

  // Group ports by side for spacing calculation
  const portsBySide = new Map<string, { port: PortDefinition; index: number }[]>();
  for (const port of ports) {
    const side = port.position;
    if (!portsBySide.has(side)) {
      portsBySide.set(side, []);
    }
    const sideList = portsBySide.get(side)!;
    sideList.push({ port, index: sideList.length });
  }

  return (
    <div
      className={clsx(
        'absolute select-none',
        (isResizing || isRotating) && 'pointer-events-auto',
        isDragging && 'cursor-grabbing',
        !isDragging && !isResizing && !isRotating && !node.locked && 'cursor-grab',
        node.locked && 'cursor-not-allowed opacity-80',
        className,
      )}
      style={{
        left: currentPosition.x,
        top: currentPosition.y,
        width: currentSize.width,
        height: currentSize.height,
        zIndex: isDragging || isResizing || isRotating ? 1000 : node.zIndex,
        transform: currentRotation ? `rotate(${currentRotation}deg)` : undefined,
        transformOrigin: 'center center',
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
          (isDragging || isResizing) && 'shadow-2xl',
        )}
      >
        {children}
      </div>

      {/* Resize handles (visible when selected) */}
      {isSelected &&
        !node.locked &&
        RESIZE_HANDLES.map(({ handle, cursor, style }) => (
          <div
            key={handle}
            className="absolute z-20"
            style={{ ...style, cursor, position: 'absolute' }}
            onMouseDown={(e) => startResize(handle, e)}
          />
        ))}

      {/* Rotation handle (visible when selected, above node top center) */}
      {isSelected && !node.locked && (
        <>
          {/* Connector line from node top to rotation handle */}
          <div
            className="absolute z-20 pointer-events-none"
            style={{
              left: '50%',
              top: -24,
              width: 1,
              height: 20,
              backgroundColor: 'var(--node-selected)',
              opacity: 0.5,
              transform: 'translateX(-50%)',
            }}
          />
          {/* Rotation handle circle */}
          <div
            className="absolute z-20 flex items-center justify-center transition-all duration-150 hover:scale-125"
            style={{
              left: '50%',
              top: -36,
              width: 16,
              height: 16,
              borderRadius: '50%',
              backgroundColor: 'var(--node-selected)',
              border: '2px solid var(--node-bg)',
              transform: 'translateX(-50%)',
              cursor: 'grab',
              fontSize: 9,
              color: 'var(--node-bg)',
              lineHeight: 1,
            }}
            onMouseDown={startRotate}
            title={`Rotation: ${Math.round(currentRotation)}°`}
          >
            ↻
          </div>
        </>
      )}

      {/* Port-based connections (always visible for data flow clarity) */}
      {hasPorts &&
        Array.from(portsBySide.entries()).map(([_side, portsOnSide]) =>
          portsOnSide.map(({ port, index }) => (
            <div
              key={port.id}
              data-port-id={port.id}
              data-port-type={port.type}
              data-node-id={node.id}
              data-anchor={port.position}
              style={getPortStyle(port, index, portsOnSide.length)}
              onMouseDown={handleAnchorMouseDown(port.id)}
              className={clsx(
                'transition-all duration-150',
                isSelected
                  ? 'scale-110 opacity-100'
                  : 'scale-75 opacity-60 hover:scale-110 hover:opacity-100',
              )}
              title={port.label ?? `${port.type}: ${port.dataType ?? 'any'}`}
            >
              {/* Port type indicator: input has inner dot, output is solid */}
              {port.type === 'input' && (
                <div
                  className="absolute inset-[3px] rounded-full"
                  style={{ backgroundColor: 'var(--node-bg)' }}
                />
              )}
            </div>
          )),
        )}

      {/* Legacy anchor points (only when selected, for backward compat) */}
      {!hasPorts &&
        isSelected &&
        ANCHOR_POSITIONS.map((anchor) => (
          <div
            key={anchor}
            data-node-id={node.id}
            data-anchor={anchor}
            style={getAnchorStyle(anchor)}
            onMouseDown={handleAnchorMouseDown(anchor)}
            className="hover:bg-[var(--node-selected)] hover:scale-125 transition-all duration-150"
          />
        ))}

      {/* Lock indicator */}
      {node.locked && <div className="absolute top-1 right-1 text-xs text-gray-500">🔒</div>}
    </div>
  );
}
