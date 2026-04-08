import {
  isSceneGroupNode,
  isGalleryNode,
  isShotNode,
  type CanvasNode,
  type NekoStoryScriptIndex,
  type OccurrenceIndexEntry,
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

export function extractSceneIdsFromCanvasNode(node: CanvasNode | undefined): string[] {
  if (!node || !isSceneGroupNode(node)) {
    return [];
  }

  return typeof node.data.sceneId === 'string' ? [node.data.sceneId] : [];
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

export function projectCharacterOccurrencesFromCanvasNode(
  node: CanvasNode,
  characterId: string,
  canvasDocumentUri?: string,
): OccurrenceIndexEntry[] {
  const boundCharacterIds = extractCharacterIdsFromCanvasNode(node);
  if (!boundCharacterIds.includes(characterId)) {
    return [];
  }

  return [
    {
      entity: {
        kind: 'character',
        id: characterId,
      },
      source: 'canvas-node',
      sourceId: node.id,
      strength: 'confirmed',
      provenance: 'lineage',
      locator: {
        uri: canvasDocumentUri,
        nodeId: node.id,
      },
    },
  ];
}

export function projectSceneOccurrencesFromCanvasNode(
  node: CanvasNode,
  sceneId: string,
  canvasDocumentUri?: string,
): OccurrenceIndexEntry[] {
  const boundSceneIds = extractSceneIdsFromCanvasNode(node);
  if (!boundSceneIds.includes(sceneId)) {
    return [];
  }

  return [
    {
      entity: {
        kind: 'scene',
        id: sceneId,
        label: isSceneGroupNode(node) ? node.data.sceneTitle : undefined,
      },
      source: 'canvas-node',
      sourceId: node.id,
      strength: 'confirmed',
      provenance: 'import',
      locator: {
        uri: canvasDocumentUri,
        nodeId: node.id,
      },
    },
  ];
}
