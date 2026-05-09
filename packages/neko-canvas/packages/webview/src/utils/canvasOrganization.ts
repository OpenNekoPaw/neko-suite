import type { CanvasNode, ShotCanvasNode } from '@neko/shared';
import { getContainerChildIds, getNodeParentId, isShotNode } from '@neko/shared';

export function isNodeDrawnInsideContainer(node: CanvasNode): boolean {
  return getNodeParentId(node) !== undefined;
}

export function getTopLevelCanvasNodes(nodes: readonly CanvasNode[]): CanvasNode[] {
  return nodes.filter((node) => !isNodeDrawnInsideContainer(node));
}

export function getSceneShotNodes(
  scene: CanvasNode,
  nodes: readonly CanvasNode[],
): ShotCanvasNode[] {
  const childOrder = getContainerChildIds(scene);
  const childOrderIndex = new Map(childOrder.map((childId, index) => [childId, index]));

  return nodes
    .filter((candidate): candidate is ShotCanvasNode => isShotNode(candidate))
    .filter((candidate) => getNodeParentId(candidate) === scene.id)
    .sort((left, right) => {
      const leftIndex = childOrderIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = childOrderIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }

      if (left.position.y !== right.position.y) {
        return left.position.y - right.position.y;
      }

      return left.position.x - right.position.x;
    });
}
