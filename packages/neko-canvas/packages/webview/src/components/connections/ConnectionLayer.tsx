/**
 * ConnectionLayer - Connection layer component
 * Manages rendering of all connections and pending connection preview
 */

import type { CanvasConnection, CanvasNode } from '@neko/shared';
import { Connection } from './Connection';

// =============================================================================
// Types
// =============================================================================

export interface ConnectionLayerProps {
  connections: CanvasConnection[];
  nodes: CanvasNode[];
  selectedConnectionIds: string[];
  pendingConnection?: {
    sourceNodeId: string;
    sourceAnchor: string;
    mousePosition: { x: number; y: number };
  } | null;
  onConnectionSelect?: (connectionId: string) => void;
}

interface Point {
  x: number;
  y: number;
}

// =============================================================================
// Constants
// =============================================================================

const SVG_OFFSET = 50000;
const SVG_SIZE = 100000;

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

// =============================================================================
// Component
// =============================================================================

export function ConnectionLayer({
  connections,
  nodes,
  selectedConnectionIds,
  pendingConnection,
  onConnectionSelect,
}: ConnectionLayerProps) {
  // Create node lookup map for performance
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  // Render pending connection preview
  const renderPendingConnection = () => {
    if (!pendingConnection) return null;

    const sourceNode = nodeMap.get(pendingConnection.sourceNodeId);
    if (!sourceNode) return null;

    const sourcePoint = getAnchorPoint(sourceNode, pendingConnection.sourceAnchor);
    const targetPoint = pendingConnection.mousePosition;

    // Calculate control points
    const dx = targetPoint.x - sourcePoint.x;
    const dy = targetPoint.y - sourcePoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const controlOffset = Math.min(distance / 2, 100) + 30;

    const cp1 = getControlPoint(sourcePoint, pendingConnection.sourceAnchor, controlOffset);
    // For pending connection, use a simple offset toward the target
    const cp2 = {
      x: targetPoint.x - (dx > 0 ? controlOffset : -controlOffset) * 0.5,
      y: targetPoint.y - (dy > 0 ? controlOffset : -controlOffset) * 0.5,
    };

    const pathD = `M ${sourcePoint.x + SVG_OFFSET} ${sourcePoint.y + SVG_OFFSET} C ${cp1.x + SVG_OFFSET} ${cp1.y + SVG_OFFSET}, ${cp2.x + SVG_OFFSET} ${cp2.y + SVG_OFFSET}, ${targetPoint.x + SVG_OFFSET} ${targetPoint.y + SVG_OFFSET}`;

    return (
      <g className="pending-connection">
        <path
          d={pathD}
          fill="none"
          stroke="var(--node-selected)"
          strokeWidth={2}
          strokeDasharray="5,5"
          opacity={0.7}
        />
        {/* Target indicator */}
        <circle
          cx={targetPoint.x + SVG_OFFSET}
          cy={targetPoint.y + SVG_OFFSET}
          r={6}
          fill="var(--node-selected)"
          opacity={0.5}
        />
      </g>
    );
  };

  return (
    <svg
      className="absolute pointer-events-none"
      style={{
        width: `${SVG_SIZE}px`,
        height: `${SVG_SIZE}px`,
        left: `-${SVG_OFFSET}px`,
        top: `-${SVG_OFFSET}px`,
        overflow: 'visible',
      }}
    >
      {/* Offset group to handle coordinate system */}
      <g transform={`translate(${SVG_OFFSET}, ${SVG_OFFSET})`}>
        {/* Render all connections */}
        {connections.map((connection) => {
          const sourceNode = nodeMap.get(connection.sourceId);
          const targetNode = nodeMap.get(connection.targetId);

          if (!sourceNode || !targetNode) return null;

          return (
            <Connection
              key={connection.id}
              connection={connection}
              sourceNode={sourceNode}
              targetNode={targetNode}
              isSelected={selectedConnectionIds.includes(connection.id)}
              onSelect={onConnectionSelect}
            />
          );
        })}
      </g>

      {/* Pending connection (outside offset group as it uses mouse coordinates) */}
      {renderPendingConnection()}
    </svg>
  );
}
