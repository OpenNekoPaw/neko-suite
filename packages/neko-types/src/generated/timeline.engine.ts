// =============================================================================
// AUTO-GENERATED — DO NOT EDIT
//
// Source: packages/neko-proto/timeline.proto
// Generated: 2026-02-25T01:40:43.662Z
// Command: node scripts/proto-gen-ts.mjs
// =============================================================================

// =============================================================================
// Enums
// =============================================================================

export type EngineTrackType =
  | 'video'
  | 'audio'
  | 'text'
  | 'effect'
  | 'subtitle'
  | 'shape'
  | 'media';

export type EngineBlendMode =
  | 'normal'
  | 'dissolve'
  | 'darken'
  | 'multiply'
  | 'colorBurn'
  | 'linearBurn'
  | 'darkerColor'
  | 'lighten'
  | 'screen'
  | 'colorDodge'
  | 'linearDodge'
  | 'lighterColor'
  | 'overlay'
  | 'softLight'
  | 'hardLight'
  | 'vividLight'
  | 'linearLight'
  | 'pinLight'
  | 'hardMix'
  | 'difference'
  | 'exclusion'
  | 'subtract'
  | 'divide'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

export type EngineTransitionType =
  | 'fade'
  | 'wipe-left'
  | 'wipe-right'
  | 'wipe-up'
  | 'wipe-down'
  | 'iris-circle'
  | 'iris-rectangle'
  | 'clock'
  | 'slide-left'
  | 'slide-right'
  | 'zoom-in'
  | 'zoom-out'
  | 'dissolve'
  | 'pixelate'
  | 'ripple'
  | 'swirl'
  | 'glitch'
  | 'flash';

export type EngineEasingType =
  | 'linear'
  | 'ease-in-quad'
  | 'ease-out-quad'
  | 'ease-in-out-quad'
  | 'ease-in-cubic'
  | 'ease-out-cubic'
  | 'ease-in-out-cubic'
  | 'ease-in-quart'
  | 'ease-out-quart'
  | 'ease-in-out-quart'
  | 'ease-in-quint'
  | 'ease-out-quint'
  | 'ease-in-out-quint'
  | 'ease-in-sine'
  | 'ease-out-sine'
  | 'ease-in-out-sine'
  | 'ease-in-expo'
  | 'ease-out-expo'
  | 'ease-in-out-expo'
  | 'ease-in-circ'
  | 'ease-out-circ'
  | 'ease-in-out-circ'
  | 'ease-in-back'
  | 'ease-out-back'
  | 'ease-in-out-back'
  | 'ease-in-elastic'
  | 'ease-out-elastic'
  | 'ease-in-out-elastic'
  | 'ease-in-bounce'
  | 'ease-out-bounce'
  | 'ease-in-out-bounce'
  | 'cubic-bezier';

export type EngineInterpolationMode =
  | 'linear'
  | 'step'
  | 'smooth';

export type EngineEffectType =
  | 'blur'
  | 'sharpen'
  | 'colorCorrection'
  | 'brightness'
  | 'contrast'
  | 'saturation'
  | 'hue'
  | 'exposure'
  | 'gamma'
  | 'vignette'
  | 'chromaticAberration'
  | 'filmGrain'
  | 'custom';

// =============================================================================
// Messages
// =============================================================================

export interface EngineTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  anchorX: number;
  anchorY: number;
}

export interface EngineEffectParams {
  effectType: EngineEffectType;
  intensity: number;
  paramsJson: string;
  enabled: boolean;
}

export interface EngineAudioProperties {
  volume: number;
  pan: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
  fadeInCurve: EngineEasingType;
  fadeOutCurve: EngineEasingType;
  gain: number;
}

export interface EngineMediaElementData {
  src: string;
  resourceId?: string;
  audio?: EngineAudioProperties;
  mediaType?: string;
  linkedAudioId?: string;
  volume: number;
}

export interface EngineAudioElementData {
  src: string;
  resourceId?: string;
  audio?: EngineAudioProperties;
  linkedVideoId?: string;
  audioSettings?: EngineAudioSettings;
  volume: number;
  pan: number;
  fadeIn: number;
  fadeOut: number;
}

export interface EngineAudioSettings {
  volume?: EngineAudioValue;
  pan?: EngineAudioValue;
  muted: boolean;
}

export interface EngineAudioValue {
  baseValue: number;
}

export interface EngineTextElementData {
  content: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  backgroundColor: string;
  textAlign: string;
  fontWeight: string;
  fontStyle: string;
  textDecoration: string;
  lineHeight: number;
  letterSpacing: number;
  strokeColor: string;
  strokeWidth: number;
  shadow?: EngineTextShadow;
}

