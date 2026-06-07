// =============================================================================
// Generated Asset Types — Cross-plugin asset reference schema (ADR-4)
//
// Binary data is stored on disk; only JSON references are passed between plugins.
// Each plugin converts `path` to a webview-compatible URI via `asWebviewUri()`.
// =============================================================================

import type { ShotScale, CameraMovement } from './canvas';

/**
 * Discriminator for generated asset types.
 */
export type GeneratedAssetType =
  | 'generated-image'
  | 'generated-audio'
  | 'generated-video'
  | 'generated-storyboard';

/**
 * Base fields shared by all generated assets.
 * Binary data lives at `path` on disk — this object is the lightweight JSON reference.
 */
export interface BaseGeneratedAsset {
  /** Asset type discriminator */
  type: GeneratedAssetType;
  /** Globally unique identifier (e.g. `crypto.randomUUID()`) */
  id: string;
  /**
   * Backward-compatible asset path.
   * Existing host adapters may still keep an absolute file-system path here,
   * but persisted cross-layer metadata should prefer `assetRef`.
   */
  path: string;
  /** Stable host-agnostic reference for persistence and tool backfill. */
  assetRef?: import('./perception-card').PerceptualAssetRef;
  /** MIME type of the stored file */
  mimeType: string;
  /** ISO 8601 timestamp of generation */
  generatedAt: string;
  /** Prompt used to generate this asset */
  prompt?: string;
  /** Model / provider identifier (e.g. `fal.ai/flux`, `dashscope/wanx`) */
  model?: string;
  /** Stable creative entity bindings inherited from the source context */
  characterIds?: readonly string[];
  /** Source canvas node or upstream node identifier for lineage tracing */
  sourceNodeId?: string;
  /** Source dialogue/voice cue identifier for generated audio or lip-sync lineage. */
  sourceCueId?: string;
  /** Speaker creative entity identifier for generated dialogue audio lineage. */
  speakerEntityId?: string;
  /** Voice representation or voice asset used by generated dialogue audio. */
  voiceAssetId?: string;
}

// -----------------------------------------------------------------------------
// Image
// -----------------------------------------------------------------------------

export interface GeneratedImage extends BaseGeneratedAsset {
  type: 'generated-image';
  /** Pixel width */
  width: number;
  /** Pixel height */
  height: number;
  /** Aspect ratio label (e.g. '16:9', '1:1') */
  ratio: string;
  /** Optional storyboard metadata linking image to a shot */
  shotMeta?: {
    sceneIndex: number;
    shotIndex: number;
    shotScale?: ShotScale;
    cameraMovement?: CameraMovement;
  };
}

// -----------------------------------------------------------------------------
// Audio
// -----------------------------------------------------------------------------

export interface GeneratedAudio extends BaseGeneratedAsset {
  type: 'generated-audio';
  /** Duration in seconds */
  duration: number;
  /** Sample rate in Hz */
  sampleRate: number;
  /** Number of audio channels */
  channels: number;
}

// -----------------------------------------------------------------------------
// Video
// -----------------------------------------------------------------------------

export interface GeneratedVideo extends BaseGeneratedAsset {
  type: 'generated-video';
  /** Duration in seconds */
  duration: number;
  /** Pixel width */
  width: number;
  /** Pixel height */
  height: number;
  /** Frames per second */
  fps: number;
}

// -----------------------------------------------------------------------------
// Storyboard (composite — references multiple GeneratedImage items)
// -----------------------------------------------------------------------------

/** A single scene within a storyboard */
export interface GeneratedStoryboardScene {
  sceneIndex: number;
  /** Scene heading text (e.g. 'INT. CAFE - DAY') */
  heading: string;
  /** Ordered shot images belonging to this scene */
  shots: GeneratedImage[];
}

export interface GeneratedStoryboard extends BaseGeneratedAsset {
  type: 'generated-storyboard';
  /** Scenes with their constituent shots */
  scenes: GeneratedStoryboardScene[];
}

// -----------------------------------------------------------------------------
// Union + type guards
// -----------------------------------------------------------------------------

/** Any generated asset variant */
export type GeneratedAsset = GeneratedImage | GeneratedAudio | GeneratedVideo | GeneratedStoryboard;

/** Type guard: narrows `GeneratedAsset` to `GeneratedImage` */
export function isGeneratedImage(asset: GeneratedAsset): asset is GeneratedImage {
  return asset.type === 'generated-image';
}

/** Type guard: narrows `GeneratedAsset` to `GeneratedAudio` */
export function isGeneratedAudio(asset: GeneratedAsset): asset is GeneratedAudio {
  return asset.type === 'generated-audio';
}

/** Type guard: narrows `GeneratedAsset` to `GeneratedVideo` */
export function isGeneratedVideo(asset: GeneratedAsset): asset is GeneratedVideo {
  return asset.type === 'generated-video';
}

/** Type guard: narrows `GeneratedAsset` to `GeneratedStoryboard` */
export function isGeneratedStoryboard(asset: GeneratedAsset): asset is GeneratedStoryboard {
  return asset.type === 'generated-storyboard';
}

// -----------------------------------------------------------------------------
// Webview-safe variant (with pre-computed webviewUri)
// -----------------------------------------------------------------------------

/**
 * A GeneratedAsset augmented with a webview-safe URI.
 * Created by the extension host via `toWebviewAsset()` before sending to webview.
 */
export type WebviewGeneratedAsset<T extends BaseGeneratedAsset = GeneratedAsset> = T & {
  /** `vscode-resource://` URI safe for use in `<img>`, `<video>`, `<audio>` src */
  webviewUri: string;
};

// -----------------------------------------------------------------------------
// Sub-directory constants
// -----------------------------------------------------------------------------

/** Standard sub-directory names under `.neko/.cache/generated/` */
export const GENERATED_ASSET_DIRS = {
  image: 'image',
  audio: 'audio',
  video: 'video',
  storyboard: 'storyboard',
} as const;
