import type { NekoCanvasAPI, NekoStoryScriptIndex } from '../types/extension-api';
import type {
  ApplyCanvasStoryboardOptions,
  CanvasStoryboardPayload,
  CanvasStoryboardScenePlan,
  CanvasStoryboardShotPlan,
  CreateStoryboardPayloadOptions,
  CreatedCanvasStoryboard,
  StoryScenePlan,
  StoryShotPlan,
} from '../types/storyboard-planner';
import type { CanvasNodeType, ShotCharacter } from '../types/canvas';

const DEFAULT_START_X = 100;
const DEFAULT_START_Y = 100;
const SCENE_WIDTH = 900;
const SCENE_GAP = 80;
const SHOT_WIDTH = 200;
const SHOT_GAP = 20;
const DEFAULT_SHOT_DURATION = 3;

export function createStoryboardPayload(
  scriptIndex: NekoStoryScriptIndex,
  options: CreateStoryboardPayloadOptions = {},
): CanvasStoryboardPayload {
  const mode = options.mode ?? 'mechanical';
  const maxScenes = Math.min(
    options.scenesLimit ?? scriptIndex.scenes.length,
    scriptIndex.scenes.length,
  );
  const scenePlans = new Map((options.scenePlans ?? []).map((plan) => [plan.sceneId, plan]));
  let nextShotNumber = 1;

  const scenes: CanvasStoryboardScenePlan[] = scriptIndex.scenes
    .slice(0, maxScenes)
    .map((scene, index) => {
      const scenePlan = scenePlans.get(scene.sceneId);
      const shotPlans =
        mode === 'semantic'
          ? buildSemanticShotPlans(scene, scenePlan, nextShotNumber, options.characterBindings)
          : buildMechanicalShotPlans(scene, scenePlan, nextShotNumber, options.characterBindings);
      nextShotNumber += shotPlans.length;

      return {
        sceneId: scene.sceneId,
        sceneTitle: scenePlan?.sceneTitle ?? scene.sceneTitle,
        sceneNumber: parseSceneNumber(scene.sceneNumber, index + 1),
        location: scene.location || undefined,
        timeOfDay: scene.timeOfDay,
        shotPlans,
      };
    });

  return {
    mode,
    sourceScriptUri: scriptIndex.uri,
    scenes,
  };
}

export async function applyStoryboardPayloadToCanvas(
  api: Pick<NekoCanvasAPI, 'nodes'>,
  payload: CanvasStoryboardPayload,
  options: ApplyCanvasStoryboardOptions = {},
): Promise<CreatedCanvasStoryboard> {
  const startX = options.startX ?? DEFAULT_START_X;
  const startY = options.startY ?? DEFAULT_START_Y;
  const createdScenes: Array<{ sourceSceneId: string; sceneNodeId: string; shotIds: string[] }> =
    [];

  for (let sceneIndex = 0; sceneIndex < payload.scenes.length; sceneIndex++) {
    const scene = payload.scenes[sceneIndex];
    if (!scene) continue;

    const sceneX = startX + sceneIndex * (SCENE_WIDTH + SCENE_GAP);
    const sceneNodeId = await api.nodes.create(
      'scene' as CanvasNodeType,
      { x: sceneX, y: startY },
      {
        sceneId: scene.sceneId,
        sceneTitle: scene.sceneTitle,
        sceneNumber: scene.sceneNumber,
        location: scene.location,
        timeOfDay: scene.timeOfDay ?? undefined,
        shotIds: [] as string[],
      },
    );

    const shotIds: string[] = [];
    for (let shotIndex = 0; shotIndex < scene.shotPlans.length; shotIndex++) {
      const shot = scene.shotPlans[shotIndex];
      if (!shot) continue;

      const shotX = sceneX + shotIndex * (SHOT_WIDTH + SHOT_GAP);
      const shotY = startY + 240;
      const shotNodeId = await api.nodes.create(
        'shot' as CanvasNodeType,
        { x: shotX, y: shotY },
        {
          shotNumber: shot.shotNumber,
          sceneGroupId: sceneNodeId,
          duration: shot.duration,
          visualDescription: shot.visualDescription,
          shotScale: shot.shotScale,
          characters: [...shot.characters],
          cameraMovement: shot.cameraMovement,
          cameraAngle: shot.cameraAngle,
          characterAction: shot.characterAction,
          emotion: [...shot.emotion],
          sceneTags: [...shot.sceneTags],
          generationStatus: 'idle' as const,
          generationHistory: [] as unknown[],
          dialogue: shot.dialogue,
          voiceOver: shot.voiceOver,
          soundCue: shot.soundCue,
          // Phase 6.3 — stamp plan provenance when orchestrated
          ...(options.workflowPlanId !== undefined && {
            workflowPlanId: options.workflowPlanId,
          }),
        },
      );
      shotIds.push(shotNodeId);
    }

    await api.nodes.update(sceneNodeId, { shotIds });
    createdScenes.push({ sourceSceneId: scene.sceneId, sceneNodeId, shotIds });
  }

  return {
    mode: payload.mode,
    scenesCreated: createdScenes.length,
    totalShots: createdScenes.reduce((total, scene) => total + scene.shotIds.length, 0),
    scenes: createdScenes,
  };
}

