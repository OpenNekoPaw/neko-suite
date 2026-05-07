import type { CanvasStoryboardPayload, ShotScale, StoryboardImportMode } from '@neko/shared';
import type {
  PluginTransferAssetRef,
  PluginTransferCutStoryboardPayload,
  PluginTransferCutStoryboardShot,
  PluginTransferPayload,
} from '@neko-agent/types';
import type { StoryboardScene } from '@/components/ChatView/MediaPreview';
import type {
  ResolvedCompositeMedia,
  ResolvedCompositeSection,
  StoryboardTableRichData,
} from './composite-content-presenter';

const DEFAULT_SHOT_DURATION_SECONDS = 3;
const DEFAULT_SHOT_SCALE: ShotScale = 'MS';

export function projectStoryboardScenesTransferPayload(
  scenes: readonly StoryboardScene[],
): PluginTransferPayload | null {
  const storyboard = projectStoryboardScenesToCanvasPayload(scenes);
  if (!storyboard) return null;
  return { kind: 'canvasStoryboard', storyboard };
}

export function projectStoryboardScenesAssetBatch(
  scenes: readonly StoryboardScene[],
): PluginTransferPayload | null {
  const assets = scenes.flatMap((scene) =>
    scene.shots.flatMap((shot) =>
      shot.localPath
        ? [
            {
              path: shot.localPath,
              mediaType: 'image' as const,
              name: `scene-${scene.sceneIndex}-shot-${shot.shotIndex}`,
            },
          ]
        : [],
    ),
  );
  return assets.length > 0 ? { kind: 'assetBatch', assets } : null;
}

export function projectStoryboardScenesCutTimelinePayload(
  scenes: readonly StoryboardScene[],
): PluginTransferPayload | null {
  const storyboard = projectStoryboardScenesToCutPayload(scenes);
  return storyboard ? { kind: 'cutStoryboard', storyboard } : null;
}

export function projectStoryboardTableTransferPayload(
  data: StoryboardTableRichData,
): PluginTransferPayload | null {
  const storyboard = projectStoryboardTableToCanvasPayload(data);
  if (!storyboard) return null;
  return { kind: 'canvasStoryboard', storyboard };
}

export function projectStoryboardTableAssetBatch(
  data: StoryboardTableRichData,
): PluginTransferPayload | null {
  const assets = data.sections.flatMap((section) =>
    section.media.flatMap((media, mediaIndex) => {
      const asset = projectCompositeMediaAssetRef(media, section, mediaIndex);
      return asset ? [asset] : [];
    }),
  );
  return assets.length > 0 ? { kind: 'assetBatch', assets } : null;
}

export function projectStoryboardTableCutTimelinePayload(
  data: StoryboardTableRichData,
): PluginTransferPayload | null {
  const storyboard = projectStoryboardTableToCutPayload(data);
  return storyboard ? { kind: 'cutStoryboard', storyboard } : null;
}

function projectStoryboardScenesToCanvasPayload(
  scenes: readonly StoryboardScene[],
): CanvasStoryboardPayload | null {
  let nextShotNumber = 1;
  const projectedScenes = scenes.map((scene, index) => {
    const shotPlans = scene.shots.map((shot) => ({
      shotNumber: nextShotNumber++,
      duration: DEFAULT_SHOT_DURATION_SECONDS,
      visualDescription: `Scene ${scene.sceneIndex} shot ${shot.shotIndex}`,
      characters: [],
      shotScale: normalizeShotScale(shot.shotScale),
      characterAction: '',
      emotion: [],
      sceneTags: [],
    }));

    return {
      sceneId: `agent-storyboard-scene-${scene.sceneIndex || index + 1}`,
      sceneTitle: scene.heading || `Scene ${scene.sceneIndex || index + 1}`,
      sceneNumber: scene.sceneIndex || index + 1,
      shotPlans,
    };
  });

  if (projectedScenes.length === 0) return null;
  return createCanvasStoryboardPayload(
    'semantic',
    'agent://rich-content/storyboard',
    projectedScenes,
  );
}

