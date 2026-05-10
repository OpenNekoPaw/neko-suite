// =============================================================================
// Audio Mix Types — Engine-aligned mix configuration
//
// These types mirror Rust MixdownConfig / MixdownTrack / MixdownElement
// in engine-kernel/src/services/audio_mixdown.rs.
// Used by both the extension bridge and webview to build mix configs.
// =============================================================================

/**
 * Audio effect configuration — matches Rust AudioEffectConfig.
 *
 * This is the engine-facing type. The UI-facing type is AudioEffectSnapshot
 * (operations/types.ts) which adds a `name` field for display.
 */
export interface AudioEffectConfig {
  id: string;
  /** Effect type key: 'compressor' | 'reverb' | 'delay' | 'chorus' | etc. */
  effectType: string;
  enabled: boolean;
  params: Record<string, unknown>;
}

/** Audio element within a mix track — matches Rust MixdownElement. */
export interface MixElementConfig {
  id: string;
  /** Absolute file path to the audio source */
  src: string;
  /** Start time on the timeline (seconds) */
  startTime: number;
  /** Duration on the timeline (seconds) */
  duration: number;
  /** Trim offset from source start (seconds) */
  trimStart: number;
  /** Element volume (0.0–10.0, default 1.0) */
  volume: number;
  /** Element pan (-1.0 left to 1.0 right, default 0.0) */
  pan: number;
  /** Whether element is muted */
  muted: boolean;
  /** Fade in duration (seconds) */
  fadeIn: number;
  /** Fade out duration (seconds) */
  fadeOut: number;
  /** Gain in dB (default 0.0) */
  gain: number;
}

/** Mix track configuration — matches Rust MixdownTrack. */
export interface MixTrackConfig {
  id: string;
  muted: boolean;
  solo: boolean;
  /** Track volume (0.0–10.0, default 1.0) */
  volume: number;
  /** Track pan (-1.0 left to 1.0 right, default 0.0) */
  pan: number;
  /** Per-track effect chain */
  effectChain: AudioEffectConfig[];
  /** Audio elements in this track */
  elements: MixElementConfig[];
}

/** Full mix stream/export configuration — matches Rust MixdownConfig. */
export interface MixStreamConfig {
  tracks: MixTrackConfig[];
  masterEffects: AudioEffectConfig[];
  /** Master bus volume (default 1.0) */
  masterVolume: number;
  /** Output sample rate (default 48000) */
  sampleRate: number;
  /** Output channels (default 2) */
  channels: number;
}

/** Known audio effect types supported by the engine DSP library. */
export type AudioEffectType =
  | 'lowpass'
  | 'highpass'
  | 'bandpass'
  | 'notch'
  | 'peaking'
  | 'low_shelf'
  | 'high_shelf'
  | 'parametric_eq'
  | 'compressor'
  | 'noise_gate'
  | 'limiter'
  | 'reverb'
  | 'delay'
  | 'chorus'
  | 'distortion'
  | 'gain';

/** Helper: create a default MixStreamConfig. */
export function createDefaultMixStreamConfig(tracks: MixTrackConfig[] = []): MixStreamConfig {
  return {
    tracks,
    masterEffects: [],
    masterVolume: 1.0,
    sampleRate: 48000,
    channels: 2,
  };
}

/** Helper: create a default MixTrackConfig. */
export function createDefaultMixTrackConfig(
  id: string,
  elements: MixElementConfig[] = [],
): MixTrackConfig {
  return {
    id,
    muted: false,
    solo: false,
    volume: 1.0,
    pan: 0.0,
    effectChain: [],
    elements,
  };
}

/** Helper: create a default MixElementConfig. */
export function createDefaultMixElementConfig(
  id: string,
  src: string,
  startTime: number,
  duration: number,
): MixElementConfig {
  return {
    id,
    src,
    startTime,
    duration,
    trimStart: 0,
    volume: 1.0,
    pan: 0.0,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    gain: 0,
  };
}