function buildMechanicalShotPlans(
  scene: NekoStoryScriptIndex['scenes'][number],
  scenePlan: StoryScenePlan | undefined,
  firstShotNumber: number,
  characterBindings: Readonly<Record<string, string>> | undefined,
): CanvasStoryboardShotPlan[] {
  const lineSpan = scene.line_end - scene.line_start;
  const shotCount = clampShotCount(scenePlan?.recommendedShotCount ?? Math.round(lineSpan / 10));
  const sceneTags = compactTags([scene.location, scene.timeOfDay ?? undefined]);
  const baseDescription = scene.actionSummary || scene.sceneTitle;

  return Array.from({ length: shotCount }, (_, index) => ({
    shotNumber: firstShotNumber + index,
    duration: DEFAULT_SHOT_DURATION,
    visualDescription: baseDescription,
    characters: createShotCharacters(scene.sceneCharacters, characterBindings),
    shotScale: 'MS',
    characterAction: scene.actionSummary || '',
    emotion: [],
    sceneTags,
  }));
}

function buildSemanticShotPlans(
  scene: NekoStoryScriptIndex['scenes'][number],
  scenePlan: StoryScenePlan | undefined,
  firstShotNumber: number,
  characterBindings: Readonly<Record<string, string>> | undefined,
): CanvasStoryboardShotPlan[] {
  const semanticPlans = scenePlan?.shotPlans ?? [];
  if (semanticPlans.length === 0) {
    return buildMechanicalShotPlans(scene, scenePlan, firstShotNumber, characterBindings);
  }

  return semanticPlans.map((shotPlan, index) =>
    normalizeShotPlan(scene, shotPlan, firstShotNumber + index, characterBindings),
  );
}

function normalizeShotPlan(
  scene: NekoStoryScriptIndex['scenes'][number],
  shotPlan: StoryShotPlan,
  shotNumber: number,
  characterBindings: Readonly<Record<string, string>> | undefined,
): CanvasStoryboardShotPlan {
  return {
    shotNumber: shotPlan.shotNumber ?? shotNumber,
    duration: shotPlan.duration ?? DEFAULT_SHOT_DURATION,
    visualDescription: shotPlan.visualDescription ?? (scene.actionSummary || scene.sceneTitle),
    characters: shotPlan.characters
      ? attachCharacterBindings(shotPlan.characters, characterBindings)
      : createShotCharacters(scene.sceneCharacters, characterBindings),
    shotScale: shotPlan.shotScale ?? 'MS',
    cameraMovement: shotPlan.cameraMovement,
    cameraAngle: shotPlan.cameraAngle,
    characterAction: shotPlan.characterAction ?? scene.actionSummary ?? '',
    emotion: [...(shotPlan.emotion ?? [])],
    sceneTags: [
      ...(shotPlan.sceneTags ?? compactTags([scene.location, scene.timeOfDay ?? undefined])),
    ],
    dialogue: shotPlan.dialogue,
    voiceOver: shotPlan.voiceOver,
    soundCue: shotPlan.soundCue,
  };
}

function createShotCharacters(
  sceneCharacters: readonly string[],
  characterBindings: Readonly<Record<string, string>> | undefined,
): ShotCharacter[] {
  return sceneCharacters.map((characterName) => {
    const characterId = resolveCharacterBinding(characterBindings, characterName);
    return characterId ? { characterId, characterName } : { characterName };
  });
}

function attachCharacterBindings(
  characters: readonly ShotCharacter[],
  characterBindings: Readonly<Record<string, string>> | undefined,
): ShotCharacter[] {
  return characters.map((character) => {
    if (character.characterId) {
      return { ...character };
    }

    const characterId = resolveCharacterBinding(characterBindings, character.characterName);
    return characterId ? { ...character, characterId } : { ...character };
  });
}

function resolveCharacterBinding(
  characterBindings: Readonly<Record<string, string>> | undefined,
  characterName: string,
): string | undefined {
  if (!characterBindings) {
    return undefined;
  }

  const directMatch = characterBindings[characterName];
  if (directMatch) {
    return directMatch;
  }

  const target = normalizeLookupKey(characterName);
  if (!target) {
    return undefined;
  }

  for (const [candidate, characterId] of Object.entries(characterBindings)) {
    if (normalizeLookupKey(candidate) === target) {
      return characterId;
    }
  }

  return undefined;
}

function normalizeLookupKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function compactTags(values: Array<string | undefined>): string[] {
  return values
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.trim());
}

function clampShotCount(rawCount: number): number {
  return Math.max(1, Math.min(rawCount || 1, 8));
}

function parseSceneNumber(sceneNumber: string | null, fallback: number): number {
  if (!sceneNumber) return fallback;
  const parsed = Number.parseInt(sceneNumber, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
