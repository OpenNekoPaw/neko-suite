import {
  isGalleryNode,
  isShotNode,
  type CanvasNode,
  type NekoStoryScriptIndex,
  type ShotCharacter,
} from '@neko/shared';

export interface GeneratedAssetBindingMetadata {
  sourceNodeId?: string;
  characterIds?: string[];
}

export function buildShotCharactersForScene(
  index: NekoStoryScriptIndex,
  sceneId: string,
): ShotCharacter[] {
  return index.characters
    .filter((character) => character.scene_ids.includes(sceneId))
    .map((character) => ({
      characterName: character.name,
      characterId: character.characterId,
    }));
}

export function extractCharacterIdsFromCanvasNode(node: CanvasNode | undefined): string[] {
  if (!node) {
    return [];
  }

  if (isShotNode(node)) {
    return node.data.characters
      .map((character) => character.characterId)
      .filter((characterId): characterId is string => typeof characterId === 'string');
  }

  if (isGalleryNode(node)) {
    return typeof node.data.characterId === 'string' ? [node.data.characterId] : [];
  }

  return [];
}

export function parseGeneratedAssetBindingMetadata(
  metadata: Record<string, unknown> | undefined,
): GeneratedAssetBindingMetadata {
  if (!metadata) {
    return {};
  }

  const sourceNodeId =
    typeof metadata['sourceNodeId'] === 'string' ? metadata['sourceNodeId'] : undefined;
  const rawCharacterIds = metadata['characterIds'];
  const characterIds = Array.isArray(rawCharacterIds)
    ? rawCharacterIds.filter((value): value is string => typeof value === 'string')
    : undefined;

  return {
    sourceNodeId,
    characterIds: characterIds && characterIds.length > 0 ? characterIds : undefined,
  };
}
