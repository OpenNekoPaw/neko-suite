// =============================================================================
// Audio Properties (音频属性)
//
// Engine fields derived from EngineAudioProperties (generated from proto).
// UI extensions: volume/pan support AnimatableProperty, eq is UI-only.
// fadeInCurve/fadeOutCurve/gain are now engine fields (Phase 3).
// =============================================================================

import { EasingType } from './easing';
import { AnimatableProperty } from './animation';
import type { EngineAudioProperties } from '../generated/timeline.engine';

/**
 * Audio properties — extends engine fields with UI capabilities.
 *
 * Engine fields (from EngineAudioProperties): volume, pan, muted, fadeIn, fadeOut,
 *   fadeInCurve, fadeOutCurve, gain
 * UI extensions: volume/pan accept AnimatableProperty, eq
 *
 * Note: Omit fadeInCurve/fadeOutCurve because TS EasingType is a superset of
 * EngineEasingType (includes legacy aliases 'bezier', 'ease-in', etc.)
 */
export interface AudioProperties extends Omit<EngineAudioProperties, 'volume' | 'pan' | 'fadeInCurve' | 'fadeOutCurve'> {
  /** Volume (0-2, 1 = 100%) - can be animated */
  volume: number | AnimatableProperty;
  /** Stereo pan (-1 = left, 0 = center, 1 = right) - can be animated */
  pan: number | AnimatableProperty;
  /** Fade in easing curve (engine field, Phase 3) */
  fadeInCurve?: EasingType;
  /** Fade out easing curve (engine field, Phase 3) */
  fadeOutCurve?: EasingType;
  /** @ui-only Equalizer settings */
  eq?: {
    lowGain: number;
    midGain: number;
    highGain: number;
  };
}

/** Default audio properties */
export const DEFAULT_AUDIO_PROPERTIES: AudioProperties = {
  volume: 1,
  pan: 0,
  muted: false,
  fadeIn: 0,
  fadeOut: 0,
  fadeInCurve: 'linear',
  fadeOutCurve: 'linear',
  gain: 0,
};