function projectStoryboardTableToCanvasPayload(
  data: StoryboardTableRichData,
): CanvasStoryboardPayload | null {
  let nextShotNumber = 1;
  const scenes = data.sections.map((section, index) => {
    const imageMedia = section.media.filter((media) => media.type === 'image');
    const shotPlans = (imageMedia.length > 0 ? imageMedia : [undefined]).map((media) => {
      const description = section.content ?? section.heading ?? `Storyboard row ${index + 1}`;
      return {
        shotNumber: nextShotNumber++,
        duration: DEFAULT_SHOT_DURATION_SECONDS,
        visualDescription: description,
        characters: [],
        shotScale: DEFAULT_SHOT_SCALE,
        characterAction: description,
        emotion: [],
        sceneTags: compactStrings([media?.caption, media?.role]),
      };
    });

    return {
      sceneId: `agent-composite-section-${section.index + 1}`,
      sceneTitle: section.heading ?? data.title ?? `Storyboard ${section.index + 1}`,
      sceneNumber: section.index + 1,
      shotPlans,
    };
  });

  if (scenes.length === 0) return null;
  return createCanvasStoryboardPayload('semantic', 'agent://rich-content/storyboard-table', scenes);
}

function projectStoryboardScenesToCutPayload(
  scenes: readonly StoryboardScene[],
): PluginTransferCutStoryboardPayload | null {
  const shots: PluginTransferCutStoryboardShot[] = [];
  let nextShotNumber = 1;
  for (const scene of scenes) {
    for (const shot of scene.shots) {
      if (!shot.localPath) continue;
      const shotNumber = nextShotNumber++;
      shots.push({
        id: `agent-scene-${scene.sceneIndex}-shot-${shot.shotIndex}`,
        shotNumber,
        duration: DEFAULT_SHOT_DURATION_SECONDS,
        imagePath: shot.localPath,
        label: `#${String(shotNumber).padStart(3, '0')} ${shot.shotScale ?? ''}`.trim(),
      });
    }
  }

  return shots.length > 0 ? { projectName: 'Agent Storyboard', shots } : null;
}

function projectStoryboardTableToCutPayload(
  data: StoryboardTableRichData,
): PluginTransferCutStoryboardPayload | null {
  let nextShotNumber = 1;
  const shots = data.sections.flatMap((section) =>
    section.media.flatMap((media, mediaIndex) => {
      if (media.type !== 'image' || !media.localPath) return [];
      const shotNumber = nextShotNumber++;
      const label = media.caption ?? section.heading ?? `#${String(shotNumber).padStart(3, '0')}`;
      return [
        {
          id: media.assetId ?? media.id,
          shotNumber,
          duration: DEFAULT_SHOT_DURATION_SECONDS,
          imagePath: media.localPath,
          ...(section.content ? { dialogue: section.content } : {}),
          label: mediaIndex === 0 ? label : `${label} ${mediaIndex + 1}`,
        } satisfies PluginTransferCutStoryboardShot,
      ];
    }),
  );

  return shots.length > 0 ? { projectName: data.title ?? 'Agent Storyboard', shots } : null;
}

function createCanvasStoryboardPayload(
  mode: StoryboardImportMode,
  sourceScriptUri: string,
  scenes: CanvasStoryboardPayload['scenes'],
): CanvasStoryboardPayload {
  return {
    mode,
    sourceScriptUri,
    scenes,
  };
}

function projectCompositeMediaAssetRef(
  media: ResolvedCompositeMedia,
  section: ResolvedCompositeSection,
  mediaIndex: number,
): PluginTransferAssetRef | null {
  if (!media.localPath || media.type === 'unknown') return null;
  return {
    path: media.localPath,
    mediaType: media.type,
    name:
      media.caption ??
      media.label ??
      section.heading ??
      `section-${section.index + 1}-asset-${mediaIndex + 1}`,
  };
}

function normalizeShotScale(value: string | undefined): ShotScale {
  if (
    value === 'ECU' ||
    value === 'CU' ||
    value === 'MCU' ||
    value === 'MS' ||
    value === 'MLS' ||
    value === 'LS' ||
    value === 'VLS' ||
    value === 'ELS'
  ) {
    return value;
  }
  return DEFAULT_SHOT_SCALE;
}

function compactStrings(values: readonly (string | undefined)[]): string[] {
  return values.filter((value): value is string => typeof value === 'string' && value.length > 0);
}
