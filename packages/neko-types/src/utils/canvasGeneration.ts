import type { CanvasNode, ShotCanvasNode } from '../types/canvas';

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

export interface CanvasShotPromptProjection {
  readonly prompt: string;
  readonly source: 'generationPrompt' | 'assembled' | 'empty';
  readonly shotScale?: string;
  readonly cameraMovement?: string;
  readonly cameraAngle?: string;
}

export type CanvasShotPromptProjectableData = Partial<
  Pick<
    ShotCanvasNode['data'],
    | 'generationPrompt'
    | 'visualDescription'
    | 'characters'
    | 'characterAction'
    | 'emotion'
    | 'sceneTags'
    | 'visualStyle'
    | 'vfx'
    | 'dialogue'
    | 'soundCue'
    | 'shotScale'
    | 'cameraMovement'
    | 'cameraAngle'
  >
>;

/**
 * Project Shot fields into the creator-facing generation prompt used by
 * one-click and batch generation. `generationPrompt` is an explicit override;
 * otherwise durable structured fields remain the source of truth.
 */
export function projectCanvasShotPrompt(node: CanvasNode): CanvasShotPromptProjection | undefined {
  if (node.type !== 'shot') return undefined;
  return projectShotDataPrompt(node.data);
}

export function projectShotDataPrompt(
  data: CanvasShotPromptProjectableData,
): CanvasShotPromptProjection {
  const explicitPrompt = readTrimmedString(data.generationPrompt);
  const result = buildProjectionResult(data);
  if (explicitPrompt) {
    return {
      ...result,
      prompt: explicitPrompt,
      source: 'generationPrompt',
    };
  }

  const parts: string[] = [];
  const visualDescription = readTrimmedString(data.visualDescription);
  if (visualDescription) parts.push(visualDescription);

  const characterNames = readCharacterNames(data.characters);
  if (characterNames.length > 0) parts.push(`Characters: ${characterNames.join(', ')}`);

  const characterAction = readTrimmedString(data.characterAction);
  if (characterAction) parts.push(`Action: ${characterAction}`);

  const emotions = readStringList(data.emotion);
  if (emotions.length > 0) parts.push(`Emotion: ${emotions.join(', ')}`);

  const sceneTags = readStringList(data.sceneTags);
  if (sceneTags.length > 0) parts.push(`Tags: ${sceneTags.join(', ')}`);

  const visualStyle = readTrimmedString(data.visualStyle);
  if (visualStyle) parts.push(`Style: ${visualStyle}`);

  const vfx = readStringList(data.vfx);
  if (vfx.length > 0) parts.push(`VFX: ${vfx.join(', ')}`);

  const dialogue = readTrimmedString(data.dialogue);
  if (dialogue) parts.push(`Dialogue: "${dialogue}"`);

  const soundCue = readTrimmedString(data.soundCue);
  if (soundCue) parts.push(`Sound: ${soundCue}`);

  return {
    ...result,
    prompt: parts.join('. '),
    source: parts.length > 0 ? 'assembled' : 'empty',
  };
}

function buildProjectionResult(
  data: Partial<Pick<ShotCanvasNode['data'], 'shotScale' | 'cameraMovement' | 'cameraAngle'>>,
): Omit<CanvasShotPromptProjection, 'prompt' | 'source'> {
  return {
    shotScale: readTrimmedString(data.shotScale),
    cameraMovement: readTrimmedString(data.cameraMovement),
    cameraAngle: readTrimmedString(data.cameraAngle),
  };
}

function readTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readStringList(values: readonly unknown[] | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => readTrimmedString(value))
    .filter((value): value is string => Boolean(value));
}

function readCharacterNames(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
      return readTrimmedString((value as { readonly characterName?: unknown }).characterName);
    })
    .filter((value): value is string => Boolean(value));
}
