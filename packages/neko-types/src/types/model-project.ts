// =============================================================================
// 3D Model Project Types — .nkm file format (v2)
//
// Lightweight JSON wrapper referencing external .gltf/.glb/.vrm model files.
// Stores editor state: face parameters, custom keyframe clips, camera position.
// Follows the same pattern as NkpProjectData (.nkp puppet project).
//
// See: docs/architecture/format-strategy.md
// =============================================================================

import type { EasingType } from './easing';

// ── Project Data (top-level .nkm file) ───────────────────────────────────────

/** .nkm project data — wraps a 3D model file with editor state */
export interface NkmProjectData {
  /** Format version (current: 2) */
  version: number;
  /** Project display name */
  name: string;
  /** Source model reference */
  model: {
    /** Relative path to .gltf/.glb/.vrm file (null if no model linked) */
    src: string | null;
  };

  // ── Face Customization ──

  /** Face parameter morph weights (Blend Shape values, keyed by parameter ID) */
  faceParams: Record<string, number>;

  // ── Custom Animations ──

  /** Custom animation clips created in the editor (user keyframe data) */
  customClips: SerializedAnimationClip[];

  // ── Camera ──

  /** Saved camera state (null uses default orbit camera) */
  camera: CameraState | null;

  // ── Viewport ──

  /** Editor viewport settings */
  viewport: {
    /** Zoom level (1.0 = default) */
    zoom: number;
  };

  // ── Editor State (opaque, for UI restoration) ──

  /** Additional editor state (selected node, panel toggles, etc.) */
  editorState: Record<string, unknown>;
}

// ── Serialized Animation Clip ────────────────────────────────────────────────

/** A complete animation clip with all channels and keyframe data */
export interface SerializedAnimationClip {
  /** Clip display name */
  name: string;
  /** Total duration in seconds */
  duration: number;
  /** Animation channels (one per animated property per node) */
  channels: SerializedAnimationChannel[];
}

/** A single animation channel targeting one property of one node */
export interface SerializedAnimationChannel {
  /** Target scene node ID */
  targetNode: string;
  /** Animated property */
  property: 'translation' | 'rotation' | 'scale' | 'morph_weights';
  /** Keyframe data */
  keyframes: SerializedKeyframe[];
}

/** A single keyframe in a serialized channel */
export interface SerializedKeyframe {
  /** Unique keyframe ID (UUID v4) */
  id: string;
  /** Time in seconds */
  timestamp: number;
  /** Values array (3 for translation/scale, 4 for rotation, N for morph_weights) */
  values: number[];
  /** Easing function to next keyframe */
  easing: EasingType;
}

// ── Camera State ─────────────────────────────────────────────────────────────

/** Saved camera position and projection parameters */
export interface CameraState {
  /** Camera world position [x, y, z] */
  position: [number, number, number];
  /** Camera look-at target [x, y, z] */
  target: [number, number, number];
  /** Camera up vector [x, y, z] */
  up: [number, number, number];
  /** Vertical field of view in degrees */
  fov: number;
}

// ── Factory ──────────────────────────────────────────────────────────────────

/** Current .nkm format version */
export const NKM_VERSION = 2;

/** Create a default empty .nkm project data */
export function createDefaultNkmProject(
  name: string,
  modelSrc: string | null = null,
): NkmProjectData {
  return {
    version: NKM_VERSION,
    name,
    model: { src: modelSrc },
    faceParams: {},
    customClips: [],
    camera: null,
    viewport: { zoom: 1.0 },
    editorState: {},
  };
}
