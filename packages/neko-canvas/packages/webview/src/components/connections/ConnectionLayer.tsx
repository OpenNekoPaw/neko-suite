/**
 * ConnectionLayer - Connection layer component
 * Manages rendering of all connections and pending connection preview.
 *
 * Supports both legacy anchor-based and port-based connections.
 * For port-based connections, calculates anchor points using port position
 * and index within the same side.
 */

import type { CanvasConnection, CanvasNode, PortDefinition } from '@neko/shared';
import { getDefaultPorts } from '@neko/shared';
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

/**
 * Get the anchor point for a legacy anchor position (center of each side).
 */
function getLegacyAnchorPoint(node: CanvasNode, anchor: string): Point {
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

/**
 * Get the anchor point for a port-based connection.
 * Calculates position based on port side and index among ports on the same side.
 */
function getPortAnchorPoint(node: CanvasNode, portId: string): Point | null {
  const ports = node.ports ?? getDefaultPorts(node.type);
  const port = ports.find((p: PortDefinition) => p.id === portId);
  if (!port) return null;

  // Count ports on the same side and find index
  const portsOnSide = ports.filter((p: PortDefinition) => p.position === port.position);
  const index = portsOnSide.indexOf(port);
  const total = portsOnSide.length;

  const { position, size } = node;
  const spacing = 1 / (total + 1);
  const fraction = spacing * (index + 1);

  switch (port.position) {
    case 'top':
      return { x: position.x + size.width * fraction, y: position.y };
    case 'right':
      return { x: position.x + size.width, y: position.y + size.height * fraction };
    case 'bottom':
      return { x: position.x + size.width * fraction, y: position.y + size.height };
    case 'left':
      return { x: position.x, y: position.y + size.height * fraction };
    default:
      return null;
  }
}

/**
 * Get anchor point for a connection endpoint.
 * Tries port-based first, falls back to legacy anchor.
 */
function getAnchorPoint(node: CanvasNode, anchor: string, portId?: string): Point {
  // Try port-based position first
  if (portId) {
    const portPoint = getPortAnchorPoint(node, portId);
    if (portPoint) return portPoint;
  }

  // Check if anchor is actually a port ID
  const portPoint = getPortAnchorPoint(node, anchor);
  if (portPoint) return portPoint;

  // Fall back to legacy anchor
  return getLegacyAnchorPoint(node, anchor);
}

/**
 * Get the anchor direction for control point calculation.
 * For ports, uses the port's position side. For legacy, uses the anchor directly.
 */
function getAnchorDirection(node: CanvasNode, anchor: string, portId?: string): string {
  if (portId) {
    const ports = node.ports ?? getDefaultPorts(node.type);
    const port = ports.find((p: PortDefinition) => p.id === portId);
    if (port) return port.position;
  }

  // Check if anchor is a port ID
  const ports = node.ports ?? getDefaultPorts(node.type);
  const port = ports.find((p: PortDefinition) => p.id === anchor);
  if (port) return port.position;

  return anchor;
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
    const sourceDir = getAnchorDirection(sourceNode, pendingConnection.sourceAnchor);
    const targetPoint = pendingConnection.mousePosition;

    // Calculate control points
    const dx = targetPoint.x - sourcePoint.x;
    const dy = targetPoint.y - sourcePoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const controlOffset = Math.min(distance / 2, 100) + 30;

    const cp1 = getControlPoint(sourcePoint, sourceDir, controlOffset);
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
