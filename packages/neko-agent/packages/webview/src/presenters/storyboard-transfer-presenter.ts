import {
  hasBlockingStoryboardDiagnostics,
  projectStoryboardTableToCutPayload as projectSemanticStoryboardTableToCutPayload,
  type DocumentArchiveResourceRef,
  type StoryboardMediaRef,
} from '@neko/shared';
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

export function projectStoryboardScenesAssetBatch(
  scenes: readonly StoryboardScene[],
): PluginTransferPayload | null {
  const assets = scenes.flatMap((scene) =>
    scene.shots.flatMap((shot) => {
      const portablePath = readPortableTransferPath(shot.localPath);
      return portablePath
        ? [
            {
              path: portablePath,
              mediaType: 'image' as const,
              name: `scene-${scene.sceneIndex}-shot-${shot.shotIndex}`,
            },
          ]
        : [];
    }),
  );
  return assets.length > 0 ? { kind: 'assetBatch', assets } : null;
}

export function projectStoryboardScenesCutTimelinePayload(
  scenes: readonly StoryboardScene[],
): PluginTransferPayload | null {
  const storyboard = projectStoryboardScenesToCutPayload(scenes);
  return storyboard ? { kind: 'cutStoryboard', storyboard } : null;
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
  if (data.storyboardTable) {
    const storyboard = projectSemanticStoryboardTableToCutPayload(data.storyboardTable, {
      resolveImagePath: ({ mediaRef }) => resolveStoryboardMediaPath(data, mediaRef),
    });
    return storyboard ? { kind: 'cutStoryboard', storyboard } : null;
  }
  if (hasBlockingStoryboardDiagnostics(data.storyboardDiagnostics ?? [])) return null;
  const storyboard = projectStoryboardTableToCutPayload(data);
  return storyboard ? { kind: 'cutStoryboard', storyboard } : null;
}

function resolveStoryboardMediaPath(
  data: StoryboardTableRichData,
  mediaRef: StoryboardMediaRef,
): string | undefined {
  const media = resolveStoryboardMedia(data, mediaRef);
  return getLocalImageMediaPath(media);
}

function resolveStoryboardMedia(
  data: StoryboardTableRichData,
  mediaRef: StoryboardMediaRef,
): ResolvedCompositeMedia | undefined {
  if (mediaRef.locator.type === 'tool-result') {
    const locator = mediaRef.locator;
    const exact = findStoryboardMedia(data, (media) => {
      return media.toolCallId === locator.toolCallId && media.assetIndex === locator.assetIndex;
    });
    if (exact) return exact;
  }

  return findStoryboardMedia(data, (media) => doesStoryboardMediaMatchRef(media, mediaRef));
}

function findStoryboardMedia(
  data: StoryboardTableRichData,
  predicate: (media: ResolvedCompositeMedia) => boolean,
): ResolvedCompositeMedia | undefined {
  for (const section of data.sections) {
    for (const media of section.media) {
      if (predicate(media)) return media;
    }
  }
  return undefined;
}

function doesStoryboardMediaMatchRef(
  media: ResolvedCompositeMedia,
  mediaRef: StoryboardMediaRef,
): boolean {
  const locator = mediaRef.locator;
  return (
    media.id.includes(mediaRef.refId) ||
    media.assetId === mediaRef.refId ||
    media.stableUri === mediaRef.refId ||
    (locator.type === 'asset' &&
      (media.assetId === locator.assetId || media.stableUri === locator.uri))
  );
}

function getLocalImageMediaPath(media: ResolvedCompositeMedia | undefined): string | undefined {
  return (
    (media?.stableUri && isCanvasReferenceImagePathUsable(media.stableUri)
      ? media.stableUri
      : undefined) ?? (media?.src && isCanvasPortableImageUrl(media.src) ? media.src : undefined)
  );
}

function isCanvasPortableImageUrl(value: string): boolean {
  return value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://');
}

function projectStoryboardScenesToCutPayload(
  scenes: readonly StoryboardScene[],
): PluginTransferCutStoryboardPayload | null {
  const shots: PluginTransferCutStoryboardShot[] = [];
  let nextShotNumber = 1;
  for (const scene of scenes) {
    for (const shot of scene.shots) {
      const imagePath = readPortableTransferPath(shot.localPath);
      if (!imagePath) continue;
      const shotNumber = nextShotNumber++;
      shots.push({
        id: `agent-scene-${scene.sceneIndex}-shot-${shot.shotIndex}`,
        shotNumber,
        duration: DEFAULT_SHOT_DURATION_SECONDS,
        imagePath,
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
      const imagePath = getLocalImageMediaPath(media);
      if (media.type !== 'image' || !imagePath) return [];
      const shotNumber = nextShotNumber++;
      const label = media.caption ?? section.heading ?? `#${String(shotNumber).padStart(3, '0')}`;
      return [
        {
          id: media.assetId ?? media.id,
          shotNumber,
          duration: DEFAULT_SHOT_DURATION_SECONDS,
          imagePath,
          ...(section.content ? { dialogue: section.content } : {}),
          label: mediaIndex === 0 ? label : `${label} ${mediaIndex + 1}`,
        } satisfies PluginTransferCutStoryboardShot,
      ];
    }),
  );

  return shots.length > 0 ? { projectName: data.title ?? 'Agent Storyboard', shots } : null;
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);
}

function projectCompositeMediaAssetRef(
  media: ResolvedCompositeMedia,
  section: ResolvedCompositeSection,
  mediaIndex: number,
): PluginTransferAssetRef | null {
  if (media.type === 'unknown') return null;
  const portablePath =
    media.stableUri && isCanvasReferenceImagePathUsable(media.stableUri)
      ? media.stableUri
      : undefined;
  if (!portablePath && !media.resourceRef) return null;
  return {
    ...(media.resourceRef ? {} : { path: portablePath }),
    mediaType: media.type,
    name:
      media.caption ??
      media.label ??
      section.heading ??
      `section-${section.index + 1}-asset-${mediaIndex + 1}`,
    ...(media.resourceRef
      ? { documentResourceRef: toStableDocumentArchiveResourceRef(media.resourceRef) }
      : {}),
  };
}

function readPortableTransferPath(value: string | undefined): string | undefined {
  return value && isCanvasReferenceImagePathUsable(value) ? value : undefined;
}

function isCanvasReferenceImagePathUsable(value: string): boolean {
  if (!value || value.startsWith('blob:') || value.startsWith('file:')) return false;
  if (value.startsWith('generated-assets/')) return false;
  if (/^(?:p|page|image|img|panel)[_-]?\d{1,4}$/i.test(value.trim())) return false;
  if (/^p\d{1,4}$/i.test(value.trim())) return false;
  const normalized = value.replace(/\\/g, '/').toLowerCase();
  if (normalized.includes('/.neko/.cache/')) return false;
  if (value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://')) {
    return true;
  }
  if (value.startsWith('${')) return true;
  return !isAbsolutePath(value);
}

function toStableDocumentArchiveResourceRef(
  ref: DocumentArchiveResourceRef | undefined,
): DocumentArchiveResourceRef | undefined {
  if (!ref) return undefined;
  return ref;
}
