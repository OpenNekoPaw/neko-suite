/**
 * Type definitions for frame-by-frame animation
 *
 * Supports traditional animation workflows: keyframes, onion skinning,
 * frame timeline, and sprite sheet export.
 */

/** A single animation frame */
export interface AnimFrame {
  readonly id: string;
  readonly layerId: string;
  readonly index: number;
  /** Number of timeline slots this frame occupies (default 1) */
  readonly duration: number;
  /** Whether this is a key drawing (vs in-between) */
  readonly isKeyframe: boolean;
  /** Pixel data — null for empty/blank frames */
  imageData: ImageData | null;
}

/** A layer in the frame animation timeline */
export interface FrameLayer {
  readonly id: string;
  readonly name: string;
  readonly frames: AnimFrame[];
  readonly visible: boolean;
  readonly locked: boolean;
}

/** Configuration for onion skin overlay rendering */
export interface OnionSkinConfig {
  readonly enabled: boolean;
  /** Number of previous frames to show */
  readonly prevCount: number;
  /** Number of next frames to show */
  readonly nextCount: number;
  /** Starting opacity for previous frames (0..1) */
  readonly prevOpacity: number;
  /** Starting opacity for next frames (0..1) */
  readonly nextOpacity: number;
}

/** Descriptor for an onion skin ghost frame to render */
export interface OnionSkinGhost {
  readonly frame: AnimFrame;
  readonly opacity: number;
  /** Tint colour — green for previous, red for next */
  readonly tint: readonly [number, number, number];
}

/** Default onion skin configuration */
export const DEFAULT_ONION_SKIN: OnionSkinConfig = {
  enabled: false,
  prevCount: 2,
  nextCount: 1,
  prevOpacity: 0.3,
  nextOpacity: 0.2,
};
