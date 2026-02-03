import { EasingType } from './easing';
import { AnimatableProperty } from './animation';
/** Audio properties with animatable volume and pan */
export interface AudioProperties {
    /** Volume (0-2, 1 = 100%) - can be animated */
    volume: number | AnimatableProperty;
    /** Stereo pan (-1 = left, 0 = center, 1 = right) - can be animated */
    pan: number | AnimatableProperty;
    /** Whether audio is muted */
    muted?: boolean;
    /** Fade in duration (seconds) */
    fadeIn: number;
    /** Fade out duration (seconds) */
    fadeOut: number;
    /** Fade in easing curve */
    fadeInCurve?: EasingType;
    /** Fade out easing curve */
    fadeOutCurve?: EasingType;
    /** Gain adjustment (dB, -20 to +20) */
    gain: number;
    /** Equalizer settings (optional) */
    eq?: {
        lowGain: number;
        midGain: number;
        highGain: number;
    };
}
/** Default audio properties */
export declare const DEFAULT_AUDIO_PROPERTIES: AudioProperties;
//# sourceMappingURL=audio.d.ts.map