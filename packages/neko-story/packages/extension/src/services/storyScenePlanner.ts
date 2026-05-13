import type {
  CameraAngle,
  CameraMovement,
  NekoStoryScriptIndex,
  ShotScale,
  StoryScenePlan,
  StoryShotPlan,
} from '@neko/shared';

const DEFAULT_SHOT_DURATION = 3;
const MIN_SHOT_COUNT = 1;
const MAX_SHOT_COUNT = 8;

type SceneDirective = NekoStoryScriptIndex['scenes'][number]['directives'][number];

const SHOT_SCALE_MAP: Record<string, ShotScale> = {
  wide: 'LS',
  establishing: 'LS',
  long: 'LS',
  medium: 'MS',
  mid: 'MS',
  'two-shot': 'MS',
  'close-up': 'CU',
  closeup: 'CU',
  close: 'CU',
  'extreme-close-up': 'ECU',
  ecu: 'ECU',
  insert: 'ECU',
  'over-the-shoulder': 'OTS',
  ots: 'OTS',
  pov: 'POV',
  aerial: 'LS',
};

const CAMERA_ANGLE_MAP: Record<string, CameraAngle> = {
  'eye-level': 'eye-level',
  low: 'low-angle',
  high: 'high-angle',
  dutch: 'dutch',
  'bird-eye': 'bird-eye',
  'worm-eye': 'low-angle',
};

const CAMERA_MOVEMENT_MAP: Record<string, CameraMovement> = {
  static: 'static',
  pan: 'pan',
  tilt: 'tilt',
  'dolly-in': 'dolly-in',
  'dolly-out': 'dolly-out',
  dolly: 'dolly',
  tracking: 'dolly',
  crane: 'crane',
  handheld: 'handheld',
  steadicam: 'static',
  'zoom-in': 'zoom-in',
  'zoom-out': 'zoom-out',
};

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
  const shotDurations = distributeDuration(scene.estimatedDuration, shotCount);
  const baseCharacters = scene.sceneCharacters.map((characterName) => ({ characterName }));
  const sceneTags = [scene.location, scene.timeOfDay ?? undefined].filter(
    (value): value is string => Boolean(value && value.trim()),
  );
  const summary = scene.actionSummary || scene.sceneTitle;

  const directives: readonly SceneDirective[] = scene.directives ?? [];
  const shotHints = directives.filter((d) => d.key === 'SHOT');
  const angleHints = directives.filter((d) => d.key === 'ANGLE');
  const moveHints = directives.filter((d) => d.key === 'MOVEMENT');
  const moods = directives.filter((d) => d.key === 'MOOD').map((d) => d.value);
  const musicCue = directives.find((d) => d.key === 'MUSIC')?.value;
  const sfxCues = directives.filter((d) => d.key === 'SFX').map((d) => d.value);
  const promptHints = directives.filter((d) => d.key === 'PROMPT');
  const styleHint = directives.find((d) => d.key === 'STYLE')?.value;
  const refHint = directives.find((d) => d.key === 'REF')?.value;
  const vfxCues = directives.filter((d) => d.key === 'VFX').map((d) => d.value);

  return Array.from({ length: shotCount }, (_, index) => {
    const shotScale = mapShotScale(shotHints[index]?.value) ?? resolveShotScale(index, shotCount);
    const cameraAngle =
      mapCameraAngle(angleHints[index]?.value) ?? (index === 0 ? 'eye-level' : undefined);
    const cameraMovement =
      mapCameraMovement(moveHints[index]?.value) ??
      (shotCount >= 3 && index === shotCount - 1 ? 'dolly-in' : undefined);
    const focusCharacters =
      baseCharacters.length > 0 && index > 0
        ? [baseCharacters[index % baseCharacters.length]!]
        : baseCharacters;

    return {
      shotNumber: index + 1,
      duration: shotDurations[index] ?? DEFAULT_SHOT_DURATION,
      visualDescription: buildVisualDescription(summary, index, shotCount),
      characters: focusCharacters,
      shotScale,
      cameraAngle,
      cameraMovement,
      characterAction: summary,
      emotion: moods.length > 0 ? moods : [],
      sceneTags,
      soundCue: sfxCues[index] ?? (index === 0 ? musicCue : undefined) ?? undefined,
      generationPrompt:
        promptHints[index]?.value ?? (index === 0 ? promptHints[0]?.value : undefined),
      visualStyle: styleHint,
      referenceImagePath: refHint,
      vfx: vfxCues.length > 0 ? vfxCues : undefined,
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

/**
 * Distribute a scene's total duration across shots.
 * First and last shots get slightly more time (establishing/payoff).
 * Falls back to equal split when scene duration is too small.
 */
function distributeDuration(sceneDuration: number, shotCount: number): number[] {
  if (shotCount <= 0) return [];
  const total = Math.max(sceneDuration, shotCount * MIN_SHOT_DURATION);
  if (shotCount === 1) return [Math.round(total)];

  const base = total / shotCount;
  return Array.from({ length: shotCount }, (_, i) => {
    const isEdge = i === 0 || i === shotCount - 1;
    const weight = isEdge ? 1.2 : 1.0;
    return Math.max(MIN_SHOT_DURATION, Math.round(base * weight));
  });
}

const MIN_SHOT_DURATION = 2;

function buildVisualDescription(summary: string, index: number, total: number): string {
  if (total <= 1) return summary;
  if (index === 0) return `${summary} Establish the scene context.`;
  if (index === total - 1) return `${summary} Emphasize the scene beat payoff.`;
  return `${summary} Focus on beat ${index + 1}.`;
}

function resolveShotScale(index: number, total: number): ShotScale {
  if (total === 1) return 'MS';
  if (index === 0) return 'LS';
  if (index === total - 1) return 'CU';
  return 'MS';
}

function mapShotScale(value: string | undefined): ShotScale | undefined {
  if (!value) return undefined;
  return SHOT_SCALE_MAP[value.toLowerCase().trim()];
}

function mapCameraAngle(value: string | undefined): CameraAngle | undefined {
  if (!value) return undefined;
  return CAMERA_ANGLE_MAP[value.toLowerCase().trim()];
}

function mapCameraMovement(value: string | undefined): CameraMovement | undefined {
  if (!value) return undefined;
  return CAMERA_MOVEMENT_MAP[value.toLowerCase().trim()];
}
