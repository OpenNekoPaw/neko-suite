import type {
  CanvasNodeType,
  GalleryPreset,
  GeneratedImageVersion,
  PortDefinition,
  ScriptScene,
  ShotCharacter,
  TableColumnDef,
} from '@neko/shared';
import { GALLERY_PRESET_CONFIGS, getBuiltInCanvasNodePresetMetadata } from '@neko/shared';
import {
  applyCanvasNodePreset,
  createBuiltInCanvasNodePresetRegistry,
  getCanvasNodePreset,
} from './canvasPresetRegistry';
import type { CanvasNodeDraft } from './canvasPresetRegistry';

const NODE_PRESETS = createBuiltInCanvasNodePresetRegistry();

interface BuildCanvasNodeOptions {
  type: CanvasNodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  zIndex: number;
  preset?: string;
}

type NodeDefaultSize = { width: number; height: number };

export const NODE_DEFAULT_SIZES: Record<CanvasNodeType, NodeDefaultSize> = {
  media: { width: 280, height: 200 },
  storyboard: { width: 240, height: 160 },
  annotation: { width: 200, height: 100 },
  group: { width: 320, height: 220 },
  text: { width: 260, height: 120 },
  artboard: { width: 640, height: 360 },
  table: { width: 660, height: 400 },
  shot: { width: 220, height: 200 },
  scene: { width: 640, height: 400 },
  gallery: { width: 290, height: 360 },
  script: { width: 280, height: 220 },
  document: { width: 220, height: 280 },
  model: { width: 240, height: 160 },
  'canvas-embed': { width: 260, height: 180 },
  project: { width: 260, height: 180 },
};

const DEFAULT_EMPTY_HISTORY: GeneratedImageVersion[] = [];
const DEFAULT_EMPTY_CHARACTERS: ShotCharacter[] = [];
const DEFAULT_EMPTY_SCENES: ScriptScene[] = [];
const DEFAULT_EMPTY_PORTS: PortDefinition[] = [];

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function asObjectArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function inferDocumentType(value: unknown): 'pdf' | 'docx' | 'epub' | 'cbz' {
  if (value === 'pdf' || value === 'docx' || value === 'epub' || value === 'cbz') {
    return value;
  }
  return 'pdf';
}

function inferMediaType(value: unknown): 'image' | 'video' | 'audio' {
  return value === 'video' || value === 'audio' ? value : 'image';
}

function inferModelType(value: unknown): 'lora' | 'checkpoint' | 'controlnet' | 'vae' {
  if (value === 'lora' || value === 'checkpoint' || value === 'controlnet' || value === 'vae') {
    return value;
  }
  return 'lora';
}

function inferModelRole(value: unknown): 'reference' | 'workflow' {
  return value === 'workflow' ? 'workflow' : 'reference';
}

function inferProjectType(value: unknown): 'nkv' | 'nka' | 'nkm' | 'nkp' {
  if (value === 'nkv' || value === 'nka' || value === 'nkm' || value === 'nkp') {
    return value;
  }
  return 'nkv';
}

function inferGalleryPreset(value: unknown): GalleryPreset {
  if (
    value === 'character-3view' ||
    value === 'character-4view' ||
    value === 'expression-9' ||
    value === 'turnaround-8' ||
    value === 'scene-views' ||
    value === 'custom'
  ) {
    return value;
  }
  return 'character-3view';
}

function getNodeDefaultSize(type: CanvasNodeType): NodeDefaultSize {
  return NODE_DEFAULT_SIZES[type] ?? { width: 200, height: 100 };
}

