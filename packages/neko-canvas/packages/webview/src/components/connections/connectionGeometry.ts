import type { CanvasConnection, CanvasNode, PortDefinition } from '@neko/shared';
import { getDefaultPorts } from '@neko/shared';

export interface Point {
  x: number;
  y: number;
}

export interface ConnectionPathGeometry {
  sourcePoint: Point;
  targetPoint: Point;
  midX: number;
  midY: number;
  pathD: string;
}

export function getLegacyAnchorPoint(node: CanvasNode, anchor: string): Point {
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

export function getPortAnchorPoint(node: CanvasNode, portId: string): Point | null {
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

export function rotatePoint(point: Point, center: Point, angleDeg: number): Point {
  if (angleDeg === 0) return point;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

export function getNodeCenter(node: CanvasNode): Point {
  return {
    x: node.position.x + node.size.width / 2,
    y: node.position.y + node.size.height / 2,
  };
}

export function getAnchorPoint(node: CanvasNode, anchor: string, portId?: string): Point {
  let point: Point;
  if (portId) {
    const portPoint = getPortAnchorPoint(node, portId);
    point = portPoint ?? getPortAnchorPoint(node, anchor) ?? getLegacyAnchorPoint(node, anchor);
  } else {
    point = getPortAnchorPoint(node, anchor) ?? getLegacyAnchorPoint(node, anchor);
  }

  const rotation = node.rotation ?? 0;
  if (rotation !== 0) {
    return rotatePoint(point, getNodeCenter(node), rotation);
  }
  return point;
}

export function getAnchorDirection(node: CanvasNode, anchor: string, portId?: string): string {
  const id = portId ?? anchor;
  const ports = node.ports ?? getDefaultPorts(node.type);
  const port = ports.find((p: PortDefinition) => p.id === id);
  if (port) return port.position;
  return anchor;
}

export function getControlPoint(point: Point, anchor: string, offset: number): Point {
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

export function getConnectionPathGeometry(
  connection: CanvasConnection,
  sourceNode: CanvasNode,
  targetNode: CanvasNode,
): ConnectionPathGeometry {
  const sourcePoint = getAnchorPoint(sourceNode, connection.sourceAnchor, connection.sourcePort);
  const targetPoint = getAnchorPoint(targetNode, connection.targetAnchor, connection.targetPort);
  const sourceDir = getAnchorDirection(sourceNode, connection.sourceAnchor, connection.sourcePort);
  const targetDir = getAnchorDirection(targetNode, connection.targetAnchor, connection.targetPort);

  const dx = targetPoint.x - sourcePoint.x;
  const dy = targetPoint.y - sourcePoint.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const controlOffset = Math.min(distance / 2, 100) + 50;

  const cp1 = getControlPoint(sourcePoint, sourceDir, controlOffset);
  const cp2 = getControlPoint(targetPoint, targetDir, controlOffset);

  return {
    sourcePoint,
    targetPoint,
    midX: (sourcePoint.x + targetPoint.x) / 2,
    midY: (sourcePoint.y + targetPoint.y) / 2,
    pathD: `M ${sourcePoint.x} ${sourcePoint.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${targetPoint.x} ${targetPoint.y}`,
  };
}
