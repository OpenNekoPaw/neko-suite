import type { NekoStoryScriptIndex, StoryScenePlan, StoryShotPlan } from '@neko/shared';

const DEFAULT_SHOT_DURATION = 3;
const MIN_SHOT_COUNT = 1;
const MAX_SHOT_COUNT = 8;

export interface BuildStoryScenePlansOptions {
  readonly sceneIds?: readonly string[];
}

export function buildStoryScenePlans(
  scriptIndex: NekoStoryScriptIndex,
  options: BuildStoryScenePlansOptions = {},
): StoryScenePlan[] {
  const filterIds = new Set(options.sceneIds ?? []);
  const scenes = scriptIndex.scenes.filter((scene) =>
    filterIds.size === 0 ? true : filterIds.has(scene.sceneId),
  );

  return scenes.map((scene) => {
    const recommendedShotCount = estimateShotCount(scene);
    return {
      sceneId: scene.sceneId,
      sceneTitle: scene.sceneTitle,
      summary: scene.actionSummary,
      recommendedShotCount,
      shotPlans: buildShotPlansForScene(scene, recommendedShotCount),
    };
  });
}

export function buildShotPlansForScene(
  scene: NekoStoryScriptIndex['scenes'][number],
  recommendedShotCount = estimateShotCount(scene),
): StoryShotPlan[] {
  const shotCount = clampShotCount(recommendedShotCount);
  const baseCharacters = scene.sceneCharacters.map((characterName) => ({ characterName }));
  const sceneTags = [scene.location, scene.timeOfDay ?? undefined].filter(
    (value): value is string => Boolean(value && value.trim()),
  );
  const summary = scene.actionSummary || scene.sceneTitle;

  return Array.from({ length: shotCount }, (_, index) => {
    const shotScale = resolveShotScale(index, shotCount);
    const focusCharacters =
      baseCharacters.length > 0 && index > 0
        ? [baseCharacters[index % baseCharacters.length]!]
        : baseCharacters;

    return {
      shotNumber: index + 1,
      duration: DEFAULT_SHOT_DURATION,
      visualDescription: buildVisualDescription(summary, index, shotCount),
      characters: focusCharacters,
      shotScale,
      cameraAngle: index === 0 ? 'eye_level' : undefined,
      cameraMovement: shotCount >= 3 && index === shotCount - 1 ? 'push_in' : undefined,
      characterAction: summary,
      emotion: [],
      sceneTags,
    };
  });
}

function estimateShotCount(scene: NekoStoryScriptIndex['scenes'][number]): number {
  const lineSpan = scene.line_end - scene.line_start + 1;
  const dialogueFactor = scene.sceneCharacters.length > 2 ? 1 : 0;
  const durationFactor = scene.estimatedDuration >= 30 ? 1 : 0;
  return clampShotCount(Math.round(lineSpan / 10) + dialogueFactor + durationFactor);
}

function clampShotCount(rawCount: number): number {
  return Math.max(MIN_SHOT_COUNT, Math.min(rawCount || MIN_SHOT_COUNT, MAX_SHOT_COUNT));
}

function buildVisualDescription(summary: string, index: number, total: number): string {
  if (total <= 1) return summary;
  if (index === 0) return `${summary} Establish the scene context.`;
  if (index === total - 1) return `${summary} Emphasize the scene beat payoff.`;
  return `${summary} Focus on beat ${index + 1}.`;
}

function resolveShotScale(index: number, total: number): StoryShotPlan['shotScale'] {
  if (total === 1) return 'MS';
  if (index === 0) return 'WS';
  if (index === total - 1) return 'CU';
  return 'MS';
}