export function buildCanvasNode(options: BuildCanvasNodeOptions): CanvasNodeDraft {
  const { type, position, data, zIndex } = options;
  if (options.preset && !getBuiltInCanvasNodePresetMetadata(options.preset)) {
    throw new Error(`Unsupported preset "${options.preset}"`);
  }
  const preset = getCanvasNodePreset(NODE_PRESETS, options.preset);

  switch (type) {
    case 'annotation':
      return applyCanvasNodePreset(
        {
          type,
          position,
          size: getNodeDefaultSize(type),
          zIndex,
          data: {
            content: asString(data.content, ''),
            style: typeof data.style === 'object' && data.style ? data.style : undefined,
          },
        },
        preset,
      );
    case 'media':
      return applyCanvasNodePreset(
        {
          type,
          position,
          size: { width: 280, height: inferMediaType(data.mediaType) === 'audio' ? 80 : 200 },
          zIndex,
          data: {
            assetPath: asString(data.assetPath, ''),
            thumbnailPath: asString(data.thumbnailPath) || undefined,
            mediaType: inferMediaType(data.mediaType),
            duration: typeof data.duration === 'number' ? data.duration : undefined,
          },
        },
        preset,
      );
    case 'storyboard':
      return {
        type,
        position,
        size: getNodeDefaultSize(type),
        zIndex,
        data: {
          title: asString(data.title, ''),
          description: asString(data.description) || undefined,
          duration: typeof data.duration === 'number' ? data.duration : undefined,
          color: asString(data.color) || undefined,
        },
      };
    case 'text':
      return applyCanvasNodePreset(
        {
          type,
          position,
          size: getNodeDefaultSize(type),
          zIndex,
          data: {
            content: asString(data.content, ''),
            format: data.format === 'markdown' ? 'markdown' : 'plain',
            style: typeof data.style === 'object' && data.style ? data.style : undefined,
          },
        },
        preset,
      );
    case 'artboard':
      return {
        type,
        position,
        size: getNodeDefaultSize(type),
        zIndex,
        data: {
          name: asString(data.name, 'Artboard'),
          description: asString(data.description) || undefined,
          backgroundColor: asString(data.backgroundColor) || undefined,
          showBorder: typeof data.showBorder === 'boolean' ? data.showBorder : true,
          preset:
            data.preset === '1080p' ||
            data.preset === '4k' ||
            data.preset === 'instagram' ||
            data.preset === 'story' ||
            data.preset === 'youtube'
              ? data.preset
              : 'custom',
        },
      };
    case 'table': {
      const columnCount = asNumber(data.columnCount, 3);
      const defaultColumns: TableColumnDef[] = Array.from({ length: columnCount }, (_, i) => ({
        id: `col-${Date.now()}-${i}`,
        label: `Column ${i + 1}`,
        width: 200,
      }));
      return applyCanvasNodePreset(
        {
          type,
          position,
          size: getNodeDefaultSize(type),
          zIndex,
          data: {
            label: asString(data.label) || undefined,
            columns: Array.isArray(data.columns)
              ? (data.columns as TableColumnDef[])
              : defaultColumns,
            rowCount: asNumber(data.rowCount, 3),
            columnCount,
            showHeader: typeof data.showHeader === 'boolean' ? data.showHeader : true,
          },
        },
        preset,
      );
    }
    case 'shot':
      return applyCanvasNodePreset(
        {
          type,
          position,
          size: getNodeDefaultSize(type),
          zIndex,
          data: {
            shotNumber: asNumber(data.shotNumber, zIndex + 1),
            duration: asNumber(data.duration, 3),
            visualDescription: asString(data.visualDescription, ''),
            characters: asObjectArray<ShotCharacter>(data.characters) ?? DEFAULT_EMPTY_CHARACTERS,
            shotScale:
              data.shotScale === 'ECU' ||
              data.shotScale === 'CU' ||
              data.shotScale === 'MCU' ||
              data.shotScale === 'MS' ||
              data.shotScale === 'MLS' ||
              data.shotScale === 'LS' ||
              data.shotScale === 'VLS' ||
              data.shotScale === 'ELS'
                ? data.shotScale
                : 'MS',
            cameraMovement:
              data.cameraMovement === 'static' ||
              data.cameraMovement === 'pan' ||
              data.cameraMovement === 'tilt' ||
              data.cameraMovement === 'zoom-in' ||
              data.cameraMovement === 'zoom-out' ||
              data.cameraMovement === 'dolly' ||
              data.cameraMovement === 'dolly-in' ||
              data.cameraMovement === 'dolly-out' ||
              data.cameraMovement === 'handheld' ||
              data.cameraMovement === 'crane'
                ? data.cameraMovement
                : undefined,
            cameraAngle:
              data.cameraAngle === 'eye-level' ||
              data.cameraAngle === 'high-angle' ||
              data.cameraAngle === 'low-angle' ||
              data.cameraAngle === 'bird-eye' ||
              data.cameraAngle === 'dutch'
                ? data.cameraAngle
                : undefined,
            characterAction: asString(data.characterAction, ''),
            emotion: asStringArray(data.emotion),
            sceneTags: asStringArray(data.sceneTags),
            referenceNodeId: asString(data.referenceNodeId) || undefined,
            generatedImage: asString(data.generatedImage) || undefined,
            generatedVideo: asString(data.generatedVideo) || undefined,
            generationStatus:
              data.generationStatus === 'pending' ||
              data.generationStatus === 'generating' ||
              data.generationStatus === 'done' ||
              data.generationStatus === 'error'
                ? data.generationStatus
                : 'idle',
            generationHistory:
              asObjectArray<GeneratedImageVersion>(data.generationHistory) ?? DEFAULT_EMPTY_HISTORY,
            dialogue: asString(data.dialogue) || undefined,
            voiceOver: asString(data.voiceOver) || undefined,
            soundCue: asString(data.soundCue) || undefined,
            lastImportedToTimelineAt:
              typeof data.lastImportedToTimelineAt === 'number'
                ? data.lastImportedToTimelineAt
                : undefined,
            lastImportedToTimelineProject:
              asString(data.lastImportedToTimelineProject) || undefined,
          },
        },
        preset,
      );
    case 'scene':
      return applyCanvasNodePreset(
        {
          type,
          position,
          size: getNodeDefaultSize(type),
          zIndex,
          data: {
            sceneTitle: asString(data.sceneTitle, 'Scene'),
            sceneNumber: asNumber(data.sceneNumber, zIndex + 1),
            location: asString(data.location) || undefined,
            timeOfDay: asString(data.timeOfDay) || undefined,
          },
        },
        preset,
      );
    case 'gallery': {
      const galleryPreset = inferGalleryPreset(data.preset);
      const presetConfig = GALLERY_PRESET_CONFIGS[galleryPreset];
      return applyCanvasNodePreset(
        {
          type,
          position,
          size: {
            width: Math.max(240, presetConfig.cols * 90 + 20),
            height: presetConfig.rows * 100 + 60,
          },
          zIndex,
          data: {
            preset: galleryPreset,
            rows: asNumber(data.rows, presetConfig.rows),
            cols: asNumber(data.cols, presetConfig.cols),
            globalPromptPrefix: asString(data.globalPromptPrefix) || undefined,
            characterId: asString(data.characterId) || undefined,
            characterName: asString(data.characterName) || undefined,
            characterProfile:
              typeof data.characterProfile === 'object' && data.characterProfile
                ? data.characterProfile
                : undefined,
          },
        },
        preset,
      );
    }
    case 'script':
      return {
        type,
        position,
        size: getNodeDefaultSize(type),
        zIndex,
        data: {
          scriptPath: asString(data.scriptPath, ''),
          scriptTitle: asString(data.scriptTitle, ''),
          scenes: asObjectArray<ScriptScene>(data.scenes) ?? DEFAULT_EMPTY_SCENES,
          linkedSceneGroupId: asString(data.linkedSceneGroupId) || undefined,
        },
      };
    case 'document':
      return {
        type,
        position,
        size: getNodeDefaultSize(type),
        zIndex,
        data: {
          docPath: asString(data.docPath, ''),
          docType: inferDocumentType(data.docType),
          title: asString(data.title, ''),
          thumbnailData: asString(data.thumbnailData) || undefined,
        },
      };
    case 'model':
      return {
        type,
        position,
        size: getNodeDefaultSize(type),
        zIndex,
        ports:
          inferModelRole(data.role) === 'workflow'
            ? [
                {
                  id: 'output',
                  type: 'output',
                  position: 'right',
                  dataType: 'any',
                  label: 'Model',
                },
              ]
            : DEFAULT_EMPTY_PORTS,
        data: {
          modelPath: asString(data.modelPath, ''),
          modelName: asString(data.modelName, ''),
          modelType: inferModelType(data.modelType),
          role: inferModelRole(data.role),
          installedVersion: asString(data.installedVersion) || undefined,
        },
      };
    case 'canvas-embed':
      return {
        type,
        position,
        size: getNodeDefaultSize(type),
        zIndex,
        data: {
          canvasPath: asString(data.canvasPath, ''),
          canvasTitle: asString(data.canvasTitle, ''),
          thumbnailData: asString(data.thumbnailData) || undefined,
        },
      };
    case 'project':
      return {
        type,
        position,
        size: getNodeDefaultSize(type),
        zIndex,
        data: {
          projectPath: asString(data.projectPath, ''),
          projectTitle: asString(data.projectTitle, ''),
          projectType: inferProjectType(data.projectType),
          thumbnailData: asString(data.thumbnailData) || undefined,
        },
      };
    case 'group':
      return {
        type,
        position,
        size: getNodeDefaultSize(type),
        zIndex,
        data: {
          childIds: asStringArray(data.childIds),
          label: asString(data.label) || undefined,
          color: asString(data.color) || undefined,
        },
      };
    default:
      return {
        type: 'annotation',
        position,
        size: getNodeDefaultSize('annotation'),
        zIndex,
        data: { content: '' },
      };
  }
}
