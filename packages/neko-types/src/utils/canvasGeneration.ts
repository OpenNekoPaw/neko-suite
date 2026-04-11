import type { CanvasNode } from '../types/canvas';

export interface CanvasGenerationLineage {
  readonly sourceNodeId: string;
  readonly characterIds?: readonly string[];
}

export function extractCanvasNodeGenerationLineage(
  node: CanvasNode,
): CanvasGenerationLineage | undefined {
  switch (node.type) {
    case 'shot': {
      const characterIds = Array.from(
        new Set(
          node.data.characters
            .map((character) => character.characterId)
            .filter((value): value is string => typeof value === 'string' && value.length > 0),
        ),
      );
      return characterIds.length > 0
        ? { sourceNodeId: node.id, characterIds }
        : { sourceNodeId: node.id };
    }
    case 'gallery': {
      const characterId = node.data.characterId;
      return typeof characterId === 'string' && characterId.length > 0
        ? { sourceNodeId: node.id, characterIds: [characterId] }
        : { sourceNodeId: node.id };
    }
    default:
      return { sourceNodeId: node.id };
  }
}
