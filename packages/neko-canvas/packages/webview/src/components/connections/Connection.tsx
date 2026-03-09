/**
 * Connection - Single connection component
 * Renders a bezier curve with directional arrow and data-type coloring.
 *
 * Supports both legacy anchor-based and port-based connections.
 * Enhanced with:
 * - Directional arrow markers
 * - Data-type-based coloring
 * - Animated flow effect
 * - Port-aware anchor calculation
 */

import { useMemo } from 'react';
import type { CanvasConnection, CanvasNode, PortDefinition } from '@neko/shared';
import { getDefaultPorts } from '@neko/shared';

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
// Constants
// =============================================================================

/** Color mapping for port data types */
const DATA_TYPE_COLORS: Record<string, string> = {
  image: '#f59e0b', // amber
  video: '#8b5cf6', // violet
  audio: '#ec4899', // pink
  text: '#06b6d4', // cyan
  any: '#6b7280', // gray
};

// =============================================================================
// Helpers
// =============================================================================

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

function getPortAnchorPoint(node: CanvasNode, portId: string): Point | null {
  const ports = node.ports ?? getDefaultPorts(node.type);
  const port = ports.find((p: PortDefinition) => p.id === portId);
  if (!port) return null;

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

function getAnchorPoint(node: CanvasNode, anchor: string, portId?: string): Point {
  if (portId) {
    const portPoint = getPortAnchorPoint(node, portId);
    if (portPoint) return portPoint;
  }
  const portPoint = getPortAnchorPoint(node, anchor);
  if (portPoint) return portPoint;
  return getLegacyAnchorPoint(node, anchor);
}

function getAnchorDirection(node: CanvasNode, anchor: string, portId?: string): string {
  const id = portId ?? anchor;
  const ports = node.ports ?? getDefaultPorts(node.type);
  const port = ports.find((p: PortDefinition) => p.id === id);
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

/**
 * Resolve connection color based on port data type or connection type.
 */
function resolveConnectionColor(
  connection: CanvasConnection,
  sourceNode: CanvasNode,
  _targetNode: CanvasNode,
): string {
  // Try to get color from source port data type
  if (connection.sourcePort) {
    const ports = sourceNode.ports ?? getDefaultPorts(sourceNode.type);
    const port = ports.find((p: PortDefinition) => p.id === connection.sourcePort);
    if (port?.dataType && DATA_TYPE_COLORS[port.dataType]) {
      return DATA_TYPE_COLORS[port.dataType]!;
    }
  }

  // Fall back to connection type
  switch (connection.type) {
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
  // Unique ID for arrow marker
  const markerId = `arrow-${connection.id}`;

  // Calculate path data
  const pathData = useMemo(() => {
    const sourcePoint = getAnchorPoint(sourceNode, connection.sourceAnchor, connection.sourcePort);
    const targetPoint = getAnchorPoint(targetNode, connection.targetAnchor, connection.targetPort);
    const sourceDir = getAnchorDirection(
      sourceNode,
      connection.sourceAnchor,
      connection.sourcePort,
    );
    const targetDir = getAnchorDirection(
      targetNode,
      connection.targetAnchor,
      connection.targetPort,
    );

    // Calculate control point offset based on distance
    const dx = targetPoint.x - sourcePoint.x;
    const dy = targetPoint.y - sourcePoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const controlOffset = Math.min(distance / 2, 100) + 50;

    const cp1 = getControlPoint(sourcePoint, sourceDir, controlOffset);
    const cp2 = getControlPoint(targetPoint, targetDir, controlOffset);

    // Midpoint for label
    const midX = (sourcePoint.x + targetPoint.x) / 2;
    const midY = (sourcePoint.y + targetPoint.y) / 2;

    return {
      sourcePoint,
      targetPoint,
      midX,
      midY,
      pathD: `M ${sourcePoint.x} ${sourcePoint.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${targetPoint.x} ${targetPoint.y}`,
    };
  }, [
    sourceNode,
    targetNode,
    connection.sourceAnchor,
    connection.targetAnchor,
    connection.sourcePort,
    connection.targetPort,
  ]);

  const strokeColor = resolveConnectionColor(connection, sourceNode, targetNode);
  const strokeWidth = isSelected ? 2.5 : 1.8;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(connection.id);
  };

  return (
    <g className="connection-group">
      {/* Arrow marker definition */}
      <defs>
        <marker
          id={markerId}
          markerWidth="8"
          markerHeight="6"
          refX="7"
          refY="3"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M 0 0 L 8 3 L 0 6 Z" fill={strokeColor} opacity={isSelected ? 1 : 0.8} />
        </marker>
      </defs>

      {/* Invisible wider path for easier clicking */}
      <path
        d={pathData.pathD}
        fill="none"
        stroke="transparent"
        strokeWidth={14}
        style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
        onClick={handleClick}
      />

      {/* Glow effect for selected */}
      {isSelected && (
        <path
          d={pathData.pathD}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth + 4}
          strokeOpacity={0.15}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Visible connection path with arrow */}
      <path
        d={pathData.pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={connection.type === 'reference' ? '6,4' : undefined}
        strokeOpacity={isSelected ? 1 : 0.7}
        markerEnd={`url(#${markerId})`}
        style={{ pointerEvents: 'none' }}
      />

      {/* Animated flow dots (visible when selected or hovered) */}
      <circle r={3} fill={strokeColor} opacity={0.9}>
        <animateMotion dur="2s" repeatCount="indefinite" path={pathData.pathD} />
      </circle>

      {/* Connection label */}
      {connection.label && (
        <g>
          <rect
            x={pathData.midX - 30}
            y={pathData.midY - 10}
            width={60}
            height={18}
            rx={4}
            fill="var(--node-bg)"
            stroke={strokeColor}
            strokeWidth={1}
            opacity={0.9}
          />
          <text
            x={pathData.midX}
            y={pathData.midY + 3}
            textAnchor="middle"
            fill="var(--toolbar-fg)"
            fontSize={10}
            fontFamily="var(--vscode-font-family)"
            style={{ pointerEvents: 'none' }}
          >
            {connection.label}
          </text>
        </g>
      )}

      {/* Source/target port dots */}
      <circle
        cx={pathData.sourcePoint.x}
        cy={pathData.sourcePoint.y}
        r={isSelected ? 4 : 3}
        fill={strokeColor}
        opacity={0.8}
        style={{ pointerEvents: 'none' }}
      />
      <circle
        cx={pathData.targetPoint.x}
        cy={pathData.targetPoint.y}
        r={isSelected ? 4 : 3}
        fill={strokeColor}
        opacity={0.8}
        style={{ pointerEvents: 'none' }}
      />
    </g>
  );
}
