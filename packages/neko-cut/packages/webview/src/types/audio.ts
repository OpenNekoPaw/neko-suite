/**
 * Audio Types
 * 音频相关类型定义
 */

import type { AnimatableProperty, EasingType } from './animation';

/**
 * Audio properties for media and audio elements
 * 媒体和音频元素的音频属性
 */
export interface AudioProperties {
  /** Volume (0-2, 1 = 100%) */
  volume: AnimatableProperty;
  /** Stereo pan (-1 = left, 0 = center, 1 = right) */
  pan: AnimatableProperty;
  /** Whether audio is muted */
  muted: boolean;
  /** Fade in duration (seconds) */
  fadeIn: number;
  /** Fade out duration (seconds) */
  fadeOut: number;
  /** Fade in easing curve */
  fadeInCurve: EasingType;
  /** Fade out easing curve */
  fadeOutCurve: EasingType;
  /** Gain adjustment in dB (-20 to +20) */
  gain: number;
  /** Equalizer settings (optional) */
  eq?: {
    lowGain: number;   // Low frequency dB
    midGain: number;   // Mid frequency dB
    highGain: number;  // High frequency dB
  };
}

/**
 * 默认音频属性
 */
export function createDefaultAudioProperties(): AudioProperties {
  return {
    volume: { baseValue: 1, keyframes: [] },
    pan: { baseValue: 0, keyframes: [] },
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    fadeInCurve: 'linear',
    fadeOutCurve: 'linear',
    gain: 0,
  };
}
