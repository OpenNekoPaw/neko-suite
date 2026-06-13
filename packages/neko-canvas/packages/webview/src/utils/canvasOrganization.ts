import type { CanvasNode } from '@neko/shared';
import { getNodeParentId } from '@neko/shared';

export function isNodeDrawnInsideContainer(node: CanvasNode): boolean {
  return getNodeParentId(node) !== undefined;
}

export function getTopLevelCanvasNodes(nodes: readonly CanvasNode[]): CanvasNode[] {
  return nodes.filter((node) => !isNodeDrawnInsideContainer(node));
}