export interface EngineTextShadow {
  color: string;
  offsetX: number;
  offsetY: number;
  blur: number;
}

export interface EngineShapeElementData {
  shapeType: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export interface EngineSubtitleElementData {
  text: string;
  fontSize: number;
  color: string;
  fontFamily: string;
  backgroundColor: string;
  textAlign: string;
  strokeColor: string;
  strokeWidth: number;
  shadow?: EngineTextShadow;
}

export interface EngineElement {
  id: string;
  name: string;
  startTime: number;
  duration: number;
  trimStart: number;
  trimEnd: number;
  transform?: EngineTransform;
  opacity: number;
  blendMode: EngineBlendMode;
  effects: EngineEffectParams[];
  muted: boolean;
  hidden: boolean;
  locked: boolean;
  speed?: EngineSpeedProperties;
  transitionIn?: EngineTransition;
  transitionOut?: EngineTransition;
}

export interface EngineSpeedProperties {
  speed: number;
  reverse: boolean;
  preservePitch: boolean;
  timeRemap?: EngineTimeRemapData;
}

export interface EngineTimeRemapData {
  enabled: boolean;
  keyframes: EngineTimeRemapKeyframe[];
}

export interface EngineTimeRemapKeyframe {
  id: string;
  outputTime: number;
  inputTime: number;
  easing: EngineEasingType;
}

export interface EngineTransition {
  transitionType: EngineTransitionType;
  duration: number;
  easing: EngineEasingType;
  feather: number;
}

export interface EngineTrack {
  id: string;
  name: string;
  trackType: EngineTrackType;
  elements: EngineElement[];
  muted: boolean;
  locked: boolean;
  hidden: boolean;
  isMain: boolean;
}

export interface EngineTimeline {
  duration: number;
  resolution?: EngineResolution;
  fps: number;
  tracks: EngineTrack[];
  defaults?: EngineProjectDefaults;
}

export interface EngineResolution {
  width: number;
  height: number;
}

export interface EngineProjectDefaults {
  text?: EngineTextDefaults;
  transform?: EngineTransformDefaults;
  audio?: EngineAudioDefaults;
}

export interface EngineTextDefaults {
  fontSize: number;
  fontFamily: string;
  color: string;
}

export interface EngineTransformDefaults {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

export interface EngineAudioDefaults {
  volume: number;
  pan: number;
  fadeIn: number;
  fadeOut: number;
}

export interface EngineAnimatableValue {

}

export interface EnginePoint2D {
  x: number;
  y: number;
}

export interface EnginePoint3D {
  x: number;
  y: number;
  z: number;
}

export interface EngineColorValue {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface EngineKeyframe {
  time: number;
  value?: EngineAnimatableValue;
  easing: EngineEasingType;
  interpolation: EngineInterpolationMode;
}

export interface EngineKeyframeTrack {
  property: string;
  keyframes: EngineKeyframe[];
  defaultValue?: EngineAnimatableValue;
}

export interface EngineCubicBezierParams {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// =============================================================================
// Key Constants (for whitelist-based engine field extraction)
// =============================================================================

export const ENGINE_BASE_ELEMENT_KEYS = ['id', 'name', 'startTime', 'duration', 'trimStart', 'trimEnd', 'transform', 'opacity', 'blendMode', 'effects', 'muted', 'hidden', 'locked', 'speed', 'transitionIn', 'transitionOut'] as const;

export const ENGINE_MEDIA_KEYS = ['src', 'resourceId', 'audio', 'mediaType', 'linkedAudioId', 'volume'] as const;

export const ENGINE_AUDIO_KEYS = ['src', 'resourceId', 'audio', 'linkedVideoId', 'audioSettings', 'volume', 'pan', 'fadeIn', 'fadeOut'] as const;

export const ENGINE_TEXT_KEYS = ['content', 'fontFamily', 'fontSize', 'color', 'backgroundColor', 'textAlign', 'fontWeight', 'fontStyle', 'textDecoration', 'lineHeight', 'letterSpacing', 'strokeColor', 'strokeWidth', 'shadow'] as const;

export const ENGINE_SHAPE_KEYS = ['shapeType', 'fill', 'stroke', 'strokeWidth'] as const;

export const ENGINE_SUBTITLE_KEYS = ['text', 'fontSize', 'color', 'fontFamily', 'backgroundColor', 'textAlign', 'strokeColor', 'strokeWidth', 'shadow'] as const;

export const ENGINE_TRACK_KEYS = ['id', 'name', 'trackType', 'elements', 'muted', 'locked', 'hidden', 'isMain'] as const;

