/**
 * Extended Canvas Types — re-exports from @neko/shared
 *
 * Text and Artboard types have been promoted to @neko/shared canvas.ts.
 * This file is kept for backward compatibility; import from @neko/shared directly
 * for new code.
 */

export type {
  TextCanvasNode,
  TextNodeStyle,
  ArtboardCanvasNode,
  ArtboardPreset,
  ShotCanvasNode,
  SceneGroupCanvasNode,
  GalleryCanvasNode,
  GalleryCell,
  GalleryPreset,
  ScriptCanvasNode,
  ScriptScene,
  DocumentCanvasNode,
  ModelCanvasNode,
  CanvasEmbedCanvasNode,
  ShotScale,
  CameraMovement,
  CameraAngle,
  ShotGenerationStatus,
  GeneratedImageVersion,
  ShotCharacter,
} from '@neko/shared';

export {
  DEFAULT_TEXT_STYLE,
  ARTBOARD_PRESETS,
  GALLERY_PRESET_CONFIGS,
  isTextNode,
  isArtboardNode,
  isShotNode,
  isSceneGroupNode,
  isGalleryNode,
} from '@neko/shared';

// ExtendedNodeType kept for existing code that may reference it
export type ExtendedNodeType =
  | 'media'
  | 'storyboard'
  | 'annotation'
  | 'group'
  | 'text'
  | 'artboard'
  | 'shot'
  | 'scene'
  | 'gallery'
  | 'script'
  | 'document'
  | 'model'
  | 'canvas-embed';

// ExtendedCanvasNode kept as type alias for backward compatibility
export type { CanvasNode as ExtendedCanvasNode } from '@neko/shared';
