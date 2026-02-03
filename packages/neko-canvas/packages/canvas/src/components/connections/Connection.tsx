/**
 * Connection - Single connection component
 * Renders a bezier curve connection between two nodes
 */

import { useMemo } from 'react';
import type { CanvasConnection, CanvasNode } from '@uniedit/shared';

// =============================================================================
// Types
// =============================================================================

export interface ConnectionProps {
  connection: CanvasConnection;
  sourceNode: CanvasNode;
  targetNode: CanvasNode;
  isSelected?: boolean;
  onSelect?: (connectionId: string) => void;
}

interface Point {
  x: number;
  y: number;
}

// =============================================================================
// Helpers
// =============================================================================

function getAnchorPoint(node: CanvasNode, anchor: string): Point {
  const { position, size } = node;

  switch (anchor) {
    case 'top':
      return { x: position.x + size.width / 2, y: position.y };
    case 'right':
      return { x: position.x + size.width, y: position.y + size.height / 2 };
    case 'bottom':
      return { x: position.x + size.width / 2, y: position.y + size.height };
    case 'left':
      return { x: position.x, y: position.y + size.height / 2 };
    default:
      return { x: position.x + size.width / 2, y: position.y + size.height / 2 };
  }
}

function getControlPoint(point: Point, anchor: string, offset: number): Point {
  switch (anchor) {
    case 'top':
      return { x: point.x, y: point.y - offset };
    case 'right':
      return { x: point.x + offset, y: point.y };
    case 'bottom':
      return { x: point.x, y: point.y + offset };
    case 'left':
      return { x: point.x - offset, y: point.y };
    default:
      return point;
  }
}

function getConnectionColor(type?: string): string {
  switch (type) {
    case 'sequence':
      return 'var(--connection-sequence)';
    case 'reference':
      return 'var(--connection-reference)';
    default:
      return 'var(--connection-default)';
  }
}

// =============================================================================
// Component
// =============================================================================

export function Connection({
  connection,
  sourceNode,
  targetNode,
  isSelected = false,
  onSelect,
}: ConnectionProps) {
  // Calculate path data
  const pathData = useMemo(() => {
    const sourcePoint = getAnchorPoint(sourceNode, connection.sourceAnchor);
    const targetPoint = getAnchorPoint(targetNode, connection.targetAnchor);

    // Calculate control point offset based on distance
    const dx = targetPoint.x - sourcePoint.x;
    const dy = targetPoint.y - sourcePoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const controlOffset = Math.min(distance / 2, 100) + 50;

    const cp1 = getControlPoint(sourcePoint, connection.sourceAnchor, controlOffset);
    const cp2 = getControlPoint(targetPoint, connection.targetAnchor, controlOffset);

    return {
      sourcePoint,
      targetPoint,
      cp1,
      cp2,
      pathD: `M ${sourcePoint.x} ${sourcePoint.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${targetPoint.x} ${targetPoint.y}`,
    };
  }, [sourceNode, targetNode, connection.sourceAnchor, connection.targetAnchor]);

  const strokeColor = getConnectionColor(connection.type);
  const strokeWidth = isSelected ? 3 : 2;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(connection.id);
  };

  return (
    <g className="connection-group">
      {/* Invisible wider path for easier clicking */}
      <path
        d={pathData.pathD}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
        style={{ cursor: 'pointer' }}
        onClick={handleClick}
      />

      {/* Visible connection path */}
      <path
        d={pathData.pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={connection.type === 'reference' ? '5,5' : undefined}
        style={{ pointerEvents: 'none' }}
        className={isSelected ? 'drop-shadow-lg' : ''}
      />

      {/* Selection highlight */}
      {isSelected && (
        <path
          d={pathData.pathD}
          fill="none"
          stroke="var(--node-selected)"
          strokeWidth={strokeWidth + 2}
          strokeOpacity={0.3}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Connection label */}
      {connection.label && (
        <text
          x={(pathData.sourcePoint.x + pathData.targetPoint.x) / 2}
          y={(pathData.sourcePoint.y + pathData.targetPoint.y) / 2 - 10}
          textAnchor="middle"
          fill="#888"
          fontSize={12}
          style={{ pointerEvents: 'none' }}
        >
          {connection.label}
        </text>
      )}
    </g>
  );
}
